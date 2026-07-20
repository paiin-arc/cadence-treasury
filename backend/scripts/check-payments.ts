import { parseAbiItem } from "viem";
import { publicClient, readContractWithRetry } from "../src/arcClient.js";
import { TREASURY_ABI } from "../src/abi.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;

type PaymentRecord = {
  owner: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  frequency: bigint;
  nextExecTime: bigint;
  active: boolean;
  requiresApproval: boolean;
};

const paymentExecutedEvent = parseAbiItem(
  "event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy)"
);

const paymentCancelledEvent = parseAbiItem(
  "event PaymentCancelled(uint256 indexed paymentId)"
);

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

function formatTime(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString();
}

async function logsForPayment(paymentId: bigint) {
  const latestBlock = await retryRpc("getBlockNumber", () => publicClient.getBlockNumber());
  const fromBlock = latestBlock > 9000n ? latestBlock - 9000n : 0n;

  const executed = await retryRpc(`executed logs for ${paymentId}`, () =>
    publicClient.getLogs({
      address: TREASURY_ADDRESS,
      event: paymentExecutedEvent,
      args: { paymentId },
      fromBlock,
      toBlock: "latest",
    })
  );
  await sleep(1_000);
  const cancelled = await retryRpc(`cancelled logs for ${paymentId}`, () =>
    publicClient.getLogs({
      address: TREASURY_ADDRESS,
      event: paymentCancelledEvent,
      args: { paymentId },
      fromBlock,
      toBlock: "latest",
    })
  );

  return { executed, cancelled };
}

async function main() {
  const ids = process.argv.slice(2).map((value) => BigInt(value));
  if (ids.length === 0) {
    throw new Error("Usage: npx tsx --env-file=.env scripts/check-payments.ts 2 5 14");
  }

  console.log(`Treasury: ${TREASURY_ADDRESS}`);
  console.log(`Checked at: ${new Date().toISOString()}`);

  for (const id of ids) {
    const payment = await readContractWithRetry<PaymentRecord>({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "getPayment",
      args: [id],
    });

    const [isDue, ownerBalance, logs] = await Promise.all([
      readContractWithRetry<boolean>({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "isDue",
        args: [id],
      }),
      readContractWithRetry<bigint>({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "userBalances",
        args: [payment.owner],
      }),
      logsForPayment(id),
    ]);

    console.log("");
    console.log(`Payment #${id.toString()}`);
    console.log(`  owner: ${payment.owner}`);
    console.log(`  recipient: ${payment.recipient}`);
    console.log(`  amount: ${formatUsdc(payment.amount)}`);
    console.log(`  owner treasury balance: ${formatUsdc(ownerBalance)}`);
    console.log(`  active: ${payment.active}`);
    console.log(`  due: ${isDue}`);
    console.log(`  requires approval: ${payment.requiresApproval}`);
    console.log(`  frequency: ${payment.frequency.toString()}s`);
    console.log(`  next execution: ${formatTime(payment.nextExecTime)}`);
    console.log(`  executed logs in last 9000 blocks: ${logs.executed.length}`);
    console.log(`  cancelled logs in last 9000 blocks: ${logs.cancelled.length}`);

    if (!payment.active) {
      console.log("  status: closed on-chain");
    } else if (payment.requiresApproval) {
      console.log("  status: waiting for human approval; scheduler intentionally skips it");
    } else if (ownerBalance < payment.amount) {
      console.log("  status: stuck because owner treasury balance is too low");
    } else if (isDue) {
      console.log("  status: due and executable by the scheduler/admin");
    } else {
      console.log("  status: scheduled for the future");
    }

    await sleep(1_000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
