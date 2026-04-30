/**
 * once.ts: One-shot scheduler tick. Runs checkAndExecuteDuePayments() once and exits.
 * Designed for Render Cron Jobs (and any other "scheduled one-shot" platform).
 */

import { checkAndExecuteDuePayments } from "./checkPayments.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS;

async function main() {
  console.log(`[Scheduler-once] Tick at ${new Date().toISOString()}`);
  console.log(`[Scheduler-once] Contract: ${TREASURY_ADDRESS}`);
  await checkAndExecuteDuePayments();
  console.log("[Scheduler-once] Done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Scheduler-once] Fatal:", err);
    process.exit(1);
  });
