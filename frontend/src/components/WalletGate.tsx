import { useState } from "react";
import { useAccount, useConnect, useChainId, useSwitchChain } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { arcTestnet } from "../lib/arc";
import cadenceLogoUrl from "../assets/cadence-logo.png";
import "../styles/WalletGate.css";

interface WalletGateProps {
  onUnlock?: () => void;
}

const FAQS = [
  {
    q: "Is my wallet safe?",
    a: "Yes. Cadence operates via non-custodial smart contracts on Arc Network. Your private keys never leave your browser.",
  },
  {
    q: "Can I trust you?",
    a: "Cadence is open-source and powered by Circle CCTP V2 protocols with automated on-chain execution.",
  },
  {
    q: "Why is it not allowing my wallet?",
    a: "Ensure your wallet extension (MetaMask or Rabby) is unlocked and connected to Arc Testnet (Chain ID 5042002).",
  },
  {
    q: "Can't find my wallet",
    a: "You can click 'Do it manually' below to enter a read-only address or install an EVM compatible browser extension.",
  },
];

export default function WalletGate({ onUnlock }: WalletGateProps) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  const onWrongChain = isConnected && chainId !== arcTestnet.id;
  const walletConnector =
    connectors.find((c) => c.id === "metaMask") ??
    connectors.find((c) => c.id === "injected") ??
    connectors[0];

  const handleConnect = async () => {
    if (onWrongChain) {
      switchChain({ chainId: arcTestnet.id });
      return;
    }

    if (!isConnected && walletConnector) {
      connect({ connector: walletConnector });
    } else if (isConnected && onUnlock) {
      onUnlock();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualAddress && onUnlock) {
      onUnlock();
    }
  };

  return (
    <div className="ref-wallet-wrapper">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="ref-wallet-card"
      >
        {/* Top Centered Icon Container */}
        <div className="ref-icon-box">
          <img src={cadenceLogoUrl} alt="Cadence Logo" className="ref-brand-logo" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="ref-title">Connect</h1>
        <p className="ref-subtitle">
          Link your wallet to check your eligibility status
        </p>

        {/* Primary Action Button or Manual Form */}
        <div className="ref-action-container">
          {!manualMode ? (
            <>
              {!isConnected ? (
                <button
                  className="ref-btn-mint"
                  onClick={handleConnect}
                  disabled={isPending || !walletConnector}
                >
                  {isPending ? "Connecting…" : walletConnector ? "Connect Wallet" : "Wallet not detected"}
                </button>
              ) : onWrongChain ? (
                <button
                  className="ref-btn-mint"
                  onClick={() => switchChain({ chainId: arcTestnet.id })}
                  disabled={isSwitching}
                >
                  {isSwitching ? "Switching…" : "Switch to Arc Testnet"}
                </button>
              ) : (
                <button className="ref-btn-mint" onClick={onUnlock || handleConnect}>
                  Enter Treasury Dashboard
                </button>
              )}

              <div className="ref-manual-link-row">
                <button className="ref-manual-btn" onClick={() => setManualMode(true)}>
                  <u>Do it manually</u>
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleManualSubmit} className="ref-manual-form">
              <input
                type="text"
                placeholder="Paste wallet address (0x…)"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="ref-manual-input"
                autoFocus
              />
              <div className="ref-form-btn-row">
                <button type="submit" className="ref-btn-mint" style={{ flex: 1 }}>
                  Continue
                </button>
                <button
                  type="button"
                  className="ref-btn-cancel"
                  onClick={() => setManualMode(false)}
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {error && <p className="ref-error-msg">{error.message}</p>}
        </div>

        {/* FAQs Inner Glass Box */}
        <div className="ref-faqs-box">
          <div className="ref-faqs-header">
            <u>Faqs</u>
          </div>
          <ul className="ref-faqs-list">
            {FAQS.map((faq, idx) => (
              <li key={idx} className="ref-faq-item">
                <button
                  className={`ref-faq-q-btn ${activeFaq === idx ? "active" : ""}`}
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                >
                  • {faq.q}
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="ref-faq-answer"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
