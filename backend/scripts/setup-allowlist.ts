/**
 * setup-allowlist.ts: Allowlist a recipient on the deployed treasury contract.
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/setup-allowlist.ts <recipient-address>
 */

import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const recipient = process.argv[2];
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    console.error("Usage: tsx scripts/setup-allowlist.ts <recipient-address>");
    process.exit(1);
  }

  console.log(`Allowlisting ${recipient} on treasury ${TREASURY}...`);

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setAllowlist(address,bool)",
    abiParameters: [recipient, "true"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "allowlist");
  console.log(`Allowlisted: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
