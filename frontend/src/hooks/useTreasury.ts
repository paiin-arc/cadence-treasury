import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";

const PAYMENT_EXECUTED_EVENT = parseAbiItem(
  "event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy)"
);

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

export function useAiCap() {
  return useQuery({
    queryKey: ["aiCap"],
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getAiCap",
      });
      return Number(raw) / 1e6;
    },
    refetchInterval: 30_000,
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

      const payments = [];
      const limit = Math.min(Number(nextId), count);

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
        payments.push({ id: i, ...p, isDue: due });
      }
      return payments;
    },
    refetchInterval: 30_000,
  });
}

export function useRecentEvents() {
  return useQuery({
    queryKey: ["recentEvents"],
    queryFn: async () => {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;

      const logs = await publicClient.getLogs({
        address: TREASURY_ADDRESS,
        event: PAYMENT_EXECUTED_EVENT,
        fromBlock,
        toBlock: "latest",
      });

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
