import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { arcTestnet } from "../lib/arc";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const onWrongChain = isConnected && chainId !== arcTestnet.id;
  const walletConnector = connectors.find((connector) => connector.id === "metaMask") ?? connectors.find((connector) => connector.id === "injected") ?? connectors[0];
  const hasWallet = Boolean(walletConnector);

  if (!isConnected) {
    return (
      <div className="connect-wallet-stack">
        <button
          className="btn btn-primary connect-btn"
          onClick={() => walletConnector && connect({ connector: walletConnector })}
          disabled={isPending || !hasWallet}
        >
          {isPending ? "Connecting…" : hasWallet ? "Connect Wallet" : "Wallet not detected"}
        </button>
        {!hasWallet && <small className="muted">Install MetaMask or Rabby and refresh the page.</small>}
        {error && <small className="muted">{error.message}</small>}
      </div>
    );
  }

  if (onWrongChain) {
    return (
      <button
        className="btn btn-ghost connect-btn"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isSwitching}
      >
        {isSwitching ? "Switching…" : "Switch to Arc Testnet"}
      </button>
    );
  }

  return (
    <button
      className="btn btn-ghost connect-btn"
      onClick={() => disconnect()}
      title="Click to disconnect"
    >
      <span className="dot-online" /> {address && shortAddr(address)}
    </button>
  );
}
