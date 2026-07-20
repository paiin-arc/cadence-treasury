import { useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import { arcTestnet, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { safeFees } from "../lib/gas";
import { recordScheduledPayments } from "../lib/paymentJournal";
import { waitForConfirmation } from "../lib/tx";

const FREQUENCY_OPTIONS = [
  { label: "One-off", seconds: 0 },
  { label: "Every hour", seconds: 3600 },
  { label: "Daily", seconds: 86400 },
  { label: "Weekly", seconds: 604800 },
  { label: "Monthly (30d)", seconds: 2592000 },
];

function formatUSDC(raw: bigint | undefined) {
  if (raw === undefined) return "—";
  return (Number(raw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SchedulePanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [freqSeconds, setFreqSeconds] = useState(0);
  const [delayMinutes, setDelayMinutes] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; txHash?: string } | null>(null);

  const userBalance = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 30_000 },
  });

  const maxTx = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "maxSingleTx",
    query: { enabled: onArc },
  });

  const { writeContractAsync } = useWriteContract();

  if (!isConnected || !onArc) return null;

  const balance = userBalance.data as bigint | undefined;
  const maxAmount = maxTx.data as bigint | undefined;
  const approvalThreshold = maxAmount ? maxAmount / 2n : undefined;

  const handleSubmit = async () => {
    setMsg(null);

    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      setMsg({ kind: "err", text: "Recipient must be a valid 0x address." });
      return;
    }
    const normalizedRecipient = recipient.toLowerCase() as `0x${string}`;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ kind: "err", text: "Enter a positive amount." });
      return;
    }
    const amountRaw = BigInt(Math.round(amt * 1_000_000));
    if (maxAmount !== undefined && amountRaw > maxAmount) {
      setMsg({ kind: "err", text: `Amount exceeds maxSingleTx (${formatUSDC(maxAmount)} USDC).` });
      return;
    }
    if (balance !== undefined && amountRaw > balance) {
      setMsg({ kind: "err", text: `Amount exceeds your treasury balance (${formatUSDC(balance)} USDC). Deposit more first.` });
      return;
    }
    const delay = Number(delayMinutes);
    if (!Number.isFinite(delay) || delay < 0) {
      setMsg({ kind: "err", text: "Delay must be 0 or more minutes." });
      return;
    }

    try {
      setBusy(true);
      setMsg({ kind: "ok", text: "Submitting…" });
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "schedulePayment",
        args: [
          normalizedRecipient,
          amountRaw,
          BigInt(freqSeconds),
          BigInt(delay * 60),
        ],
        ...(await safeFees()),
      } as any);
      setMsg({
        kind: "ok",
        text: `Payment sent (${hash.slice(0, 10)}…), waiting…`,
        txHash: hash,
      });
      const receipt = await waitForConfirmation(hash, "Schedule");
      if (!receipt) {
        setMsg({
          kind: "ok",
          text: "Payment submitted. Arc RPC could not confirm it yet, but the tx may already be mined. Check ArcScan and the list will refresh automatically.",
          txHash: hash,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["payments"] }),
          queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
          queryClient.invalidateQueries({ queryKey: ["treasuryStats"] }),
        ]);
        return;
      }

      let paymentId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TREASURY_ABI,
            data: log.data,
            topics: (log as any).topics,
          });
          if ((decoded as any).eventName === "PaymentScheduled") {
            paymentId = ((decoded as any).args as { paymentId: bigint }).paymentId.toString();
            break;
          }
        } catch {
          /* not a treasury event */
        }
      }

      if (paymentId && address) {
        recordScheduledPayments(address, [
          {
            id: paymentId,
            owner: address.toLowerCase(),
            recipient: normalizedRecipient,
            amountRaw: amountRaw.toString(),
            frequency: freqSeconds,
            delaySeconds: delay * 60,
            txHash: hash,
            scheduledAt: Date.now(),
            source: "schedule",
          },
        ]);
      }

      const willTriggerApproval =
        approvalThreshold !== undefined && amountRaw >= approvalThreshold;
      setMsg({
        kind: "ok",
        text: willTriggerApproval
          ? `Scheduled${paymentId ? ` as #${paymentId}` : ""} — flagged for human review.`
          : `Scheduled${paymentId ? ` as #${paymentId}` : ""} — the bot will execute on time.`,
        txHash: hash,
      });
      setRecipient("");
      setAmount("");
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
        queryClient.invalidateQueries({ queryKey: ["treasuryStats"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Transaction failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="schedule-panel">
      <div className="schedule-card">
        <div className="schedule-header">
          <h3>Schedule a payment</h3>
          <span className="schedule-balance">
            Available: <strong>{formatUSDC(balance)}</strong> USDC
          </span>
        </div>
        <p className="interact-help">
          Queue a one-off or recurring USDC transfer from your treasury balance to an allowlisted recipient.
          The bot executes it on time.
        </p>

        <label className="field">
          <span>Recipient</span>
          <div className="form-row">
            <input
              type="text"
              placeholder="0x…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={busy}
              spellCheck={false}
            />
          </div>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Amount</span>
            <div className="form-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <span className="suffix">USDC</span>
            </div>
            {maxAmount !== undefined && (
              <span className="field-hint">
                Max per tx: {formatUSDC(maxAmount)} · Auto-flag at ≥ {formatUSDC(approvalThreshold)}
              </span>
            )}
          </label>
        </div>

        <div className="field-row two">
          <label className="field">
            <span>Frequency</span>
            <div className="form-row">
              <select
                value={freqSeconds}
                onChange={(e) => setFreqSeconds(Number(e.target.value))}
                disabled={busy}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.seconds}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="field">
            <span>First fires in</span>
            <div className="form-row">
              <input
                type="text"
                inputMode="numeric"
                placeholder="1"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
                disabled={busy}
              />
              <span className="suffix">min</span>
            </div>
          </label>
        </div>

        <button
          className="btn btn-primary form-btn"
          onClick={handleSubmit}
          disabled={busy || !recipient || !amount}
        >
          {busy ? "Scheduling…" : "Schedule payment"}
        </button>

        {msg && (
          <div className={`interact-msg ${msg.kind}`}>
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
