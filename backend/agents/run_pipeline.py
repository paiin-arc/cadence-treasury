"""
Main agent pipeline — runs Planner → Risk → Executor in sequence.
Run this on a schedule (e.g., every 15 minutes via cron).
"""
import asyncio
import json
from datetime import datetime

from planner_agent import run_planner
from risk_agent import run_risk_agent
from executor_agent import run_executor


async def run_pipeline():
    timestamp = datetime.utcnow().isoformat()
    print(f"\n{'='*60}")
    print(f"[Pipeline] Starting at {timestamp}")
    print(f"{'='*60}")

    print("\n[Pipeline] Step 1: Running Planner Agent...")
    proposal = await run_planner()

    print("\n[Pipeline] Step 2: Running Risk Agent...")
    risk_decision = await run_risk_agent(proposal)

    print("\n[Pipeline] Step 3: Running Executor Agent...")
    result = run_executor(proposal, risk_decision)

    log_entry = {
        "timestamp": timestamp,
        "proposal": proposal,
        "risk_decision": risk_decision,
        "execution_result": result,
    }

    with open("audit_log.jsonl", "a") as f:
        f.write(json.dumps(log_entry) + "\n")

    print(f"\n[Pipeline] Complete. Executed: {result.get('executed')}")
    return log_entry


if __name__ == "__main__":
    asyncio.run(run_pipeline())
