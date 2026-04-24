import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function main() {
  const recipient = "0xYOUR_ALLOWLISTED_RECIPIENT_ADDRESS";
  const amountUSDC = 10;
  const amountRaw = (amountUSDC * 1_000_000).toString();
  const frequency = "0";
  const delaySeconds = "30";

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY as `0x${string}`,
    abiFunctionSignature: "schedulePayment(address,uint256,uint64,uint64)",
    abiParameters: [recipient, amountRaw, frequency, delaySeconds],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "schedule payment");
  console.log("Payment scheduled:", `https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
