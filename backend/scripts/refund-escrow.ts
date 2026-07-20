/**
 * refund-escrow.ts: Arbiter-only refund of a held escrow payment.
 *
 * Calls RefundProtocol.refundByArbiter(paymentID) via the Circle dev-controlled wallet.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/refund-escrow.ts <paymentId>
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const ESCROW = process.env.ESCROW_CONTRACT_ADDRESS;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID;

  if (!ESCROW || !/^0x[0-9a-fA-F]{40}$/.test(ESCROW)) {
    console.error("ESCROW_CONTRACT_ADDRESS is missing or invalid in backend/.env");
    process.exit(1);
  }
  if (!WALLET_ID) {
    console.error("DEPLOYER_WALLET_ID is missing in backend/.env");
    process.exit(1);
  }

  const idArg = process.argv[2];
  if (!idArg || !/^\d+$/.test(idArg)) {
    console.error("Usage: tsx scripts/refund-escrow.ts <paymentId>");
    process.exit(1);
  }

  console.log(`Refunding escrow payment ${idArg} on ${ESCROW}...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: ESCROW,
    abiFunctionSignature: "refundByArbiter(uint256)",
    abiParameters: [idArg],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id ?? "", `refund-escrow-${idArg}`);
  console.log(`Refunded: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
