import { useAccount, useReadContract, useBalance } from "wagmi";
import { TREASURY_ADDRESS, arcTestnet } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";

export default function WalletHealthCard() {
  const { address, isConnected } = useAccount();

  // Fetch native USDC balance on Arc Testnet
  const { data: walletBalance } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: {
      refetchInterval: 10_000,
    },
  });

  // Fetch user balance in Treasury contract
  const { data: treasuryBalanceRaw } = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: {
      refetchInterval: 10_000,
    },
  });

  const treasuryBalance = treasuryBalanceRaw !== undefined ? Number(treasuryBalanceRaw) / 1e6 : 0;
  const walletUSDC = walletBalance ? Number(walletBalance.value) / 1e18 : 0; // Native gas token format

  if (!isConnected || !address) return null;

  return (
    <div className="wallet-health-card">
      <div className="card-header">
        <div className="title-row">
          <h3>Wallet & Health Status</h3>
          <span className="health-badge green">
            <span className="health-dot" /> Operational
          </span>
        </div>
      </div>

      <div className="health-metrics-grid">
        <div className="health-tile">
          <span className="tile-label">Wallet USDC Balance</span>
          <span className="tile-val">
            {walletUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="denom">USDC</span>
          </span>
          <span className="tile-sub">Available for deposit</span>
        </div>

        <div className="health-tile highlight">
          <span className="tile-label">Treasury Vault Balance</span>
          <span className="tile-val orange">
            {treasuryBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            <span className="denom">USDC</span>
          </span>
          <span className="tile-sub">Active in contract</span>
        </div>

        <div className="health-tile">
          <span className="tile-label">Connected Account</span>
          <span className="tile-val mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <span className="tile-sub">Arc Chain ID: 5042002</span>
        </div>
      </div>
    </div>
  );
}
