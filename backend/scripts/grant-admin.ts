/**
 * grant-admin.ts: Grant DEFAULT_ADMIN_ROLE to another address.
 * Lets you manage the contract from a browser wallet (Rabby/MetaMask).
 *
 * Run from backend/:
 *   npx tsx --env-file=.env scripts/grant-admin.ts <target-address>
 */

import { keccak256, toBytes, type Address } from "viem";
import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

void keccak256; void toBytes; // imports kept in case of future role expansion

const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const target = process.argv[2];
  if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
    console.error("Usage: tsx scripts/grant-admin.ts <target-address>");
    process.exit(1);
  }

  console.log(`Granting DEFAULT_ADMIN_ROLE to ${target} on ${TREASURY}...`);
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "grantRole(bytes32,address)",
    abiParameters: [DEFAULT_ADMIN_ROLE, target as Address],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(tx.data?.id!, "grant-admin");
  console.log(`Granted: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
