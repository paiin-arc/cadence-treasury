export type PaymentJournalItem = {
  id: string;
  owner: string;
  recipient: string;
  amountRaw: string;
  frequency: number;
  delaySeconds: number;
  txHash: string;
  scheduledAt: number;
  source: "schedule" | "batch" | "bill";
};

export const PAYMENT_JOURNAL_EVENT = "cadence:payment-journal";

const storageKey = (owner?: string) =>
  owner ? `cadence:payment-journal:${owner.toLowerCase()}` : "cadence:payment-journal:anon";

export function loadPaymentJournal(owner?: string): PaymentJournalItem[] {
  try {
    const raw = localStorage.getItem(storageKey(owner));
    return raw ? (JSON.parse(raw) as PaymentJournalItem[]) : [];
  } catch {
    return [];
  }
}

export function recordScheduledPayments(owner: string | undefined, items: PaymentJournalItem[]) {
  if (!owner || items.length === 0) return;

  const existing = loadPaymentJournal(owner);
  const next = [...items, ...existing]
    .filter((item, index, all) =>
      all.findIndex((candidate) => candidate.id === item.id && candidate.txHash === item.txHash) === index
    )
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    .slice(0, 80);

  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PAYMENT_JOURNAL_EVENT));
  } catch {
    /* ignore */
  }
}
