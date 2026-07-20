import { useTreasuryStats } from "../hooks/useTreasury";

interface StatsRowProps {
  failedCount?: number;
  pendingCount?: number;
}

function formatUSDC(n: number) {
  if (n >= 100000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StatsRow({ failedCount = 0, pendingCount = 0 }: StatsRowProps) {
  const { data, isLoading } = useTreasuryStats();

  const totalExecutions = (data?.paidOutCount ?? 0) + failedCount;
  const successRate = totalExecutions > 0 
    ? ((data?.paidOutCount ?? 0) / totalExecutions * 100).toFixed(1)
    : "100.0";

  const cards = [
    {
      key: "scheduled",
      label: "Scheduled Funds",
      value: data ? formatUSDC(data.totalScheduled) : "—",
      sub: data ? `${data.scheduledCount} queued` : " ",
      icon: "⏱",
      color: "#6366F1",
    },
    {
      key: "paid",
      label: "Total Executed",
      value: data ? formatUSDC(data.totalPaidOut) : "—",
      sub: data ? `${data.paidOutCount} payments` : " ",
      icon: "↗",
      color: "#3B82F6",
    },
    {
      key: "pending",
      label: "Pending",
      value: `${data ? data.scheduledCount + pendingCount : 0}`,
      sub: "Awaiting trigger",
      icon: "◈",
      color: "#F59E0B",
    },
    {
      key: "rate",
      label: "Success Rate",
      value: `${successRate}%`,
      sub: `${failedCount} failed`,
      icon: "✓",
      color: "#10B981",
    },
  ];

  return (
    <div className="clean-stats-row">
      {cards.map((c) => (
        <div className="clean-stat-card" key={c.key}>
          <div className="clean-stat-top">
            <span className="clean-stat-icon" style={{ color: c.color, background: `${c.color}12` }}>
              {c.icon}
            </span>
            <span className="clean-stat-label">{c.label}</span>
          </div>
          <div className="clean-stat-value">{isLoading && !data ? "…" : c.value}</div>
          <div className="clean-stat-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
