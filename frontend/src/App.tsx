import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useTreasuryBalance,
  useAiCap,
  usePayments,
  useRecentEvents,
} from "./hooks/useTreasury";
import { TREASURY_ADDRESS } from "./lib/arc";

const queryClient = new QueryClient();

function formatUSDC(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function Dashboard() {
  const { data: balance, isLoading: balLoading } = useTreasuryBalance();
  const { data: aiCap, isLoading: capLoading } = useAiCap();
  const { data: payments, isLoading: payLoading } = usePayments(10);
  const { data: events, isLoading: evtLoading } = useRecentEvents();

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
        USDC Treasury Dashboard
      </h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 24 }}>
        Contract:{" "}
        <a
          href={`https://testnet.arcscan.app/address/${TREASURY_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#0066cc" }}
        >
          {TREASURY_ADDRESS ? formatAddress(TREASURY_ADDRESS) : "(not set)"}
        </a>{" "}
        · Arc Testnet
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>
            Total Balance
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1a7f4b" }}>
            {balLoading ? "..." : formatUSDC(balance ?? 0)}
          </div>
          <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>
            USDC on Arc Testnet
          </div>
        </div>
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>
            AI Execution Cap (5%)
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c47a00" }}>
            {capLoading ? "..." : formatUSDC(aiCap ?? 0)}
          </div>
          <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>
            Max per AI-triggered payment
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Scheduled Payments
        </h2>
        {payLoading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : payments?.length === 0 ? (
          <p style={{ color: "#999" }}>No payments scheduled yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>ID</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Recipient</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Amount</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Frequency</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "6px 8px" }}>#{p.id}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>
                    <a
                      href={`https://testnet.arcscan.app/address/${p.recipient}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0066cc" }}
                    >
                      {formatAddress(p.recipient as string)}
                    </a>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {formatUSDC(Number(p.amount) / 1e6)}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {Number(p.frequency) === 0
                      ? "One-off"
                      : `Every ${Number(p.frequency) / 3600}h`}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {!p.active ? (
                      <span style={{ color: "#999" }}>Completed</span>
                    ) : p.isDue ? (
                      <span style={{ color: "#cc0000", fontWeight: 600 }}>
                        Due now
                      </span>
                    ) : (
                      <span style={{ color: "#1a7f4b" }}>Scheduled</span>
                    )}
                    {p.requiresApproval && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: "#fff3cd",
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        Needs approval
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Recent Executions
        </h2>
        {evtLoading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : events?.length === 0 ? (
          <p style={{ color: "#999" }}>No payments executed yet.</p>
        ) : (
          <div style={{ fontSize: 13 }}>
            {events
              ?.slice(-5)
              .reverse()
              .map((e, i) => (
                <div
                  key={i}
                  style={{ padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}
                >
                  <span style={{ color: "#1a7f4b", fontWeight: 600 }}>
                    {formatUSDC(e.amount)}
                  </span>
                  {" → "}
                  <span style={{ fontFamily: "monospace" }}>
                    {formatAddress(e.recipient as string)}
                  </span>
                  {" · "}
                  <a
                    href={`https://testnet.arcscan.app/tx/${e.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#0066cc" }}
                  >
                    tx
                  </a>
                </div>
              ))}
          </div>
        )}
      </div>

      <p
        style={{
          color: "#999",
          fontSize: 11,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        Refreshes every 15 seconds · Arc Testnet · Chain ID 5042002
      </p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
