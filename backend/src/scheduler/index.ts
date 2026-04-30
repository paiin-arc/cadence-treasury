import cron from "node-cron";
import { publicClient } from "../arcClient.js";
import { TREASURY_ABI } from "../abi.js";
import { checkAndExecuteDuePayments } from "./checkPayments.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;

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

  cron.schedule("* * * * *", () => {
    console.log(`\n[${new Date().toISOString()}] Cron tick`);
    checkAndExecuteDuePayments();
  });

  console.log("Cron scheduled: every minute");
}

main().catch(console.error);
