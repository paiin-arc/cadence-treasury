import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import { wagmiConfig } from "./lib/wagmi";

import Sidebar, { type TabId } from "./components/Sidebar";
import Header from "./components/Header";
import HeroTreasuryCard from "./components/HeroTreasuryCard";
import StatsRow from "./components/StatsRow";
import UpcomingPaymentsWidget from "./components/UpcomingPaymentsWidget";
import TransactionsHistory from "./components/TransactionsHistory";
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

import { useAnalytics } from "./hooks/useTreasury";

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

  if (tab === "landing") {
    return <Landing />;
  }

  return (
    <div className={`app-redesigned-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        currentTab={tab}
        onSelectTab={switchTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="app-main-viewport">
        <Header
          currentTab={tab}
          agentLogs={agentLogs}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="app-tab-container">
          {tab === "dashboard" && (
            <div className="dashboard-content-flow">
              {/* Single source of truth: Balance + Actions + Metadata */}
              <HeroTreasuryCard
                agentLogs={agentLogs}
                onActionClick={handleHeroAction}
              />

              {/* 4 clean analytics cards — no balance duplicate */}
              <StatsRow failedCount={failedCount} pendingCount={0} />

              {/* Transaction history feed */}
              <TransactionsHistory searchQuery={searchQuery} />

              {/* Upcoming schedules + Agent activity */}
              <div className="grid-2-cols">
                <UpcomingPaymentsWidget />
                <AgentActivity logs={agentLogs} />
              </div>
            </div>
          )}

          {tab === "schedule" && (
            <div className="tab-section-flow">
              <SchedulePanel />
              <MyPayments />
            </div>
          )}

          {tab === "bills" && <Bills />}
          {tab === "escrow" && <Escrow />}
          {tab === "multipay" && <MultiPayPanel />}
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
