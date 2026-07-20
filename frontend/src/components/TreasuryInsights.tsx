import { useMemo } from "react";
import type { TxHistoryItem, AgentLog } from "../hooks/useTreasury";

interface TreasuryInsightsProps {
  historyItems: TxHistoryItem[];
  agentLogs: AgentLog[];
  activeSchedulesCount: number;
}

function formatUSDC(n: number) {
  if (n === 0) return "$0.00";
  if (n >= 100000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TreasuryInsights({
  historyItems,
  agentLogs,
  activeSchedulesCount,
}: TreasuryInsightsProps) {
  const stats = useMemo(() => {
    let highestBalance = 0;
    let lowestBalance = 0;
    let currentBal = 0;
    let totalDepositSum = 0;
    let totalWithdrawSum = 0;
    let totalOutflowSum = 0;
    let largestDeposit = 0;
    let largestWithdrawal = 0;
    let executionCount = 0;

    const daysWithActivity = new Set<string>();

    // Process chronological items
    const sorted = [...historyItems].sort((a, b) => Number(a.blockNumber - b.blockNumber));

    sorted.forEach((item) => {
      const amount = item.amount ? Number(item.amount) / 1e6 : 0;
      const dayKey = item.timestamp
        ? new Date(item.timestamp).toISOString().split("T")[0]
        : "today";
      daysWithActivity.add(dayKey);

      if (item.type === "deposit") {
        currentBal += amount;
        totalDepositSum += amount;
        if (amount > largestDeposit) largestDeposit = amount;
      } else if (item.type === "withdraw") {
        currentBal = Math.max(0, currentBal - amount);
        totalWithdrawSum += amount;
        if (amount > largestWithdrawal) largestWithdrawal = amount;
      } else if (item.type === "execute") {
        currentBal = Math.max(0, currentBal - amount);
        totalOutflowSum += amount;
        executionCount++;
      }

      if (currentBal > highestBalance) highestBalance = currentBal;
    });

    const activeDaysCount = Math.max(1, daysWithActivity.size);
    const avgDailyOutflow = totalOutflowSum / activeDaysCount;
    const avgDailyBalance = currentBal / activeDaysCount;

    return {
      highestBalance,
      lowestBalance,
      avgDailyBalance,
      avgDailyOutflow,
      largestDeposit,
      largestWithdrawal,
      activeSchedulesCount,
      totalAgentExecutions: agentLogs.length,
      hasData: historyItems.length > 0 || agentLogs.length > 0,
    };
  }, [historyItems, agentLogs, activeSchedulesCount]);

  if (!stats.hasData) {
    return (
      <div className="treasury-insights-card empty">
        <div className="insights-header">
          <h3>Treasury Insights & Benchmarks</h3>
          <span className="insights-badge">Real-time Analytics</span>
        </div>
        <div className="insights-empty-state">
          <span className="insights-icon">📊</span>
          <h4>No treasury activity yet</h4>
          <p>Create your first schedule or deposit funds to generate deep analytics benchmarks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="treasury-insights-card">
      <div className="insights-header">
        <div>
          <h3>Treasury Insights & Benchmarks</h3>
          <span className="insights-sub">Computed metrics from historical block logs</span>
        </div>
        <span className="insights-badge live">Live Sync</span>
      </div>

      <div className="insights-grid-4">
        <div className="insight-tile">
          <span className="tile-label">Highest Treasury Balance</span>
          <span className="tile-val green">{formatUSDC(stats.highestBalance)}</span>
          <span className="tile-sub">Historical peak</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Average Daily Outflow</span>
          <span className="tile-val orange">{formatUSDC(stats.avgDailyOutflow)}</span>
          <span className="tile-sub">Per active day</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Largest Single Deposit</span>
          <span className="tile-val green">{formatUSDC(stats.largestDeposit)}</span>
          <span className="tile-sub">Max single credit</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Largest Single Withdrawal</span>
          <span className="tile-val amber">{formatUSDC(stats.largestWithdrawal)}</span>
          <span className="tile-sub">Max single debit</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Average Daily Balance</span>
          <span className="tile-val">{formatUSDC(stats.avgDailyBalance)}</span>
          <span className="tile-sub">Vault average</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Active Schedules</span>
          <span className="tile-val blue">{stats.activeSchedulesCount}</span>
          <span className="tile-sub">Currently queued</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Total Agent Executions</span>
          <span className="tile-val purple">{stats.totalAgentExecutions}</span>
          <span className="tile-sub">Automated actions</span>
        </div>

        <div className="insight-tile">
          <span className="tile-label">Lowest Treasury Balance</span>
          <span className="tile-val">{formatUSDC(stats.lowestBalance)}</span>
          <span className="tile-sub">Vault floor</span>
        </div>
      </div>
    </div>
  );
}
