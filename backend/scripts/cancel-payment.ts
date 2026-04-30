/**
 * cancel-payment.ts: Cancel an active scheduled payment.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/cancel-payment.ts <paymentId>
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const idArg = process.argv[2];
  if (idArg === undefined || !/^\d+$/.test(idArg)) {
    console.error("Usage: tsx scripts/cancel-payment.ts <paymentId>");
    process.exit(1);
  }

  console.log(`Cancelling payment ${idArg} on ${TREASURY}...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "cancelPayment(uint256)",
    abiParameters: [idArg],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(tx.data?.id!, "cancel-payment");
  console.log(`Cancelled: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
