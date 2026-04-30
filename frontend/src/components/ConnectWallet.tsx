import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { arcTestnet } from "../lib/arc";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const onWrongChain = isConnected && chainId !== arcTestnet.id;
  const injected = connectors[0];

  if (!isConnected) {
    return (
      <button
        className="btn btn-primary connect-btn"
        onClick={() => connect({ connector: injected })}
        disabled={isPending || !injected}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
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
