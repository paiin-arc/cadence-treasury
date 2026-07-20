import { useState, useMemo } from "react";
import type { TxHistoryItem, AgentLog, FailedTx } from "../hooks/useTreasury";

interface AnalyticsChartsProps {
  historyItems: TxHistoryItem[];
  agentLogs: AgentLog[];
  failedTxs: FailedTx[];
  scheduledPaymentsCount: number;
}

function formatUSDC(n: number) {
  if (n === 0) return "$0.00";
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AnalyticsCharts({
  historyItems,
  failedTxs,
  scheduledPaymentsCount,
}: AnalyticsChartsProps) {
  const [activeRange, setActiveRange] = useState<"7D" | "30D" | "ALL">("30D");

  // Calculate range cutoff timestamp
  const rangeCutoff = useMemo(() => {
    const now = Date.now();
    if (activeRange === "7D") return now - 7 * 86400 * 1000;
    if (activeRange === "30D") return now - 30 * 86400 * 1000;
    return 0; // ALL
  }, [activeRange]);

  // Filter history within selected range
  const filteredHistory = useMemo(() => {
    return historyItems.filter((item) => !item.timestamp || item.timestamp >= rangeCutoff);
  }, [historyItems, rangeCutoff]);

  // 1. Treasury Growth Calculations
  const growthData = useMemo(() => {
    let cumulative = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    const points: { x: number; y: number; balance: number }[] = [];
    const sorted = [...filteredHistory].sort((a, b) => Number(a.blockNumber - b.blockNumber));

    sorted.forEach((item) => {
      const amt = item.amount ? Number(item.amount) / 1e6 : 0;
      if (item.type === "deposit") {
        cumulative += amt;
        totalDeposits += amt;
      } else if (item.type === "withdraw") {
        cumulative = Math.max(0, cumulative - amt);
        totalWithdrawals += amt;
      } else if (item.type === "execute") {
        cumulative = Math.max(0, cumulative - amt);
      }
      points.push({ x: 0, y: 0, balance: cumulative });
    });

    const maxBal = Math.max(...points.map((p) => p.balance), 10);
    const width = 500;
    const height = 140;

    const mappedPoints = points.map((p, idx) => {
      const x = points.length > 1 ? (idx / (points.length - 1)) * width : width / 2;
      const y = height - (p.balance / maxBal) * (height - 30) - 15;
      return { x, y, balance: p.balance };
    });

    // Build SVG Path string
    let dPath = "";
    if (mappedPoints.length === 0) {
      dPath = `M0 130 L500 130`;
    } else if (mappedPoints.length === 1) {
      dPath = `M0 ${mappedPoints[0].y} L500 ${mappedPoints[0].y}`;
    } else {
      dPath = `M ${mappedPoints[0].x} ${mappedPoints[0].y}`;
      for (let i = 1; i < mappedPoints.length; i++) {
        const prev = mappedPoints[i - 1];
        const curr = mappedPoints[i];
        const cx = (prev.x + curr.x) / 2;
        dPath += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
      }
    }

    return {
      points: mappedPoints,
      dPath,
      totalDeposits,
      totalWithdrawals,
      netBalance: cumulative,
      hasData: points.length > 0,
    };
  }, [filteredHistory]);

  // 2. Outflow & Spending Calculations
  const spendingData = useMemo(() => {
    const executed = filteredHistory.filter((i) => i.type === "execute");
    const totalExecuted = executed.length;

    let totalOutflow = 0;
    let largestPayment = 0;
    const recipientsSet = new Set<string>();

    executed.forEach((i) => {
      const amt = i.amount ? Number(i.amount) / 1e6 : 0;
      totalOutflow += amt;
      if (amt > largestPayment) largestPayment = amt;
      if (i.to) recipientsSet.add(i.to);
    });

    const avgPayment = totalExecuted > 0 ? totalOutflow / totalExecuted : 0;

    // Group into 5 buckets for bar heights
    const bucketCount = 5;
    const buckets = Array.from({ length: bucketCount }, (_, idx) => ({
      label: `P${idx + 1}`,
      amount: 0,
    }));

    executed.forEach((i, idx) => {
      const bIdx = Math.min(bucketCount - 1, Math.floor((idx / Math.max(1, executed.length)) * bucketCount));
      const amt = i.amount ? Number(i.amount) / 1e6 : 0;
      buckets[bIdx].amount += amt;
    });

    const maxBucketAmt = Math.max(...buckets.map((b) => b.amount), 1);
    const formattedBuckets = buckets.map((b) => ({
      ...b,
      heightPercent: (b.amount / maxBucketAmt) * 100,
    }));

    return {
      totalOutflow,
      largestPayment,
      avgPayment,
      totalExecuted,
      recipientsCount: recipientsSet.size,
      buckets: formattedBuckets,
      hasData: executed.length > 0,
    };
  }, [filteredHistory]);

  // 3. Payment Success Analytics Calculations
  const successAnalytics = useMemo(() => {
    const executedCount = filteredHistory.filter((i) => i.type === "execute").length;
    const failedCount = failedTxs.filter((t) => t.state !== "Resolved").length;
    const retryingCount = failedTxs.filter((t) => t.state === "Retrying").length;
    const totalAttempts = executedCount + failedCount;

    const rate = totalAttempts > 0 ? Math.round((executedCount / totalAttempts) * 100) : 100;

    return {
      successRatePercent: rate,
      executedCount,
      scheduledCount: scheduledPaymentsCount,
      failedCount,
      retryingCount,
    };
  }, [filteredHistory, failedTxs, scheduledPaymentsCount]);

  const hasAnyData = historyItems.length > 0;

  return (
    <div className="analytics-charts-grid">
      {/* 1. Treasury Growth Area Chart */}
      <div className="analytics-card growth-chart-card">
        <div className="chart-card-header">
          <div>
            <h3>Treasury Growth & Flow</h3>
            <span className="chart-sub">Real-time cumulative net balance curve</span>
          </div>
          <div className="chart-range-pills">
            {(["7D", "30D", "ALL"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setActiveRange(range)}
                className={`range-pill ${activeRange === range ? "active" : ""}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {!hasAnyData ? (
          <div className="chart-empty-state">
            <span className="empty-icon">📈</span>
            <h4>No treasury activity yet</h4>
            <p>Deposit funds or execute a schedule to begin tracking growth.</p>
          </div>
        ) : (
          <div className="chart-svg-wrapper">
            <svg className="growth-svg" viewBox="0 0 500 140" preserveAspectRatio="none">
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#F97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <line x1="0" y1="30" x2="500" y2="30" stroke="#27272A" strokeDasharray="4 4" />
              <line x1="0" y1="70" x2="500" y2="70" stroke="#27272A" strokeDasharray="4 4" />
              <line x1="0" y1="110" x2="500" y2="110" stroke="#27272A" strokeDasharray="4 4" />

              <path
                d={`${growthData.dPath} L500 140 L0 140 Z`}
                fill="url(#balanceGrad)"
              />

              <path
                d={growthData.dPath}
                fill="none"
                stroke="#F97316"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {growthData.points.map((pt, idx) => (
                <circle key={idx} cx={pt.x} cy={pt.y} r="4" fill="#F97316" stroke="#09090B" strokeWidth="2" />
              ))}
            </svg>

            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot orange" /> Net Balance: {formatUSDC(growthData.netBalance)}
              </span>
              <span className="legend-item">
                <span className="legend-dot green" /> Total Deposits: {formatUSDC(growthData.totalDeposits)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Outflow & Spending Analytics Bar Chart */}
      <div className="analytics-card spending-chart-card">
        <div className="chart-card-header">
          <h3>Outflow & Spending</h3>
          <span className="chart-sub">Executed Payout Analytics</span>
        </div>

        {!spendingData.hasData ? (
          <div className="chart-empty-state">
            <span className="empty-icon">💸</span>
            <h4>No executed payouts</h4>
            <p>Executed payouts will appear here in period bars.</p>
          </div>
        ) : (
          <div className="bar-chart-container">
            {spendingData.buckets.map((b, idx) => (
              <div key={idx} className="bar-column">
                <span className="bar-tooltip">{formatUSDC(b.amount)}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${b.amount > 0 ? "active" : ""}`}
                    style={{ height: `${Math.max(8, b.heightPercent)}%` }}
                  />
                </div>
                <span className="bar-label">{b.label}</span>
              </div>
            ))}
          </div>
        )}

        {spendingData.hasData && (
          <div className="spending-meta-metrics">
            <div className="meta-item">
              <span className="m-label">Largest Payment</span>
              <span className="m-val">{formatUSDC(spendingData.largestPayment)}</span>
            </div>
            <div className="meta-item">
              <span className="m-label">Avg Payment</span>
              <span className="m-val">{formatUSDC(spendingData.avgPayment)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Payment Success Analytics Donut */}
      <div className="analytics-card success-rate-card">
        <div className="chart-card-header">
          <h3>Execution Success</h3>
          <span className="chart-sub">Dynamic Health Percentage</span>
        </div>

        <div className="donut-wrapper">
          <svg className="donut-svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#27272A" strokeWidth="12" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#10B981"
              strokeWidth="12"
              strokeDasharray={`${(successAnalytics.successRatePercent * 251.2) / 100} 251.2`}
              strokeDashoffset="0"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="donut-center-text">
            <span className="percent-val">{successAnalytics.successRatePercent}%</span>
            <span className="percent-label">Success Rate</span>
          </div>
        </div>

        <div className="donut-breakdown">
          <div className="breakdown-row">
            <span className="dot green" />
            <span className="row-label">Successful Executions</span>
            <span className="row-val">{successAnalytics.executedCount}</span>
          </div>
          <div className="breakdown-row">
            <span className="dot orange" />
            <span className="row-label">Active / Scheduled</span>
            <span className="row-val">{successAnalytics.scheduledCount}</span>
          </div>
          <div className="breakdown-row">
            <span className="dot red" />
            <span className="row-label">Failed Transactions</span>
            <span className="row-val">{successAnalytics.failedCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
