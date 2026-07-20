import { useState } from "react";
import ConnectWallet from "./ConnectWallet";
import NotificationsWidget from "./NotificationsWidget";
import type { TabId } from "./Sidebar";
import type { AgentLog } from "../hooks/useTreasury";

interface HeaderProps {
  currentTab: TabId;
  agentLogs: AgentLog[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const TAB_TITLES: Record<TabId, { title: string; breadcrumb: string }> = {
  dashboard: { title: "Treasury Overview", breadcrumb: "Dashboard / Home" },
  schedule: { title: "Recurring Schedules", breadcrumb: "Payments / Schedule" },
  bills: { title: "Accounts & Bills", breadcrumb: "Financials / Bills" },
  escrow: { title: "Escrow Vaults", breadcrumb: "Contracts / Escrow" },
  multipay: { title: "Multi-Pay Batch", breadcrumb: "Payments / Multi-Pay" },
  appkit: { title: "App Kit Developer Suite", breadcrumb: "Tools / App Kit" },
  docs: { title: "Documentation & Specs", breadcrumb: "Resources / Docs" },
  cli: { title: "CLI Guide & Scripts", breadcrumb: "Developer / CLI" },
};

export default function Header({
  currentTab,
  agentLogs,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const info = TAB_TITLES[currentTab] || TAB_TITLES.dashboard;

  return (
    <header className="redesigned-header">
      {/* Left Title & Breadcrumbs */}
      <div className="header-title-block">
        <span className="header-breadcrumb">{info.breadcrumb}</span>
        <h1 className="header-main-title">{info.title}</h1>
      </div>

      {/* Center Search Input (Command Palette style) */}
      <div className="header-search-bar">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search transactions, recipients or type command..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
        <span className="search-kbd">⌘K</span>
      </div>

      {/* Right Controls */}
      <div className="header-right-controls">
        {/* Network Badge */}
        <div className="network-badge-pill">
          <span className="network-dot" />
          <span>Arc Testnet</span>
        </div>

        {/* Notifications Dropdown Toggle */}
        <div className="notifications-wrapper">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`notifications-bell-btn ${showNotifications ? "active" : ""}`}
            title="Notifications"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {agentLogs.length > 0 && <span className="unread-dot" />}
          </button>

          {showNotifications && (
            <NotificationsWidget
              agentLogs={agentLogs}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </div>

        {/* Connect Wallet Button */}
        <ConnectWallet />
      </div>
    </header>
  );
}
