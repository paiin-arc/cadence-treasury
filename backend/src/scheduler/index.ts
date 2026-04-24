import cron from "node-cron";
import { publicClient } from "../arcClient.js";
import { circleClient, waitForTx } from "../circleClient.js";
import { TREASURY_ABI } from "../abi.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;
const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function checkAndExecuteDuePayments() {
  try {
    const nextId = await publicClient.readContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "nextPaymentId",
    });

    console.log(`[Scheduler] Checking ${nextId} payments...`);

    for (let i = 0n; i < nextId; i++) {
      const due = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "isDue",
        args: [i],
      });

      if (!due) continue;

      const payment = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getPayment",
        args: [i],
      });

      if (payment.requiresApproval) {
        console.log(`[Scheduler] Payment ${i} requires approval — skipping for human review`);
        continue;
      }

      console.log(
        `[Scheduler] Executing payment ${i} → ${payment.recipient} for ${Number(payment.amount) / 1e6} USDC`
      );

      try {
        const tx = await circleClient.createContractExecutionTransaction({
          walletId: SCHEDULER_WALLET_ID,
          contractAddress: TREASURY_ADDRESS,
          abiFunctionSignature: "executePayment(uint256,string)",
          abiParameters: [i.toString(), ""],
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });

        const txId = tx.data?.id;
        if (!txId) throw new Error("No transaction ID");

        const txHash = await waitForTx(txId, `payment-${i}`);
        console.log(`[Scheduler] Payment ${i} executed: https://testnet.arcscan.app/tx/${txHash}`);
      } catch (err) {
        console.error(`[Scheduler] Payment ${i} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}

async function watchContractEvents() {
  console.log("[Watcher] Listening for contract events...");

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "PaymentScheduled",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(
          `[Watcher] New payment scheduled: id=${log.args.paymentId} recipient=${log.args.recipient} amount=${Number(log.args.amount!) / 1e6} USDC`
        );
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "Deposited",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(
          `[Watcher] Deposit: user=${log.args.user} amount=${Number(log.args.amount!) / 1e6} USDC`
        );
      }
    },
  });
}

async function main() {
  console.log("Treasury Scheduler starting...");
  console.log("   Contract:", TREASURY_ADDRESS);

  await watchContractEvents();
  await checkAndExecuteDuePayments();

  cron.schedule("*/5 * * * *", () => {
    console.log(`\n[${new Date().toISOString()}] Cron tick`);
    checkAndExecuteDuePayments();
  });

  console.log("Cron scheduled: every 5 minutes");
}

main().catch(console.error);
