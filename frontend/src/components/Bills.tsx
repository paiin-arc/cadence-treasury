import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { decodeEventLog } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { arcTestnet, publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";
import { usePayments } from "../hooks/useTreasury";

type Bill = {
  id: string;
  label: string;
  description: string;
  recipient: string;
  amountUSDC: string;
  dueDate: string;
  paymentId?: string;
  scheduledAt?: number;
};

const storageKey = (addr?: string) =>
  addr ? `cadence:bills:${addr.toLowerCase()}` : "cadence:bills:anon";

function loadBills(addr?: string): Bill[] {
  try {
    const raw = localStorage.getItem(storageKey(addr));
    return raw ? (JSON.parse(raw) as Bill[]) : [];
  } catch {
    return [];
  }
}

function saveBills(addr: string | undefined, bills: Bill[]) {
  try {
    localStorage.setItem(storageKey(addr), JSON.stringify(bills));
  } catch {
    /* ignore */
  }
}

function formatUSDC(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dueDate: string) {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

export default function Bills() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;
  const queryClient = useQueryClient();

  const [bills, setBills] = useState<Bill[]>(() => loadBills(address));
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Omit<Bill, "id">>({
    label: "",
    description: "",
    recipient: "",
    amountUSDC: "",
    dueDate: todayISO(),
  });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Reload when wallet changes
  useEffect(() => {
    setBills(loadBills(address));
  }, [address]);

  // Persist on every change
  useEffect(() => {
    saveBills(address, bills);
  }, [address, bills]);

  const userBalance = useReadContract({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    functionName: "userBalances",
    args: address ? [address] : undefined,
    query: { enabled: !!address && onArc, refetchInterval: 8_000 },
  });

  const { data: payments } = usePayments(80);
  const { writeContractAsync } = useWriteContract();

  // For each bill that has a paymentId, find its on-chain status from payments[]
  const billStatus = useMemo(() => {
    const map = new Map<string, "draft" | "settling" | "paid" | "failed">();
    for (const b of bills) {
      if (!b.paymentId) {
        map.set(b.id, "draft");
        continue;
      }
      const p = payments?.find((pp) => pp.id.toString() === b.paymentId);
      if (!p) {
        map.set(b.id, "settling");
        continue;
      }
      // frequency=0 → one-off. !active means executed or cancelled.
      if (!p.active && p.executedCount > 0) map.set(b.id, "paid");
      else if (!p.active) map.set(b.id, "failed");
      else map.set(b.id, "settling");
    }
    return map;
  }, [bills, payments]);

  const handleAdd = () => {
    setMsg(null);
    if (!draft.label.trim()) {
      setMsg({ kind: "err", text: "Add a label (e.g. Rent, Electricity)." });
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(draft.recipient)) {
      setMsg({ kind: "err", text: "Recipient must be a valid 0x address." });
      return;
    }
    const amt = Number(draft.amountUSDC);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ kind: "err", text: "Amount must be positive." });
      return;
    }
    if (!draft.dueDate) {
      setMsg({ kind: "err", text: "Pick a due date." });
      return;
    }
    const newBill: Bill = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...draft,
      recipient: draft.recipient.toLowerCase(),
    };
    setBills((prev) => [newBill, ...prev]);
    setDraft({ label: "", description: "", recipient: "", amountUSDC: "", dueDate: todayISO() });
    setShowForm(false);
    setMsg({ kind: "ok", text: `Bill "${newBill.label}" saved.` });
  };

  const handleDelete = (id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  const handlePay = async (bill: Bill) => {
    setMsg(null);
    if (!isConnected || !onArc) {
      setMsg({ kind: "err", text: "Connect on Arc Testnet to pay." });
      return;
    }
    const amountRaw = BigInt(Math.round(Number(bill.amountUSDC) * 1_000_000));
    const balance = userBalance.data as bigint | undefined;
    if (balance !== undefined && amountRaw > balance) {
      setMsg({
        kind: "err",
        text: `${bill.amountUSDC} USDC exceeds your treasury balance (${formatUSDC(Number(balance) / 1e6)}). Deposit more first.`,
      });
      return;
    }

    try {
      setPayingId(bill.id);
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "schedulePayment",
        args: [bill.recipient as `0x${string}`, amountRaw, 0n, 0n],
      });
      setMsg({ kind: "ok", text: `Payment sent (${hash.slice(0, 10)}…), waiting…` });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
        pollingInterval: 1_500,
      });
      if (receipt.status !== "success") throw new Error("Schedule reverted");

      // Pull paymentId from PaymentScheduled event in the receipt
      let paymentId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TREASURY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "PaymentScheduled") {
            paymentId = (decoded.args as { paymentId: bigint }).paymentId.toString();
            break;
          }
        } catch {
          /* not our event */
        }
      }

      setBills((prev) =>
        prev.map((b) =>
          b.id === bill.id
            ? { ...b, paymentId, scheduledAt: Date.now() }
            : b
        )
      );
      setMsg({
        kind: "ok",
        text: `Bill "${bill.label}" sent to scheduler. The bot will settle it within ~60s.`,
      });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["txHistory"] });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg({ kind: "err", text: err.shortMessage ?? err.message ?? "Pay failed" });
    } finally {
      setPayingId(null);
    }
  };

  const sortedBills = useMemo(
    () =>
      [...bills].sort((a, b) => {
        const sa = billStatus.get(a.id) ?? "draft";
        const sb = billStatus.get(b.id) ?? "draft";
        const order = { draft: 0, settling: 1, paid: 2, failed: 3 };
        if (order[sa] !== order[sb]) return order[sa] - order[sb];
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }),
    [bills, billStatus]
  );

  return (
    <div className="bills-panel">
      <div className="schedule-card">
        <div className="schedule-header">
          <div>
            <h3>Bills</h3>
            <p className="interact-help" style={{ marginTop: 4, marginBottom: 0 }}>
              Save named bills with a due date. Click <strong>Pay now</strong> to settle —
              the scheduler bot fires it within ~60s.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
            style={{ height: "fit-content" }}
          >
            {showForm ? "Close" : "+ Add bill"}
          </button>
        </div>

        {showForm && (
          <div className="bill-form">
            <div className="field-row two">
              <label className="field">
                <span>Label</span>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Rent, Electricity, Phone…"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Due date</span>
                <div className="form-row">
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  />
                </div>
              </label>
            </div>

            <label className="field">
              <span>Recipient</span>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="0x…"
                  value={draft.recipient}
                  onChange={(e) => setDraft({ ...draft, recipient: e.target.value })}
                  spellCheck={false}
                />
              </div>
            </label>

            <div className="field-row two">
              <label className="field">
                <span>Amount</span>
                <div className="form-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.amountUSDC}
                    onChange={(e) => setDraft({ ...draft, amountUSDC: e.target.value })}
                  />
                  <span className="suffix">USDC</span>
                </div>
              </label>
              <label className="field">
                <span>Description</span>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Optional note"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
              </label>
            </div>

            <button className="btn btn-primary form-btn" onClick={handleAdd}>
              Save bill
            </button>
          </div>
        )}

        {sortedBills.length === 0 ? (
          <p className="interact-help" style={{ marginTop: 18 }}>
            No bills yet. Add one to start tracking what's owed.
          </p>
        ) : (
          <div className="bills-list">
            {sortedBills.map((b) => {
              const status = billStatus.get(b.id) ?? "draft";
              const days = daysUntil(b.dueDate);
              const overdue = status === "draft" && days < 0;
              const dueSoon = status === "draft" && days >= 0 && days <= 3;
              return (
                <div className="bill-row" key={b.id}>
                  <div className="bill-row-main">
                    <div className="bill-row-top">
                      <span className="bill-label">{b.label}</span>
                      {status === "paid" && <span className="pill pill-ok">Paid</span>}
                      {status === "settling" && (
                        <span className="pill pill-warn">Settling…</span>
                      )}
                      {status === "failed" && (
                        <span className="pill pill-fail">Failed</span>
                      )}
                      {status === "draft" && overdue && (
                        <span className="pill pill-fail">Overdue · {Math.abs(days)}d</span>
                      )}
                      {status === "draft" && dueSoon && (
                        <span className="pill pill-due">Due in {days}d</span>
                      )}
                      {status === "draft" && !overdue && !dueSoon && (
                        <span className="pill pill-scheduled">
                          Due {b.dueDate}
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <div className="bill-desc">{b.description}</div>
                    )}
                    <div className="bill-meta">
                      <a
                        href={`https://testnet.arcscan.app/address/${b.recipient}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(b.recipient)}
                      </a>
                      <span>·</span>
                      <strong>{formatUSDC(Number(b.amountUSDC))} USDC</strong>
                      {b.paymentId !== undefined && (
                        <>
                          <span>·</span>
                          <span className="bill-pid">#{b.paymentId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="bill-row-actions">
                    {status === "draft" && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePay(b)}
                        disabled={payingId === b.id || !isConnected || !onArc}
                      >
                        {payingId === b.id ? "Paying…" : "Pay now"}
                      </button>
                    )}
                    {status !== "settling" && (
                      <button
                        className="btn-cancel"
                        onClick={() => handleDelete(b.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {msg && (
          <div className={`interact-msg ${msg.kind}`} style={{ marginTop: 12 }}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
