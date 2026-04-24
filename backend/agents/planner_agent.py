"""
Planner Agent — analyzes treasury state and proposes actions.
Uses OpenGradient TEE LLM with BATCH_HASHED settlement.
"""
import asyncio
import json
import os
import opengradient as og
from dotenv import load_dotenv
from treasury_reader import (
    get_total_balance,
    get_ai_cap,
    get_recent_events,
    get_scheduled_payments,
)

load_dotenv()

llm = og.LLM(private_key=os.environ["OG_PRIVATE_KEY"])

SYSTEM_PROMPT = """You are a USDC treasury Planner agent for a DeFi treasury system on Arc blockchain.
Your job is to analyze treasury data and propose ONE concrete optimization action.

You MUST respond with ONLY valid JSON — no markdown, no explanation outside the JSON.
JSON schema:
{
  "action_type": "suggest_delay | suggest_rebalance | flag_overspend | flag_low_balance | no_action",
  "target_payment_id": <integer or null>,
  "rationale": "<1-2 sentence explanation>",
  "confidence": <float 0.0-1.0>,
  "estimated_impact_usdc": <float or null>,
  "urgency": "low | medium | high"
}"""


async def run_planner() -> dict:
    balance = get_total_balance()
    ai_cap = get_ai_cap()
    recent_events = get_recent_events()
    due_payments = get_scheduled_payments()

    user_message = f"""Treasury analysis request:

Current USDC balance: {balance:.2f} USDC
AI execution cap (5%): {ai_cap:.2f} USDC
Payments due now: {json.dumps(due_payments)}
Recent executions (last 10000 blocks): {len(recent_events)} payments

Rules you must follow:
- Never propose amounts above {ai_cap:.2f} USDC (AI cap)
- Minimum balance must stay above 100 USDC
- Only propose actions for due or near-due payments

Analyze and propose one action."""

    result = await llm.chat(
        model=og.TEE_LLM.GPT_4_1_2025_04_14,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=300,
        temperature=0.0,
        x402_settlement_mode=og.x402SettlementMode.BATCH_HASHED,
    )

    raw = result.chat_output.get("content", "{}")

    try:
        proposal = json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        proposal = json.loads(match.group()) if match else {
            "action_type": "no_action",
            "rationale": "Parse error",
        }

    proposal["og_payment_hash"] = result.payment_hash
    proposal["balance_at_analysis"] = balance
    proposal["ai_cap_at_analysis"] = ai_cap

    print(f"[Planner] Proposal: {json.dumps(proposal, indent=2)}")
    print(f"[Planner] OG proof: {result.payment_hash}")

    return proposal


if __name__ == "__main__":
    proposal = asyncio.run(run_planner())
    print("\nFinal proposal:", json.dumps(proposal, indent=2))
