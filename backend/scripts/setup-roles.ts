import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function main() {
  const walletSet = await circleClient.createWalletSet({ name: "AI Executor Wallets" });

  const wallets = await circleClient.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
    metadata: [{ refId: "ai-executor-treasury" }],
  });

  const aiWallet = wallets.data?.wallets?.[0];
  console.log("AI Executor wallet created:");
  console.log("   Address:", aiWallet?.address);
  console.log("   Wallet ID:", aiWallet?.id);
  console.log("\nAdd to your .env:");
  console.log(`AI_EXECUTOR_WALLET_ID=${aiWallet?.id}`);
  console.log(`AI_EXECUTOR_WALLET_ADDRESS=${aiWallet?.address}`);
}

main().catch(console.error);
