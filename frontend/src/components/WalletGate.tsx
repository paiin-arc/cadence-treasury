import { useAccount, useConnect, useChainId, useSwitchChain } from "wagmi";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import cadenceLogoUrl from "../assets/cadence-logo.png";
import { arcTestnet } from "../lib/arc";
import "../styles/WalletGate.css";

interface WalletGateProps {
  onUnlock?: () => void;
}

export default function WalletGate({ onUnlock }: WalletGateProps) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

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

  return (
    <div className="wallet-gate-wrapper">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="wallet-gate-card"
      >
        {/* Brand Header */}
        <div className="gate-brand-row">
          <img src={cadenceLogoUrl} alt="Cadence" className="gate-logo" />
          <span className="gate-brand-name">CADENCE</span>
        </div>

        {/* Title & Description */}
        <h1 className="gate-title">Automate USDC Treasury Operations</h1>
        <p className="gate-description">
          Connect your wallet to manage recurring payroll, cross-chain transfers, and automated liquidity schedules on Arc.
        </p>

        {/* Action Button Stack */}
        <div className="gate-action-stack">
          {!isConnected ? (
            <button
              className="gate-btn-primary"
              onClick={handleConnect}
              disabled={isPending || !walletConnector}
            >
              {isPending ? "Connecting…" : walletConnector ? "Connect Wallet" : "Wallet Not Detected"}
              <ArrowRight size={16} />
            </button>
          ) : onWrongChain ? (
            <button
              className="gate-btn-warning"
              onClick={() => switchChain({ chainId: arcTestnet.id })}
              disabled={isSwitching}
            >
              {isSwitching ? "Switching…" : "Switch to Arc Testnet"}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="gate-btn-primary" onClick={onUnlock || handleConnect}>
              Enter Treasury Dashboard
              <ArrowRight size={16} />
            </button>
          )}

          {!walletConnector && (
            <p className="gate-subtext">Install MetaMask or Rabby wallet to continue.</p>
          )}

          {error && <p className="gate-error">{error.message}</p>}
        </div>

        {/* Security & System Info Footer */}
        <div className="gate-footer-meta">
          <div className="gate-meta-item">
            <Zap size={13} className="gate-icon" />
            <span>Arc Chain 5042002</span>
          </div>
          <div className="gate-meta-item">
            <ShieldCheck size={13} className="gate-icon" />
            <span>Circle CCTP Native</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
