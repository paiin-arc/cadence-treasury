# Cadence

> Programmable USDC payroll on Arc. Set the cadence — USDC pays itself.

Cadence is a self-driving treasury that holds USDC on Circle's Arc Testnet, queues recurring or one-off payments, and executes them automatically through a deterministic scheduler bot. Sub-second finality, USDC as gas, every flow auditable on ArcScan.

Built by [@paiin_ip](https://twitter.com/paiin_ip).

---

## Features

- **Deposit & withdraw** — approve once, deposit USDC into your personal treasury balance, withdraw anytime
- **Schedule payments** — one-off or recurring (hourly / daily / weekly / monthly) to any address
- **Multi-pay** — bundle up to 4 wallets into a single signed transaction (perfect for payroll)
- **Bills** — save labelled bills with a due date, click "Pay now" to settle
- **Auto-flagging** — payments ≥ ½ `maxSingleTx` get marked for human review
- **Live dashboard** — treasury volume, scheduled queue, transaction history with filters
- **CLI guide** — every UI action also runs as a one-line script
- **Public verification** — every state change emits an event, every tx is on-chain

---

## Architecture

```
cadence/
├── contracts/    Solidity USDCTreasury (Hardhat + OpenZeppelin)
├── backend/      Node scheduler bot + Circle wallet helpers (TypeScript)
└── frontend/     React + Vite + viem + wagmi dashboard
```

- **Contract**: `USDCTreasury.sol` — per-user balances, payment queue, role-gated execution, emergency pause
- **Backend**: cron-driven scheduler runs every minute, reads due payments, executes via Circle developer-controlled wallets
- **Frontend**: connects via injected wallets (Rabby/MetaMask), reads contract state via viem, talks to the user's wallet for writes

---

## Network

| | |
|---|---|
| Chain | Arc Testnet |
| Chain ID | 5042002 |
| RPC | https://rpc.testnet.arc.network |
| Explorer | https://testnet.arcscan.app |
| USDC | `0x3600000000000000000000000000000000000000` |
| Treasury | `0xb4A668f7B45c2BBFB89bCb6853E72bFF464c8F44` |
| Faucet | https://faucet.circle.com |

---

## Run locally

### Prerequisites

- Node 22+
- A Circle Developer Console account ([console.circle.com](https://console.circle.com)) with API key + Entity Secret registered
- A wallet with Arc Testnet USDC (grab from the faucet above)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_TREASURY_ADDRESS + VITE_ARC_RPC
npm run dev
```

Opens on http://localhost:5173.

### Backend (scheduler bot)

```bash
cd backend
npm install
cp .env.example .env   # fill in Circle keys + treasury address + wallet ID
npm run scheduler
```

The scheduler watches contract events and fires due payments every minute.

### Contracts (only if you want to redeploy)

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network arcTestnet
```

---

## CLI

Every action has a one-line script. From `backend/`:

```bash
# Wallets
npx tsx --env-file=.env scripts/create-wallet.ts

# Treasury
npx tsx --env-file=.env scripts/deposit.ts 50
npx tsx --env-file=.env scripts/withdraw.ts 10
npx tsx --env-file=.env scripts/schedule-payment.ts 0xRecipient... 5 0 60
npx tsx --env-file=.env scripts/cancel-payment.ts 3

# Admin
npx tsx --env-file=.env scripts/set-paused.ts true
npx tsx --env-file=.env scripts/set-max-single-tx.ts 1000
```

See the in-app **CLI Guide** tab for the full list with descriptions.

---

## Deployment

- **Frontend** → Netlify / Vercel (Vite static build).
  Set env vars `VITE_TREASURY_ADDRESS` and `VITE_ARC_RPC` in your hosting provider.
- **Backend** → Fly.io (`backend/fly.toml` and `Dockerfile` included).
  Set Circle keys as Fly secrets:
  ```bash
  flyctl secrets set CIRCLE_API_KEY=... CIRCLE_ENTITY_SECRET=... DEPLOYER_WALLET_ID=... TREASURY_CONTRACT_ADDRESS=0x...
  flyctl deploy
  ```
  The bot must run 24/7 — without it, scheduled payments and bills won't settle.

---

## Tech

| Layer | Stack |
|---|---|
| Contracts | Solidity 0.8.24, OpenZeppelin (AccessControl, ReentrancyGuard, SafeERC20), Hardhat |
| Backend | Node 22, TypeScript, viem, `@circle-fin/developer-controlled-wallets`, node-cron |
| Frontend | React 18, Vite, TypeScript, viem, wagmi, @tanstack/react-query |
| Hosting | Netlify (frontend), Fly.io (scheduler) |

---

## License

MIT
