import { fallback, http, createConfig } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { arbitrumSepolia } from "viem/chains";
import { arcTestnet, ARC_RPC_URLS } from "./arc";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, arbitrumSepolia],
  connectors: [metaMask(), injected()],
  transports: {
    [arcTestnet.id]: fallback(
      ARC_RPC_URLS.map((url) =>
        http(url, {
          retryCount: 5,
          retryDelay: 2_000,
          timeout: 20_000,
        })
      ),
      { rank: false }
    ),
    [arbitrumSepolia.id]: http(),
  },
});

export const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000" as const;

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
