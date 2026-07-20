/**
 * Cadence API server (Phase 1: refund escrow only).
 *
 * Runs alongside the scheduler bot. Exposes one route:
 *   POST /api/refund-escrow  body: { paymentId: number }
 *
 * Submits refundByArbiter(paymentId) via the Circle dev-controlled wallet.
 *
 * Run from backend/:
 *   npm run api
 *
 * Then test from another terminal:
 *   curl -X POST http://localhost:8080/api/refund-escrow \
 *     -H "Content-Type: application/json" \
 *     -d '{"paymentId": 0}'
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { circleClient, waitForTx } from "../circleClient.js";
import { loadDb } from "../db.js";
import "dotenv/config";

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8080);
const ESCROW = process.env.ESCROW_CONTRACT_ADDRESS;
const WALLET_ID = process.env.DEPLOYER_WALLET_ID;

if (!ESCROW || !/^0x[0-9a-fA-F]{40}$/.test(ESCROW)) {
  throw new Error("ESCROW_CONTRACT_ADDRESS missing or invalid in backend/.env");
}
if (!WALLET_ID) {
  throw new Error("DEPLOYER_WALLET_ID missing in backend/.env");
}

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    escrow: ESCROW,
    arbiterWalletId: WALLET_ID,
  })
);

app.get("/api/analytics", (c) => {
  const wallet = c.req.query("wallet")?.toLowerCase();
  const db = loadDb();

  if (!wallet) {
    return c.json({
      agentLogs: db.agentLogs,
      failedTxs: db.failedTxs,
    });
  }

  const userLogs = db.agentLogs.filter(
    (l) => l.wallet?.toLowerCase() === wallet
  );
  const userFailed = db.failedTxs.filter(
    (f) => f.wallet?.toLowerCase() === wallet
  );

  return c.json({
    agentLogs: userLogs,
    failedTxs: userFailed,
  });
});


app.post("/api/refund-escrow", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body must be valid JSON" }, 400);
  }

  const { paymentId } = body as { paymentId?: number | string };
  if (paymentId === undefined || paymentId === null) {
    return c.json({ error: "Missing paymentId" }, 400);
  }
  const idStr = String(paymentId);
  if (!/^\d+$/.test(idStr)) {
    return c.json({ error: "paymentId must be a non-negative integer" }, 400);
  }

  console.log(`[api] Refund requested for escrow #${idStr}`);

  try {
    const tx = await circleClient.createContractExecutionTransaction({
      walletId: WALLET_ID,
      contractAddress: ESCROW,
      abiFunctionSignature: "refundByArbiter(uint256)",
      abiParameters: [idStr],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const circleTxId = tx.data?.id;
    if (!circleTxId) {
      return c.json({ error: "Circle did not return a transaction ID" }, 502);
    }

    console.log(`[api] Circle tx submitted: ${circleTxId}`);
    const txHash = await waitForTx(circleTxId, `refund-#${idStr}`);

    console.log(`[api] Refunded escrow #${idStr}: ${txHash}`);
    return c.json({
      ok: true,
      paymentId: Number(idStr),
      txHash,
      arcscanUrl: `https://testnet.arcscan.app/tx/${txHash}`,
    });
  } catch (e) {
    const err = e as Error;
    console.error(`[api] Refund #${idStr} failed:`, err.message);
    return c.json({ error: err.message ?? "Refund failed" }, 500);
  }
});

console.log(`Cadence API listening on http://localhost:${PORT}`);
console.log(`  Escrow:  ${ESCROW}`);
console.log(`  Arbiter wallet: ${WALLET_ID}`);

serve({ fetch: app.fetch, port: PORT });
