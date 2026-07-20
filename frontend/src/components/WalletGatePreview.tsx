import { useState, type ReactNode } from "react";
import { useAccount, useConnect } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowRight } from "lucide-react";
import "../styles/WalletGatePreview.css";

interface WalletGatePreviewProps {
  children: ReactNode;
  pageTitle: string;
}

export default function WalletGatePreview({ children, pageTitle }: WalletGatePreviewProps) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [dismissedModal, setDismissedModal] = useState(false);

  const walletConnector =
    connectors.find((c) => c.id === "metaMask") ??
    connectors.find((c) => c.id === "injected") ??
    connectors[0];

  const handleConnect = () => {
    if (walletConnector) {
      connect({ connector: walletConnector });
    }
  };

  // If wallet is connected, render the real operational page cleanly
  if (isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="wallet-gate-wrapper">
      {/* Background Animated Floating Demo Activity Cards */}
      <div className="gate-anim-background">
        <motion.div
          animate={{ y: [0, -12, 0], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="floating-activity-card card-1"
        >
          <span style={{ color: "#c084fc", fontSize: "16px" }}>⇄</span>
          <div>
            <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600" }}>USDC Schedule Executed</div>
            <div style={{ color: "#a1a1aa", fontSize: "11px" }}>4,500 USDC → payroll_q3.eth</div>
          </div>
        </motion.div>

        <motion.div
          animate={{ y: [0, 14, 0], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="floating-activity-card card-2"
        >
          <span style={{ color: "#38bdf8", fontSize: "16px" }}>◆</span>
          <div>
            <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600" }}>Multi-Pay Batch Signed</div>
            <div style={{ color: "#a1a1aa", fontSize: "11px" }}>4 Wallets · Single Signature</div>
          </div>
        </motion.div>

        <motion.div
          animate={{ y: [0, -10, 0], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="floating-activity-card card-3"
        >
          <span style={{ color: "#34d399", fontSize: "16px" }}>🔒</span>
          <div>
            <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600" }}>Milestone Escrow Vault</div>
            <div style={{ color: "#a1a1aa", fontSize: "11px" }}>50,000 USDC Locked on Arc</div>
          </div>
        </motion.div>
      </div>

      {/* Render Full Page Interface in Demo Mode */}
      <div className={`wallet-gate-preview-content ${dismissedModal ? "preview-interactive" : ""}`}>
        {children}
      </div>

      {/* Soft Blur Overlay & Floating Center Glassmorphism Modal */}
      <AnimatePresence>
        {!dismissedModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="gate-blur-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="gate-modal-card"
            >
              <div className="gate-modal-badge">
                <span>⟡ Experience Cadence</span>
              </div>

              <h2 className="gate-modal-title">Explore {pageTitle}</h2>

              <p className="gate-modal-desc">
                Explore treasury workflows in preview mode. Connect your wallet to create schedules, execute multipay transactions and manage escrow operations.
              </p>

              <div className="gate-modal-actions">
                <button
                  className="btn-gate-connect"
                  onClick={handleConnect}
                  disabled={isPending || !walletConnector}
                >
                  <Wallet size={16} />
                  <span>{isPending ? "Connecting Wallet…" : "Connect Wallet"}</span>
                  <ArrowRight size={16} />
                </button>

                <button
                  className="btn-gate-dismiss"
                  onClick={() => setDismissedModal(true)}
                >
                  Continue Exploring in Demo Mode →
                </button>
              </div>

              <div className="gate-feature-symbols">
                <span>◆ Demo Mode Active</span>
                <span>◈ Arc Network 5042002</span>
                <span>✦ Circle CCTP Ready</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
