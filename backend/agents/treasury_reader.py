"""Reads treasury state from Arc using JSON-RPC directly."""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

RPC_URL = os.getenv("ARC_RPC_URL", "https://rpc.testnet.arc.network")
TREASURY = os.getenv("TREASURY_CONTRACT_ADDRESS")

USDC_DECIMALS = 6


def _eth_call(to: str, data: str) -> str:
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
        "id": 1,
    }
    r = requests.post(RPC_URL, json=payload, timeout=10)
    return r.json()["result"]


def get_total_balance() -> float:
    """Get total USDC in treasury (ERC-20 balanceOf via getTotalBalance())."""
    sig = "0xc9af9b8f"
    result = _eth_call(TREASURY, sig)
    raw = int(result, 16)
    return raw / 10**USDC_DECIMALS


def get_ai_cap() -> float:
    """Get current AI execution cap in USDC."""
    sig = "0x4c3d3c5f"
    result = _eth_call(TREASURY, sig)
    raw = int(result, 16)
    return raw / 10**USDC_DECIMALS


def get_recent_events(from_block: str = "latest") -> list[dict]:
    """Get recent PaymentExecuted events."""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getLogs",
        "params": [{
            "address": TREASURY,
            "fromBlock": hex(max(0, int(from_block, 16) - 10000)) if from_block != "latest" else "earliest",
            "toBlock": "latest",
            "topics": ["0x43c8cdf5e84fb6d2af2fd37dac3cab3d6edde81f06e3ac9cdbdfe1d9de3bec3d"]
        }],
        "id": 1,
    }
    r = requests.post(RPC_URL, json=payload, timeout=10)
    return r.json().get("result", [])


def get_scheduled_payments(max_id: int = 20) -> list[dict]:
    """Read scheduled payments from the contract."""
    payments = []
    for i in range(max_id):
        try:
            is_due_sig = "0x4a3c06ba"
            padded_id = hex(i)[2:].zfill(64)
            result = _eth_call(TREASURY, is_due_sig + padded_id)
            is_due = int(result, 16) == 1
            if is_due:
                payments.append({"id": i, "due": True})
        except Exception:
            break
    return payments


if __name__ == "__main__":
    print(f"Total balance: {get_total_balance()} USDC")
    print(f"AI cap: {get_ai_cap()} USDC")
