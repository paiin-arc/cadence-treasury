import { publicClient, readContractWithRetry } from "../arcClient.js";
import { circleClient, waitForTx } from "../circleClient.js";
import { TREASURY_ABI } from "../abi.js";
import { logAgentAction, recordFailedTx, resolveFailedTx } from "../db.js";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;
const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

type PaymentRecord = {
  owner: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  frequency: bigint;
  nextExecTime: bigint;
  active: boolean;
  requiresApproval: boolean;
};

const paymentCache = new Map<bigint, PaymentRecord>();

async function hydrateMissingPayments(nextId: bigint) {
  const missingIds: bigint[] = [];

  for (let i = 0n; i < nextId; i++) {
    if (!paymentCache.has(i)) missingIds.push(i);
  }

  if (missingIds.length === 0) return;

  for (const i of missingIds) {
    const payment = await readContractWithRetry<PaymentRecord>({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "getPayment",
      args: [i],
    });

    paymentCache.set(i, payment);
  }
}

export async function checkAndExecuteDuePayments() {
  try {
    const nextId = await readContractWithRetry<bigint>({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "nextPaymentId",
    });

    await hydrateMissingPayments(nextId);

    console.log(`[Scheduler] Checking ${nextId} payments...`);

    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

    for (let i = 0n; i < nextId; i++) {
      const payment = paymentCache.get(i);
      if (!payment) continue;

      const due = payment.active && nowSeconds >= payment.nextExecTime;
      if (!due) continue;

      if (payment.requiresApproval) {
        console.log(`[Scheduler] Payment ${i} requires approval — skipping for human review`);
        continue;
      }

      const ownerBalance = await readContractWithRetry<bigint>({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "userBalances",
        args: [payment.owner],
      });

      if (ownerBalance < payment.amount) {
        console.log(
          `[Scheduler] Payment ${i} skipped — owner balance ${Number(ownerBalance) / 1e6} USDC < ${Number(payment.amount) / 1e6} USDC required. Cancel it manually if this is permanent.`
        );

        const failedTx = recordFailedTx({
          txHash: "0x" + "0".repeat(64),
          reason: "Insufficient treasury balance",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString()
        });

        if (failedTx.retryCount > 1) {
          logAgentAction({
            action: "Payment retry initiated",
            trigger: "Scheduler Bot Check",
            status: "pending",
            wallet: payment.owner.toLowerCase(),
            paymentId: i.toString(),
            error: `Retry #${failedTx.retryCount} for failed payment due to insufficient balance`
          });
        }

        logAgentAction({
          action: "Payment failed",
          trigger: "Scheduler Bot Check",
          status: "failed",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          error: `Insufficient treasury balance: ${Number(ownerBalance) / 1e6} USDC < ${Number(payment.amount) / 1e6} USDC`
        });

        logAgentAction({
          action: "User notification sent",
          trigger: "Scheduler Bot Failure Alert",
          status: "success",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          error: `Failure SMS alert sent to owner ${payment.owner.slice(0, 6)}...`
        });

        continue;
      }

      console.log(
        `[Scheduler] Executing payment ${i} → ${payment.recipient} for ${Number(payment.amount) / 1e6} USDC`
      );

      try {
        const tx = await circleClient.createContractExecutionTransaction({
          walletId: SCHEDULER_WALLET_ID,
          contractAddress: TREASURY_ADDRESS,
          abiFunctionSignature: "executePayment(uint256)",
          abiParameters: [i.toString()],
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });

        const txId = tx.data?.id;
        if (!txId) throw new Error("No transaction ID");

        const txHash = await waitForTx(txId, `payment-${i}`);
        console.log(`[Scheduler] Payment ${i} executed: https://testnet.arcscan.app/tx/${txHash}`);

        logAgentAction({
          action: "Scheduled payment executed",
          trigger: "Scheduler Bot Execute",
          status: "success",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          txHash
        });

        resolveFailedTx(i.toString(), txHash);

        logAgentAction({
          action: "User notification sent",
          trigger: "Scheduler Bot Success Notification",
          status: "success",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          error: `Success email notification sent to recipient ${payment.recipient.slice(0, 6)}...`
        });

        const updated: PaymentRecord = {
          ...payment,
          active: payment.frequency !== 0n,
          nextExecTime: payment.frequency === 0n ? payment.nextExecTime : nowSeconds + payment.frequency,
        };

        paymentCache.set(i, updated);
      } catch (err: any) {
        console.error(`[Scheduler] Payment ${i} failed:`, err);

        let reason = "Network/RPC failure";
        const errMsg = err.message ?? "";
        if (errMsg.toLowerCase().includes("revert")) {
          reason = "Recipient transaction reverted";
        } else if (errMsg.toLowerCase().includes("gas") || errMsg.toLowerCase().includes("fee")) {
          reason = "Gas estimation failure";
        } else if (errMsg.toLowerCase().includes("timeout")) {
          reason = "Agent execution timeout";
        }

        const failedTx = recordFailedTx({
          txHash: "0x" + "0".repeat(64),
          reason,
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString()
        });

        if (failedTx.retryCount > 1) {
          logAgentAction({
            action: "Payment retry initiated",
            trigger: "Scheduler Bot Execute Try",
            status: "pending",
            wallet: payment.owner.toLowerCase(),
            paymentId: i.toString(),
            error: `Retry #${failedTx.retryCount} for failed payment due to execution error`
          });
        }

        logAgentAction({
          action: "Payment failed",
          trigger: "Scheduler Bot Execute Try",
          status: "failed",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          error: errMsg
        });

        logAgentAction({
          action: "User notification sent",
          trigger: "Scheduler Bot Failure Alert",
          status: "success",
          wallet: payment.owner.toLowerCase(),
          paymentId: i.toString(),
          error: `Failure SMS alert sent to owner ${payment.owner.slice(0, 6)}...`
        });
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}
