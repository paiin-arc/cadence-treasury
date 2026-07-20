import { ethers } from "hardhat";

/**
 * Deploys RefundProtocol (Cadence Escrow) to Arc Testnet.
 *
 * The deployer wallet becomes the arbiter — the address that can refund
 * disputed payments and sign early-release approvals.
 *
 * Set ARBITER_ADDRESS in contracts/.env if you want a different arbiter
 * (e.g. your Circle dev-controlled wallet that already runs the scheduler).
 *
 * Run:
 *   npx hardhat run scripts/deploy-escrow.ts --network arcTestnet
 */
async function main() {
  const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000";
  const EIP712_NAME = "CadenceEscrow";
  const EIP712_VERSION = "1";

  const [signer] = await ethers.getSigners();
  const arbiter = process.env.ARBITER_ADDRESS ?? signer.address;

  console.log("Deployer:", signer.address);
  console.log("Arbiter: ", arbiter);
  console.log("USDC:    ", USDC_ARC_TESTNET);

  const RefundProtocol = await ethers.getContractFactory("RefundProtocol");
  const escrow = await RefundProtocol.deploy(
    arbiter,
    USDC_ARC_TESTNET,
    EIP712_NAME,
    EIP712_VERSION
  );
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("\nRefundProtocol deployed at:", address);
  console.log("\nAdd to backend/.env:");
  console.log(`ESCROW_CONTRACT_ADDRESS=${address}`);
  console.log("\nAdd to frontend/.env:");
  console.log(`VITE_ESCROW_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
