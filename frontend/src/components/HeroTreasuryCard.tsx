import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import type { AgentLog } from "../hooks/useTreasury";
import DepositModal from "./DepositModal";
import WithdrawModal from "./WithdrawModal";

interface HeroTreasuryCardProps {
  agentLogs: AgentLog[];
  onActionClick?: (action: "deposit" | "withdraw" | "schedule") => void;
}

export default function HeroTreasuryCard({
  agentLogs,
  onActionClick,
}: HeroTreasuryCardProps) {
  const { address } = useAccount();
  const [name, setName] = useState("Cadence Main Treasury");
  const [isEditing, setIsEditing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  useEffect(() => {
    if (address) {
      const saved = localStorage.getItem(`cadence:treasury-name:${address.toLowerCase()}`);
      if (saved) setName(saved);
      else setName(`Treasury of ${address.slice(0, 6)}…${address.slice(-4)}`);
    }
  }, [address]);

  const saveName = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setName(trimmed);
    if (address) {
      localStorage.setItem(`cadence:treasury-name:${address.toLowerCase()}`, trimmed);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const { data: balanceRaw } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: {
      refetchInterval: 10_000,
    },
  });

  const balance = balanceRaw !== undefined ? Number(balanceRaw) / 1e6 : 0;

  const createdLog = agentLogs.find((l) => l.action === "Treasury created");
  const createdDateStr = createdLog
    ? new Date(createdLog.timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Apr 26, 2026";

  return (
    <>
      <div className="hero-treasury-card">
        <div className="hero-glow-backdrop" />
        <div className="hero-content">
          {/* Top Meta Info Header */}
          <div className="hero-header-row">
            <div className="hero-title-group">
              {isEditing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    setIsEditing(false);
                    saveName(name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsEditing(false);
                      saveName(name);
                    }
                  }}
                  autoFocus
                  className="hero-name-input"
                />
              ) : (
                <div className="hero-name-display">
                  <h2>{name}</h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="hero-edit-btn"
                    title="Rename Treasury"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="hero-status-pills">
                <span className="status-pill-green">
                  <span className="pulse-dot" /> Treasury Healthy
                </span>
                <span className="status-pill-orange">Arc L2 Vault</span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="hero-actions-group">
              <button
                onClick={() => setShowDepositModal(true)}
                className="hero-btn primary"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Deposit Funds
              </button>
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="hero-btn secondary"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
                Withdraw
              </button>
              <button
                onClick={() => onActionClick?.("schedule")}
                className="hero-btn secondary"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 15" />
                </svg>
                Create Schedule
              </button>
            </div>
          </div>

          {/* Main Balance Display */}
          <div className="hero-balance-row">
            <div className="balance-block">
              <span className="balance-label-sm">Total Treasury Balance</span>
              <div className="balance-number-row">
                <span className="currency-symbol">$</span>
                <span className="balance-amount">
                  {balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="asset-code">USDC</span>
              </div>
            </div>
          </div>

          {/* Bottom Metadata Grid */}
          <div className="hero-metadata-grid">
            <div className="meta-tile">
              <span className="meta-label">Treasury ID</span>
              <div className="meta-val-row">
                <a
                  href={`https://testnet.arcscan.app/address/${TREASURY_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="meta-val link"
                >
                  {TREASURY_ADDRESS.slice(0, 8)}…{TREASURY_ADDRESS.slice(-6)} ↗
                </a>
                <button
                  onClick={() => copyText(TREASURY_ADDRESS, "contract")}
                  className="copy-btn"
                  title="Copy Address"
                >
                  {copiedKey === "contract" ? "✓" : "📋"}
                </button>
              </div>
            </div>

            <div className="meta-tile">
              <span className="meta-label">Owner Wallet</span>
              <div className="meta-val-row">
                <span className="meta-val">
                  {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "Not Connected"}
                </span>
                {address && (
                  <button
                    onClick={() => copyText(address, "owner")}
                    className="copy-btn"
                    title="Copy Owner Address"
                  >
                    {copiedKey === "owner" ? "✓" : "📋"}
                  </button>
                )}
              </div>
            </div>

            <div className="meta-tile">
              <span className="meta-label">Activation Date</span>
              <span className="meta-val">{createdDateStr}</span>
            </div>

            <div className="meta-tile">
              <span className="meta-label">Supported Asset</span>
              <span className="meta-val asset-highlight">USDC (Native Gas)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
      />
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
      />
    </>
  );
}
