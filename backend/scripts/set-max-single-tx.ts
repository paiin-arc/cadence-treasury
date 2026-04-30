/**
 * set-max-single-tx.ts: Admin call to set the contract's maxSingleTx.
 * (Payments at or above maxSingleTx/2 get the requiresApproval flag.)
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/set-max-single-tx.ts <amount-in-usdc>
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const arg = process.argv[2];
  const amountUSDC = arg !== undefined ? Number(arg) : NaN;
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    console.error("Usage: tsx scripts/set-max-single-tx.ts <amount-in-usdc>");
    process.exit(1);
  }
  const amountRaw = BigInt(Math.round(amountUSDC * 1_000_000)).toString();

  console.log(`Setting maxSingleTx to ${amountUSDC} USDC (approval threshold = ${amountUSDC / 2} USDC)...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setMaxSingleTx(uint256)",
    abiParameters: [amountRaw],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(tx.data?.id!, "set-max-single-tx");
  console.log(`Set: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
