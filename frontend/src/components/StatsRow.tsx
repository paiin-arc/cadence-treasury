import { useTreasuryStats } from "../hooks/useTreasury";

function formatUSDC(n: number) {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}K`;
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
};

export default function StatsRow() {
  const { data, isLoading } = useTreasuryStats();

  const cards = [
    {
      key: "balance",
      label: "Treasury Balance",
      value: data ? formatUSDC(data.treasuryBalance) : "—",
      sub: "Live USDC in treasury",
      icon: ICONS.vault,
      color: "#67e8f9",
      tone: "primary" as const,
    },
    {
      key: "deposits",
      label: "Total Deposits",
      value: data ? formatUSDC(data.totalDeposits) : "—",
      sub: data ? `${data.depositCount} deposit${data.depositCount === 1 ? "" : "s"}` : " ",
      icon: ICONS.deposit,
      color: "#34d399",
      tone: "secondary" as const,
    },
    {
      key: "scheduled",
      label: "Scheduled Volume",
      value: data ? formatUSDC(data.totalScheduled) : "—",
      sub: data ? `${data.scheduledCount} payment${data.scheduledCount === 1 ? "" : "s"} queued` : " ",
      icon: ICONS.scheduled,
      color: "#a78bfa",
      tone: "secondary" as const,
    },
    {
      key: "paid",
      label: "Total Paid Out",
      value: data ? formatUSDC(data.totalPaidOut) : "—",
      sub: data ? `${data.paidOutCount} execution${data.paidOutCount === 1 ? "" : "s"}` : " ",
      icon: ICONS.paid,
      color: "#fbbf24",
      tone: "secondary" as const,
    },
  ];

  return (
    <div className="stats-row">
      <div className="stats-header">
        <h2>Live treasury stats</h2>
        <span className="stats-pulse">
          <span className="pulse" /> Auto-refresh every 15s
        </span>
      </div>
      <div className="stats-grid">
        {cards.map((c) => (
          <div className={`stat-card stat-card-${c.tone}`} key={c.key}>
            <div className="stat-card-glow" style={{ background: `radial-gradient(circle at 80% 0%, ${c.color}22, transparent 60%)` }} />
            <div className="stat-card-row">
              <div className="stat-card-label">{c.label}</div>
              <span className="stat-card-icon" style={{ color: c.color, borderColor: `${c.color}40`, background: `${c.color}10` }}>
                {c.icon}
              </span>
            </div>
            <div className={`stat-card-value ${c.tone === "primary" ? "accent" : ""}`}>
              {isLoading && !data ? "…" : c.value}
            </div>
            <div className="stat-card-sub">{c.sub}</div>
            <svg className="stat-card-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
              <path
                d="M0 18 Q 18 6, 32 14 T 68 10 T 100 6"
                fill="none"
                stroke={c.color}
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.55"
              />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
