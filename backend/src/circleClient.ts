import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

export async function waitForTx(txId: string, label = "tx"): Promise<string> {
  const terminalStates = new Set(["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"]);
  process.stdout.write(`  Waiting for ${label}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await circleClient.getTransaction({ id: txId });
    const state = data?.transaction?.state;
    process.stdout.write(".");

    if (state && terminalStates.has(state)) {
      console.log(` → ${state}`);
      if (state === "FAILED" || state === "DENIED") throw new Error(`${label} failed: ${state}`);
      return data?.transaction?.txHash ?? "";
    }
  }
  throw new Error(`${label} timed out`);
}
