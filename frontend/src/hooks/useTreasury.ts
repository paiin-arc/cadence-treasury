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
};

// Arc public RPC limits getLogs to a 9000-block range. Walk backwards in chunks
// so we can pull multi-day history. 35 chunks × 9000 ≈ ~3-4 days at sub-second blocks.
const CHUNK_SIZE = 9000n;
const MAX_CHUNKS = 35;

async function paginatedLogs<T extends { transactionHash?: string | null }>(
  event: Parameters<typeof publicClient.getLogs>[0]["event"]
): Promise<T[]> {
  const latest = await publicClient.getBlockNumber();
  const ranges: { from: bigint; to: bigint }[] = [];
  let to = latest;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const from = to > CHUNK_SIZE ? to - CHUNK_SIZE : 0n;
    ranges.push({ from, to });
    if (from === 0n) break;
    to = from - 1n;
  }
  const results = await Promise.all(
    ranges.map(async ({ from, to }) => {
      try {
        return await publicClient.getLogs({
          address: TREASURY_ADDRESS,
          event,
          fromBlock: from,
          toBlock: to,
        });
      } catch {
        return [];
      }
    })
  );
  return results.flat() as T[];
}

export function useTreasuryBalance() {
  return useQuery({
    queryKey: ["treasuryBalance"],
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getTotalBalance",
      });
      return Number(raw) / 1e6;
    },
    refetchInterval: 15_000,
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
      });

      const limit = Math.min(Number(nextId), count);

      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 9000n ? latestBlock - 9000n : 0n;

      const [executedLogs, cancelledLogs] = await Promise.all([
        publicClient.getLogs({
          address: TREASURY_ADDRESS,
          event: PAYMENT_EXECUTED_EVENT,
          fromBlock,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: TREASURY_ADDRESS,
          event: PAYMENT_CANCELLED_EVENT,
          fromBlock,
          toBlock: "latest",
        }),
      ]);

      const executedCounts = new Map<string, number>();
      for (const l of executedLogs) {
        const key = l.args.paymentId?.toString() ?? "";
        executedCounts.set(key, (executedCounts.get(key) ?? 0) + 1);
      }
      const cancelledIds = new Set(
        cancelledLogs.map((l) => l.args.paymentId?.toString() ?? "")
      );

      const payments = [];
      for (let i = 0; i < limit; i++) {
        const p = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "getPayment",
          args: [BigInt(i)],
        });
        const due = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "isDue",
          args: [BigInt(i)],
        });
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
    refetchInterval: 30_000,
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
        }),
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
    refetchInterval: 30_000,
    staleTime: 15_000,
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
            const tx = await publicClient.getTransaction({ hash: l.transactionHash! });
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
      return items;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
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
    refetchInterval: 30_000,
  });
}
