import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import type { AgentLog } from "../hooks/useTreasury";

type TreasuryMetadataProps = {
  agentLogs: AgentLog[];
};

export default function TreasuryMetadata({ agentLogs }: TreasuryMetadataProps) {
  const { address } = useAccount();
  const [name, setName] = useState("My Cadence Treasury");
  const [isEditing, setIsEditing] = useState(false);

  // Load custom name from local storage
  useEffect(() => {
    if (address) {
      const saved = localStorage.getItem(`cadence:treasury-name:${address.toLowerCase()}`);
      if (saved) {
        setName(saved);
      } else {
        setName(`Treasury of ${address.slice(0, 6)}…${address.slice(-4)}`);
      }
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

  // Fetch the user's specific balance in the treasury
  const { data: balanceRaw } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: {
      refetchInterval: 10_000,
    }
  });

  const balance = balanceRaw !== undefined ? Number(balanceRaw) / 1e6 : 0;

  // Determine creation date from backend logs
  const createdLog = agentLogs.find((l) => l.action === "Treasury created");
  const createdDateStr = createdLog 
    ? new Date(createdLog.timestamp).toLocaleDateString(undefined, { 
        year: "numeric", 
        month: "short", 
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Apr 26, 2026"; // fallback default

  if (!address) return null;

  return (
    <div className="treasury-metadata-card">
      <div className="metadata-glow" />
      <div className="metadata-header">
        <div className="metadata-title-area">
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
              className="metadata-name-input"
            />
          ) : (
            <div className="metadata-name-row">
              <h3>{name}</h3>
              <button onClick={() => setIsEditing(true)} className="metadata-edit-btn" title="Edit Name">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
          <span className="metadata-badge">Arc Testnet</span>
        </div>
        <div className="metadata-balance-panel">
          <span className="balance-label">Your Balance</span>
          <span className="balance-value">
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="balance-denom">USDC</span>
          </span>
        </div>
      </div>

      <div className="metadata-grid">
        <div className="metadata-item">
          <span className="metadata-item-label">Treasury ID</span>
          <a
            href={`https://testnet.arcscan.app/address/${TREASURY_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="metadata-item-value address-link"
          >
            {TREASURY_ADDRESS.slice(0, 10)}…{TREASURY_ADDRESS.slice(-8)} ↗
          </a>
        </div>
        <div className="metadata-item">
          <span className="metadata-item-label">Owner Wallet</span>
          <span className="metadata-item-value">{address.slice(0, 10)}…{address.slice(-8)}</span>
        </div>
        <div className="metadata-item">
          <span className="metadata-item-label">Activation Date</span>
          <span className="metadata-item-value">{createdDateStr}</span>
        </div>
        <div className="metadata-item">
          <span className="metadata-item-label">Supported Assets</span>
          <span className="metadata-item-value asset-tag">USDC (Native Gas)</span>
        </div>
      </div>
    </div>
  );
}
