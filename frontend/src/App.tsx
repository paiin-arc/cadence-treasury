import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import { wagmiConfig } from "./lib/wagmi";

import Sidebar, { type TabId } from "./components/Sidebar";
import Header from "./components/Header";
import HeroTreasuryCard from "./components/HeroTreasuryCard";
import StatsRow from "./components/StatsRow";
import AnalyticsCharts from "./components/AnalyticsCharts";
import TreasuryInsights from "./components/TreasuryInsights";
import UpcomingPaymentsWidget from "./components/UpcomingPaymentsWidget";
import TransactionsHistory from "./components/TransactionsHistory";
import FailedTransactions from "./components/FailedTransactions";
import AgentActivity from "./components/AgentActivity";

import SchedulePanel from "./components/SchedulePanel";
import MyPayments from "./components/MyPayments";
import Bills from "./components/Bills";
import Escrow from "./components/Escrow";
import MultiPayPanel from "./components/MultiPayPanel";
import AppKitPanel from "./components/AppKitPanel";
import Docs from "./components/Docs";
import CliGuide from "./components/CliGuide";
import Landing from "./Landing";
import WalletGatePreview from "./components/WalletGatePreview";

import { useAnalytics, useTransactionsHistory, usePayments } from "./hooks/useTreasury";

const queryClient = new QueryClient();

function readHashTab(): TabId {
  if (typeof window === "undefined") return "landing";
  const h = window.location.hash.replace("#", "");
  if (
    h === "dashboard" ||
    h === "schedule" ||
    h === "bills" ||
    h === "escrow" ||
    h === "multipay" ||
    h === "appkit" ||
    h === "docs" ||
    h === "cli"
  ) {
    return h as TabId;
  }
  return "landing";
}

function AppContent() {
  const [tab, setTab] = useState<TabId>(readHashTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { address } = useAccount();
  const { data: analyticsData } = useAnalytics(address);
  const { data: historyItems } = useTransactionsHistory();
  const { data: payments } = usePayments(20);

  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchTab = (next: TabId) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
  };

  const handleHeroAction = (action: "deposit" | "withdraw" | "schedule") => {
    if (action === "schedule") {
      switchTab("schedule");
    }
  };

  const failedCount = analyticsData?.failedTxs?.length ?? 0;
  const agentLogs = analyticsData?.agentLogs ?? [];
  const failedTxs = analyticsData?.failedTxs ?? [];

  if (tab === "landing") {
    return <Landing />;
  }

  return (
    <div className={`app-redesigned-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* 1. Redesigned Sidebar */}
      <Sidebar
        currentTab={tab}
        onSelectTab={switchTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* 2. Main Content Viewport */}
      <div className="app-main-viewport">
        {/* Top Header */}
        <Header
          currentTab={tab}
          agentLogs={agentLogs}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Tab Body Content */}
        <main className="app-tab-container">
          {tab === "dashboard" && (
            <div className="dashboard-content-flow">
              {/* Hero Treasury Card */}
              <HeroTreasuryCard
                agentLogs={agentLogs}
                onActionClick={handleHeroAction}
              />

              {/* 7-Card Analytics Stats Row */}
              <StatsRow
                failedCount={failedCount}
                pendingCount={0}
              />

              {/* 100% Real Dynamic Analytics Charts */}
              <AnalyticsCharts
                historyItems={historyItems ?? []}
                agentLogs={agentLogs}
                failedTxs={failedTxs}
                scheduledPaymentsCount={payments?.length ?? 0}
              />

              {/* Real Treasury Insights & Benchmarks */}
              <TreasuryInsights
                historyItems={historyItems ?? []}
                agentLogs={agentLogs}
                activeSchedulesCount={payments?.length ?? 0}
              />

              {/* Main Transaction Center Table */}
              <TransactionsHistory searchQuery={searchQuery} />

              {/* Grid Section: Scheduled Queue & Agent Activity */}
              <div className="grid-2-cols">
                <UpcomingPaymentsWidget />
                <AgentActivity logs={agentLogs} />
              </div>

              {/* Failed Transaction Tracker */}
              <FailedTransactions failedTxs={failedTxs} />
            </div>
          )}

          {tab === "schedule" && (
            <WalletGatePreview pageTitle="Recurring Payment Schedules">
              <div className="tab-section-flow">
                <SchedulePanel />
                <MyPayments />
              </div>
            </WalletGatePreview>
          )}

          {tab === "bills" && <Bills />}
          {tab === "escrow" && (
            <WalletGatePreview pageTitle="Milestone Escrow Vaults">
              <Escrow />
            </WalletGatePreview>
          )}
          {tab === "multipay" && (
            <WalletGatePreview pageTitle="Multi-Pay Batch Payroll">
              <MultiPayPanel />
            </WalletGatePreview>
          )}
          {tab === "appkit" && <AppKitPanel />}
          {tab === "docs" && <Docs />}
          {tab === "cli" && <CliGuide />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
