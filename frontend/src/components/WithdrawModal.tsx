import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { USDC_ARC_TESTNET, ERC20_ABI } from "../lib/wagmi";
import { safeFees } from "../lib/gas";
import { waitForConfirmation } from "../lib/tx";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatUSDC(raw: bigint | undefined) {
  if (raw === undefined) return "0.00";
  return (Number(raw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseUsdcInput(s: string): bigint | null {
  if (!s.trim()) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 1_000_000));
}

export default function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [amountInput, setAmountInput] = useState("");
  const [busy, setBusy] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; txHash?: `0x${string}` } | null>(null);

  const walletUsdc = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 10_000 },
  });

  const treasuryUserBalance = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 10_000 },
  });

  const { writeContractAsync } = useWriteContract();

  if (!isOpen) return null;

  const handleMax = () => {
    if (treasuryUserBalance.data !== undefined) {
      const maxVal = (Number(treasuryUserBalance.data as bigint) / 1e6).toFixed(2);
      setAmountInput(maxVal);
    }
  };

  const refreshAll = async () => {
    await Promise.allSettled([
      walletUsdc.refetch(),
      treasuryUserBalance.refetch(),
      queryClient.invalidateQueries({ queryKey: ["treasuryBalance"] }),
      queryClient.invalidateQueries({ queryKey: ["recentEvents"] }),
      queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const handleWithdraw = async () => {
    setMsg(null);
    const amount = parseUsdcInput(amountInput);
    if (!amount) {
      setMsg({ kind: "err", text: "Enter a positive USDC amount" });
      return;
    }
    if (treasuryUserBalance.data !== undefined && amount > (treasuryUserBalance.data as bigint)) {
      setMsg({ kind: "err", text: "Amount exceeds your treasury balance" });
      return;
    }

    try {
      setBusy(true);
      const hash = await writeContractAsync({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "withdraw",
        args: [amount],
        ...(await safeFees()),
      } as any);
      setMsg({
        kind: "ok",
        text: `Withdrawal sent (${hash.slice(0, 10)}…), confirming on-chain…`,
        txHash: hash,
      });

      const receipt = await waitForConfirmation(hash, "Withdrawal");
      setMsg({
        kind: "ok",
        text: receipt
          ? `✓ Withdrawal confirmed: ${hash.slice(0, 12)}…`
          : "Withdrawal submitted. Balances refreshing automatically…",
        txHash: hash,
      });

      setAmountInput("");
      await refreshAll();
      onSuccess?.();

      setTimeout(() => {
        onClose();
        setMsg(null);
      }, 1800);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Withdrawal failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header-row">
          <div className="modal-title-group">
            <h3>Withdraw USDC</h3>
            <span className="modal-sub">Pull your Treasury Vault balance back to your wallet</span>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            ✕
          </button>
        </div>

        {/* Info Tiles */}
        <div className="modal-balance-tiles">
          <div className="tile-box highlight">
            <span className="tile-label">Treasury Vault Balance</span>
            <span className="tile-value orange">{formatUSDC(treasuryUserBalance.data as bigint)} USDC</span>
            <span className="tile-sub">Available to withdraw</span>
          </div>

          <div className="tile-box">
            <span className="tile-label">Destination Address</span>
            <span className="tile-value font-mono">
              {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
            </span>
            <span className="tile-sub">Connected Wallet</span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="modal-input-group">
          <label className="input-label">Withdraw Amount</label>
          <div className="input-with-max-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={busy}
              className="modal-amount-input"
            />
            <button onClick={handleMax} disabled={busy} className="max-pill-btn">
              MAX
            </button>
            <span className="denom-suffix">USDC</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          className="modal-submit-btn secondary"
          onClick={handleWithdraw}
          disabled={busy || !amountInput}
        >
          {busy ? "Withdrawing USDC…" : "Withdraw USDC"}
        </button>

        {/* Status Area */}
        {msg && (
          <div className={`modal-status-msg ${msg.kind}`}>
            <div>{msg.text}</div>
            {msg.txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${msg.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="modal-tx-link"
              >
                View on ArcScan ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
