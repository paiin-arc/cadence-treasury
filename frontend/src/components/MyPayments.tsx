import { useState } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { usePayments } from "../hooks/useTreasury";

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

export default function MyPayments() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const { data: payments, isLoading } = usePayments(50);
  const { writeContractAsync } = useWriteContract();

  const [cancelling, setCancelling] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!isConnected || !onArc) return null;

  const mine = (payments ?? []).filter(
    (p) => address && (p.owner as string).toLowerCase() === address.toLowerCase()
  );

  const handleCancel = async (id: number) => {
    setMsg(null);
    try {
      setCancelling(id);
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "cancelPayment",
        args: [BigInt(id)],
      });
      setMsg({ kind: "ok", text: `Cancel sent (${hash.slice(0, 10)}…), waiting…` });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
        pollingInterval: 1_500,
      });
      if (receipt.status !== "success") {
        throw new Error("Cancel reverted");
      }
      setMsg({ kind: "ok", text: `Payment #${id} cancelled.` });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Cancel failed" });
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="my-payments">
      <div className="schedule-card">
        <div className="schedule-header">
          <h3>Your scheduled payments</h3>
          <span className="schedule-balance">
            {mine.length} payment{mine.length === 1 ? "" : "s"}
          </span>
        </div>

        {isLoading ? (
          <p className="interact-help">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="interact-help">
            You haven't scheduled any payments yet. Use the form above to create one.
          </p>
        ) : (
          <table className="payments-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Recipient</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Frequency</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mine.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>
                    <a
                      href={`https://testnet.arcscan.app/address/${p.recipient}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddr(p.recipient as string)}
                    </a>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatUSDC(p.amount as bigint)} USDC</td>
                  <td>{formatFrequency(Number(p.frequency))}</td>
                  <td>
                    {p.cancelled ? (
                      <span className="pill pill-cancel">Cancelled</span>
                    ) : !p.active && p.executedCount > 0 ? (
                      <span className="pill pill-ok">Done</span>
                    ) : !p.active ? (
                      <span className="pill pill-fail">Failed</span>
                    ) : p.requiresApproval ? (
                      <span className="pill pill-warn">Needs approval</span>
                    ) : p.isDue ? (
                      <span className="pill pill-due">Due now</span>
                    ) : p.executedCount > 0 ? (
                      <span className="pill pill-ok">
                        Active · {p.executedCount} paid
                      </span>
                    ) : (
                      <span className="pill pill-scheduled">Scheduled</span>
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
              ))}
            </tbody>
          </table>
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
