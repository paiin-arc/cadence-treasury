import { useAccount } from "wagmi";
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
  return `Every ${Math.round(seconds / 604800)}w`;
}

export default function UpcomingPaymentsWidget() {
  const { address } = useAccount();
  const { data: payments, isLoading } = usePayments(20);

  const myPayments = (payments ?? []).filter(
    (p) => address && p.active && (p.owner as string).toLowerCase() === address.toLowerCase()
  );

  return (
    <div className="upcoming-payments-widget">
      <div className="widget-header">
        <div className="title-group">
          <h3>Scheduled Queue</h3>
          <span className="badge-pill">{myPayments.length} upcoming</span>
        </div>
      </div>

      {isLoading ? (
        <div className="widget-empty">Loading scheduled payments…</div>
      ) : myPayments.length === 0 ? (
        <div className="widget-empty-state">
          <span className="calendar-icon-bg">📅</span>
          <p className="empty-title">No scheduled payments</p>
          <p className="empty-sub">Create a recurring payment schedule to automate USDC payouts.</p>
        </div>
      ) : (
        <div className="payments-queue-list">
          {myPayments.slice(0, 5).map((p) => {
            const nextDate = new Date(Number(p.nextExecTime) * 1000);
            const isDue = Date.now() >= Number(p.nextExecTime) * 1000;

            return (
              <div key={p.id.toString()} className="queue-item">
                <div className="item-icon-box">
                  ⏱
                </div>
                <div className="item-details">
                  <div className="item-line1">
                    <span className="recipient-addr">{shortAddr(p.recipient)}</span>
                    <span className="payment-amount">${formatUSDC(p.amount)} USDC</span>
                  </div>
                  <div className="item-line2">
                    <span className="freq-tag">{formatFrequency(Number(p.frequency))}</span>
                    <span className={`time-tag ${isDue ? "due" : ""}`}>
                      {isDue ? "⚡ Due for Execution" : `Next: ${nextDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
