"""
Risk Agent — validates Planner proposals against safety rules.
Uses OpenGradient TEE LLM with INDIVIDUAL_FULL settlement for full audit trail.
"""
import asyncio
import json
import os
import opengradient as og
from dotenv import load_dotenv
from treasury_reader import get_total_balance, get_ai_cap

load_dotenv()

llm = og.LLM(private_key=os.environ["OG_PRIVATE_KEY"])

ALLOWLISTED_RECIPIENTS: set[str] = set()

SYSTEM_PROMPT = """You are a treasury Risk Agent. Your ONLY job is to validate proposals.
You MUST call the validate_proposal function with your decision.
Be strict — reject anything that violates the rules."""

RISK_TOOLS = [{
    "type": "function",
    "function": {
        "name": "validate_proposal",
        "description": "Record the risk validation decision for a treasury action",
        "parameters": {
            "type": "object",
            "properties": {
                "approved": {
                    "type": "boolean",
                    "description": "True if proposal passes all safety checks",
                },
                "risk_score": {
                    "type": "number",
                    "description": "Risk score 0.0 (safe) to 1.0 (dangerous)",
                },
                "rejection_reason": {
                    "type": "string",
                    "description": "Why rejected (empty if approved)",
                },
                "warnings": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Non-blocking concerns",
                },
            },
            "required": ["approved", "risk_score"],
        },
    },
}]


async def run_risk_agent(proposal: dict) -> dict:
    balance = get_total_balance()
    ai_cap = get_ai_cap()
    min_balance = 100.0

    amount = proposal.get("estimated_impact_usdc") or 0

    user_message = f"""Validate this treasury proposal:

Proposal: {json.dumps(proposal, indent=2)}

Safety rules to check:
1. amount ({amount} USDC) must be <= AI cap ({ai_cap:.2f} USDC)
2. balance after action ({balance - amount:.2f} USDC) must be >= {min_balance} USDC minimum
3. confidence must be >= 0.6 to proceed
4. action_type "no_action" is always approved with risk_score 0.0

Call validate_proposal with your decision."""

    result = await llm.chat(
        model=og.TEE_LLM.GPT_4_1_2025_04_14,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        tools=RISK_TOOLS,
        tool_choice="required",
        max_tokens=300,
        temperature=0.0,
        x402_settlement_mode=og.x402SettlementMode.INDIVIDUAL_FULL,
    )

    tool_calls = result.chat_output.get("tool_calls", [])
    if tool_calls:
        decision = json.loads(tool_calls[0]["function"]["arguments"])
    else:
        decision = {
            "approved": False,
            "risk_score": 1.0,
            "rejection_reason": "Risk agent error: no tool call",
        }

    decision["og_proof_hash"] = result.payment_hash
    decision["proposal_hash"] = proposal.get("og_payment_hash", "")

    print(f"[Risk] Decision: approved={decision['approved']} risk={decision.get('risk_score', '?')}")
    print(f"[Risk] OG proof (INDIVIDUAL_FULL): {result.payment_hash}")

    return decision


if __name__ == "__main__":
    test_proposal = {
        "action_type": "suggest_delay",
        "target_payment_id": 0,
        "rationale": "Payment timing conflicts with low balance window",
        "confidence": 0.85,
        "estimated_impact_usdc": 50.0,
        "urgency": "low",
        "og_payment_hash": "0xtest",
    }
    decision = asyncio.run(run_risk_agent(test_proposal))
    print("Decision:", json.dumps(decision, indent=2))
