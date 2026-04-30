/**
 * set-paused.ts: Pause or unpause the treasury (emergency kill switch).
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/set-paused.ts true   # pause
 *   npx tsx --env-file=.env scripts/set-paused.ts false  # unpause
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const arg = process.argv[2];
  if (arg !== "true" && arg !== "false") {
    console.error("Usage: tsx scripts/set-paused.ts <true|false>");
    process.exit(1);
  }

  console.log(`Setting paused = ${arg}...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setPaused(bool)",
    abiParameters: [arg],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(tx.data?.id!, "set-paused");
  console.log(`Set: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
