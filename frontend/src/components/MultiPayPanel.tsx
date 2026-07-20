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

const SLOTS = [0, 1, 2, 3];
const FREQUENCY_OPTIONS = [
  { label: "One-off", seconds: 0 },
  { label: "Hourly", seconds: 3600 },
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

export default function MultiPayPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [rows, setRows] = useState(
    SLOTS.map(() => ({ recipient: "", amount: "" }))
  );
  const [freqSeconds, setFreqSeconds] = useState(2592000);
  const [delayMinutes, setDelayMinutes] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

  const totalAmount = rows.reduce((sum, r) => {
    const n = Number(r.amount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const filledRows = rows.filter((r) => r.recipient.trim() && r.amount.trim());

  const updateRow = (i: number, key: "recipient" | "amount", val: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  };

  const handleSubmit = async () => {
    setMsg(null);

    if (filledRows.length === 0) {
      setMsg({ kind: "err", text: "Add at least one recipient + amount." });
      return;
    }

    const recipients: `0x${string}`[] = [];
    const amounts: bigint[] = [];
    const maxAmount = maxTx.data as bigint | undefined;

    for (const r of filledRows) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(r.recipient)) {
        setMsg({ kind: "err", text: `Invalid recipient: ${r.recipient.slice(0, 10)}…` });
        return;
      }
      const n = Number(r.amount);
      if (!Number.isFinite(n) || n <= 0) {
        setMsg({ kind: "err", text: `Invalid amount: ${r.amount}` });
        return;
      }
      const raw = BigInt(Math.round(n * 1_000_000));
      if (maxAmount !== undefined && raw > maxAmount) {
        setMsg({
          kind: "err",
          text: `${n} USDC exceeds maxSingleTx (${formatUSDC(maxAmount)} USDC)`,
        });
        return;
      }
      recipients.push(r.recipient.toLowerCase() as `0x${string}`);
      amounts.push(raw);
    }

    const totalRaw = amounts.reduce((s, a) => s + a, 0n);
    if (userBalance.data !== undefined && totalRaw > (userBalance.data as bigint)) {
      setMsg({
        kind: "err",
        text: `Total ${formatUSDC(totalRaw)} USDC exceeds your treasury balance (${formatUSDC(userBalance.data as bigint)} USDC). Deposit more first.`,
      });
      return;
    }

    const delay = Number(delayMinutes);
    if (!Number.isFinite(delay) || delay < 0) {
      setMsg({ kind: "err", text: "Delay must be 0 or more minutes." });
      return;
    }

    const frequencies = recipients.map(() => BigInt(freqSeconds));
    const delays = recipients.map(() => BigInt(delay * 60));

    try {
      setBusy(true);
      setMsg({ kind: "ok", text: "One signature scheduling all payments…" });

      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "schedulePaymentBatch",
        args: [recipients, amounts, frequencies, delays],
        ...(await safeFees()),
      } as any);

      setMsg({ kind: "ok", text: `Sent (${hash.slice(0, 10)}…), waiting for confirmation…` });

      const receipt = await waitForConfirmation(hash, "Batch");
      if (!receipt) {
        setMsg({
          kind: "ok",
          text: `Batch submitted (${hash.slice(0, 10)}…). Arc RPC could not confirm it yet; check ArcScan and the list will refresh automatically.`,
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["payments"] }),
          queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
          queryClient.invalidateQueries({ queryKey: ["treasuryStats"] }),
        ]);
        return;
      }

      const scheduledIds: string[] = [];
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TREASURY_ABI,
            data: log.data,
            topics: (log as any).topics,
          });
          if ((decoded as any).eventName === "PaymentScheduled") {
            scheduledIds.push(((decoded as any).args as { paymentId: bigint }).paymentId.toString());
          }
        } catch {
          /* not a treasury event */
        }
      }

      if (address && scheduledIds.length > 0) {
        recordScheduledPayments(
          address,
          scheduledIds.map((id, index) => ({
            id,
            owner: address.toLowerCase(),
            recipient: recipients[index],
            amountRaw: amounts[index].toString(),
            frequency: freqSeconds,
            delaySeconds: delay * 60,
            txHash: hash,
            scheduledAt: Date.now(),
            source: "batch",
          }))
        );
      }

      setMsg({
        kind: "ok",
        text: `Scheduled ${recipients.length} payment${recipients.length === 1 ? "" : "s"}${scheduledIds.length > 0 ? ` (#${scheduledIds.join(", #")})` : ""} in one tx · ${hash.slice(0, 10)}…`,
      });
      setRows(SLOTS.map(() => ({ recipient: "", amount: "" })));
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
        queryClient.invalidateQueries({ queryKey: ["treasuryStats"] }),
      ]);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Tx failed" });
    } finally {
      setBusy(false);
    }
  };

  if (!isConnected || !onArc) {
    return (
      <div className="multipay-panel">
        <div className="schedule-card">
          <h3>Connect on Arc Testnet to use Multi-pay</h3>
          <p className="interact-help">
            Schedule up to 4 wallets in a single signed transaction — perfect for payroll runs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="multipay-panel">
      <div className="schedule-card">
        <div className="schedule-header">
          <div>
            <h3>Multi-pay · 4 wallets, 1 signature</h3>
            <p className="interact-help" style={{ marginTop: 4, marginBottom: 0 }}>
              Bundle salary runs into a single signed transaction. Set frequency once.
            </p>
          </div>
          <span className="schedule-balance">
            Available: <strong>{formatUSDC(userBalance.data as bigint)}</strong> USDC
          </span>
        </div>

        <div className="mp-rows" style={{ marginTop: 18 }}>
          {rows.map((r, i) => (
            <div className="mp-row" key={i}>
              <div className="mp-row-num">{i + 1}</div>
              <div className="mp-row-fields">
                <input
                  type="text"
                  placeholder="Recipient 0x…"
                  value={r.recipient}
                  onChange={(e) => updateRow(i, "recipient", e.target.value)}
                  disabled={busy}
                  spellCheck={false}
                />
                <div className="mp-row-amount">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={r.amount}
                    onChange={(e) => updateRow(i, "amount", e.target.value)}
                    disabled={busy}
                  />
                  <span>USDC</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="field-row two" style={{ marginTop: 16 }}>
          <label className="field">
            <span>Frequency</span>
            <div className="form-row">
              <select
                value={freqSeconds}
                onChange={(e) => setFreqSeconds(Number(e.target.value))}
                disabled={busy}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.seconds}>{o.label}</option>
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
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
                disabled={busy}
              />
              <span className="suffix">min</span>
            </div>
          </label>
        </div>

        <div className="mp-summary" style={{ marginTop: 14 }}>
          <span>{filledRows.length} of 4 wallets · Total</span>
          <strong>
            {totalAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} USDC
          </strong>
        </div>

        <button
          className="btn btn-primary form-btn"
          onClick={handleSubmit}
          disabled={busy || filledRows.length === 0}
          style={{ marginTop: 16 }}
        >
          {busy
            ? "Scheduling…"
            : `Sign once · schedule ${filledRows.length || ""} payment${filledRows.length === 1 ? "" : "s"}`.trim()}
        </button>

        {msg && (
          <div className={`interact-msg ${msg.kind}`} style={{ marginTop: 12 }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
