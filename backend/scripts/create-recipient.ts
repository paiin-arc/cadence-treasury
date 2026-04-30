/**
 * create-recipient.ts: Create a second Circle wallet to use as a payment recipient.
 *
 * Adds the wallet to the existing CIRCLE_WALLET_SET_ID and writes
 * RECIPIENT_WALLET_ID + RECIPIENT_WALLET_ADDRESS to backend/.env.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/create-recipient.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { circleClient } from "../src/circleClient.js";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");

function upsertEnv(key: string, value: string) {
  const line = `${key}=${value}`;
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  content = re.test(content)
    ? content.replace(re, line)
    : (content.endsWith("\n") || content.length === 0 ? content : content + "\n") + line + "\n";
  fs.writeFileSync(ENV_PATH, content, "utf-8");
}

async function main() {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) {
    throw new Error("CIRCLE_WALLET_SET_ID is required in backend/.env");
  }

  console.log("Creating recipient wallet on ARC-TESTNET...");
  const recipient = (
    await circleClient.createWallets({
      walletSetId,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
    })
  ).data?.wallets?.[0];

  if (!recipient) throw new Error("Recipient wallet creation failed");

  console.log("Recipient wallet ID:", recipient.id);
  console.log("Recipient address:  ", recipient.address);
  upsertEnv("RECIPIENT_WALLET_ID", recipient.id);
  upsertEnv("RECIPIENT_WALLET_ADDRESS", recipient.address);
  console.log("\nWritten to backend/.env: RECIPIENT_WALLET_ID, RECIPIENT_WALLET_ADDRESS");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
