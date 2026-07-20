import fs from "fs";
import path from "path";

export interface AgentLog {
  id: string;
  action: string;
  trigger: string;
  status: "success" | "failed" | "pending";
  timestamp: number;
  wallet?: string;
  paymentId?: string;
  error?: string;
  txHash?: string;
}

export interface FailedTx {
  txHash: string;
  timestamp: number;
  reason: string;
  retryCount: number;
  state: "Retrying" | "Failed" | "Resolved";
  wallet: string;
  paymentId?: string;
}

export interface DatabaseSchema {
  agentLogs: AgentLog[];
  failedTxs: FailedTx[];
}

const DB_FILE = path.resolve(process.cwd(), "logs/db.json");

export function loadDb(): DatabaseSchema {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      return { agentLogs: [], failedTxs: [] };
    }
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return { agentLogs: [], failedTxs: [] };
  }
}

export function saveDb(db: DatabaseSchema) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save database:", e);
  }
}

export function logAgentAction(log: Omit<AgentLog, "id" | "timestamp">): AgentLog {
  const db = loadDb();
  const newLog: AgentLog = {
    id: `agent-log-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    timestamp: Date.now(),
    ...log,
  };
  db.agentLogs.unshift(newLog);
  // Cap history at 200 items to avoid bloated file sizes
  if (db.agentLogs.length > 200) {
    db.agentLogs = db.agentLogs.slice(0, 200);
  }
  saveDb(db);
  return newLog;
}

export function recordFailedTx(tx: Omit<FailedTx, "timestamp" | "retryCount" | "state">): FailedTx {
  const db = loadDb();
  
  // Find if this specific payment ID already has a retrying transaction
  const existingIndex = db.failedTxs.findIndex(
    (f) => f.paymentId === tx.paymentId && f.state === "Retrying"
  );
  
  let retryCount = 1;
  let state: FailedTx["state"] = "Retrying";
  
  let record: FailedTx;
  
  if (existingIndex !== -1) {
    retryCount = db.failedTxs[existingIndex].retryCount + 1;
    if (retryCount >= 3) {
      state = "Failed";
    }
    record = {
      ...db.failedTxs[existingIndex],
      ...tx,
      retryCount,
      state,
      timestamp: Date.now(),
    };
    db.failedTxs[existingIndex] = record;
  } else {
    record = {
      ...tx,
      timestamp: Date.now(),
      retryCount,
      state,
    };
    db.failedTxs.unshift(record);
  }
  
  saveDb(db);
  return record;
}

export function resolveFailedTx(paymentId: string, txHash: string) {
  const db = loadDb();
  const index = db.failedTxs.findIndex(
    (f) => f.paymentId === paymentId && f.state === "Retrying"
  );
  if (index !== -1) {
    db.failedTxs[index].state = "Resolved";
    db.failedTxs[index].txHash = txHash;
    db.failedTxs[index].timestamp = Date.now();
    saveDb(db);
  }
}
