import { useCallback, useEffect, useState } from "react";
import type {
  AppKit,
  AppKitActions,
  BridgeParams,
  EstimateResult,
  EstimateSpendResult,
  EstimatedGas,
  GetBalancesResult,
  SendParams,
  SpendParams,
  SpendResult,
  SwapEstimate,
  SwapParams,
} from "@circle-fin/app-kit";
import { createPublicClient, fallback, http } from "viem";
import type { EIP1193Provider } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ARC_RPC_URLS, arcTestnet } from "../lib/arc";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type BusyAction =
  | "balances"
  | "deposit"
  | "estimateSpend"
  | "spend"
  | "estimateBridge"
  | "bridge"
  | "estimateSwap"
  | "swap"
  | "estimateSend"
  | "send";

type OperationLog = {
  id: string;
  action: string;
  status: "done" | "error" | "event";
  detail: string;
  href?: string;
};

const KIT_KEY = import.meta.env.VITE_CIRCLE_KIT_KEY as string | undefined;

const BRIDGE_TESTNET_CHAINS = [
  { label: "Arc Testnet", value: "Arc_Testnet" },
  { label: "Base Sepolia", value: "Base_Sepolia" },
  { label: "Ethereum Sepolia", value: "Ethereum_Sepolia" },
  { label: "Avalanche Fuji", value: "Avalanche_Fuji" },
  { label: "Polygon Amoy", value: "Polygon_Amoy_Testnet" },
] as const;

const UNIFIED_TESTNET_CHAINS = [
  { label: "Arc Testnet", value: "Arc_Testnet" },
  { label: "Base Sepolia", value: "Base_Sepolia" },
  { label: "Ethereum Sepolia", value: "Ethereum_Sepolia" },
  { label: "Avalanche Fuji", value: "Avalanche_Fuji" },
  { label: "Polygon Amoy", value: "Polygon_Amoy_Testnet" },
] as const;

const SWAP_TOKENS = ["USDC", "EURC", "cirBTC"] as const;
const ARC_CHAIN = "Arc_Testnet" as const;
type BridgeTestnetChain = (typeof BRIDGE_TESTNET_CHAINS)[number]["value"];
type UnifiedTestnetChain = (typeof UNIFIED_TESTNET_CHAINS)[number]["value"];

let appKitPromise: Promise<AppKit> | null = null;

const getAppKit = () => {
  appKitPromise ??= import("@circle-fin/app-kit").then(({ AppKit }) => new AppKit({ disableErrorReporting: true }));
  return appKitPromise;
};

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const summarize = (value: unknown) => {
  try {
    return JSON.stringify(
      value,
      (_, item) => (typeof item === "bigint" ? item.toString() : item),
      2
    );
  } catch {
    return String(value);
  }
};

const txFromResult = (value: unknown): { hash?: string; href?: string } => {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const hash = typeof record.txHash === "string" ? record.txHash : typeof record.hash === "string" ? record.hash : undefined;
  const href = typeof record.explorerUrl === "string" ? record.explorerUrl : hash ? `https://testnet.arcscan.app/tx/${hash}` : undefined;
  return { hash, href };
};

function short(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function AppKitPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [balances, setBalances] = useState<GetBalancesResult | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("1.00");
  const [sendToken, setSendToken] = useState("USDC");

  const [bridgeSource, setBridgeSource] = useState<BridgeTestnetChain>(ARC_CHAIN);
  const [bridgeDest, setBridgeDest] = useState<BridgeTestnetChain>("Base_Sepolia");
  const [bridgeRecipient, setBridgeRecipient] = useState("");
  const [bridgeAmount, setBridgeAmount] = useState("1.00");

  const [swapIn, setSwapIn] = useState<(typeof SWAP_TOKENS)[number]>("USDC");
  const [swapOut, setSwapOut] = useState<(typeof SWAP_TOKENS)[number]>("EURC");
  const [swapAmount, setSwapAmount] = useState("1.00");
  const [slippage, setSlippage] = useState("300");

  const [ubSource, setUbSource] = useState<UnifiedTestnetChain>(ARC_CHAIN);
  const [ubDest, setUbDest] = useState<UnifiedTestnetChain>("Base_Sepolia");
  const [ubRecipient, setUbRecipient] = useState("");
  const [ubAmount, setUbAmount] = useState("1.00");

  const onWrongChain = isConnected && chainId !== arcTestnet.id;

  const addLog = useCallback((entry: Omit<OperationLog, "id">) => {
    setLogs((current) => [{ ...entry, id: makeId() }, ...current].slice(0, 10));
  }, []);

  useEffect(() => {
    const handler = (payload: AppKitActions[keyof AppKitActions]) => {
      addLog({
        action: "App Kit event",
        status: "event",
        detail: summarize(payload),
      });
    };

    let mounted = true;
    let loadedKit: AppKit | null = null;
    getAppKit().then((kit) => {
      if (!mounted) return;
      loadedKit = kit;
      kit.on("*", handler);
    });

    return () => {
      mounted = false;
      loadedKit?.off("*", handler);
    };
  }, [addLog]);

  const getAdapter = useCallback(async () => {
    if (!window.ethereum) throw new Error("No injected wallet provider found.");
    const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
    return createViemAdapterFromProvider({
      provider: window.ethereum,
      getPublicClient: ({ chain }) =>
        createPublicClient({
          chain,
          transport:
            chain.id === arcTestnet.id
              ? fallback(ARC_RPC_URLS.map((url) => http(url, { retryCount: 2, timeout: 20_000 })), { rank: false })
              : http(),
        }),
      capabilities: { addressContext: "user-controlled" },
    });
  }, []);

  const runAction = useCallback(
    async <T,>(action: BusyAction, label: string, task: () => Promise<T>, onDone?: (result: T) => void) => {
      setBusy(action);
      setEstimate(null);
      try {
        const result = await task();
        onDone?.(result);
        const { hash, href } = txFromResult(result);
        addLog({
          action: label,
          status: "done",
          detail: hash ? `Transaction submitted: ${short(hash)}` : summarize(result),
          href,
        });
      } catch (err) {
        addLog({
          action: label,
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(null);
      }
    },
    [addLog]
  );

  const disabled = !isConnected || busy !== null;

  const sendParams = useCallback(
    async (): Promise<SendParams> => ({
      from: { adapter: await getAdapter(), chain: ARC_CHAIN },
      to: sendTo,
      amount: sendAmount,
      token: sendToken,
    }),
    [getAdapter, sendAmount, sendTo, sendToken]
  );

  const bridgeParams = useCallback(
    async (): Promise<BridgeParams> => ({
      from: { adapter: await getAdapter(), chain: bridgeSource },
      to: {
        chain: bridgeDest,
        recipientAddress: bridgeRecipient || address || "",
        useForwarder: true,
      },
      amount: bridgeAmount,
      token: "USDC",
    }),
    [address, bridgeAmount, bridgeDest, bridgeRecipient, bridgeSource, getAdapter]
  );

  const swapParams = useCallback(
    async (): Promise<SwapParams> => ({
      from: { adapter: await getAdapter(), chain: ARC_CHAIN as SwapParams["from"]["chain"] },
      tokenIn: swapIn,
      tokenOut: swapOut,
      amountIn: swapAmount,
      config: {
        kitKey: KIT_KEY ?? "",
        slippageBps: Number(slippage) || 300,
        allowanceStrategy: "permit",
      },
    }),
    [getAdapter, slippage, swapAmount, swapIn, swapOut]
  );

  const spendParams = useCallback(
    async (): Promise<SpendParams> => {
      const adapter = await getAdapter();
      return {
        from: {
          adapter,
          allocations: { chain: ubSource, amount: ubAmount },
        },
        to: {
          chain: ubDest,
          recipientAddress: ubRecipient || address || "",
          useForwarder: true,
        },
        amount: ubAmount,
        token: "USDC",
      };
    },
    [address, getAdapter, ubAmount, ubDest, ubRecipient, ubSource]
  );

  return (
    <div className="appkit-panel">
      <div className="schedule-card appkit-hero">
        <div className="schedule-header">
          <div>
            <h3>Circle App Kit Actions</h3>
            <p className="interact-help" style={{ marginTop: 4, marginBottom: 0 }}>
              Bridge, send, swap, and spend real USDC flows from the connected wallet.
            </p>
          </div>
          <span className={`pill ${KIT_KEY ? "pill-ok" : "pill-warn"}`}>
            {KIT_KEY ? "Kit key ready" : "Swap key missing"}
          </span>
        </div>

        <div className="appkit-status-grid">
          <div className="appkit-status">
            <span>Wallet</span>
            <strong>{address ? short(address) : "Not connected"}</strong>
            <small>{isConnected ? "Browser wallet adapter" : "Connect wallet first"}</small>
          </div>
          <div className="appkit-status">
            <span>Arc gas</span>
            <strong>Native USDC</strong>
            <small>RPC methods still use EVM names like eth_sendTransaction</small>
          </div>
          <div className="appkit-status">
            <span>Network</span>
            <strong>{arcTestnet.name}</strong>
            <small>{arcTestnet.id} · Testnet only</small>
          </div>
        </div>

        {onWrongChain && (
          <button className="btn btn-primary form-btn" onClick={() => switchChain({ chainId: arcTestnet.id })} disabled={isSwitching}>
            {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
          </button>
        )}
      </div>

      <div className="appkit-action-grid appkit-action-forms">
        <section className="schedule-card appkit-action-card">
          <div className="schedule-header">
            <h3>Send</h3>
            <span className="schedule-balance">Same chain</span>
          </div>
          <label className="form-row">
            <input value={sendTo} onChange={(event) => setSendTo(event.target.value)} placeholder="Recipient 0x..." />
          </label>
          <div className="field-row two">
            <label className="form-row">
              <input value={sendAmount} onChange={(event) => setSendAmount(event.target.value)} placeholder="1.00" />
              <span className="suffix">{sendToken}</span>
            </label>
            <label className="form-row">
              <select value={sendToken} onChange={(event) => setSendToken(event.target.value)}>
                {SWAP_TOKENS.map((token) => (
                  <option value={token} key={token}>{token}</option>
                ))}
                <option value="NATIVE">Native USDC gas</option>
              </select>
            </label>
          </div>
          <div className="field-row two">
            <button
              className="btn btn-ghost form-btn"
              disabled={disabled || !sendTo}
              onClick={() => runAction("estimateSend", "Estimate send", async () => (await getAppKit()).estimateSend(await sendParams()), (result: EstimatedGas) => setEstimate(summarize(result)))}
            >
              {busy === "estimateSend" ? "Estimating..." : "Estimate"}
            </button>
            <button
              className="btn btn-primary form-btn"
              disabled={disabled || !sendTo}
              onClick={() => runAction("send", "Send", async () => (await getAppKit()).send(await sendParams()))}
            >
              {busy === "send" ? "Sending..." : "Send"}
            </button>
          </div>
        </section>

        <section className="schedule-card appkit-action-card">
          <div className="schedule-header">
            <h3>Bridge</h3>
            <span className="schedule-balance">CCTP</span>
          </div>
          <div className="field-row two">
            <label className="form-row">
              <select value={bridgeSource} onChange={(event) => setBridgeSource(event.target.value as BridgeTestnetChain)}>
                {BRIDGE_TESTNET_CHAINS.map((chain) => (
                  <option value={chain.value} key={chain.value}>{chain.label}</option>
                ))}
              </select>
            </label>
            <label className="form-row">
              <select value={bridgeDest} onChange={(event) => setBridgeDest(event.target.value as BridgeTestnetChain)}>
                {BRIDGE_TESTNET_CHAINS.map((chain) => (
                  <option value={chain.value} key={chain.value}>{chain.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-row">
            <input value={bridgeRecipient} onChange={(event) => setBridgeRecipient(event.target.value)} placeholder="Recipient, defaults to connected wallet" />
          </label>
          <label className="form-row">
            <input value={bridgeAmount} onChange={(event) => setBridgeAmount(event.target.value)} placeholder="1.00" />
            <span className="suffix">USDC</span>
          </label>
          <div className="field-row two">
            <button
              className="btn btn-ghost form-btn"
              disabled={disabled || bridgeSource === bridgeDest}
              onClick={() => runAction("estimateBridge", "Estimate bridge", async () => (await getAppKit()).estimateBridge(await bridgeParams()), (result: EstimateResult) => setEstimate(summarize(result)))}
            >
              {busy === "estimateBridge" ? "Estimating..." : "Estimate"}
            </button>
            <button
              className="btn btn-primary form-btn"
              disabled={disabled || bridgeSource === bridgeDest}
              onClick={() => runAction("bridge", "Bridge", async () => (await getAppKit()).bridge(await bridgeParams()))}
            >
              {busy === "bridge" ? "Bridging..." : "Bridge"}
            </button>
          </div>
        </section>

        <section className="schedule-card appkit-action-card">
          <div className="schedule-header">
            <h3>Swap</h3>
            <span className="schedule-balance">Arc only</span>
          </div>
          <div className="field-row two">
            <label className="form-row">
              <select value={swapIn} onChange={(event) => setSwapIn(event.target.value as (typeof SWAP_TOKENS)[number])}>
                {SWAP_TOKENS.map((token) => (
                  <option value={token} key={token}>{token}</option>
                ))}
              </select>
            </label>
            <label className="form-row">
              <select value={swapOut} onChange={(event) => setSwapOut(event.target.value as (typeof SWAP_TOKENS)[number])}>
                {SWAP_TOKENS.map((token) => (
                  <option value={token} key={token}>{token}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row two">
            <label className="form-row">
              <input value={swapAmount} onChange={(event) => setSwapAmount(event.target.value)} placeholder="1.00" />
              <span className="suffix">{swapIn}</span>
            </label>
            <label className="form-row">
              <input value={slippage} onChange={(event) => setSlippage(event.target.value)} placeholder="300" />
              <span className="suffix">BPS</span>
            </label>
          </div>
          <div className="field-row two">
            <button
              className="btn btn-ghost form-btn"
              disabled={disabled || !KIT_KEY || swapIn === swapOut}
              onClick={() => runAction("estimateSwap", "Estimate swap", async () => (await getAppKit()).estimateSwap(await swapParams()), (result: SwapEstimate) => setEstimate(summarize(result)))}
            >
              {busy === "estimateSwap" ? "Estimating..." : "Estimate"}
            </button>
            <button
              className="btn btn-primary form-btn"
              disabled={disabled || !KIT_KEY || swapIn === swapOut}
              onClick={() => runAction("swap", "Swap", async () => (await getAppKit()).swap(await swapParams()))}
            >
              {busy === "swap" ? "Swapping..." : "Swap"}
            </button>
          </div>
          {!KIT_KEY && <small className="appkit-note">Set VITE_CIRCLE_KIT_KEY for Arc swap quotes and execution.</small>}
        </section>

        <section className="schedule-card appkit-action-card">
          <div className="schedule-header">
            <h3>Unified Balance</h3>
            <span className="schedule-balance">Gateway</span>
          </div>
          <div className="field-row two">
            <button
              className="btn btn-ghost form-btn"
              disabled={disabled}
              onClick={() =>
                runAction("balances", "Unified balance", async () => (await getAppKit()).unifiedBalance.getBalances({ token: "USDC", networkType: "testnet", sources: { address: address ?? "" }, includePending: true }), setBalances)
              }
            >
              {busy === "balances" ? "Checking..." : "Check Balance"}
            </button>
            <button
              className="btn btn-primary form-btn"
              disabled={disabled}
              onClick={() =>
                runAction("deposit", "Unified deposit", async () =>
                  (await getAppKit()).unifiedBalance.deposit({
                    from: { adapter: await getAdapter(), chain: ubSource },
                    amount: ubAmount,
                    token: "USDC",
                    allowanceStrategy: "approve",
                  })
                )
              }
            >
              {busy === "deposit" ? "Depositing..." : "Deposit"}
            </button>
          </div>
          <div className="field-row two">
            <label className="form-row">
              <select value={ubSource} onChange={(event) => setUbSource(event.target.value as UnifiedTestnetChain)}>
                {UNIFIED_TESTNET_CHAINS.map((chain) => (
                  <option value={chain.value} key={chain.value}>{chain.label}</option>
                ))}
              </select>
            </label>
            <label className="form-row">
              <select value={ubDest} onChange={(event) => setUbDest(event.target.value as UnifiedTestnetChain)}>
                {UNIFIED_TESTNET_CHAINS.map((chain) => (
                  <option value={chain.value} key={chain.value}>{chain.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-row">
            <input value={ubRecipient} onChange={(event) => setUbRecipient(event.target.value)} placeholder="Spend recipient, defaults to connected wallet" />
          </label>
          <label className="form-row">
            <input value={ubAmount} onChange={(event) => setUbAmount(event.target.value)} placeholder="1.00" />
            <span className="suffix">USDC</span>
          </label>
          <div className="field-row two">
            <button
              className="btn btn-ghost form-btn"
              disabled={disabled}
              onClick={() => runAction("estimateSpend", "Estimate spend", async () => (await getAppKit()).unifiedBalance.estimateSpend(await spendParams()), (result: EstimateSpendResult) => setEstimate(summarize(result)))}
            >
              {busy === "estimateSpend" ? "Estimating..." : "Estimate Spend"}
            </button>
            <button
              className="btn btn-primary form-btn"
              disabled={disabled}
              onClick={() => runAction("spend", "Unified spend", async () => (await getAppKit()).unifiedBalance.spend(await spendParams()), (result: SpendResult) => setEstimate(summarize(result)))}
            >
              {busy === "spend" ? "Spending..." : "Spend"}
            </button>
          </div>
        </section>
      </div>

      {(balances || estimate || logs.length > 0) && (
        <section className="schedule-card appkit-results">
          <div className="schedule-header">
            <h3>Activity</h3>
            <button className="btn btn-ghost btn-small" onClick={() => { setLogs([]); setBalances(null); setEstimate(null); }}>
              Clear
            </button>
          </div>

          {balances && (
            <div className="appkit-result-box">
              <strong>Unified Balance</strong>
              <pre>{summarize(balances)}</pre>
            </div>
          )}

          {estimate && (
            <div className="appkit-result-box">
              <strong>Latest estimate / result</strong>
              <pre>{estimate}</pre>
            </div>
          )}

          <div className="appkit-log-list">
            {logs.map((log) => (
              <div className={`appkit-log ${log.status}`} key={log.id}>
                <div>
                  <strong>{log.action}</strong>
                  <pre>{log.detail}</pre>
                </div>
                {log.href && (
                  <a className="tx-link appkit-tx-link" href={log.href} target="_blank" rel="noreferrer">
                    View tx
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
