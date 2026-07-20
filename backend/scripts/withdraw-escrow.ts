/**
 * withdraw-escrow.ts: Recipient-side withdrawal of held escrow payment(s).
 *
 * Uses RECIPIENT_WALLET_ID from .env to call RefundProtocol.withdraw([paymentIDs]).
 * Only succeeds for payments where this wallet is the `to` address.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/withdraw-escrow.ts <paymentId> [<paymentId> ...]
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const ESCROW = process.env.ESCROW_CONTRACT_ADDRESS;
  const WALLET_ID = process.env.RECIPIENT_WALLET_ID;

  if (!ESCROW || !/^0x[0-9a-fA-F]{40}$/.test(ESCROW)) {
    console.error("ESCROW_CONTRACT_ADDRESS missing or invalid in backend/.env");
    process.exit(1);
  }
  if (!WALLET_ID) {
    console.error(
      "RECIPIENT_WALLET_ID missing in backend/.env (run scripts/create-recipient.ts first)"
    );
    process.exit(1);
  }

  const ids = process.argv.slice(2);
  if (ids.length === 0 || !ids.every((s) => /^\d+$/.test(s))) {
    console.error("Usage: tsx scripts/withdraw-escrow.ts <paymentId> [<paymentId> ...]");
    process.exit(1);
  }

  console.log(
    `Withdrawing escrow payment${ids.length === 1 ? "" : "s"} ${ids.join(", ")} via wallet ${WALLET_ID}...`
  );

  // The contract takes a uint256[] — Circle expects the array as a stringified JSON array.
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: ESCROW,
    abiFunctionSignature: "withdraw(uint256[])",
    abiParameters: [ids],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id ?? "", `withdraw-escrow`);
  console.log(`Withdrew: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
