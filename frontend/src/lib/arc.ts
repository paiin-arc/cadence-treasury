import { createPublicClient, fallback, http } from "viem";
import { arcTestnet } from "viem/chains";

const ARC_FALLBACK_RPC_URLS = [
  "https://rpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network",
];

export { arcTestnet };

export const ARC_RPC_URLS = (
  import.meta.env.VITE_ARC_RPC
    ? [import.meta.env.VITE_ARC_RPC]
    : ARC_FALLBACK_RPC_URLS
).filter(Boolean);

export const ARC_RPC_URL = ARC_RPC_URLS[0];

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(
    ARC_RPC_URLS.map((url) =>
      http(url, {
        retryCount: 5,
        retryDelay: 2_000,
        timeout: 20_000,
      })
    ),
    { rank: false }
  ),
});

export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS as `0x${string}`;
export const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}` | undefined) ?? null;
