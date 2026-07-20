import { createPublicClient, defineChain, http } from "viem";
import "dotenv/config";

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] },
  },
  testnet: true,
});

const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;

const ESCROW_READ_ABI = [
  {
    name: "payments",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "releaseTimestamp", type: "uint256" },
      { name: "refundTo", type: "address" },
      { name: "withdrawnAmount", type: "uint256" },
      { name: "refunded", type: "bool" },
    ],
  },
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nonce",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network", {
    retryCount: 3,
    retryDelay: 1_500,
    timeout: 15_000,
  }),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryRpc<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error ?? "");
      const retryable =
        message.includes("request limit reached") ||
        message.includes("429") ||
        message.includes("rate limit");

      if (!retryable || attempt === 4) break;
      await sleep(2_500 * (attempt + 1));
    }
  }

  throw new Error(`${label} failed after retries`, { cause: lastError });
}

function formatUsdc(raw: bigint) {
  return `${(Number(raw) / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} USDC`;
}

function status(amount: bigint, withdrawnAmount: bigint, refunded: boolean) {
  if (refunded) return "refunded";
  if (amount > 0n && withdrawnAmount >= amount) return "withdrawn/paid";
  return "held in escrow";
}

async function main() {
  if (!ESCROW_ADDRESS) throw new Error("ESCROW_CONTRACT_ADDRESS is not set");

  const ids = process.argv.slice(2).map((value) => BigInt(value));
  if (ids.length === 0) {
    throw new Error("Usage: npx tsx --env-file=.env scripts/check-escrow-payments.ts 2");
  }

  const nonce = await retryRpc("nonce", () =>
    publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_READ_ABI,
      functionName: "nonce",
    })
  );

  console.log(`Escrow: ${ESCROW_ADDRESS}`);
  console.log(`Escrow nonce: ${nonce.toString()}`);
  console.log(`Checked at: ${new Date().toISOString()}`);

  for (const id of ids) {
    const payment = await retryRpc(`escrow payment ${id}`, () =>
      publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_READ_ABI,
        functionName: "payments",
        args: [id],
      })
    );

    const [to, amount, releaseTimestamp, refundTo, withdrawnAmount, refunded] = payment;
    const recipientBalance = await retryRpc(`recipient balance ${id}`, () =>
      publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_READ_ABI,
        functionName: "balances",
        args: [to],
      })
    );

    console.log("");
    console.log(`Escrow payment #${id.toString()}`);
    console.log(`  recipient: ${to}`);
    console.log(`  refund to: ${refundTo}`);
    console.log(`  amount: ${formatUsdc(amount)}`);
    console.log(`  withdrawn amount: ${formatUsdc(withdrawnAmount)}`);
    console.log(`  recipient escrow balance: ${formatUsdc(recipientBalance)}`);
    console.log(`  refunded: ${refunded}`);
    console.log(`  release time: ${new Date(Number(releaseTimestamp) * 1000).toISOString()}`);
    console.log(`  status: ${status(amount, withdrawnAmount, refunded)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
