import { useState, useMemo } from "react";
import type { AgentLog } from "../hooks/useTreasury";

interface AgentActivityProps {
  logs: AgentLog[];
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getAgentEmoji(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("create")) return "🤖";
  if (a.includes("deposit")) return "🤖";
  if (a.includes("execute")) return "⚡";
  if (a.includes("retry")) return "🔄";
  if (a.includes("failed")) return "⚠️";
  if (a.includes("received")) return "📥";
  if (a.includes("notification")) return "📲";
  return "🤖";
}

export default function AgentActivity({ logs }: AgentActivityProps) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedTx(hash);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  // Extract agent execution logs with valid txHashes
  const executedLogs = useMemo(() => {
    return logs.filter(
      (l) =>
        (l.action.toLowerCase().includes("execute") || l.action.toLowerCase().includes("executed")) &&
        l.txHash &&
        l.txHash !== "0x" + "0".repeat(64)
    );
  }, [logs]);

  return (
    <div className="agent-activity-redesigned-card">
      {/* Card Header */}
      <div className="card-header-row">
        <div className="title-group">
          <h3>Agent Activity & Executions</h3>
          <span className="badge-pill">{logs.length} total events</span>
        </div>
        <span className="agent-counter-chip">
          ⚡ {executedLogs.length} Executed Payouts
        </span>
      </div>

      {/* Top Banner: Agent Executed Payments Summary */}
      {executedLogs.length > 0 && (
        <div className="agent-executions-summary-box">
          <div className="summary-box-title">
            <span>⚡ Scheduled Payments Executed by Agent</span>
            <span className="count-tag">{executedLogs.length} Executed</span>
          </div>
          <div className="executed-hashes-scroll">
            {executedLogs.map((item) => (
              <div key={item.id} className="executed-hash-row">
                <div className="hash-info">
                  <span className="pid-badge">Payment #{item.paymentId ?? "—"}</span>
                  <a
                    href={`https://testnet.arcscan.app/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hash-mono-link"
                  >
                    {item.txHash!.slice(0, 10)}…{item.txHash!.slice(-6)} ↗
                  </a>
                </div>
                <div className="hash-actions">
                  <button
                    onClick={() => copyHash(item.txHash!)}
                    className="copy-hash-btn"
                    title="Copy Transaction Hash"
                  >
                    {copiedTx === item.txHash ? "✓ Copied" : "📋 Copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline Feed */}
      {logs.length === 0 ? (
        <div className="activity-empty-state">
          <span className="bot-icon-bg">🤖</span>
          <p className="empty-title">Scheduler Agent Standby</p>
          <p className="empty-sub">Agent activities and execution logs will appear here live.</p>
        </div>
      ) : (
        <div className="activity-timeline-feed">
          {logs.map((log) => {
            const emoji = getAgentEmoji(log.action);
            const isExpanded = expandedLogId === log.id;
            const hasValidHash = log.txHash && log.txHash !== "0x" + "0".repeat(64);

            return (
              <div key={log.id} className={`activity-timeline-item ${log.status}`}>
                <div className="node-avatar">
                  {emoji}
                </div>

                <div className="item-content-box">
                  <div className="item-header">
                    <span className="action-name">{emoji} {log.action}</span>
                    <span className={`status-tag ${log.status}`}>{log.status}</span>
                  </div>

                  <div className="item-sub-info">
                    <span className="trigger-text">{log.trigger}</span>
                    <span className="bullet-sep">•</span>
                    <span className="time-text">{formatTime(log.timestamp)}</span>
                  </div>

                  {log.paymentId && (
                    <div className="payment-id-tag">
                      Payment ID: #{log.paymentId}
                    </div>
                  )}

                  {hasValidHash && (
                    <div className="tx-hash-badge-row">
                      <a
                        href={`https://testnet.arcscan.app/tx/${log.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-hash-link"
                      >
                        Tx: {log.txHash!.slice(0, 8)}…{log.txHash!.slice(-6)} ↗
                      </a>
                      <button
                        onClick={() => copyHash(log.txHash!)}
                        className="inline-copy-btn"
                        title="Copy Tx Hash"
                      >
                        {copiedTx === log.txHash ? "✓" : "📋"}
                      </button>
                    </div>
                  )}

                  {log.error && (
                    <div className="log-expand-wrapper">
                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="expand-btn"
                      >
                        {isExpanded ? "Hide Logs ▲" : "View Agent Logs ▼"}
                      </button>
                      {isExpanded && (
                        <pre className="log-code-block">{log.error}</pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
