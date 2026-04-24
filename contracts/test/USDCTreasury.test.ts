import { expect } from "chai";
import { ethers } from "hardhat";

describe("USDCTreasury", () => {
  it("deploys and sets roles correctly", async () => {
    const [admin] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const ADMIN_ROLE = ethers.ZeroHash;
    expect(await treasury.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    expect(await treasury.paused()).to.be.false;
    expect(await treasury.aiCapBps()).to.equal(500n);
  });

  it("deposits and withdraws correctly", async () => {
    const [admin, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const depositAmount = 500n * 1_000_000n;

    await usdc.connect(admin).mint(user.address, depositAmount);
    await usdc.connect(user).approve(await treasury.getAddress(), depositAmount);

    await treasury.connect(user).deposit(depositAmount);
    expect(await treasury.userBalances(user.address)).to.equal(depositAmount);
  });
});
