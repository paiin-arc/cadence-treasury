import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { decodeEventLog } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, TREASURY_ADDRESS, ESCROW_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { ESCROW_ABI } from "../lib/escrowAbi";
import { USDC_ARC_TESTNET, ERC20_ABI } from "../lib/wagmi";
import { usePayments } from "../hooks/useTreasury";
import { useEscrowPayments } from "../hooks/useEscrow";
import { safeFees } from "../lib/gas";
import { waitForConfirmation } from "../lib/tx";

type PayMethod = "scheduler" | "escrow";

type Bill = {
  id: string;
  label: string;
  description: string;
  recipient: string;
  amountUSDC: string;
  dueDate: string;
  /** Default "scheduler" for backward compat with existing saved bills. */
  method?: PayMethod;
  /** Treasury paymentId when method=scheduler */
  paymentId?: string;
  /** RefundProtocol payment id when method=escrow */
  escrowId?: string;
  scheduledAt?: number;
};

const storageKey = (addr?: string) =>
  addr ? `cadence:bills:${addr.toLowerCase()}` : "cadence:bills:anon";

function loadBills(addr?: string): Bill[] {
  try {
    const raw = localStorage.getItem(storageKey(addr));
    return raw ? (JSON.parse(raw) as Bill[]) : [];
  } catch {
    return [];
  }
}

function saveBills(addr: string | undefined, bills: Bill[]) {
  try {
    localStorage.setItem(storageKey(addr), JSON.stringify(bills));
  } catch {
    /* ignore */
  }
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dueDate: string) {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

type BillStatus = "draft" | "settling" | "held" | "paid" | "refunded" | "failed";

export default function Bills() {
  const { address, isConnected } = useAccount();

  return (
    <BillsForWallet
      key={address ?? "anon"}
      address={address}
      isConnected={isConnected}
    />
  );
}

function BillsForWallet({
  address,
  isConnected,
}: {
  address?: `0x${string}`;
  isConnected: boolean;
}) {
  const escrowAddr = (ESCROW_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const escrowConfigured = !!ESCROW_ADDRESS;

  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();
  const me = address?.toLowerCase();

  const [bills, setBills] = useState<Bill[]>(() => loadBills(address));
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Omit<Bill, "id">>({
    label: "",
    description: "",
    recipient: "",
    amountUSDC: "",
    dueDate: todayISO(),
    method: "scheduler",
  });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    kind: "ok" | "err";
    text: string;
    txHash?: string;
  } | null>(null);

  useEffect(() => {
    saveBills(address, bills);
  }, [address, bills]);

  // Treasury balance (for scheduler bills)
  const userBalance = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 30_000 },
  });

  // Wallet USDC balance (for escrow bills — pay from wallet, not treasury)
  const walletUsdc = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 30_000 },
  });

  // Escrow allowance from connected wallet
  const escrowAllowance = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, escrowAddr] : undefined,
    query: { enabled: !!address && escrowConfigured && onArc, refetchInterval: 30_000 },
  });

  const { data: payments } = usePayments(80);
  const { data: escrowPayments } = useEscrowPayments();
  const { writeContractAsync } = useWriteContract();

  // Status derivation handles both scheduler and escrow methods
  const billStatus = useMemo(() => {
    const map = new Map<string, BillStatus>();
    for (const b of bills) {
      const method = b.method ?? "scheduler";

      if (method === "scheduler") {
        if (!b.paymentId) {
          map.set(b.id, "draft");
          continue;
        }
        const p = payments?.find((pp) => pp.id.toString() === b.paymentId);
        if (!p) {
          map.set(b.id, "settling");
          continue;
        }
        if (!p.active && p.cancelled) map.set(b.id, "failed");
        else if (!p.active) map.set(b.id, "paid");
        else map.set(b.id, "settling");
      } else {
        // escrow
        if (!b.escrowId) {
          map.set(b.id, "draft");
          continue;
        }
        const e = escrowPayments?.find((ee) => ee.id.toString() === b.escrowId);
        if (!e) {
          map.set(b.id, "held"); // optimistic — just paid, may not be indexed yet
          continue;
        }
        if (e.status === "withdrawn") map.set(b.id, "paid");
        else if (e.status === "refunded") map.set(b.id, "refunded");
        else map.set(b.id, "held");
      }
    }
    return map;
  }, [bills, payments, escrowPayments]);

  const handleAdd = () => {
    setMsg(null);
    if (!draft.label.trim()) {
      setMsg({ kind: "err", text: "Add a label (e.g. Rent, Electricity)." });
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(draft.recipient)) {
      setMsg({ kind: "err", text: "Recipient must be a valid 0x address." });
      return;
    }
    const amt = Number(draft.amountUSDC);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ kind: "err", text: "Amount must be positive." });
      return;
    }
    if (!draft.dueDate) {
      setMsg({ kind: "err", text: "Pick a due date." });
      return;
    }
    const newBill: Bill = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...draft,
      recipient: draft.recipient.toLowerCase(),
      method: draft.method ?? "scheduler",
    };
    setBills((prev) => [newBill, ...prev]);
    setDraft({
      label: "",
      description: "",
      recipient: "",
      amountUSDC: "",
      dueDate: todayISO(),
      method: "scheduler",
    });
    setShowForm(false);
    setMsg({ kind: "ok", text: `Bill "${newBill.label}" saved.` });
  };

  const handleDelete = (id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  const handleEscrowWithdraw = async (bill: Bill, paymentId: bigint) => {
    setMsg(null);
    try {
      setPayingId(bill.id);
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: "withdraw",
        args: [[paymentId]],
        ...(await safeFees()),
      });
      setMsg({ kind: "ok", text: `Withdraw submitted (${hash.slice(0, 10)}…)` });
      const receipt = await waitForConfirmation(hash, "Withdraw", 90_000);
      setMsg({
        kind: "ok",
        text: receipt
          ? "Escrow payment withdrawn successfully."
          : "Withdraw submitted. Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.",
        txHash: hash,
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Withdraw failed" });
    } finally {
      setPayingId(null);
    }
  };

  const handleEscrowRefund = async (bill: Bill, paymentId: bigint) => {
    setMsg(null);
    try {
      setPayingId(bill.id);
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: "refundByRecipient",
        args: [paymentId],
        ...(await safeFees()),
      });
      setMsg({ kind: "ok", text: `Refund submitted (${hash.slice(0, 10)}…)` });
      const receipt = await waitForConfirmation(hash, "Refund", 90_000);
      setMsg({
        kind: "ok",
        text: receipt
          ? "Escrow payment refunded to payer."
          : "Refund submitted. Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.",
        txHash: hash,
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Refund failed" });
    } finally {
      setPayingId(null);
    }
  };

  const handlePay = async (bill: Bill) => {
    setMsg(null);
    if (!isConnected || !onArc) {
      setMsg({ kind: "err", text: "Connect on Arc Testnet to pay." });
      return;
    }
    const method = bill.method ?? "scheduler";
    const amountRaw = BigInt(Math.round(Number(bill.amountUSDC) * 1_000_000));

    // ===== Escrow path =====
    if (method === "escrow") {
      if (!escrowConfigured) {
        setMsg({ kind: "err", text: "Escrow contract not configured. Set VITE_ESCROW_ADDRESS." });
        return;
      }
      const wBal = walletUsdc.data as bigint | undefined;
      if (wBal !== undefined && amountRaw > wBal) {
        setMsg({
          kind: "err",
          text: `${bill.amountUSDC} USDC exceeds your wallet balance (${formatUSDC(Number(wBal) / 1e6)}).`,
        });
        return;
      }

      try {
        setPayingId(bill.id);
        const current = (escrowAllowance.data as bigint | undefined) ?? 0n;
        if (current < amountRaw) {
          setMsg({
            kind: "ok",
            text: "Confirm the approval in your wallet (Rabby/MetaMask)…",
          });
          const approveHash = await writeContractAsync({
            chainId: arcTestnet.id,
            address: USDC_ARC_TESTNET,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [escrowAddr, amountRaw],
            ...(await safeFees()),
          });
          setMsg({
            kind: "ok",
            text: "Approval submitted, waiting for confirmation…",
            txHash: approveHash,
          });
          const ar = await waitForConfirmation(approveHash, "Approve", 90_000);
          if (!ar) {
            setMsg({
              kind: "ok",
              text: "Approval submitted, but Arc RPC did not confirm it yet. If your wallet shows it succeeded, try paying again in a few seconds.",
              txHash: approveHash,
            });
            await Promise.allSettled([escrowAllowance.refetch()]);
            return;
          }
          await Promise.allSettled([escrowAllowance.refetch()]);
        }

        setMsg({ kind: "ok", text: "Confirm escrow payment in your wallet…" });
        const hash = await writeContractAsync({
          chainId: arcTestnet.id,
          address: escrowAddr,
          abi: ESCROW_ABI,
          functionName: "pay",
          args: [bill.recipient as `0x${string}`, amountRaw, address as `0x${string}`],
          ...(await safeFees()),
        });
        setMsg({
          kind: "ok",
          text: "Escrow payment submitted, waiting for confirmation…",
          txHash: hash,
        });
        const receipt = await waitForConfirmation(hash, "Pay", 90_000);
        if (!receipt) {
          setMsg({
            kind: "ok",
            text: "Escrow payment submitted. Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.",
            txHash: hash,
          });
          await Promise.allSettled([
            queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
          ]);
          return;
        }

        // Pull escrow id from PaymentCreated event
        let escrowId: string | undefined;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: ESCROW_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "PaymentCreated") {
              escrowId = (decoded.args as { paymentID: bigint }).paymentID.toString();
              break;
            }
          } catch {
            /* not our event */
          }
        }

        setBills((prev) =>
          prev.map((b) =>
            b.id === bill.id ? { ...b, escrowId, scheduledAt: Date.now() } : b
          )
        );
        setMsg({
          kind: "ok",
          text: `Held in escrow${escrowId ? ` (#${escrowId})` : ""}. Recipient can withdraw when ready — you can refund as arbiter.`,
          txHash: hash,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
        ]);
      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string; cause?: { hash?: string } };
        setMsg({
          kind: "err",
          text: err.shortMessage ?? err.message ?? "Escrow pay failed",
          txHash: err.cause?.hash,
        });
      } finally {
        setPayingId(null);
      }
      return;
    }

    // ===== Scheduler path (original) =====
    const balance = userBalance.data as bigint | undefined;
    if (balance !== undefined && amountRaw > balance) {
      setMsg({
        kind: "err",
        text: `${bill.amountUSDC} USDC exceeds your treasury balance (${formatUSDC(Number(balance) / 1e6)}). Deposit more first.`,
      });
      return;
    }

    try {
      setPayingId(bill.id);
      setMsg({ kind: "ok", text: "Confirm in your wallet (Rabby/MetaMask)…" });
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "schedulePayment",
        args: [bill.recipient as `0x${string}`, amountRaw, 0n, 0n],
        ...(await safeFees()),
      });
      setMsg({
        kind: "ok",
        text: "Payment submitted, waiting for confirmation…",
        txHash: hash,
      });
      const receipt = await waitForConfirmation(hash, "Schedule", 90_000);
      if (!receipt) {
        setMsg({
          kind: "ok",
          text: `Bill "${bill.label}" submitted to scheduler. Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.`,
          txHash: hash,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["payments"] }),
          queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
        ]);
        return;
      }

      let paymentId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TREASURY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "PaymentScheduled") {
            paymentId = (decoded.args as { paymentId: bigint }).paymentId.toString();
            break;
          }
        } catch {
          /* not our event */
        }
      }

      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id ? { ...b, paymentId, scheduledAt: Date.now() } : b
        )
      );
      setMsg({
        kind: "ok",
        text: `Bill "${bill.label}" sent to scheduler. The bot will settle it within ~60s.`,
        txHash: hash,
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string; cause?: { hash?: string } };
      setMsg({
        kind: "err",
        text: err.shortMessage ?? err.message ?? "Pay failed",
        txHash: err.cause?.hash,
      });
    } finally {
      setPayingId(null);
    }
  };

  const sortedBills = useMemo(
    () =>
      [...bills].sort((a, b) => {
        const sa = billStatus.get(a.id) ?? "draft";
        const sb = billStatus.get(b.id) ?? "draft";
        const order: Record<BillStatus, number> = {
          draft: 0,
          held: 1,
          settling: 2,
          paid: 3,
          refunded: 4,
          failed: 5,
        };
        if (order[sa] !== order[sb]) return order[sa] - order[sb];
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }),
    [bills, billStatus]
  );

  return (
    <div className="bills-panel">
      <div className="schedule-card">
        <div className="schedule-header">
          <div>
            <h3>Bills</h3>
            <p className="interact-help" style={{ marginTop: 4, marginBottom: 0 }}>
              Save named bills with a due date. <strong>Direct pay</strong> goes through the
              scheduler bot (~60s). <strong>Escrow</strong> holds USDC until the recipient
              withdraws — refundable.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
            style={{ height: "fit-content" }}
          >
            {showForm ? "Close" : "+ Add bill"}
          </button>
        </div>

        {showForm && (
          <div className="bill-form">
            <div className="field-row two">
              <label className="field">
                <span>Label</span>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Rent, Electricity, Phone…"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Due date</span>
                <div className="form-row">
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  />
                </div>
              </label>
            </div>

            <label className="field">
              <span>Recipient</span>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="0x…"
                  value={draft.recipient}
                  onChange={(e) => setDraft({ ...draft, recipient: e.target.value })}
                  spellCheck={false}
                />
              </div>
            </label>

            <div className="field-row two">
              <label className="field">
                <span>Amount</span>
                <div className="form-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.amountUSDC}
                    onChange={(e) => setDraft({ ...draft, amountUSDC: e.target.value })}
                  />
                  <span className="suffix">USDC</span>
                </div>
              </label>
              <label className="field">
                <span>Description</span>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Optional note"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
              </label>
            </div>

            {/* Payment method toggle */}
            <div className="bill-method">
              <span className="bill-method-label">Pay via</span>
              <div className="bill-method-options">
                <button
                  type="button"
                  className={`bill-method-btn ${(draft.method ?? "scheduler") === "scheduler" ? "active" : ""}`}
                  onClick={() => setDraft({ ...draft, method: "scheduler" })}
                >
                  <strong>Direct</strong>
                  <span>Treasury balance · ~60s · final</span>
                </button>
                <button
                  type="button"
                  className={`bill-method-btn ${draft.method === "escrow" ? "active" : ""}`}
                  onClick={() => setDraft({ ...draft, method: "escrow" })}
                  disabled={!escrowConfigured}
                  title={!escrowConfigured ? "Set VITE_ESCROW_ADDRESS to enable" : ""}
                >
                  <strong>Escrow</strong>
                  <span>Wallet USDC · held · refundable</span>
                </button>
              </div>
            </div>

            <button className="btn btn-primary form-btn" onClick={handleAdd}>
              Save bill
            </button>
          </div>
        )}

        {sortedBills.length === 0 ? (
          <p className="interact-help" style={{ marginTop: 18 }}>
            No bills yet. Add one to start tracking what's owed.
          </p>
        ) : (
          <div className="bills-list">
            {sortedBills.map((b) => {
              const status = billStatus.get(b.id) ?? "draft";
              const method = b.method ?? "scheduler";
              const days = daysUntil(b.dueDate);
              const overdue = status === "draft" && days < 0;
              const dueSoon = status === "draft" && days >= 0 && days <= 3;
              const idLabel = method === "escrow" ? b.escrowId : b.paymentId;
              const escrowPayment = method === "escrow" && b.escrowId
                ? escrowPayments?.find((ee) => ee.id.toString() === b.escrowId)
                : undefined;
              const isRecipient = me && escrowPayment?.to === me;
              return (
                <div className="bill-row" key={b.id}>
                  <div className="bill-row-main">
                    <div className="bill-row-top">
                      <span className="bill-label">{b.label}</span>

                      {/* Method badge */}
                      <span className={`bill-method-pill ${method}`}>
                        {method === "escrow" ? "Escrow" : "Direct"}
                      </span>

                      {/* Status pills */}
                      {status === "paid" && <span className="pill pill-ok">Paid</span>}
                      {status === "held" && (
                        <span className="pill pill-warn">Held in escrow</span>
                      )}
                      {status === "refunded" && (
                        <span className="pill pill-cancel">Refunded</span>
                      )}
                      {status === "settling" && (
                        <span className="pill pill-warn">Settling…</span>
                      )}
                      {status === "failed" && (
                        <span className="pill pill-fail">Failed</span>
                      )}
                      {status === "draft" && overdue && (
                        <span className="pill pill-fail">Overdue · {Math.abs(days)}d</span>
                      )}
                      {status === "draft" && dueSoon && (
                        <span className="pill pill-due">Due in {days}d</span>
                      )}
                      {status === "draft" && !overdue && !dueSoon && (
                        <span className="pill pill-scheduled">Due {b.dueDate}</span>
                      )}
                    </div>
                    {b.description && (
                      <div className="bill-desc">{b.description}</div>
                    )}
                    <div className="bill-meta">
                      <a
                        href={`https://testnet.arcscan.app/address/${b.recipient}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(b.recipient)}
                      </a>
                      <span>·</span>
                      <strong>{formatUSDC(Number(b.amountUSDC))} USDC</strong>
                      {idLabel !== undefined && (
                        <>
                          <span>·</span>
                          <span className="bill-pid">#{idLabel}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="bill-row-actions">
                    {status === "draft" && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePay(b)}
                        disabled={
                          payingId === b.id ||
                          !isConnected ||
                          !onArc ||
                          (method === "escrow" && !escrowConfigured)
                        }
                      >
                        {payingId === b.id
                          ? method === "escrow"
                            ? "Locking…"
                            : "Paying…"
                          : method === "escrow"
                            ? "Lock in escrow"
                            : "Pay now"}
                      </button>
                    )}
                    {method === "escrow" && status === "held" && isRecipient && escrowPayment && (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleEscrowWithdraw(b, escrowPayment.id)}
                          disabled={payingId === b.id || !isConnected || !onArc}
                        >
                          {payingId === b.id ? "Withdrawing…" : "Withdraw"}
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => handleEscrowRefund(b, escrowPayment.id)}
                          disabled={payingId === b.id || !isConnected || !onArc}
                        >
                          {payingId === b.id ? "Refunding…" : "Refund payer"}
                        </button>
                      </>
                    )}
                    {status !== "settling" && status !== "held" && (
                      <button
                        className="btn-cancel"
                        onClick={() => handleDelete(b.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {msg && (
          <div className={`interact-msg ${msg.kind}`} style={{ marginTop: 12 }}>
            <div>{msg.text}</div>
            {msg.txHash && (
              <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>tx:</span>{" "}
                <a
                  href={`https://testnet.arcscan.app/tx/${msg.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {msg.txHash.slice(0, 10)}…{msg.txHash.slice(-6)} ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
