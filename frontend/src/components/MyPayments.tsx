import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { usePayments } from "../hooks/useTreasury";
import { safeFees } from "../lib/gas";
import { waitForConfirmation } from "../lib/tx";
import {
  loadPaymentJournal,
  PAYMENT_JOURNAL_EVENT,
  type PaymentJournalItem,
} from "../lib/paymentJournal";

function formatUSDC(amountRaw: bigint) {
  return (Number(amountRaw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatFrequency(seconds: number) {
  if (seconds === 0) return "One-off";
  if (seconds < 3600) return `Every ${seconds}s`;
  if (seconds < 86400) return `Every ${seconds / 3600}h`;
  if (seconds < 604800) return `Every ${seconds / 86400}d`;
  if (seconds < 2592000) return `Every ${Math.round(seconds / 604800)}w`;
  return `Every ${Math.round(seconds / 86400)}d`;
}

function formatDateTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyPayments() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const { data: payments, isLoading } = usePayments(50);
  const { writeContractAsync } = useWriteContract();

  const [cancelling, setCancelling] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [journal, setJournal] = useState<PaymentJournalItem[]>(() =>
    loadPaymentJournal(address)
  );

  useEffect(() => {
    const syncJournal = () => setJournal(loadPaymentJournal(address));
    syncJournal();
    window.addEventListener(PAYMENT_JOURNAL_EVENT, syncJournal);
    window.addEventListener("storage", syncJournal);
    return () => {
      window.removeEventListener(PAYMENT_JOURNAL_EVENT, syncJournal);
      window.removeEventListener("storage", syncJournal);
    };
  }, [address]);

  const mine = useMemo(() => {
    const mineOnChain = (payments ?? []).filter(
      (p) => address && (p.owner as string).toLowerCase() === address.toLowerCase()
    );
    const chainIds = new Set(mineOnChain.map((p) => p.id.toString()));
    const journalOnly = journal.filter((item) => !chainIds.has(item.id));

    return [
      ...mineOnChain.map((payment) => {
        const journalItem = journal.find((item) => item.id === payment.id.toString());
        return { kind: "chain" as const, payment, journalItem };
      }),
      ...journalOnly.map((journalItem) => ({
        kind: "journal" as const,
        journalItem,
      })),
    ].sort((a, b) => {
      const aId = a.kind === "chain" ? a.payment.id : Number(a.journalItem.id);
      const bId = b.kind === "chain" ? b.payment.id : Number(b.journalItem.id);
      return bId - aId;
    });
  }, [address, journal, payments]);

  if (!isConnected || !onArc) return null;

  const handleCancel = async (id: number) => {
    setMsg(null);
    try {
      setCancelling(id);
      const hash = await writeContractAsync({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "cancelPayment",
        args: [BigInt(id)],
        ...(await safeFees()),
      } as any);
      setMsg({ kind: "ok", text: `Cancel sent (${hash.slice(0, 10)}…), waiting…` });
      const receipt = await waitForConfirmation(hash, "Cancel");
      if (!receipt) {
        setMsg({
          kind: "ok",
          text: `Cancel submitted (${hash.slice(0, 10)}…). Arc RPC could not confirm it yet; the list will refresh automatically.`,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["payments"] }),
          queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
        ]);
        return;
      }
      setMsg({ kind: "ok", text: `Payment #${id} cancelled.` });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Cancel failed" });
    } finally {
      setCancelling(null);
    }
  };

  const scrollToScheduleForm = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalCount = mine.length;
  const displayedItems = isExpanded ? mine : mine.slice(0, 5);

  const counterLabel = useMemo(() => {
    if (totalCount === 0) return "0 payments";
    if (totalCount <= 5 || isExpanded) return `Showing ${totalCount} payment${totalCount === 1 ? "" : "s"}`;
    return `Showing 5 of ${totalCount} payments`;
  }, [totalCount, isExpanded]);

  return (
    <div className="my-payments">
      <div className="schedule-card">
        {/* Header with Showing X of N Counter */}
        <div className="schedule-header">
          <div>
            <h3>Your Scheduled Payments</h3>
            <span className="schedule-sub-meta">{counterLabel}</span>
          </div>
          <span className="schedule-balance">
            {totalCount} total queued
          </span>
        </div>

        {isLoading ? (
          <div className="payments-loading">Loading scheduled payments…</div>
        ) : totalCount === 0 ? (
          <div className="payments-empty-state">
            <span className="empty-cal-icon">📅</span>
            <h4>No scheduled payments yet</h4>
            <p>Create your first recurring USDC payment schedule to automate team payouts.</p>
            <button onClick={scrollToScheduleForm} className="create-schedule-btn">
              + Create Payment
            </button>
          </div>
        ) : (
          <>
            {/* Scroll Container with Sticky Headers */}
            <div className={`payments-scroll-wrapper ${isExpanded ? "expanded" : "collapsed"}`}>
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Recipient</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Frequency</th>
                    <th>Status</th>
                    <th>Tx</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((row) => {
                    if (row.kind === "journal") {
                      const item = row.journalItem;
                      return (
                        <tr key={`journal-${item.id}-${item.txHash}`}>
                          <td className="font-mono">#{item.id}</td>
                          <td>
                            <a
                              href={`https://testnet.arcscan.app/address/${item.recipient}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono link-muted"
                            >
                              {shortAddr(item.recipient)}
                            </a>
                          </td>
                          <td style={{ textAlign: "right" }} className="font-mono">
                            {formatUSDC(BigInt(item.amountRaw))} USDC
                          </td>
                          <td>{formatFrequency(item.frequency)}</td>
                          <td>
                            <span className="pill pill-scheduled">Indexing</span>
                          </td>
                          <td>
                            <a
                              className="tx-link"
                              href={`https://testnet.arcscan.app/tx/${item.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              title={formatDateTime(item.scheduledAt)}
                            >
                              Verify ↗
                            </a>
                          </td>
                          <td></td>
                        </tr>
                      );
                    }

                    const p = row.payment;
                    return (
                      <tr key={p.id}>
                        <td className="font-mono">#{p.id}</td>
                        <td>
                          <a
                            href={`https://testnet.arcscan.app/address/${p.recipient}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono link-muted"
                          >
                            {shortAddr(p.recipient as string)}
                          </a>
                        </td>
                        <td style={{ textAlign: "right" }} className="font-mono bold">
                          {formatUSDC(p.amount as bigint)} USDC
                        </td>
                        <td>{formatFrequency(Number(p.frequency))}</td>
                        <td>
                          {(() => {
                            const isOneOff = Number(p.frequency) === 0;
                            if (!p.active) {
                              if (p.cancelled || !isOneOff) {
                                return <span className="pill pill-cancel">Cancelled</span>;
                              }
                              return <span className="pill pill-ok">Done</span>;
                            }
                            if (p.requiresApproval) {
                              return <span className="pill pill-warn">Needs approval</span>;
                            }
                            if (p.isDue) {
                              return <span className="pill pill-due">Due now</span>;
                            }
                            if (p.executedCount > 0) {
                              return (
                                <span className="pill pill-ok">
                                  Active · {p.executedCount} paid
                                </span>
                              );
                            }
                            return <span className="pill pill-scheduled">Scheduled</span>;
                          })()}
                        </td>
                        <td>
                          {row.journalItem?.txHash ? (
                            <a
                              className="tx-link"
                              href={`https://testnet.arcscan.app/tx/${row.journalItem.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              title={formatDateTime(row.journalItem.scheduledAt)}
                            >
                              Verify ↗
                            </a>
                          ) : (
                            <span className="tx-link" style={{ opacity: 0.55 }}>On-chain</span>
                          )}
                        </td>
                        <td>
                          {p.active && (
                            <button
                              className="btn-cancel"
                              onClick={() => handleCancel(p.id)}
                              disabled={cancelling === p.id}
                            >
                              {cancelling === p.id ? "Cancelling…" : "Cancel"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expand / Collapse Button */}
            {totalCount > 5 && (
              <div className="payments-expand-bar">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="view-all-payments-btn"
                >
                  {isExpanded ? (
                    <>
                      <span>↑ Show Less</span>
                    </>
                  ) : (
                    <>
                      <span>↓ View All Payments ({totalCount - 5} more)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {msg && (
          <div className={`interact-msg ${msg.kind}`} style={{ marginTop: 12 }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
