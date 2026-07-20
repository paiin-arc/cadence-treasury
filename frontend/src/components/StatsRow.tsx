import { useTreasuryStats } from "../hooks/useTreasury";

interface StatsRowProps {
  failedCount?: number;
  pendingCount?: number;
}

function formatUSDC(n: number) {
  if (n >= 100000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ICONS = {
  vault: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v0M9 12h0M12 15v0M15 12h0" />
    </svg>
  ),
  deposit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  ),
  scheduled: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  paid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  failed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  rate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

export default function StatsRow({ failedCount = 0, pendingCount = 0 }: StatsRowProps) {
  const { data, isLoading } = useTreasuryStats();

  const totalExecutions = (data?.paidOutCount ?? 0) + failedCount;
  const successRate = totalExecutions > 0 
    ? ((data?.paidOutCount ?? 0) / totalExecutions * 100).toFixed(1)
    : "100.0";

  const cards = [
    {
      key: "balance",
      label: "Treasury Balance",
      value: data ? formatUSDC(data.treasuryBalance) : "—",
      sub: "Live USDC in vault",
      icon: ICONS.vault,
      color: "#F97316", // Warm Orange
      sparkline: "M0 20 Q 25 5, 50 15 T 100 8",
    },
    {
      key: "deposits",
      label: "Total Deposits",
      value: data ? formatUSDC(data.totalDeposits) : "—",
      sub: data ? `${data.depositCount} deposits` : " ",
      icon: ICONS.deposit,
      color: "#10B981", // Emerald Green
      sparkline: "M0 18 Q 30 8, 60 14 T 100 4",
    },
    {
      key: "scheduled",
      label: "Scheduled Volume",
      value: data ? formatUSDC(data.totalScheduled) : "—",
      sub: data ? `${data.scheduledCount} queued` : " ",
      icon: ICONS.scheduled,
      color: "#6366F1", // Indigo
      sparkline: "M0 15 Q 20 18, 50 8 T 100 12",
    },
    {
      key: "paid",
      label: "Total Paid Out",
      value: data ? formatUSDC(data.totalPaidOut) : "—",
      sub: data ? `${data.paidOutCount} executions` : " ",
      icon: ICONS.paid,
      color: "#3B82F6", // Blue
      sparkline: "M0 22 Q 40 10, 70 16 T 100 6",
    },
    {
      key: "pending",
      label: "Pending Payments",
      value: `${data ? data.scheduledCount + pendingCount : 0}`,
      sub: "Awaiting trigger",
      icon: ICONS.pending,
      color: "#F59E0B", // Amber
      sparkline: "M0 12 Q 35 22, 65 10 T 100 14",
    },
    {
      key: "failed",
      label: "Failed Txs",
      value: `${failedCount}`,
      sub: failedCount > 0 ? "Requires review" : "Zero errors",
      icon: ICONS.failed,
      color: failedCount > 0 ? "#EF4444" : "#9CA3AF", // Red
      sparkline: "M0 19 Q 25 15, 50 20 T 100 18",
    },
    {
      key: "rate",
      label: "Success Rate",
      value: `${successRate}%`,
      sub: "Execution health",
      icon: ICONS.rate,
      color: "#10B981", // Green
      sparkline: "M0 24 L 30 18 L 60 12 L 100 4",
    },
  ];

  return (
    <div className="redesigned-stats-row">
      <div className="stats-header">
        <div className="stats-title-group">
          <h2>Key Analytics Metrics</h2>
          <span className="stats-pulse-badge">
            <span className="pulse-dot" /> Auto-syncing live
          </span>
        </div>
      </div>
      <div className="stats-grid-7">
        {cards.map((c) => (
          <div className="stat-card-redesigned" key={c.key}>
            <div className="card-top-row">
              <span className="stat-label">{c.label}</span>
              <span className="stat-icon" style={{ color: c.color, background: `${c.color}15`, borderColor: `${c.color}30` }}>
                {c.icon}
              </span>
            </div>
            <div className="stat-val">{isLoading && !data ? "…" : c.value}</div>
            <div className="stat-sub">{c.sub}</div>
            <svg className="mini-sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
              <path
                d={c.sparkline}
                fill="none"
                stroke={c.color}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
