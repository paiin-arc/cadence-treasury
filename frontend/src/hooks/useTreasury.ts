import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";

const PAYMENT_EXECUTED_EVENT = parseAbiItem(
  "event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy)"
);

const DEPOSITED_EVENT = parseAbiItem(
  "event Deposited(address indexed user, uint256 amount)"
);

const PAYMENT_SCHEDULED_EVENT = parseAbiItem(
  "event PaymentScheduled(uint256 indexed paymentId, address indexed owner, address indexed recipient, uint256 amount, uint64 frequency)"
);

const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed user, uint256 amount)"
);

const PAYMENT_CANCELLED_EVENT = parseAbiItem(
  "event PaymentCancelled(uint256 indexed paymentId)"
);

export type TxHistoryItem = {
  type: "deposit" | "withdraw" | "schedule" | "execute" | "cancel";
  blockNumber: bigint;
  txHash: string;
  amount?: bigint;
  from?: string;
  to?: string;
  paymentId?: bigint;
  timestamp?: number;
};

// Arc public RPC limits getLogs to a 9000-block range AND rate-limits aggressive
// callers. We pull 12 chunks (~1.5 day at sub-second blocks) and cap concurrency
// at 3 to stay under the 429 ceiling.
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

import { parseEventLogs } from "viem";

let cachedTreasuryLogsPromise: Promise<any[]> | null = null;
let cachedTreasuryLogsTimestamp = 0;

async function getAllTreasuryLogs(): Promise<any[]> {
  const now = Date.now();
  if (cachedTreasuryLogsPromise && now - cachedTreasuryLogsTimestamp < 10000) {
    return cachedTreasuryLogsPromise;
  }
  
  cachedTreasuryLogsTimestamp = now;
  cachedTreasuryLogsPromise = (async () => {
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
          address: TREASURY_ADDRESS,
          fromBlock: from,
          toBlock: to,
        });
      } catch {
        return [];
      }
    });
    const results = await runWithConcurrency(tasks, CONCURRENCY);
    const rawLogs = results.flat();
    return parseEventLogs({ abi: TREASURY_ABI, logs: rawLogs });
  })();
  
  return cachedTreasuryLogsPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paginatedLogs<T = any>(event: any): Promise<T[]> {
  const eventName = event.name;
  const parsedLogs = await getAllTreasuryLogs();
  return parsedLogs.filter((l) => l.eventName === eventName) as unknown as T[];
}

export function useTreasuryBalance() {
  return useQuery({
    queryKey: ["treasuryBalance"],
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getTotalBalance",
      } as any);
      return Number(raw) / 1e6;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function usePayments(count: number = 10) {
  return useQuery({
    queryKey: ["payments", count],
    queryFn: async () => {
      const nextId = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "nextPaymentId",
      } as any);

      const limit = Math.min(Number(nextId), count);

      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 9000n ? latestBlock - 9000n : 0n;

      const [executedLogs, cancelledLogs] = await Promise.all([
        publicClient
          .getLogs({
            address: TREASURY_ADDRESS,
            event: PAYMENT_EXECUTED_EVENT,
            fromBlock,
            toBlock: "latest",
          })
          .catch(() => []),
        publicClient
          .getLogs({
            address: TREASURY_ADDRESS,
            event: PAYMENT_CANCELLED_EVENT,
            fromBlock,
            toBlock: "latest",
          })
          .catch(() => []),
      ]);

      const executedCounts = new Map<string, number>();
      for (const l of executedLogs) {
        const key = l.args.paymentId?.toString() ?? "";
        executedCounts.set(key, (executedCounts.get(key) ?? 0) + 1);
      }
      const cancelledIds = new Set(
        cancelledLogs.map((l) => l.args.paymentId?.toString() ?? "")
      );

      const start = Math.max(Number(nextId) - limit, 0);
      const ids = Array.from({ length: limit }, (_, offset) => start + offset).reverse();

      const payments = [];
      for (const i of ids) {
        const p: any = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "getPayment",
          args: [BigInt(i)],
        } as any);
        const due = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "isDue",
          args: [BigInt(i)],
        } as any);
        const idKey = i.toString();
        payments.push({
          id: i,
          ...p,
          isDue: due,
          executedCount: executedCounts.get(idKey) ?? 0,
          cancelled: cancelledIds.has(idKey),
        });
      }
      return payments;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useTreasuryStats() {
  return useQuery({
    queryKey: ["treasuryStats"],
    queryFn: async () => {
      const [balance, depositLogs, scheduledLogs, executedLogs] = await Promise.all([
        publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "getTotalBalance",
        } as any),
        paginatedLogs<{ args: { amount?: bigint } }>(DEPOSITED_EVENT),
        paginatedLogs<{ args: { amount?: bigint } }>(PAYMENT_SCHEDULED_EVENT),
        paginatedLogs<{ args: { amount?: bigint } }>(PAYMENT_EXECUTED_EVENT),
      ]);

      const sumAmounts = (logs: { args: { amount?: bigint } }[]) =>
        logs.reduce((s, l) => s + (l.args.amount ?? 0n), 0n);

      return {
        treasuryBalance: Number(balance) / 1e6,
        totalDeposits: Number(sumAmounts(depositLogs)) / 1e6,
        depositCount: depositLogs.length,
        totalScheduled: Number(sumAmounts(scheduledLogs)) / 1e6,
        scheduledCount: scheduledLogs.length,
        totalPaidOut: Number(sumAmounts(executedLogs)) / 1e6,
        paidOutCount: executedLogs.length,
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useTransactionsHistory() {
  return useQuery<TxHistoryItem[]>({
    queryKey: ["txHistory"],
    queryFn: async () => {
      type LogShape = {
        blockNumber: bigint;
        transactionHash: string;
        args: {
          amount?: bigint;
          user?: string;
          owner?: string;
          recipient?: string;
          executedBy?: string;
          paymentId?: bigint;
        };
      };
      const [deposits, withdrawals, scheduled, executed, cancelled] = await Promise.all([
        paginatedLogs<LogShape>(DEPOSITED_EVENT),
        paginatedLogs<LogShape>(WITHDRAWN_EVENT),
        paginatedLogs<LogShape>(PAYMENT_SCHEDULED_EVENT),
        paginatedLogs<LogShape>(PAYMENT_EXECUTED_EVENT),
        paginatedLogs<LogShape>(PAYMENT_CANCELLED_EVENT),
      ]);

      // Cancel events don't include who cancelled; fetch tx.from per cancel.
      const cancelItems: TxHistoryItem[] = await Promise.all(
        cancelled.map(async (l) => {
          let from: string | undefined;
          try {
            const tx = await publicClient.getTransaction({ hash: l.transactionHash as `0x${string}` });
            from = tx.from;
          } catch {
            from = undefined;
          }
          return {
            type: "cancel" as const,
            blockNumber: l.blockNumber!,
            txHash: l.transactionHash!,
            paymentId: l.args.paymentId,
            from,
          };
        })
      );

      const items: TxHistoryItem[] = [
        ...deposits.map((l) => ({
          type: "deposit" as const,
          blockNumber: l.blockNumber!,
          txHash: l.transactionHash!,
          amount: l.args.amount,
          from: (l.args.user as string)?.toLowerCase(),
        })),
        ...withdrawals.map((l) => ({
          type: "withdraw" as const,
          blockNumber: l.blockNumber!,
          txHash: l.transactionHash!,
          amount: l.args.amount,
          from: (l.args.user as string)?.toLowerCase(),
        })),
        ...scheduled.map((l) => ({
          type: "schedule" as const,
          blockNumber: l.blockNumber!,
          txHash: l.transactionHash!,
          amount: l.args.amount,
          from: (l.args.owner as string)?.toLowerCase(),
          to: (l.args.recipient as string)?.toLowerCase(),
          paymentId: l.args.paymentId,
        })),
        ...executed.map((l) => ({
          type: "execute" as const,
          blockNumber: l.blockNumber!,
          txHash: l.transactionHash!,
          amount: l.args.amount,
          from: (l.args.executedBy as string)?.toLowerCase(),
          to: (l.args.recipient as string)?.toLowerCase(),
          paymentId: l.args.paymentId,
        })),
        ...cancelItems,
      ];

      items.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      // Resolve timestamps for the first 30 items
      const visibleItems = items.slice(0, 30);
      await Promise.all(
        visibleItems.map(async (item) => {
          item.timestamp = await getBlockTime(item.blockNumber);
        })
      );

      return items;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

const blockTimeCache = new Map<bigint, number>();

async function getBlockTime(blockNumber: bigint): Promise<number> {
  if (blockTimeCache.has(blockNumber)) {
    return blockTimeCache.get(blockNumber)!;
  }
  try {
    const block = await publicClient.getBlock({ blockNumber });
    const ts = Number(block.timestamp) * 1000;
    blockTimeCache.set(blockNumber, ts);
    return ts;
  } catch {
    return Date.now();
  }
}


export function useRecentEvents() {
  return useQuery({
    queryKey: ["recentEvents"],
    queryFn: async () => {
      const logs = await paginatedLogs<{
        args: { paymentId?: bigint; recipient?: string; amount?: bigint; executedBy?: string };
        transactionHash: string;
        blockNumber: bigint;
      }>(PAYMENT_EXECUTED_EVENT);

      return logs.map((log) => ({
        paymentId: log.args.paymentId?.toString(),
        recipient: log.args.recipient,
        amount: Number(log.args.amount ?? 0n) / 1e6,
        executedBy: log.args.executedBy,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber?.toString(),
      }));
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export type AgentLog = {
  id: string;
  action: string;
  trigger: string;
  status: "success" | "failed" | "pending";
  timestamp: number;
  wallet?: string;
  paymentId?: string;
  error?: string;
  txHash?: string;
};

export type FailedTx = {
  txHash: string;
  timestamp: number;
  reason: string;
  retryCount: number;
  state: "Retrying" | "Failed" | "Resolved";
  wallet: string;
  paymentId?: string;
};

export type AnalyticsData = {
  agentLogs: AgentLog[];
  failedTxs: FailedTx[];
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://localhost:8080" : "https://cadence-treasury-backend.onrender.com");

export function useAnalytics(walletAddress: string | undefined) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        return { agentLogs: [], failedTxs: [] };
      }

      const res = await fetch(`${BACKEND_URL}/api/analytics?wallet=${walletAddress.toLowerCase()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch analytics");
      }
      return res.json() as Promise<AnalyticsData>;
    },
    refetchInterval: 10_000,
    enabled: !!walletAddress,
  });
}

