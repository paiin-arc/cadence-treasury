/**
 * create-wallet.ts: Create the developer-controlled scheduler wallet on Arc Testnet.
 *
 * 1. Register entity secret (writes CIRCLE_ENTITY_SECRET to backend/.env)
 * 2. Create wallet set
 * 3. Create deployer/scheduler wallet (writes DEPLOYER_WALLET_ID + DEPLOYER_WALLET_ADDRESS)
 * 4. Pause for faucet funding
 * 5. Print wallet balances
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/create-wallet.ts
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");
const OUTPUT_DIR = path.join(__dirname, "output");
const WALLET_SET_NAME = "Treasury Wallets";

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
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is required in backend/.env");
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (entitySecret && /^[0-9a-fA-F]{64}$/.test(entitySecret)) {
    console.log("Using existing CIRCLE_ENTITY_SECRET from .env (skipping registration).");
  } else {
    console.log("Registering new entity secret...");
    entitySecret = crypto.randomBytes(32).toString("hex");
    await registerEntitySecretCiphertext({
      apiKey,
      entitySecret,
      recoveryFileDownloadPath: OUTPUT_DIR,
    });
    upsertEnv("CIRCLE_ENTITY_SECRET", entitySecret);
    console.log("Entity secret registered. Recovery file in:", OUTPUT_DIR);
  }

  console.log("\nCreating wallet set...");
  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const walletSet = (await client.createWalletSet({ name: WALLET_SET_NAME })).data?.walletSet;
  if (!walletSet?.id) throw new Error("Wallet set creation failed");
  console.log("Wallet set ID:", walletSet.id);

  console.log("\nCreating deployer/scheduler wallet on ARC-TESTNET...");
  const deployer = (
    await client.createWallets({
      walletSetId: walletSet.id,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
    })
  ).data?.wallets?.[0];
  if (!deployer) throw new Error("Deployer wallet creation failed");
  console.log("Deployer wallet ID:", deployer.id);
  console.log("Deployer address:", deployer.address);
  upsertEnv("DEPLOYER_WALLET_ID", deployer.id);
  upsertEnv("DEPLOYER_WALLET_ADDRESS", deployer.address);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "deployer-wallet.json"),
    JSON.stringify(deployer, null, 2),
    "utf-8"
  );

  console.log("\nFund the deployer wallet before continuing:");
  console.log("  1. https://faucet.circle.com");
  console.log('  2. Select "Arc Testnet"');
  console.log(`  3. Address: ${deployer.address}`);
  console.log("  4. Request both native (gas) and USDC");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) =>
    rl.question("\nPress Enter once funded... ", () => {
      rl.close();
      resolve();
    })
  );

  console.log("\nDeployer balances:");
  const balances = (await client.getWalletTokenBalance({ id: deployer.id })).data?.tokenBalances;
  for (const b of balances ?? []) {
    console.log(`  ${b.token?.symbol ?? "Unknown"}: ${b.amount}`);
  }
  console.log("\nDone. backend/.env is updated with the deployer wallet variables.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
