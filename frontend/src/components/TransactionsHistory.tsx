import { useState, useMemo } from "react";
import { useTransactionsHistory, type TxHistoryItem } from "../hooks/useTreasury";
import { TREASURY_ADDRESS } from "../lib/arc";

type FilterType = "all" | TxHistoryItem["type"];

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "withdraw", label: "Withdrawals" },
  { value: "schedule", label: "Scheduled" },
  { value: "execute", label: "Executed" },
  { value: "cancel", label: "Cancelled" },
];

const TYPE_META: Record<
  TxHistoryItem["type"],
  { label: string; color: string; icon: JSX.Element }
> = {
  deposit: {
    label: "Deposit",
    color: "#34d399",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
  },
  withdraw: {
    label: "Withdraw",
    color: "#fbbf24",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ),
  },
  schedule: {
    label: "Scheduled",
    color: "#67e8f9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  execute: {
    label: "Executed",
    color: "#a78bfa",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  cancel: {
    label: "Cancelled",
    color: "#f87171",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
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
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function TransactionsHistory() {
  const { data, isLoading } = useTransactionsHistory();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter((t) => t.type === filter);
  }, [data, filter]);

  const uniqueWallets = useMemo(() => {
    const set = new Set<string>();
    for (const tx of data ?? []) {
      if (tx.from) set.add(tx.from);
      if (tx.to) set.add(tx.to);
    }
    return set.size;
  }, [data]);

  return (
    <div className="tx-history">
      <div className="tx-history-header">
        <div>
          <h2>Transactions</h2>
          <p>
            Public on-chain activity. Anyone can verify on{" "}
            <a
              href={`https://testnet.arcscan.app/address/${TREASURY_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="tx-verify-link"
            >
              ArcScan ↗
            </a>
          </p>
        </div>
        <div className="tx-summary">
          <div className="tx-stat">
            <span className="tx-stat-num">{data?.length ?? 0}</span>
            <span className="tx-stat-label">Transactions</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-num">{uniqueWallets}</span>
            <span className="tx-stat-label">Wallets</span>
          </div>
        </div>
      </div>

      <div className="tx-filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`tx-filter ${filter === f.value ? "active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {data && f.value !== "all" && (
              <span className="tx-filter-count">
                {data.filter((t) => t.type === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="tx-feed">
        {isLoading ? (
          <div className="tx-empty">Loading on-chain history…</div>
        ) : filtered.length === 0 ? (
          <div className="tx-empty">
            No {filter === "all" ? "" : filter} transactions in the last ~9 000 blocks.
          </div>
        ) : (
          filtered.map((tx, i) => {
            const meta = TYPE_META[tx.type];
            return (
              <a
                key={`${tx.txHash}-${i}`}
                href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="tx-row"
              >
                <span
                  className="tx-icon"
                  style={{
                    color: meta.color,
                    background: `${meta.color}14`,
                    borderColor: `${meta.color}40`,
                  }}
                >
                  {meta.icon}
                </span>
                <div className="tx-main">
                  <div className="tx-line">
                    <span className="tx-type">{meta.label}</span>
                    {tx.amount !== undefined && (
                      <span className="tx-amount">{formatUSDC(tx.amount)}</span>
                    )}
                    {tx.paymentId !== undefined && (
                      <span className="tx-pid">#{tx.paymentId.toString()}</span>
                    )}
                  </div>
                  <div className="tx-sub">
                    {tx.from && (
                      <>
                        <span className="tx-verb">by</span>
                        <span className="tx-addr">{shortAddr(tx.from)}</span>
                      </>
                    )}
                    {tx.to && (
                      <>
                        <span className="tx-arrow-mini">→</span>
                        <span className="tx-addr">{shortAddr(tx.to)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="tx-meta">
                  <span className="tx-block">block {tx.blockNumber.toString()}</span>
                  <span className="tx-link">Verify ↗</span>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
