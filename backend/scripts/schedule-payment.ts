import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function main() {
  const recipient = process.env.RECIPIENT_WALLET_ADDRESS;
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    console.error("Set RECIPIENT_WALLET_ADDRESS in backend/.env (or run scripts/create-recipient.ts).");
    process.exit(1);
  }

  const amountUSDC = Number(process.argv[2] ?? 10);
  const frequencySeconds = Number(process.argv[3] ?? 0);
  const delaySeconds = Number(process.argv[4] ?? 30);

  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    console.error("Usage: tsx scripts/schedule-payment.ts [amountUSDC] [frequencySeconds] [delaySeconds]");
    process.exit(1);
  }

  const amountRaw = BigInt(Math.round(amountUSDC * 1_000_000)).toString();
  console.log(
    `Scheduling ${amountUSDC} USDC -> ${recipient}, frequency=${frequencySeconds}s, delay=${delaySeconds}s`
  );

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY as `0x${string}`,
    abiFunctionSignature: "schedulePayment(address,uint256,uint64,uint64)",
    abiParameters: [recipient, amountRaw, frequencySeconds.toString(), delaySeconds.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "schedule payment");
  console.log("Payment scheduled:", `https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
