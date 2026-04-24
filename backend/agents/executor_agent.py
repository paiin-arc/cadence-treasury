"""
Executor Agent — executes approved proposals by calling the treasury contract.
Only runs when Risk Agent approved AND risk_score < 0.4.
"""
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

CIRCLE_API_KEY = os.environ["CIRCLE_API_KEY"]
AI_EXECUTOR_WALLET_ID = os.environ["AI_EXECUTOR_WALLET_ID"]
TREASURY = os.environ["TREASURY_CONTRACT_ADDRESS"]

HEADERS = {
    "Authorization": f"Bearer {CIRCLE_API_KEY}",
    "Content-Type": "application/json",
}


def execute_payment(payment_id: int, og_proof_hash: str) -> dict:
    """Call executePayment on the treasury contract via Circle API."""
    payload = {
        "walletId": AI_EXECUTOR_WALLET_ID,
        "contractAddress": TREASURY,
        "abiFunctionSignature": "executePayment(uint256,string)",
        "abiParameters": [str(payment_id), og_proof_hash],
        "fee": {"type": "level", "config": {"feeLevel": "MEDIUM"}},
    }

    r = requests.post(
        "https://api.circle.com/v1/w3s/developer/transactions/contractExecution",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", {})


def poll_transaction(tx_id: str, max_attempts: int = 40) -> str:
    """Poll Circle API until transaction completes."""
    terminal = {"COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"}

    for _ in range(max_attempts):
        time.sleep(3)
        r = requests.get(
            f"https://api.circle.com/v1/w3s/transactions/{tx_id}",
            headers=HEADERS,
            timeout=10,
        )
        data = r.json().get("data", {}).get("transaction", {})
        state = data.get("state", "")

        if state in terminal:
            if state in {"FAILED", "DENIED", "CANCELLED"}:
                raise RuntimeError(f"Transaction {state}: {tx_id}")
            return data.get("txHash", "")

    raise TimeoutError(f"Transaction timed out: {tx_id}")


def run_executor(proposal: dict, risk_decision: dict) -> dict:
    """
    Execute a proposal that has been approved by the Risk Agent.
    Only proceeds if approved AND risk_score < 0.4 AND action is executable.
    """
    if not risk_decision.get("approved"):
        reason = risk_decision.get("rejection_reason", "Unknown")
        print(f"[Executor] Skipping — rejected by Risk Agent: {reason}")
        return {"executed": False, "reason": reason}

    if risk_decision.get("risk_score", 1.0) >= 0.4:
        score = risk_decision["risk_score"]
        print(f"[Executor] Skipping — risk score too high: {score}")
        return {"executed": False, "reason": f"Risk score {score} >= 0.4 threshold"}

    action = proposal.get("action_type")
    payment_id = proposal.get("target_payment_id")

    if action == "no_action" or payment_id is None:
        print("[Executor] No action to execute")
        return {"executed": False, "reason": "No action required"}

    combined_proof = (
        f"planner:{proposal.get('og_payment_hash','')[:20]}"
        f"|risk:{risk_decision.get('og_proof_hash','')[:20]}"
    )

    print(f"[Executor] Executing payment {payment_id} with proof: {combined_proof}")

    try:
        tx_response = execute_payment(payment_id, combined_proof)
        tx_id = tx_response.get("id")

        if not tx_id:
            raise ValueError("No transaction ID from Circle API")

        tx_hash = poll_transaction(tx_id)
        result = {
            "executed": True,
            "payment_id": payment_id,
            "tx_hash": tx_hash,
            "og_proof": combined_proof,
            "explorer": f"https://testnet.arcscan.app/tx/{tx_hash}",
        }
        print(f"[Executor] Executed: {result['explorer']}")
        return result

    except Exception as e:
        print(f"[Executor] Failed: {e}")
        return {"executed": False, "reason": str(e)}


if __name__ == "__main__":
    print("[Executor] Executor agent ready — needs AI_EXECUTOR_ROLE on contract")
