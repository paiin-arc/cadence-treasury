import { useState } from "react";
import type { FailedTx } from "../hooks/useTreasury";

interface FailedTransactionsProps {
  failedTxs: FailedTx[];
  onRetrySuccess?: () => void;
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FailedTransactions({ failedTxs, onRetrySuccess }: FailedTransactionsProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleManualRetry = async (paymentId?: string) => {
    if (!paymentId) return;
    setRetryingId(paymentId);
    setTimeout(() => {
      setRetryingId(null);
      onRetrySuccess?.();
    }, 1500);
  };

  const activeFailures = failedTxs.filter((tx) => tx.state !== "Resolved");

  return (
    <div className="failed-txs-redesigned-card">
      <div className="card-header-row">
        <div className="title-group">
          <h3>Failed Transaction Tracker</h3>
          <span className="badge-alert-pill">
            {activeFailures.length} active issues
          </span>
        </div>
      </div>

      {failedTxs.length === 0 ? (
        <div className="tracker-empty-state">
          <span className="check-icon-circle">✓</span>
          <p className="empty-title">All Systems Nominal</p>
          <p className="empty-sub">No failed transactions or execution errors tracked.</p>
        </div>
      ) : (
        <div className="failed-items-feed">
          {failedTxs.map((tx, idx) => {
            const isRetrying = tx.state === "Retrying" || retryingId === tx.paymentId;
            const isResolved = tx.state === "Resolved";

            return (
              <div key={`${tx.paymentId}-${idx}`} className={`failed-tx-item ${tx.state.toLowerCase()}`}>
                <div className="item-top-bar">
                  <span className={`state-tag ${isResolved ? "resolved" : isRetrying ? "retrying" : "failed"}`}>
                    {isRetrying && <span className="mini-spinner" />}
                    {isResolved ? "Resolved" : isRetrying ? "Retrying" : "Failed"}
                  </span>
                  <span className="item-time">{formatDateTime(tx.timestamp)}</span>
                </div>

                <div className="item-reason-block">
                  <span className="reason-label">Failure Reason:</span>
                  <span className="reason-text">{tx.reason}</span>
                </div>

                <div className="item-stats-row">
                  {tx.paymentId && (
                    <span className="stat-pill-info">
                      Payment #{tx.paymentId}
                    </span>
                  )}
                  <span className="stat-pill-info">
                    Retries: {tx.retryCount}/3
                  </span>
                </div>

                {!isResolved && (
                  <div className="item-action-row">
                    <button
                      onClick={() => handleManualRetry(tx.paymentId)}
                      disabled={isRetrying}
                      className="retry-action-btn"
                    >
                      {isRetrying ? "Triggering Retry Bot…" : "⚡ Retry Execution"}
                    </button>
                    {tx.txHash && tx.txHash !== "0x" + "0".repeat(64) && (
                      <a
                        href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="explorer-link"
                      >
                        View Tx ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
