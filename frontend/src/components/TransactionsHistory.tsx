import { useState, useMemo, type ReactElement } from "react";
import { useAccount } from "wagmi";
import { useTransactionsHistory, useAnalytics } from "../hooks/useTreasury";

type FilterType = "all" | "deposit" | "withdraw" | "schedule" | "execute" | "agent_exec" | "failed" | "agent";

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "withdraw", label: "Withdrawals" },
  { value: "schedule", label: "Scheduled" },
  { value: "execute", label: "Executed" },
  { value: "agent_exec", label: "⚡ Agent Executions" },
  { value: "failed", label: "Failed" },
  { value: "agent", label: "Agent Activity Logs" },
];

const TYPE_META: Record<
  string,
  { label: string; color: string; icon: ReactElement }
> = {
  deposit: {
    label: "Deposit",
    color: "#10B981", // Green
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
  },
  withdraw: {
    label: "Withdraw",
    color: "#F59E0B", // Amber
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ),
  },
  schedule: {
    label: "Scheduled",
    color: "#6366F1", // Indigo
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  execute: {
    label: "Agent Execution",
    color: "#3B82F6", // Blue
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  cancel: {
    label: "Cancelled",
    color: "#EF4444",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  failed: {
    label: "Failed",
    color: "#EF4444",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  agent: {
    label: "Agent Log",
    color: "#F97316", // Warm Orange
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
      </svg>
    ),
  },
};

function formatUSDC(raw: bigint | undefined) {
  if (raw === undefined) return "—";
  return `${(Number(raw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

function shortAddr(a: string | undefined) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface TransactionsHistoryProps {
  searchQuery?: string;
}

export default function TransactionsHistory({ searchQuery = "" }: TransactionsHistoryProps) {
  const { data: txData, isLoading: isTxLoading } = useTransactionsHistory();
  const { address, isConnected } = useAccount();
  const { data: analyticsData } = useAnalytics(address);

  const [filter, setFilter] = useState<FilterType>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const me = address?.toLowerCase();

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Combine on-chain logs, failed transactions, and agent activity logs
  const combinedItems = useMemo(() => {
    const list: Array<{
      id: string;
      type: string;
      amount?: bigint;
      status: string;
      recipient?: string;
      txHash?: string;
      timestamp: number;
      chain: string;
      errorReason?: string;
      from?: string;
      to?: string;
      blockNumber?: bigint;
      paymentId?: string;
    }> = [];

    // On-chain txs
    (txData ?? []).forEach((t, idx) => {
      list.push({
        id: `tx-${t.txHash}-${idx}`,
        type: t.type,
        amount: t.amount,
        status: t.type === "execute" ? "Confirmed (Bot)" : "Success",
        recipient: t.to,
        txHash: t.txHash,
        timestamp: t.timestamp ?? Date.now(),
        chain: "Arc Testnet",
        from: t.from,
        to: t.to,
        blockNumber: t.blockNumber,
        paymentId: t.paymentId ? t.paymentId.toString() : undefined,
      });
    });

    // Failed txs from backend DB
    (analyticsData?.failedTxs ?? []).forEach((f, idx) => {
      list.push({
        id: `fail-${f.paymentId}-${idx}`,
        type: "failed",
        status: f.state,
        recipient: undefined,
        txHash: f.txHash !== "0x" + "0".repeat(64) ? f.txHash : undefined,
        timestamp: f.timestamp,
        chain: "Arc Testnet",
        errorReason: f.reason,
        from: f.wallet,
        paymentId: f.paymentId,
      });
    });

    // Agent activity logs
    (analyticsData?.agentLogs ?? []).forEach((a) => {
      list.push({
        id: a.id,
        type: a.action.toLowerCase().includes("execute") ? "agent_exec" : "agent",
        status: a.status,
        recipient: a.paymentId ? `Payment #${a.paymentId}` : undefined,
        txHash: a.txHash,
        timestamp: a.timestamp,
        chain: "Arc Bot",
        errorReason: a.error,
        from: a.wallet,
        paymentId: a.paymentId,
      });
    });

    // Sort descending by timestamp
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [txData, analyticsData]);

  // Filtered by Mine / Query / Tab Filter
  const filtered = useMemo(() => {
    return combinedItems.filter((item) => {
      // Filter by Mine Only
      if (mineOnly && me) {
        if (item.from !== me && item.to !== me) return false;
      }

      // Filter by Tab
      if (filter !== "all") {
        if (filter === "agent_exec") {
          return (
            (item.type === "execute" || item.type === "agent_exec") &&
            !!item.txHash &&
            item.txHash !== "0x" + "0".repeat(64)
          );
        }
        if (filter === "agent" && item.type !== "agent") return false;
        if (filter === "failed" && item.type !== "failed") return false;
        if (item.type !== filter) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchType = item.type.toLowerCase().includes(q);
        const matchRecipient = item.recipient?.toLowerCase().includes(q);
        const matchHash = item.txHash?.toLowerCase().includes(q);
        const matchReason = item.errorReason?.toLowerCase().includes(q);
        const matchPid = item.paymentId?.toLowerCase().includes(q);
        if (!matchType && !matchRecipient && !matchHash && !matchReason && !matchPid) return false;
      }

      return true;
    });
  }, [combinedItems, mineOnly, me, filter, searchQuery]);

  const agentExecutedCount = useMemo(() => {
    return combinedItems.filter(
      (item) => (item.type === "execute" || item.type === "agent_exec") && !!item.txHash && item.txHash !== "0x" + "0".repeat(64)
    ).length;
  }, [combinedItems]);

  return (
    <div className="transaction-center-card">
      <div className="center-header-row">
        <div>
          <h2>Transaction Center</h2>
          <p className="center-sub">Unified transaction history & agent execution logs</p>
        </div>
        <div className="center-actions">
          <span className="agent-executions-chip">
            ⚡ {agentExecutedCount} Agent Executed Payments
          </span>
          {isConnected && (
            <button
              className={`filter-mine-btn ${mineOnly ? "active" : ""}`}
              onClick={() => setMineOnly(!mineOnly)}
            >
              {mineOnly ? "showing mine" : "show mine"}
            </button>
          )}
        </div>
      </div>

      {/* 8 Tab Filters Bar */}
      <div className="transaction-tabs-bar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`tab-btn ${filter === f.value ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <div className="table-responsive-wrapper">
        {isTxLoading ? (
          <div className="center-loading">Loading transaction records…</div>
        ) : filtered.length === 0 ? (
          <div className="center-empty-state">
            <div className="empty-icon-circle">📜</div>
            <h3>No transactions found</h3>
            <p>Deposit funds or execute a scheduled payment to see records here.</p>
          </div>
        ) : (
          <table className="transaction-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Recipient / Payment ID</th>
                <th>ArcScan Tx Hash</th>
                <th>Timestamp</th>
                <th>Chain / Worker</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const meta = TYPE_META[row.type] || TYPE_META.deposit;

                return (
                  <tr key={row.id}>
                    <td>
                      <span className="type-badge" style={{ color: meta.color, background: `${meta.color}15` }}>
                        <span className="badge-icon">{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="amount-col">
                      {row.amount !== undefined ? formatUSDC(row.amount) : "—"}
                    </td>
                    <td>
                      <span className={`status-pill-table ${row.status.toLowerCase().replace(/\s+/g, "-")}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="recipient-col">
                      {row.paymentId ? (
                        <span className="pid-cell">Payment #{row.paymentId}</span>
                      ) : (
                        shortAddr(row.recipient)
                      )}
                    </td>
                    <td className="hash-col">
                      {row.txHash && row.txHash !== "0x" + "0".repeat(64) ? (
                        <div className="hash-copy-cell">
                          <a
                            href={`https://testnet.arcscan.app/tx/${row.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hash-link font-mono"
                          >
                            {row.txHash.slice(0, 8)}…{row.txHash.slice(-6)} ↗
                          </a>
                          <button
                            onClick={() => copyHash(row.txHash!)}
                            className="mini-copy-btn"
                            title="Copy Tx Hash"
                          >
                            {copiedHash === row.txHash ? "✓" : "📋"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="time-col">
                      {new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="chain-col">{row.chain}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
