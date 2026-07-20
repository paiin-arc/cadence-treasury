import { createPublicClient, fallback, http } from "viem";
import { arcTestnet } from "viem/chains";

export { arcTestnet };

const ARC_FALLBACK_RPC_URLS = [
  "https://rpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network",
];

const RPC_URLS = (process.env.ARC_RPC_URL
  ? process.env.ARC_RPC_URL.split(",")
  : ARC_FALLBACK_RPC_URLS
)
  .map((url) => url.trim())
  .filter(Boolean);
const VERBOSE_RPC_LOGS = process.env.ARC_RPC_VERBOSE_LOGS === "true";

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(
    RPC_URLS.map((url) =>
      http(url, {
        retryCount: 3,
        retryDelay: 1_000,
        timeout: 15_000,
      })
    ),
    { rank: false }
  ),
});

let rpcCooldownUntil = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryRpc(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("request limit reached") || message.includes("429") || message.includes("rate limit");
}

function maybeLogRpc(message: string) {
  if (VERBOSE_RPC_LOGS) {
    console.warn(message);
  }
}

function applyRpcCooldown() {
  const now = Date.now();
  const cooldownMs = 4_000 + Math.floor(Math.random() * 2_000);
  rpcCooldownUntil = Math.max(rpcCooldownUntil, now + cooldownMs);
}

export async function readContractWithRetry<T>(
  args: Parameters<typeof publicClient.readContract>[0]
): Promise<T> {
  let attempt = 0;

  while (true) {
    const now = Date.now();
    const remainingCooldown = rpcCooldownUntil - now;
    if (remainingCooldown > 0) {
      maybeLogRpc(`[Scheduler] Arc RPC cooldown active for ${remainingCooldown}ms before retrying...`);
      await sleep(remainingCooldown);
    }

    try {
      return (await publicClient.readContract(args)) as T;
    } catch (error) {
      if (!shouldRetryRpc(error) || attempt >= 3) {
        throw error;
      }

      applyRpcCooldown();
      const backoffMs = 1_000 * 2 ** attempt + Math.floor(Math.random() * 500);
      maybeLogRpc(
        `[Scheduler] Arc RPC rate limit hit, retrying in ${backoffMs}ms (attempt ${attempt + 1}/3)...`
      );
      await sleep(backoffMs);
      attempt += 1;
    }
  }
}
