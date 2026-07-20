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

type HubTab = "bridge" | "gateway" | "swap" | "send";

const KIT_KEY = import.meta.env.VITE_CIRCLE_KIT_KEY as string | undefined;

const BRIDGE_TESTNET_CHAINS = [
  { label: "Arc Testnet", value: "Arc_Testnet", icon: "🌐" },
  { label: "Base Sepolia", value: "Base_Sepolia", icon: "🔵" },
  { label: "Ethereum Sepolia", value: "Ethereum_Sepolia", icon: "💎" },
  { label: "Avalanche Fuji", value: "Avalanche_Fuji", icon: "🔺" },
  { label: "Polygon Amoy", value: "Polygon_Amoy_Testnet", icon: "🟣" },
] as const;

const UNIFIED_TESTNET_CHAINS = [
  { label: "Arc Testnet", value: "Arc_Testnet", icon: "🌐" },
  { label: "Base Sepolia", value: "Base_Sepolia", icon: "🔵" },
  { label: "Ethereum Sepolia", value: "Ethereum_Sepolia", icon: "💎" },
  { label: "Avalanche Fuji", value: "Avalanche_Fuji", icon: "🔺" },
  { label: "Polygon Amoy", value: "Polygon_Amoy_Testnet", icon: "🟣" },
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
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function AppKitPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [activeTab, setActiveTab] = useState<HubTab>("bridge");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [balances, setBalances] = useState<GetBalancesResult | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("10.00");
  const [sendToken, setSendToken] = useState("USDC");

  const [bridgeSource, setBridgeSource] = useState<BridgeTestnetChain>(ARC_CHAIN);
  const [bridgeDest, setBridgeDest] = useState<BridgeTestnetChain>("Base_Sepolia");
  const [bridgeRecipient, setBridgeRecipient] = useState("");
  const [bridgeAmount, setBridgeAmount] = useState("25.00");

  const [swapIn, setSwapIn] = useState<(typeof SWAP_TOKENS)[number]>("USDC");
  const [swapOut, setSwapOut] = useState<(typeof SWAP_TOKENS)[number]>("EURC");
  const [swapAmount, setSwapAmount] = useState("50.00");
  const [slippage, setSlippage] = useState("300");

  const [ubSource, setUbSource] = useState<UnifiedTestnetChain>(ARC_CHAIN);
  const [ubDest, setUbDest] = useState<UnifiedTestnetChain>("Base_Sepolia");
  const [ubRecipient, setUbRecipient] = useState("");
  const [ubAmount, setUbAmount] = useState("10.00");

  const onWrongChain = isConnected && chainId !== arcTestnet.id;

  const addLog = useCallback((entry: Omit<OperationLog, "id">) => {
    setLogs((current) => [{ ...entry, id: makeId() }, ...current].slice(0, 10));
  }, []);

  useEffect(() => {
    const handler = (payload: AppKitActions[keyof AppKitActions]) => {
      addLog({
        action: "Gateway Event",
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
          detail: hash ? `Transaction confirmed: ${short(hash)}` : summarize(result),
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
    <div className="gateway-redesigned-suite">
      {/* 1. Hero Gateway Banner */}
      <div className="gateway-hero-card">
        <div className="hero-top-row">
          <div className="hero-title-group">
            <div className="gateway-badge">
              <span className="pulse-dot-green" /> Circle Gateway Protocol
            </div>
            <h2>Gateway Multichain Suite</h2>
            <p className="hero-sub font-medium">
              Unified Liquidity, CCTP Cross-Chain Bridging, Token Swaps & Direct Transfers
            </p>
          </div>

          <div className="gateway-status-chips">
            <div className="status-chip">
              <span className="chip-label">Wallet</span>
              <span className="chip-val">{address ? short(address) : "Disconnected"}</span>
            </div>
            <div className="status-chip">
              <span className="chip-label">Network</span>
              <span className="chip-val green">Arc L2 Testnet</span>
            </div>
            <div className="status-chip">
              <span className="chip-label">Circle Kit</span>
              <span className={`chip-val ${KIT_KEY ? "green" : "orange"}`}>
                {KIT_KEY ? "✓ Configured" : "Bridge Active"}
              </span>
            </div>
          </div>
        </div>

        {onWrongChain && (
          <div className="chain-switch-warning">
            <span>⚠️ You are connected to chain #{chainId}. Switch to Arc Testnet to use Gateway features.</span>
            <button
              className="switch-btn"
              onClick={() => switchChain({ chainId: arcTestnet.id })}
              disabled={isSwitching}
            >
              {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
            </button>
          </div>
        )}
      </div>

      {/* 2. Sub-Hub Segmented Control Navigation */}
      <div className="gateway-nav-segmented">
        <button
          onClick={() => setActiveTab("bridge")}
          className={`seg-tab-btn ${activeTab === "bridge" ? "active" : ""}`}
        >
          <span className="tab-icon">🌉</span>
          <div className="tab-text">
            <span className="tab-title">CCTP Bridge</span>
            <span className="tab-sub">Cross-Chain USDC</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("gateway")}
          className={`seg-tab-btn ${activeTab === "gateway" ? "active" : ""}`}
        >
          <span className="tab-icon">🌐</span>
          <div className="tab-text">
            <span className="tab-title">Unified Gateway</span>
            <span className="tab-sub">Multichain Allocations</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("swap")}
          className={`seg-tab-btn ${activeTab === "swap" ? "active" : ""}`}
        >
          <span className="tab-icon">💱</span>
          <div className="tab-text">
            <span className="tab-title">Multi-Swap</span>
            <span className="tab-sub">USDC / EURC / cirBTC</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("send")}
          className={`seg-tab-btn ${activeTab === "send" ? "active" : ""}`}
        >
          <span className="tab-icon">💸</span>
          <div className="tab-text">
            <span className="tab-title">Direct Send</span>
            <span className="tab-sub">Instant Transfers</span>
          </div>
        </button>
      </div>

      {/* 3. Sub-Hub Form Panel */}
      <div className="gateway-hub-viewport">
        {/* SUB-HUB 1: CCTP BRIDGE */}
        {activeTab === "bridge" && (
          <div className="hub-card-body">
            <div className="hub-header-row">
              <div>
                <h3>🌉 Native CCTP Cross-Chain Bridge</h3>
                <p className="hub-desc">Move native USDC between Arc Testnet and EVM testnets with zero slippage</p>
              </div>
              <span className="cctp-chip">Native CCTP Protocol</span>
            </div>

            <div className="chain-selector-grid">
              <div className="chain-select-box">
                <span className="box-label">From Source Chain</span>
                <select
                  value={bridgeSource}
                  onChange={(e) => setBridgeSource(e.target.value as BridgeTestnetChain)}
                  className="chain-select-input"
                >
                  {BRIDGE_TESTNET_CHAINS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bridge-arrow-node">➡️</div>

              <div className="chain-select-box">
                <span className="box-label">To Destination Chain</span>
                <select
                  value={bridgeDest}
                  onChange={(e) => setBridgeDest(e.target.value as BridgeTestnetChain)}
                  className="chain-select-input"
                >
                  {BRIDGE_TESTNET_CHAINS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-group">
              <label className="input-label">Recipient Address</label>
              <input
                type="text"
                placeholder="0x... (Defaults to connected wallet)"
                value={bridgeRecipient}
                onChange={(e) => setBridgeRecipient(e.target.value)}
                className="gateway-text-input font-mono"
              />
            </div>

            <div className="field-group">
              <label className="input-label">Bridge Amount</label>
              <div className="input-amount-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="25.00"
                  value={bridgeAmount}
                  onChange={(e) => setBridgeAmount(e.target.value)}
                  className="gateway-amount-input"
                />
                <span className="denom-tag">USDC</span>
              </div>
            </div>

            <div className="hub-actions-row">
              <button
                className="hub-btn secondary"
                disabled={disabled || bridgeSource === bridgeDest}
                onClick={() =>
                  runAction(
                    "estimateBridge",
                    "Estimate CCTP Bridge",
                    async () => (await getAppKit()).estimateBridge(await bridgeParams()),
                    (result: EstimateResult) => setEstimate(summarize(result))
                  )
                }
              >
                {busy === "estimateBridge" ? "Estimating Fees..." : "Estimate Fees"}
              </button>

              <button
                className="hub-btn primary"
                disabled={disabled || bridgeSource === bridgeDest}
                onClick={() => runAction("bridge", "CCTP Bridge", async () => (await getAppKit()).bridge(await bridgeParams()))}
              >
                {busy === "bridge" ? "Bridging USDC..." : "Bridge USDC"}
              </button>
            </div>
          </div>
        )}

        {/* SUB-HUB 2: UNIFIED GATEWAY */}
        {activeTab === "gateway" && (
          <div className="hub-card-body">
            <div className="hub-header-row">
              <div>
                <h3>🌐 Unified Multichain Gateway</h3>
                <p className="hub-desc">Aggregate and spend USDC liquidity across all connected chains from one wallet</p>
              </div>
              <span className="cctp-chip">Circle Gateway</span>
            </div>

            <div className="gateway-balance-actions">
              <button
                className="hub-btn secondary"
                disabled={disabled}
                onClick={() =>
                  runAction(
                    "balances",
                    "Check Multichain Balances",
                    async () =>
                      (await getAppKit()).unifiedBalance.getBalances({
                        token: "USDC",
                        networkType: "testnet",
                        sources: { address: address ?? "" },
                        includePending: true,
                      }),
                    setBalances
                  )
                }
              >
                {busy === "balances" ? "Querying Balances..." : "🔍 Check Multichain Balances"}
              </button>

              <button
                className="hub-btn primary"
                disabled={disabled}
                onClick={() =>
                  runAction("deposit", "Unified Gateway Deposit", async () =>
                    (await getAppKit()).unifiedBalance.deposit({
                      from: { adapter: await getAdapter(), chain: ubSource },
                      amount: ubAmount,
                      token: "USDC",
                      allowanceStrategy: "approve",
                    })
                  )
                }
              >
                {busy === "deposit" ? "Depositing..." : "Deposit to Gateway"}
              </button>
            </div>

            <div className="chain-selector-grid">
              <div className="chain-select-box">
                <span className="box-label">Source Liquidity Chain</span>
                <select
                  value={ubSource}
                  onChange={(e) => setUbSource(e.target.value as UnifiedTestnetChain)}
                  className="chain-select-input"
                >
                  {UNIFIED_TESTNET_CHAINS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bridge-arrow-node">➡️</div>

              <div className="chain-select-box">
                <span className="box-label">Destination Payout Chain</span>
                <select
                  value={ubDest}
                  onChange={(e) => setUbDest(e.target.value as UnifiedTestnetChain)}
                  className="chain-select-input"
                >
                  {UNIFIED_TESTNET_CHAINS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-group">
              <label className="input-label">Recipient Address</label>
              <input
                type="text"
                placeholder="0x... (Defaults to connected wallet)"
                value={ubRecipient}
                onChange={(e) => setUbRecipient(e.target.value)}
                className="gateway-text-input font-mono"
              />
            </div>

            <div className="field-group">
              <label className="input-label">Spend Amount</label>
              <div className="input-amount-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="10.00"
                  value={ubAmount}
                  onChange={(e) => setUbAmount(e.target.value)}
                  className="gateway-amount-input"
                />
                <span className="denom-tag">USDC</span>
              </div>
            </div>

            <div className="hub-actions-row">
              <button
                className="hub-btn secondary"
                disabled={disabled}
                onClick={() =>
                  runAction(
                    "estimateSpend",
                    "Estimate Spend",
                    async () => (await getAppKit()).unifiedBalance.estimateSpend(await spendParams()),
                    (result: EstimateSpendResult) => setEstimate(summarize(result))
                  )
                }
              >
                {busy === "estimateSpend" ? "Estimating..." : "Estimate Spend"}
              </button>

              <button
                className="hub-btn primary"
                disabled={disabled}
                onClick={() =>
                  runAction(
                    "spend",
                    "Unified Spend",
                    async () => (await getAppKit()).unifiedBalance.spend(await spendParams()),
                    (result: SpendResult) => setEstimate(summarize(result))
                  )
                }
              >
                {busy === "spend" ? "Executing Spend..." : "Spend USDC"}
              </button>
            </div>
          </div>
        )}

        {/* SUB-HUB 3: MULTI-CURRENCY SWAP */}
        {activeTab === "swap" && (
          <div className="hub-card-body">
            <div className="hub-header-row">
              <div>
                <h3>💱 Multi-Currency Token Swaps</h3>
                <p className="hub-desc">Swap USDC, EURC, and cirBTC natively on Arc Testnet</p>
              </div>
              <span className="cctp-chip">Arc DEX Swaps</span>
            </div>

            <div className="field-row two">
              <div className="chain-select-box">
                <span className="box-label">Pay Token</span>
                <select
                  value={swapIn}
                  onChange={(e) => setSwapIn(e.target.value as (typeof SWAP_TOKENS)[number])}
                  className="chain-select-input"
                >
                  {SWAP_TOKENS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="chain-select-box">
                <span className="box-label">Receive Token</span>
                <select
                  value={swapOut}
                  onChange={(e) => setSwapOut(e.target.value as (typeof SWAP_TOKENS)[number])}
                  className="chain-select-input"
                >
                  {SWAP_TOKENS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-row two">
              <div className="field-group">
                <label className="input-label">Swap Amount</label>
                <div className="input-amount-wrapper">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="50.00"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="gateway-amount-input"
                  />
                  <span className="denom-tag">{swapIn}</span>
                </div>
              </div>

              <div className="field-group">
                <label className="input-label">Slippage Tolerance</label>
                <div className="input-amount-wrapper">
                  <input
                    type="text"
                    placeholder="300"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="gateway-amount-input"
                  />
                  <span className="denom-tag">BPS</span>
                </div>
              </div>
            </div>

            <div className="hub-actions-row">
              <button
                className="hub-btn secondary"
                disabled={disabled || !KIT_KEY || swapIn === swapOut}
                onClick={() =>
                  runAction(
                    "estimateSwap",
                    "Estimate Swap",
                    async () => (await getAppKit()).estimateSwap(await swapParams()),
                    (result: SwapEstimate) => setEstimate(summarize(result))
                  )
                }
              >
                {busy === "estimateSwap" ? "Quoting..." : "Get Quote"}
              </button>

              <button
                className="hub-btn primary"
                disabled={disabled || !KIT_KEY || swapIn === swapOut}
                onClick={() => runAction("swap", "Execute Swap", async () => (await getAppKit()).swap(await swapParams()))}
              >
                {busy === "swap" ? "Swapping..." : "Swap Tokens"}
              </button>
            </div>
          </div>
        )}

        {/* SUB-HUB 4: DIRECT SEND */}
        {activeTab === "send" && (
          <div className="hub-card-body">
            <div className="hub-header-row">
              <div>
                <h3>💸 Direct Token Transfer</h3>
                <p className="hub-desc">Execute same-chain instant token transfers on Arc Testnet</p>
              </div>
              <span className="cctp-chip">Arc Direct Transfer</span>
            </div>

            <div className="field-group">
              <label className="input-label">Recipient 0x Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="gateway-text-input font-mono"
              />
            </div>

            <div className="field-row two">
              <div className="field-group">
                <label className="input-label">Transfer Amount</label>
                <div className="input-amount-wrapper">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="10.00"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="gateway-amount-input"
                  />
                  <span className="denom-tag">{sendToken}</span>
                </div>
              </div>

              <div className="field-group">
                <label className="input-label">Token Asset</label>
                <select
                  value={sendToken}
                  onChange={(e) => setSendToken(e.target.value)}
                  className="chain-select-input"
                >
                  {SWAP_TOKENS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="NATIVE">Native USDC Gas</option>
                </select>
              </div>
            </div>

            <div className="hub-actions-row">
              <button
                className="hub-btn secondary"
                disabled={disabled || !sendTo}
                onClick={() =>
                  runAction(
                    "estimateSend",
                    "Estimate Send",
                    async () => (await getAppKit()).estimateSend(await sendParams()),
                    (result: EstimatedGas) => setEstimate(summarize(result))
                  )
                }
              >
                {busy === "estimateSend" ? "Estimating..." : "Estimate Gas"}
              </button>

              <button
                className="hub-btn primary"
                disabled={disabled || !sendTo}
                onClick={() => runAction("send", "Send Tokens", async () => (await getAppKit()).send(await sendParams()))}
              >
                {busy === "send" ? "Sending..." : "Send Tokens"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Activity & Operations Output Feed */}
      {(balances || estimate || logs.length > 0) && (
        <div className="gateway-activity-card">
          <div className="activity-card-header">
            <h3>Gateway Operation Receipts</h3>
            <button
              className="clear-logs-btn"
              onClick={() => {
                setLogs([]);
                setBalances(null);
                setEstimate(null);
              }}
            >
              Clear Feed
            </button>
          </div>

          {balances && (
            <div className="gateway-result-block">
              <span className="result-label">Unified Multichain Balances</span>
              <pre className="result-code">{summarize(balances)}</pre>
            </div>
          )}

          {estimate && (
            <div className="gateway-result-block">
              <span className="result-label">Fee & Route Estimate</span>
              <pre className="result-code">{estimate}</pre>
            </div>
          )}

          <div className="gateway-log-feed">
            {logs.map((log) => (
              <div key={log.id} className={`gateway-log-row ${log.status}`}>
                <div className="log-info">
                  <span className={`log-badge ${log.status}`}>{log.status}</span>
                  <strong>{log.action}</strong>
                  <pre className="log-detail-pre">{log.detail}</pre>
                </div>
                {log.href && (
                  <a href={log.href} target="_blank" rel="noreferrer" className="log-tx-link">
                    View on ArcScan ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
