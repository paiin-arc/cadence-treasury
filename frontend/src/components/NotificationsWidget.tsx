import type { AgentLog } from "../hooks/useTreasury";

interface NotificationsWidgetProps {
  agentLogs: AgentLog[];
  onClose: () => void;
}

function formatTimeAgo(timestamp: number) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function NotificationsWidget({
  agentLogs,
  onClose,
}: NotificationsWidgetProps) {
  return (
    <div className="notifications-popover">
      <div className="popover-header">
        <div className="title-area">
          <h4>System Notifications</h4>
          <span className="count-pill">{agentLogs.length}</span>
        </div>
        <button onClick={onClose} className="close-btn">
          ✕
        </button>
      </div>

      <div className="notifications-list">
        {agentLogs.length === 0 ? (
          <div className="notifications-empty">
            <span className="bell-icon-bg">🔔</span>
            <p>No new notifications</p>
          </div>
        ) : (
          agentLogs.slice(0, 10).map((log) => {
            const isError = log.status === "failed";
            const isPending = log.status === "pending";

            return (
              <div key={log.id} className={`notification-item ${log.status}`}>
                <span className="item-icon">
                  {isError ? "⚠" : isPending ? "⏳" : "✓"}
                </span>
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{log.action}</span>
                    <span className="item-time">{formatTimeAgo(log.timestamp)}</span>
                  </div>
                  <p className="item-desc">{log.trigger}</p>
                  {log.error && <p className="item-error-msg">{log.error}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
