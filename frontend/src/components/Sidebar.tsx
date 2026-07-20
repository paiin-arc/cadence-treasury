import { useState, type ReactNode } from "react";
import { useAccount, useDisconnect } from "wagmi";
import ConnectWallet from "./ConnectWallet";

export type TabId =
  | "dashboard"
  | "schedule"
  | "bills"
  | "escrow"
  | "multipay"
  | "appkit"
  | "docs"
  | "cli";

interface SidebarProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS: { id: TabId; label: string; icon: ReactNode; badge?: string }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "bills",
    label: "Bills & Invoices",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: "escrow",
    label: "Escrow Vaults",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: "multipay",
    label: "Multi-Pay",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    id: "appkit",
    label: "Gateway",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    badge: "CCTP",
  },
  {
    id: "docs",
    label: "Docs & Specs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    id: "cli",
    label: "CLI Guide",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
];

export default function Sidebar({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [selectedTreasury, setSelectedTreasury] = useState("Cadence Main Vault");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const treasuries = ["Cadence Main Vault", "Arc Testnet Treasury", "Developer Escrow"];

  return (
    <aside className={`redesigned-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Top Brand & Collapse Toggle */}
      <div className="sidebar-brand-row">
        <div className="brand-logo-area">
          <div className="brand-icon-glow">
            <span className="brand-dot-pulse" />
          </div>
          {!collapsed && (
            <div className="brand-text-block">
              <span className="brand-title">CADENCE</span>
              <span className="brand-sub">TREASURY</span>
            </div>
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          className="collapse-toggle-btn"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <polyline points="13 17 18 12 13 7" />
            ) : (
              <polyline points="11 17 6 12 11 7" />
            )}
            <line x1={collapsed ? "6" : "18"} y1="12" x2={collapsed ? "18" : "6"} y2="12" />
          </svg>
        </button>
      </div>

      {/* Treasury Switcher Dropdown */}
      {!collapsed && (
        <div className="treasury-switcher-container">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="treasury-switcher-btn"
          >
            <div className="switcher-info">
              <span className="switcher-label">Active Treasury</span>
              <span className="switcher-val">{selectedTreasury}</span>
            </div>
            <svg className={`chevron-icon ${isDropdownOpen ? "open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="treasury-dropdown-menu">
              {treasuries.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTreasury(t);
                    setIsDropdownOpen(false);
                  }}
                  className={`dropdown-item ${selectedTreasury === t ? "active" : ""}`}
                >
                  <span className="item-dot" />
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation List */}
      <nav className="sidebar-nav-list">
        {NAV_ITEMS.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {!collapsed && <span className="nav-item-label">{item.label}</span>}
              {!collapsed && item.badge && <span className="nav-item-badge">{item.badge}</span>}
              {isActive && <span className="active-glow-bar" />}
            </button>
          );
        })}
      </nav>

      {/* Footer Profile & Wallet Section */}
      <div className="sidebar-footer">
        {isConnected && address ? (
          <div className="profile-card">
            <div className="profile-avatar">
              {address.slice(2, 4).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="profile-info">
                <span className="profile-addr">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <span className="profile-status">
                  <span className="online-dot" /> Connected to Arc
                </span>
              </div>
            )}
            {!collapsed && (
              <button onClick={() => disconnect()} className="disconnect-icon-btn" title="Disconnect Wallet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          !collapsed && (
            <div className="connect-wallet-sidebar-wrapper">
              <ConnectWallet />
            </div>
          )
        )}
      </div>
    </aside>
  );
}
