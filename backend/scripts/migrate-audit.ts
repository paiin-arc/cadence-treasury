/**
 * migrate-audit.ts: Scan ALL payments on the old escrow and flag held funds.
 *
 * Run from backend/:
 *   ESCROW_CONTRACT_ADDRESS=0xOLD npx tsx --env-file=.env scripts/migrate-audit.ts
 *
 * Or just run it (uses current ESCROW_CONTRACT_ADDRESS from .env):
 *   npx tsx --env-file=.env scripts/migrate-audit.ts
 */

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

const ABI = [
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
    name: "nonce",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network", {
    retryCount: 3,
    retryDelay: 1_500,
    timeout: 15_000,
  }),
});

function formatUsdc(raw: bigint) {
  return `${(Number(raw) / 1e6).toFixed(2)} USDC`;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === 4 || !String(e?.message ?? "").includes("request limit")) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error(`${label}: unreachable`);
}

async function main() {
  if (!ESCROW_ADDRESS) {
    console.error("Set ESCROW_CONTRACT_ADDRESS in .env or pass via env");
    process.exit(1);
  }

  console.log(`\n🔍  Migration audit for: ${ESCROW_ADDRESS}\n`);

  const nonce = await retry(
    () => client.readContract({ address: ESCROW_ADDRESS, abi: ABI, functionName: "nonce" }),
    "nonce"
  );

  const total = Number(nonce);
  console.log(`Total payments created: ${total}\n`);

  if (total === 0) {
    console.log("✅  No payments on this contract. Safe to switch.\n");
    return;
  }

  let held = 0;
  let withdrawn = 0;
  let refunded = 0;
  let heldTotal = 0n;

  for (let i = 0; i < total; i++) {
    await sleep(500); // rate limit spacing
    const p = await retry(
      () => client.readContract({
        address: ESCROW_ADDRESS,
        abi: ABI,
        functionName: "payments",
        args: [BigInt(i)],
      }),
      `payment ${i}`
    );

    const [to, amount, , refundTo, withdrawnAmount, isRefunded] = p;

    if (isRefunded) {
      refunded++;
    } else if (amount > 0n && withdrawnAmount >= amount) {
      withdrawn++;
    } else {
      // HELD — needs resolution
      held++;
      heldTotal += amount - withdrawnAmount;
      console.log(
        `⚠️  Payment #${i}  |  ${formatUsdc(amount)}  |  to: ${shortAddr(to)}  |  refundTo: ${shortAddr(refundTo)}`
      );
      console.log(
        `    Status: HELD (${formatUsdc(amount - withdrawnAmount)} still locked)\n`
      );
    }
  }

  console.log("─".repeat(60));
  console.log(`  Held:      ${held}  (${formatUsdc(heldTotal)} locked)`);
  console.log(`  Withdrawn: ${withdrawn}`);
  console.log(`  Refunded:  ${refunded}`);
  console.log(`  Total:     ${total}`);
  console.log("─".repeat(60));

  if (held === 0) {
    console.log("\n✅  All payments resolved. Safe to switch to new contract.\n");
  } else {
    console.log(`\n⚠️  ${held} payment(s) still held. Resolve before switching:\n`);
    console.log("  Option A — Recipient withdraws:");
    console.log("    Employee calls withdraw([paymentId]) on the OLD contract\n");
    console.log("  Option B — Arbiter refunds:");
    console.log("    npx tsx --env-file=.env scripts/refund-escrow.ts <paymentId>\n");
    console.log("  After all held payments are resolved, update .env to the new address.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
