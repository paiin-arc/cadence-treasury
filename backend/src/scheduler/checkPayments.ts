import { publicClient } from "../arcClient.js";
import { circleClient, waitForTx } from "../circleClient.js";
import { TREASURY_ABI } from "../abi.js";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;
const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

export async function checkAndExecuteDuePayments() {
  try {
    const nextId = await publicClient.readContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "nextPaymentId",
    });

    console.log(`[Scheduler] Checking ${nextId} payments...`);

    for (let i = 0n; i < nextId; i++) {
      const due = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "isDue",
        args: [i],
      });

      if (!due) continue;

      const payment = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getPayment",
        args: [i],
      });

      if (payment.requiresApproval) {
        console.log(`[Scheduler] Payment ${i} requires approval — skipping for human review`);
        continue;
      }

      const ownerBalance = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "userBalances",
        args: [payment.owner],
      });

      if (ownerBalance < payment.amount) {
        console.log(
          `[Scheduler] Payment ${i} skipped — owner balance ${Number(ownerBalance) / 1e6} USDC < ${Number(payment.amount) / 1e6} USDC required. Cancel it manually if this is permanent.`
        );
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
      } catch (err) {
        console.error(`[Scheduler] Payment ${i} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}
