import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { publicClient, ESCROW_ADDRESS } from "../lib/arc";
import { ESCROW_ABI } from "../lib/escrowAbi";

const PAYMENT_CREATED = parseAbiItem(
  "event PaymentCreated(uint256 indexed paymentID, address indexed to, uint256 amount, uint256 releaseTimestamp, address indexed refundTo)"
);

const CHUNK_SIZE = 9000n;
const MAX_CHUNKS = 12;
const CONCURRENCY = 3;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function paginatedLogs(event: unknown, address: `0x${string}`) {
  const latest = await publicClient.getBlockNumber();
  const ranges: { from: bigint; to: bigint }[] = [];
  let to = latest;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const from = to > CHUNK_SIZE ? to - CHUNK_SIZE : 0n;
    ranges.push({ from, to });
    if (from === 0n) break;
    to = from - 1n;
  }
  const tasks = ranges.map(({ from, to }) => async () => {
    try {
      return await publicClient.getLogs({
        address,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: event as any,
        fromBlock: from,
        toBlock: to,
      });
    } catch {
      return [];
    }
  });
  const results = await runWithConcurrency(tasks, CONCURRENCY);
  return results.flat();
}

export type EscrowPayment = {
  id: bigint;
  to: string;
  amount: bigint;
  refundTo: string;
  withdrawnAmount: bigint;
  refunded: boolean;
  payer?: string;
  blockNumber?: bigint;
  txHash?: string;
  /** "held" | "withdrawn" | "refunded" */
  status: "held" | "withdrawn" | "refunded";
};

export function useEscrowPayments() {
  return useQuery<EscrowPayment[]>({
    queryKey: ["escrow:payments", ESCROW_ADDRESS],
    enabled: !!ESCROW_ADDRESS,
    queryFn: async () => {
      if (!ESCROW_ADDRESS) return [];

      // 1. Fetch all PaymentCreated events for tx context (payer + tx hash)
      const created = await paginatedLogs(PAYMENT_CREATED, ESCROW_ADDRESS);

      // 2. Read current nonce → iterate ids 0..nonce-1 from contract for source-of-truth state
      const nonce = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "nonce",
      })) as bigint;

      const N = Number(nonce);
      if (N === 0) return [];

      type CreatedLog = {
        args: { paymentID?: bigint; to?: string; amount?: bigint; refundTo?: string };
        blockNumber?: bigint;
        transactionHash?: string;
      };
      const createdLogs = created as unknown as CreatedLog[];
      const idToLog = new Map<string, CreatedLog>();
      for (const log of createdLogs) {
        const k = log.args.paymentID?.toString() ?? "";
        idToLog.set(k, log);
      }

      // 3. For each id, read payments(id) AND look up the payer (tx.from of the creation log)
      const items: EscrowPayment[] = [];
      for (let i = 0; i < N; i++) {
        const idKey = i.toString();
        const log = idToLog.get(idKey);

        const p = (await publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: "payments",
          args: [BigInt(i)],
        })) as readonly [string, bigint, bigint, string, bigint, boolean];

        const [to, amount, , refundTo, withdrawnAmount, refunded] = p;

        // Determine payer via tx.from for the creation tx
        let payer: string | undefined;
        if (log?.transactionHash) {
          try {
            const tx = await publicClient.getTransaction({
              hash: log.transactionHash as `0x${string}`,
            });
            payer = tx.from.toLowerCase();
          } catch {
            /* skip */
          }
        }

        let status: EscrowPayment["status"];
        if (refunded) status = "refunded";
        else if (withdrawnAmount >= amount && amount > 0n) status = "withdrawn";
        else status = "held";

        items.push({
          id: BigInt(i),
          to: to.toLowerCase(),
          amount,
          refundTo: refundTo.toLowerCase(),
          withdrawnAmount,
          refunded,
          payer,
          blockNumber: log?.blockNumber,
          txHash: log?.transactionHash ?? undefined,
          status,
        });
      }

      return items.sort((a, b) => Number(b.id - a.id));
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useEscrowArbiter() {
  return useQuery({
    queryKey: ["escrow:arbiter", ESCROW_ADDRESS],
    enabled: !!ESCROW_ADDRESS,
    queryFn: async () => {
      if (!ESCROW_ADDRESS) return null;
      const arb = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: "arbiter",
      })) as string;
      return arb.toLowerCase();
    },
    staleTime: 5 * 60_000,
  });
}
