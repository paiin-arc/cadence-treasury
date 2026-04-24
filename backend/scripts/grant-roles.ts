import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { ethers } from "ethers";
import "dotenv/config";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function waitForTx(txId: string): Promise<string | undefined> {
  const terminal = new Set(["COMPLETE", "CONFIRMED", "FAILED"]);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await circleClient.getTransaction({ id: txId });
    if (data?.transaction?.state && terminal.has(data.transaction.state)) {
      return data.transaction.txHash;
    }
    process.stdout.write(".");
  }
  throw new Error(`Transaction ${txId} timed out`);
}

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const AI_EXECUTOR_ADDRESS = process.env.AI_EXECUTOR_WALLET_ADDRESS!;
  const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const AI_EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AI_EXECUTOR_ROLE"));

  console.log("Granting AI_EXECUTOR_ROLE to:", AI_EXECUTOR_ADDRESS);

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "grantRole(bytes32,address)",
    abiParameters: [AI_EXECUTOR_ROLE, AI_EXECUTOR_ADDRESS],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  process.stdout.write("Waiting");
  const txHash = await waitForTx(tx.data?.id!);
  console.log(`\nAI_EXECUTOR_ROLE granted: https://testnet.arcscan.app/tx/${txHash}`);

  const TEST_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
  const tx2 = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setAllowlist(address,bool)",
    abiParameters: [TEST_RECIPIENT, "true"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  process.stdout.write("Allowlisting");
  const txHash2 = await waitForTx(tx2.data?.id!);
  console.log(`\nRecipient allowlisted: https://testnet.arcscan.app/tx/${txHash2}`);
}

main().catch(console.error);
