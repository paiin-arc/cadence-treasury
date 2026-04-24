import { ethers } from "hardhat";

async function main() {
  const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000";

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 18),
    "USDC"
  );

  const Treasury = await ethers.getContractFactory("USDCTreasury");
  const treasury = await Treasury.deploy(USDC_ARC_TESTNET, deployer.address);
  await treasury.waitForDeployment();

  const address = await treasury.getAddress();
  console.log("USDCTreasury deployed at:", address);
  console.log("Add this to your .env: TREASURY_CONTRACT_ADDRESS=" + address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
