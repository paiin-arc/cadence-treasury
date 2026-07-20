import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { USDC_ARC_TESTNET, ERC20_ABI } from "../lib/wagmi";
import { safeFees } from "../lib/gas";
import { waitForConfirmation } from "../lib/tx";

const FAUCET_URL = "https://faucet.circle.com";

interface DepositModalProps {
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

export default function DepositModal({ isOpen, onClose, onSuccess }: DepositModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [amountInput, setAmountInput] = useState("");
  const [busy, setBusy] = useState<"approve" | "deposit" | null>(null);
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

  const allowance = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, TREASURY_ADDRESS] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 10_000 },
  });

  const { writeContractAsync } = useWriteContract();

  if (!isOpen) return null;

  const handleMax = () => {
    if (walletUsdc.data !== undefined) {
      const maxVal = (Number(walletUsdc.data as bigint) / 1e6).toFixed(2);
      setAmountInput(maxVal);
    }
  };

  const refreshAll = async () => {
    await Promise.allSettled([
      walletUsdc.refetch(),
      treasuryUserBalance.refetch(),
      allowance.refetch(),
      queryClient.invalidateQueries({ queryKey: ["treasuryBalance"] }),
      queryClient.invalidateQueries({ queryKey: ["recentEvents"] }),
      queryClient.invalidateQueries({ queryKey: ["txHistory"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const handleDeposit = async () => {
    setMsg(null);
    const amount = parseUsdcInput(amountInput);
    if (!amount) {
      setMsg({ kind: "err", text: "Enter a positive USDC amount" });
      return;
    }
    if (walletUsdc.data !== undefined && amount > (walletUsdc.data as bigint)) {
      setMsg({ kind: "err", text: "Amount exceeds wallet USDC balance" });
      return;
    }

    try {
      const currentAllowance = (allowance.data as bigint | undefined) ?? 0n;
      if (currentAllowance < amount) {
        setBusy("approve");
        const approveHash = await writeContractAsync({
          address: USDC_ARC_TESTNET,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TREASURY_ADDRESS, amount],
          ...(await safeFees()),
        } as any);
        setMsg({
          kind: "ok",
          text: `Approval sent (${approveHash.slice(0, 10)}…), confirming…`,
          txHash: approveHash,
        });
        const approvalReceipt = await waitForConfirmation(approveHash, "Approval");
        if (!approvalReceipt) {
          setMsg({
            kind: "ok",
            text: "Approval submitted, waiting on block confirmation. Try Deposit again if needed.",
            txHash: approveHash,
          });
          await refreshAll();
          return;
        }
        await Promise.allSettled([allowance.refetch()]);
      }

      setBusy("deposit");
      const depositHash = await writeContractAsync({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "deposit",
        args: [amount],
        ...(await safeFees()),
      } as any);
      setMsg({
        kind: "ok",
        text: `Deposit sent (${depositHash.slice(0, 10)}…), confirming on-chain…`,
        txHash: depositHash,
      });

      const depositReceipt = await waitForConfirmation(depositHash, "Deposit");
      setMsg({
        kind: "ok",
        text: depositReceipt
          ? `✓ Deposit confirmed! ${depositHash.slice(0, 12)}…`
          : "Deposit submitted and mining. Refreshing balances…",
        txHash: depositHash,
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
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Deposit failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header-row">
          <div className="modal-title-group">
            <h3>Deposit USDC</h3>
            <span className="modal-sub">Approve + credit funds directly to your Treasury Vault</span>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            ✕
          </button>
        </div>

        {/* Balance Tiles */}
        <div className="modal-balance-tiles">
          <div className="tile-box">
            <span className="tile-label">Wallet USDC</span>
            <span className="tile-value">{formatUSDC(walletUsdc.data as bigint)} USDC</span>
            <a className="faucet-link" href={FAUCET_URL} target="_blank" rel="noreferrer">
              Get from faucet →
            </a>
          </div>

          <div className="tile-box highlight">
            <span className="tile-label">Treasury Vault</span>
            <span className="tile-value orange">{formatUSDC(treasuryUserBalance.data as bigint)} USDC</span>
            <span className="tile-sub font-mono">
              {address && `${address.slice(0, 6)}…${address.slice(-4)}`}
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="modal-input-group">
          <label className="input-label">Deposit Amount</label>
          <div className="input-with-max-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={!!busy}
              className="modal-amount-input"
            />
            <button onClick={handleMax} disabled={!!busy} className="max-pill-btn">
              MAX
            </button>
            <span className="denom-suffix">USDC</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          className="modal-submit-btn primary"
          onClick={handleDeposit}
          disabled={!!busy || !amountInput}
        >
          {busy === "approve"
            ? "1/2 Approving USDC…"
            : busy === "deposit"
            ? "2/2 Depositing USDC…"
            : "Deposit USDC"}
        </button>

        {/* Transaction Status Msg */}
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
