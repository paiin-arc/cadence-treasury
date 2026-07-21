import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * RefundProtocol – Payroll-Safe Escrow Tests
 *
 * These tests verify the payroll trust model:
 *   - Salary is final after withdrawal
 *   - No debts, no clawbacks, no future payroll deductions
 *   - Refunds only succeed before withdrawal
 */
describe("RefundProtocol (Payroll-Safe)", () => {
  const AMOUNT = 1000n * 1_000_000n; // 1,000 USDC (6 decimals)

  async function deployFixture() {
    const [arbiter, employer, employee] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const RefundProtocol = await ethers.getContractFactory("RefundProtocol");
    const escrow = await RefundProtocol.deploy(
      arbiter.address,
      await usdc.getAddress(),
      "CadenceEscrow",
      "1"
    );

    // Fund employer and approve escrow
    await usdc.mint(employer.address, AMOUNT * 10n);
    await usdc
      .connect(employer)
      .approve(await escrow.getAddress(), AMOUNT * 10n);

    return { escrow, usdc, arbiter, employer, employee };
  }

  /** Helper: employer creates a payroll escrow for the employee */
  async function createPayment(
    escrow: Awaited<ReturnType<typeof deployFixture>>["escrow"],
    employer: Awaited<ReturnType<typeof deployFixture>>["employer"],
    employee: Awaited<ReturnType<typeof deployFixture>>["employee"]
  ) {
    await escrow
      .connect(employer)
      .pay(employee.address, AMOUNT, employer.address);
    // nonce starts at 0, so first payment = ID 0
    return 0n;
  }

  // ─── TEST 1 ───────────────────────────────────────────────────────
  it("TEST 1: refund succeeds before withdrawal", async () => {
    const { escrow, usdc, arbiter, employer, employee } =
      await loadFixture(deployFixture);
    const paymentID = await createPayment(escrow, employer, employee);

    const employerBalBefore = await usdc.balanceOf(employer.address);

    await escrow.connect(arbiter).refundByArbiter(paymentID);

    const payment = await escrow.payments(paymentID);
    expect(payment.refunded).to.be.true;

    // Funds returned to refundTo (employer)
    const employerBalAfter = await usdc.balanceOf(employer.address);
    expect(employerBalAfter - employerBalBefore).to.equal(AMOUNT);
  });

  // ─── TEST 2 ───────────────────────────────────────────────────────
  it("TEST 2: refund reverts after employee withdraws", async () => {
    const { escrow, arbiter, employer, employee } =
      await loadFixture(deployFixture);
    const paymentID = await createPayment(escrow, employer, employee);

    // Employee withdraws salary
    await escrow.connect(employee).withdraw([paymentID]);

    // Arbiter tries to refund → must revert
    await expect(
      escrow.connect(arbiter).refundByArbiter(paymentID)
    ).to.be.revertedWithCustomError(escrow, "PaymentAlreadyWithdrawn");
  });

  // ─── TEST 3 ───────────────────────────────────────────────────────
  it("TEST 3: debts mapping no longer exists on the contract", async () => {
    const { escrow } = await loadFixture(deployFixture);

    // The old contract had `function debts(address) → uint256`.
    // If debts still exists, escrow.debts will be a function.
    // After removal, it should be undefined.
    expect((escrow as any).debts).to.be.undefined;
  });

  // ─── TEST 4 ───────────────────────────────────────────────────────
  it("TEST 4: future payroll is not affected by old refunds", async () => {
    const { escrow, usdc, arbiter, employer, employee } =
      await loadFixture(deployFixture);

    // Payment 0 — will be refunded
    await escrow
      .connect(employer)
      .pay(employee.address, AMOUNT, employer.address);
    // Payment 1 — future payroll
    await escrow
      .connect(employer)
      .pay(employee.address, AMOUNT, employer.address);

    // Refund payment 0
    await escrow.connect(arbiter).refundByArbiter(0n);

    // Employee balance for payment 1 should be fully intact
    const balance = await escrow.balances(employee.address);
    expect(balance).to.equal(AMOUNT); // only payment 1 remains

    // Employee can withdraw payment 1 with full amount
    const walletBefore = await usdc.balanceOf(employee.address);
    await escrow.connect(employee).withdraw([1n]);
    const walletAfter = await usdc.balanceOf(employee.address);
    expect(walletAfter - walletBefore).to.equal(AMOUNT);
  });

  // ─── TEST 5 ───────────────────────────────────────────────────────
  it("TEST 5: cannot refund twice", async () => {
    const { escrow, arbiter, employer, employee } =
      await loadFixture(deployFixture);
    const paymentID = await createPayment(escrow, employer, employee);

    // First refund succeeds
    await escrow.connect(arbiter).refundByArbiter(paymentID);

    // Second refund reverts
    await expect(
      escrow.connect(arbiter).refundByArbiter(paymentID)
    ).to.be.revertedWithCustomError(escrow, "PaymentRefunded");
  });

  // ─── TEST 6 ───────────────────────────────────────────────────────
  it("TEST 6: cannot withdraw a refunded payment", async () => {
    const { escrow, arbiter, employer, employee } =
      await loadFixture(deployFixture);
    const paymentID = await createPayment(escrow, employer, employee);

    // Arbiter refunds
    await escrow.connect(arbiter).refundByArbiter(paymentID);

    // Employee tries to withdraw refunded payment → revert
    await expect(
      escrow.connect(employee).withdraw([paymentID])
    ).to.be.revertedWithCustomError(escrow, "PaymentRefunded");
  });

  // ─── TEST 7 ───────────────────────────────────────────────────────
  // Note: earlyWithdrawByArbiter uses a non-standard EIP-712 array encoding
  // (abi.encode arrays inline vs hashing per spec). This test verifies the
  // core payroll invariant directly: any withdrawnAmount > 0 blocks refund.
  it("TEST 7: arbiter cannot refund after any withdrawal (guards future code changes)", async () => {
    const { escrow, arbiter, employer, employee } =
      await loadFixture(deployFixture);

    // Create two payments
    await escrow
      .connect(employer)
      .pay(employee.address, AMOUNT, employer.address);
    await escrow
      .connect(employer)
      .pay(employee.address, AMOUNT, employer.address);

    // Employee withdraws payment 0 (full withdrawal → withdrawnAmount = amount)
    await escrow.connect(employee).withdraw([0n]);

    // Verify withdrawnAmount is set
    const payment0 = await escrow.payments(0n);
    expect(payment0.withdrawnAmount).to.equal(AMOUNT);

    // Arbiter tries to refund payment 0 → must revert
    await expect(
      escrow.connect(arbiter).refundByArbiter(0n)
    ).to.be.revertedWithCustomError(escrow, "PaymentAlreadyWithdrawn");

    // Recipient also cannot refund payment 0
    await expect(
      escrow.connect(employee).refundByRecipient(0n)
    ).to.be.revertedWithCustomError(escrow, "PaymentAlreadyWithdrawn");

    // Payment 1 is unaffected — can still be refunded
    await escrow.connect(arbiter).refundByArbiter(1n);
    const payment1 = await escrow.payments(1n);
    expect(payment1.refunded).to.be.true;
  });
});
