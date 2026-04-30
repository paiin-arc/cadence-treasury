import { useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { USDC_ARC_TESTNET, ERC20_ABI } from "../lib/wagmi";

const FAUCET_URL = "https://faucet.circle.com";

function formatUSDC(raw: bigint | undefined) {
  if (raw === undefined) return "—";
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

export default function InteractPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState<"approve" | "deposit" | "withdraw" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const walletUsdc = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 8_000 },
  });

  const treasuryUserBalance = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 8_000 },
  });

  const allowance = useReadContract({
    address: USDC_ARC_TESTNET,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, TREASURY_ADDRESS] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 8_000 },
  });

  const { writeContractAsync } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const txReceipt = useWaitForTransactionReceipt({ hash: pendingHash });

  const refreshAll = () => {
    walletUsdc.refetch();
    treasuryUserBalance.refetch();
    allowance.refetch();
    queryClient.invalidateQueries({ queryKey: ["treasuryBalance"] });
    queryClient.invalidateQueries({ queryKey: ["recentEvents"] });
  };

  const handleDeposit = async () => {
    setMsg(null);
    const amount = parseUsdcInput(depositAmount);
    if (!amount) {
      setMsg({ kind: "err", text: "Enter a positive USDC amount" });
      return;
    }
    if (walletUsdc.data !== undefined && amount > walletUsdc.data) {
      setMsg({ kind: "err", text: "Amount exceeds wallet balance" });
      return;
    }

    try {
      const currentAllowance = (allowance.data as bigint | undefined) ?? 0n;
      if (currentAllowance < amount) {
        setBusy("approve");
        const approveHash = await writeContractAsync({
          chainId: arcTestnet.id,
          address: USDC_ARC_TESTNET,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TREASURY_ADDRESS, amount],
        });
        setPendingHash(approveHash);
        setMsg({ kind: "ok", text: `Approval sent (${approveHash.slice(0, 10)}…), waiting…` });
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
          timeout: 60_000,
          pollingInterval: 1_500,
        });
        if (approveReceipt.status !== "success") {
          throw new Error(`Approval reverted (${approveHash.slice(0, 10)}…)`);
        }
        await allowance.refetch();
      }

      setBusy("deposit");
      const depositHash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "deposit",
        args: [amount],
      });
      setPendingHash(depositHash);
      setMsg({ kind: "ok", text: `Deposit sent (${depositHash.slice(0, 10)}…), waiting…` });
      const depositReceipt = await publicClient.waitForTransactionReceipt({
        hash: depositHash,
        timeout: 60_000,
        pollingInterval: 1_500,
      });
      if (depositReceipt.status !== "success") {
        throw new Error(`Deposit reverted (${depositHash.slice(0, 10)}…)`);
      }
      setMsg({ kind: "ok", text: `Deposit confirmed: ${depositHash.slice(0, 12)}…` });
      setDepositAmount("");
      refreshAll();
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Transaction failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleWithdraw = async () => {
    setMsg(null);
    const amount = parseUsdcInput(withdrawAmount);
    if (!amount) {
      setMsg({ kind: "err", text: "Enter a positive USDC amount" });
      return;
    }
    if (treasuryUserBalance.data !== undefined && amount > (treasuryUserBalance.data as bigint)) {
      setMsg({ kind: "err", text: "Amount exceeds your treasury balance" });
      return;
    }

    try {
      setBusy("withdraw");
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "withdraw",
        args: [amount],
      });
      setPendingHash(hash);
      setMsg({ kind: "ok", text: `Withdraw sent (${hash.slice(0, 10)}…), waiting…` });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
        pollingInterval: 1_500,
      });
      if (receipt.status !== "success") {
        throw new Error(`Withdraw reverted (${hash.slice(0, 10)}…)`);
      }
      setMsg({ kind: "ok", text: `Withdraw confirmed: ${hash.slice(0, 12)}…` });
      setWithdrawAmount("");
      refreshAll();
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Transaction failed" });
    } finally {
      setBusy(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="interact-panel">
        <div className="interact-empty">
          <h3>Connect your wallet to deposit or withdraw</h3>
          <p>Need testnet USDC? Grab some from the Circle faucet.</p>
          <a className="btn btn-ghost" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Get USDC from faucet →
          </a>
        </div>
      </div>
    );
  }

  if (!onArc) {
    return (
      <div className="interact-panel">
        <div className="interact-empty">
          <h3>Wrong network</h3>
          <p>Use the connect button above to switch to Arc Testnet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="interact-panel">
      <div className="interact-stats">
        <div className="stat">
          <div className="stat-label">Wallet USDC</div>
          <div className="stat-value">{formatUSDC(walletUsdc.data as bigint)}</div>
          <a className="stat-sub" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Get more from faucet →
          </a>
        </div>
        <div className="stat">
          <div className="stat-label">Your treasury balance</div>
          <div className="stat-value accent">
            {formatUSDC(treasuryUserBalance.data as bigint)}
          </div>
          <div className="stat-sub">Credited to {address && `${address.slice(0, 6)}…${address.slice(-4)}`}</div>
        </div>
      </div>

      <div className="interact-grid">
        <div className="interact-card">
          <h3>Deposit</h3>
          <p className="interact-help">
            Approve + deposit in one click. The treasury credits your address.
          </p>
          <div className="form-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={!!busy}
            />
            <span className="suffix">USDC</span>
          </div>
          <button
            className="btn btn-primary form-btn"
            onClick={handleDeposit}
            disabled={!!busy || !depositAmount}
          >
            {busy === "approve"
              ? "Approving…"
              : busy === "deposit"
                ? "Depositing…"
                : "Deposit"}
          </button>
        </div>

        <div className="interact-card">
          <h3>Withdraw</h3>
          <p className="interact-help">
            Pull your treasury balance back to your wallet anytime.
          </p>
          <div className="form-row">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={!!busy}
            />
            <span className="suffix">USDC</span>
          </div>
          <button
            className="btn btn-ghost form-btn"
            onClick={handleWithdraw}
            disabled={!!busy || !withdrawAmount}
          >
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`interact-msg ${msg.kind}`}>
          {msg.text}
          {pendingHash && txReceipt.isSuccess && msg.kind === "ok" && (
            <>
              {" — "}
              <a
                href={`https://testnet.arcscan.app/tx/${pendingHash}`}
                target="_blank"
                rel="noreferrer"
              >
                view on ArcScan
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
