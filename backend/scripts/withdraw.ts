/**
 * withdraw.ts: Withdraw USDC from your treasury balance back to your wallet.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/withdraw.ts <amount-in-usdc>
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const arg = process.argv[2];
  const amountUSDC = Number(arg);
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    console.error("Usage: tsx scripts/withdraw.ts <amount-in-usdc>");
    process.exit(1);
  }
  const amountRaw = BigInt(Math.round(amountUSDC * 1_000_000)).toString();

  console.log(`Withdrawing ${amountUSDC} USDC...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "withdraw(uint256)",
    abiParameters: [amountRaw],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(tx.data?.id!, "withdraw");
  console.log(`Withdrew: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
