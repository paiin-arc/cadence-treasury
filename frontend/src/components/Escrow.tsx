import { useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { getAddress } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, ESCROW_ADDRESS } from "../lib/arc";
import { ESCROW_ABI } from "../lib/escrowAbi";
import { USDC_ARC_TESTNET, ERC20_ABI } from "../lib/wagmi";
import { useEscrowPayments, useEscrowArbiter, type EscrowPayment } from "../hooks/useEscrow";
import { safeFees } from "../lib/gas";
import { waitForConfirmation } from "../lib/tx";

function formatUSDC(raw: bigint) {
  return (Number(raw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function parseUsdc(s: string): bigint | null {
  if (!s.trim()) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 1_000_000));
}

export default function Escrow() {
  const escrowAddr = (ESCROW_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const escrowConfigured = !!ESCROW_ADDRESS;

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [view, setView] = useState<"sent" | "received">("sent");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"approve" | "pay" | "withdraw" | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; txHash?: `0x${string}` } | null>(null);

  const me = address?.toLowerCase();

  const { data: payments, isLoading } = useEscrowPayments();
  const { data: arbiter } = useEscrowArbiter();

  const allowance = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, escrowAddr] : undefined,
    query: { enabled: !!address && escrowConfigured && onArc, refetchInterval: 30_000 },
  });

  const walletUsdc = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 30_000 },
  });

  const { writeContractAsync } = useWriteContract();

  const sentEscrows = useMemo(
    () => (payments ?? []).filter((p) => p.payer === me),
    [payments, me]
  );
  const receivedEscrows = useMemo(
    () => (payments ?? []).filter((p) => p.to === me),
    [payments, me]
  );

  const visible = view === "sent" ? sentEscrows : receivedEscrows;

  if (!escrowConfigured) {
    return (
      <div className="docs">
        <section className="docs-card">
          <span className="docs-eyebrow">not configured</span>
          <h3>Escrow contract not set</h3>
          <p>
            Set <code>VITE_ESCROW_ADDRESS</code> in <code>frontend/.env</code> and restart the
            dev server.
          </p>
        </section>
      </div>
    );
  }

  if (!isConnected || !onArc) {
    return (
      <div className="docs">
        <section className="docs-card">
          <span className="docs-eyebrow">escrow</span>
          <h3>Connect on Arc Testnet to use Escrow</h3>
          <p>
            Hold USDC for vendors in a neutral contract. Refundable. Released by the recipient
            (or signed early by the arbiter).
          </p>
        </section>
      </div>
    );
  }

  const handleCreate = async () => {
    setMsg(null);

    // Validate + checksum the recipient address via viem's getAddress()
    let checksummedRecipient: `0x${string}`;
    try {
      checksummedRecipient = getAddress(recipient.trim()) as `0x${string}`;
    } catch {
      setMsg({ kind: "err", text: "Recipient must be a valid 0x address." });
      return;
    }
    const amt = parseUsdc(amount);
    if (!amt) {
      setMsg({ kind: "err", text: "Amount must be positive." });
      return;
    }
    if (walletUsdc.data !== undefined && amt > (walletUsdc.data as bigint)) {
      setMsg({ kind: "err", text: "Amount exceeds your wallet USDC balance." });
      return;
    }

    // Debug: log all addresses before sending the tx
    console.log("[Escrow:handleCreate]", {
      recipient: checksummedRecipient,
      escrowAddress: escrowAddr,
      amount: amt.toString(),
      refundTo: address,
    });

    try {
      const current = (allowance.data as bigint | undefined) ?? 0n;
      if (current < amt) {
        setBusy("approve");
        setMsg({ kind: "ok", text: "Approving escrow to spend USDC…" });

        // Debug: log the exact approval tx so you can verify it's ERC20 approve, not NFT
        console.log("[Escrow:approve]", {
          tokenContract: USDC_ARC_TESTNET,
          abi: "ERC20 — approve(address,uint256)",
          functionName: "approve",
          spender: escrowAddr,
          amount: amt.toString(),
        });

        const approveHash = await writeContractAsync({
          chainId: arcTestnet.id,
          address: USDC_ARC_TESTNET,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [escrowAddr, amt],
          ...(await safeFees()),
        } as any);
        const receipt = await waitForConfirmation(approveHash, "Approve");
        if (!receipt) {
          setMsg({
            kind: "ok",
            text: "Approval submitted, but Arc RPC did not confirm it yet. If your wallet shows it succeeded, try Create escrow again in a few seconds.",
            txHash: approveHash,
          });
          await Promise.allSettled([allowance.refetch()]);
          return;
        }
        await Promise.allSettled([allowance.refetch()]);
      }

      setBusy("pay");
      setMsg({ kind: "ok", text: "Creating escrow…" });
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: "pay",
        args: [checksummedRecipient, amt, address as `0x${string}`],
        ...(await safeFees()),
      } as any);
      const receipt = await waitForConfirmation(hash, "Pay");
      if (!receipt) {
        setMsg({
          kind: "ok",
          text: "Escrow submitted. Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.",
          txHash: hash,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
        ]);
        return;
      }

      setMsg({
        kind: "ok",
        text: `Escrow created (${hash.slice(0, 10)}…). Held until recipient withdraws or you refund.`,
        txHash: hash,
      });
      setRecipient("");
      setAmount("");
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["escrow:payments"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Tx failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleWithdraw = async (p: EscrowPayment) => {
    setMsg(null);
    try {
      setActingId(p.id.toString());
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: "withdraw",
        args: [[p.id]],
        ...(await safeFees()),
      } as any);
      setMsg({ kind: "ok", text: `Withdraw sent (${hash.slice(0, 10)}…)…` });
      const receipt = await waitForConfirmation(hash, "Withdraw");
      setMsg({
        kind: "ok",
        text: receipt
          ? `Withdrew ${formatUSDC(p.amount - p.withdrawnAmount)} USDC.`
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
      setActingId(null);
    }
  };

  const handleRefundByRecipient = async (p: EscrowPayment) => {
    setMsg(null);
    try {
      setActingId(p.id.toString());
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: "refundByRecipient",
        args: [p.id],
        ...(await safeFees()),
      } as any);
      setMsg({ kind: "ok", text: `Refund sent (${hash.slice(0, 10)}…)…` });
      const receipt = await waitForConfirmation(hash, "Refund");
      setMsg({
        kind: "ok",
        text: receipt
          ? `Refunded ${formatUSDC(p.amount)} USDC to payer.`
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
      setActingId(null);
    }
  };

  const userIsArbiter = me && arbiter && me === arbiter;

  return (
    <div className="escrow-panel">
      {/* Create form */}
      <div className="schedule-card">
        <div className="schedule-header">
          <div>
            <h3>Create escrow</h3>
            <p className="interact-help" style={{ marginTop: 4, marginBottom: 0 }}>
              Lock USDC into the escrow contract. Recipient withdraws when ready.
              Arbiter can refund if the deal goes sideways.
            </p>
          </div>
          <span className="schedule-balance">
            Wallet: <strong>{formatUSDC((walletUsdc.data as bigint) ?? 0n)}</strong> USDC
          </span>
        </div>

        <div className="field-row two" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Recipient</span>
            <div className="form-row">
              <input
                type="text"
                placeholder="0x…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={!!busy}
                spellCheck={false}
              />
            </div>
          </label>
          <label className="field">
            <span>Amount</span>
            <div className="form-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!!busy}
              />
              <span className="suffix">USDC</span>
            </div>
          </label>
        </div>

        <button
          className="btn btn-primary form-btn"
          onClick={handleCreate}
          disabled={!!busy || !recipient || !amount}
          style={{ marginTop: 4 }}
        >
          {busy === "approve" ? "Approving…" : busy === "pay" ? "Creating…" : "Create escrow"}
        </button>

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

      {/* Toggle */}
      <div className="escrow-toggle">
        <button
          className={`escrow-toggle-btn ${view === "sent" ? "active" : ""}`}
          onClick={() => setView("sent")}
        >
          Sent <span className="escrow-toggle-count">{sentEscrows.length}</span>
        </button>
        <button
          className={`escrow-toggle-btn ${view === "received" ? "active" : ""}`}
          onClick={() => setView("received")}
        >
          Received <span className="escrow-toggle-count">{receivedEscrows.length}</span>
        </button>
      </div>

      {/* List */}
      <div className="schedule-card">
        <div className="schedule-header">
          <h3>{view === "sent" ? "Escrows you sent" : "Escrows you received"}</h3>
          <a
            href={`https://testnet.arcscan.app/address/${escrowAddr}`}
            target="_blank"
            rel="noreferrer"
            className="schedule-balance"
            style={{ fontSize: 12 }}
          >
            Contract: {shortAddr(escrowAddr)} ↗
          </a>
        </div>

        {isLoading ? (
          <p className="interact-help">Loading escrows…</p>
        ) : visible.length === 0 ? (
          <p className="interact-help">
            {view === "sent"
              ? "You haven't created any escrows yet. Use the form above."
              : "No incoming escrows for your wallet yet."}
          </p>
        ) : (
          <div className="escrow-list">
            {visible.map((p) => {
              const isMineToWithdraw = view === "received" && p.status === "held";
              return (
                <div className="escrow-row" key={p.id.toString()}>
                  <div className="escrow-row-main">
                    <div className="escrow-row-top">
                      <span className="escrow-id">#{p.id.toString()}</span>
                      {p.status === "held" && (
                        <span className="pill pill-warn">Held in escrow</span>
                      )}
                      {p.status === "withdrawn" && (
                        <span className="pill pill-ok">Withdrawn</span>
                      )}
                      {p.status === "refunded" && (
                        <span className="pill pill-cancel">Refunded</span>
                      )}
                    </div>
                    <div className="escrow-row-meta">
                      <strong>{formatUSDC(p.amount)} USDC</strong>
                      <span>·</span>
                      <span>to</span>
                      <a
                        href={`https://testnet.arcscan.app/address/${p.to}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(p.to)}
                      </a>
                      <span>·</span>
                      <span>refund→</span>
                      <a
                        href={`https://testnet.arcscan.app/address/${p.refundTo}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(p.refundTo)}
                      </a>
                      {p.txHash && (
                        <>
                          <span>·</span>
                          <a
                            href={`https://testnet.arcscan.app/tx/${p.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            create tx ↗
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="escrow-row-actions">
                    {isMineToWithdraw && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleWithdraw(p)}
                        disabled={actingId === p.id.toString()}
                      >
                        {actingId === p.id.toString() ? "Withdrawing…" : "Withdraw"}
                      </button>
                    )}
                    {view === "received" && p.status === "held" && (
                      <button
                        className="btn-cancel"
                        onClick={() => handleRefundByRecipient(p)}
                        disabled={actingId === p.id.toString()}
                        title="Voluntarily refund the payer"
                      >
                        Refund payer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Arbiter note for sent view */}
        {view === "sent" && (
          <div className="escrow-arbiter-note">
            <strong>Need to refund as arbiter?</strong>
            <p>
              The arbiter on this contract is{" "}
              <code>{arbiter ? shortAddr(arbiter) : "…"}</code> (your Circle scheduler wallet),
              not the wallet you connected. Run:
            </p>
            <pre>
              <code>
                {`# from backend/
npx tsx --env-file=.env scripts/refund-escrow.ts <paymentId>`}
              </code>
            </pre>
            {userIsArbiter && (
              <p style={{ marginTop: 8, color: "var(--c-accent)" }}>
                <strong>Note:</strong> Your connected wallet IS the arbiter — but the Phase B
                UI still uses the CLI for arbiter refunds to keep Rabby and Circle wallets
                isolated.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
