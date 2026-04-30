/**
 * deposit.ts: Deposit USDC into the treasury from the deployer wallet.
 *
 * Flow:
 *   1. approve(treasury, amount) on the USDC contract
 *   2. deposit(amount) on the treasury
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/deposit.ts <amount-in-usdc>
 *   e.g. npx tsx --env-file=.env scripts/deposit.ts 50
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/deposit.ts <amount-in-usdc>");
    process.exit(1);
  }
  const amountUSDC = Number(arg);
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    console.error("Amount must be a positive number");
    process.exit(1);
  }
  const amountRaw = BigInt(Math.round(amountUSDC * 1_000_000)).toString();

  console.log(`Approving treasury ${TREASURY} to spend ${amountUSDC} USDC...`);
  const approveTx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: USDC_ARC_TESTNET,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [TREASURY, amountRaw],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const approveHash = await waitForTx(approveTx.data?.id!, "approve");
  console.log(`Approved: https://testnet.arcscan.app/tx/${approveHash}`);

  console.log(`\nDepositing ${amountUSDC} USDC...`);
  const depositTx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "deposit(uint256)",
    abiParameters: [amountRaw],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const depositHash = await waitForTx(depositTx.data?.id!, "deposit");
  console.log(`Deposited: https://testnet.arcscan.app/tx/${depositHash}`);
}

main().catch(console.error);
