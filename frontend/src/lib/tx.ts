import { publicClient } from "./arc";

export function isRpcConfirmationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("RPC Request failed") ||
    message.includes("request limit reached") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timed out")
  );
}

export async function waitForConfirmation(
  hash: `0x${string}`,
  label: string,
  timeout = 60_000
) {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout,
      pollingInterval: 1_500,
    });
    if (receipt.status !== "success") {
      throw new Error(`${label} reverted (${hash.slice(0, 10)}…)`);
    }
    return receipt;
  } catch (error) {
    if (isRpcConfirmationError(error)) return null;
    throw error;
  }
}
