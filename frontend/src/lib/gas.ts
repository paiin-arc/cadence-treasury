/**
 * Gas overrides for Arc Testnet transactions.
 *
 * Arc has dynamic EIP-1559 fees and the default Rabby/MetaMask estimation
 * occasionally underbids the current base fee — transactions then sit stuck
 * in mempool indefinitely (we hit this multiple times during development).
 *
 * `safeFees()` returns conservative static EIP-1559 caps by default.
 * Arc's public RPC can rate-limit fee methods like `eth_gasPrice`; avoiding
 * the preflight fee read keeps successful wallet transactions from surfacing
 * as false RPC failures.
 */

import { publicClient } from "./arc";

// Floors that make Arc validators actually want to include our tx.
// Arc's suggested priorityFee is often 0.001 Gwei which is basically zero —
// validators will skip it. We force a minimum 1 Gwei tip.
const MIN_PRIORITY = 1_000_000_000n; //   1 Gwei
const MIN_MAX_FEE = 80_000_000_000n; //  80 Gwei
const FALLBACK_MAX_FEE = 150_000_000_000n; // 150 Gwei
const FALLBACK_PRIORITY = 2_000_000_000n; //   2 Gwei

export type Fees = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

function max(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export async function safeFees(): Promise<Fees> {
  if (import.meta.env.VITE_DYNAMIC_GAS !== "true") {
    return {
      maxFeePerGas: FALLBACK_MAX_FEE,
      maxPriorityFeePerGas: FALLBACK_PRIORITY,
    };
  }

  try {
    const f = await publicClient.estimateFeesPerGas();
    const priority = max(f.maxPriorityFeePerGas * 2n, MIN_PRIORITY);
    // maxFeePerGas must always >= priority. Floor at MIN_MAX_FEE, and at
    // (network maxFee * 2) — whichever is higher — so we cover spikes.
    const maxFee = max(max(f.maxFeePerGas * 2n, MIN_MAX_FEE), priority + 1_000_000_000n);
    return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
  } catch {
    return {
      maxFeePerGas: FALLBACK_MAX_FEE,
      maxPriorityFeePerGas: FALLBACK_PRIORITY,
    };
  }
}
