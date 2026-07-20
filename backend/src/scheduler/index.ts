import cron from "node-cron";
import { parseAbiItem } from "viem";
import { publicClient } from "../arcClient.js";
import { TREASURY_ABI } from "../abi.js";
import { checkAndExecuteDuePayments } from "./checkPayments.js";
import { logAgentAction, loadDb } from "../db.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;

const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed user, uint256 amount)"
);

const PAYMENT_CANCELLED_EVENT = parseAbiItem(
  "event PaymentCancelled(uint256 indexed paymentId)"
);

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
        logAgentAction({
          action: "New payment scheduled",
          trigger: "On-chain PaymentScheduled Event",
          status: "success",
          wallet: log.args.owner?.toLowerCase(),
          paymentId: log.args.paymentId?.toString(),
          txHash: log.transactionHash ?? undefined
        });
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "Deposited",
    onLogs: (logs) => {
      for (const log of logs) {
        const user = log.args.user?.toLowerCase();
        console.log(
          `[Watcher] Deposit: user=${user} amount=${Number(log.args.amount!) / 1e6} USDC`
        );

        // Check if this is the first deposit log for this user to trigger "Treasury created"
        const db = loadDb();
        const hasPrior = db.agentLogs.some(
          (l) => l.wallet === user && (l.action === "Treasury created" || l.action === "Deposit detected")
        );

        if (!hasPrior) {
          logAgentAction({
            action: "Treasury created",
            trigger: "First Deposit Detected",
            status: "success",
            wallet: user,
            txHash: log.transactionHash ?? undefined
          });
        }

        logAgentAction({
          action: "Deposit detected",
          trigger: "On-chain Deposited Event",
          status: "success",
          wallet: user,
          error: `${Number(log.args.amount!) / 1e6} USDC deposited`,
          txHash: log.transactionHash ?? undefined
        });
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "Withdrawn",
    onLogs: (logs) => {
      for (const log of logs) {
        const user = log.args.user?.toLowerCase();
        console.log(
          `[Watcher] Withdrawal: user=${user} amount=${Number(log.args.amount!) / 1e6} USDC`
        );
        logAgentAction({
          action: "Payment failed",
          trigger: "On-chain Withdrawn Event",
          status: "success",
          wallet: user,
          error: `${Number(log.args.amount!) / 1e6} USDC withdrawn`,
          txHash: log.transactionHash ?? undefined
        });
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "PaymentCancelled",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(
          `[Watcher] Payment cancelled: id=${log.args.paymentId}`
        );
        logAgentAction({
          action: "Payment failed",
          trigger: "On-chain PaymentCancelled Event",
          status: "success",
          paymentId: log.args.paymentId?.toString(),
          error: "Payment cancelled by owner",
          txHash: log.transactionHash ?? undefined
        });
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
