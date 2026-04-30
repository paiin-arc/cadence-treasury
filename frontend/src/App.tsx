import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./lib/wagmi";
import Landing from "./Landing";
import InteractPanel from "./components/InteractPanel";
import SchedulePanel from "./components/SchedulePanel";
import MyPayments from "./components/MyPayments";
import StatsRow from "./components/StatsRow";
import TransactionsHistory from "./components/TransactionsHistory";
import CliGuide from "./components/CliGuide";
import MultiPayPanel from "./components/MultiPayPanel";
import Bills from "./components/Bills";

const queryClient = new QueryClient();

type Tab = "dashboard" | "bills" | "multipay" | "cli";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "bills", label: "Bills" },
  { id: "multipay", label: "Multi-pay" },
  { id: "cli", label: "CLI Guide" },
];

function readHashTab(): Tab {
  if (typeof window === "undefined") return "dashboard";
  const h = window.location.hash.replace("#", "");
  if (h === "bills" || h === "multipay" || h === "cli") return h;
  return "dashboard";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readHashTab);

  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    }
    setTimeout(() => {
      document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 30);
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Landing />
        <section id="dashboard" className="dashboard-section">
          <div className="tab-bar-wrap">
            <div className="tab-bar">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`tab ${tab === t.id ? "active" : ""}`}
                  onClick={() => switchTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "dashboard" && (
            <>
              <StatsRow />
              <InteractPanel />
              <SchedulePanel />
              <MyPayments />
              <TransactionsHistory />
            </>
          )}
          {tab === "bills" && <Bills />}
          {tab === "multipay" && <MultiPayPanel />}
          {tab === "cli" && <CliGuide />}
        </section>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
