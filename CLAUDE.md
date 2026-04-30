# USDC Treasury on Arc — Complete Build Guide
> Build this with your bare hands in VSCode, step by step.

---

## What you'll build

```
usdc-treasury/
├── contracts/          ← Solidity smart contracts (Hardhat)
├── backend/            ← Node.js scheduler + Circle wallet helpers
│   ├── scheduler/      ← Cron + event watcher (TypeScript)
│   └── scripts/        ← One-off setup scripts
├── frontend/           ← React dashboard (Vite + Viem)
└── scripts/            ← Deployment & setup scripts
```

A USDC treasury on Arc with deposits, withdrawals, scheduled and recurring payments, all driven by a deterministic scheduler bot. No AI, no off-chain inference — everything you need lives on Arc and in Circle's developer-controlled wallets.

---

## Prerequisites — install these first

Open a terminal in VSCode and verify each one:

```bash
node --version      # Need v22+
git --version
```

Install if missing:
- **Node.js v22**: https://nodejs.org (pick LTS)
- **VSCode Extensions**: Install "Solidity" by Nomicfoundation

---

## Accounts you need — get these before writing any code

### 1. Circle Developer Console
Go to https://console.circle.com → Sign up → Create an API key (Standard Key).

Also register your Entity Secret:
- In the Console: go to "Entity Secret" → follow the wizard
- This gives you a `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`

### 2. Arc Testnet USDC
- Go to: https://faucet.circle.com
- Select "Arc Testnet" and request USDC + native tokens

### 3. Deployer wallet (for Hardhat deploys)
- Install MetaMask: https://metamask.io
- Add Arc Testnet to MetaMask:
  - Network name: Arc Testnet
  - RPC URL: https://rpc.testnet.arc.network
  - Chain ID: 5042002
  - Currency: USDC
- Export your MetaMask private key: MetaMask → Account → Export Private Key
  ⚠️ Use a **dedicated testnet wallet**, never your real wallet

---

## Part 1 — Project Setup

### Step 1.1 — Create the root folder

Open VSCode, then open a terminal (`Ctrl+\`` or Terminal → New Terminal):

```bash
mkdir usdc-treasury
cd usdc-treasury
git init
```

Create a `.gitignore`:
```bash
cat > .gitignore << 'EOF'
node_modules/
.env
.env.*
artifacts/
cache/
dist/
EOF
```

---

## Part 2 — Smart Contracts (Hardhat + Solidity)

### Step 2.1 — Set up Hardhat

```bash
mkdir contracts
cd contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
# Choose: Create a TypeScript project → Yes to all prompts
```

Install OpenZeppelin:
```bash
npm install @openzeppelin/contracts
```

### Step 2.2 — Configure Hardhat for Arc

Delete the auto-generated `contracts/Lock.sol` and `test/Lock.ts`. Then open `hardhat.config.ts` and replace its contents:

```typescript
// contracts/hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arcTestnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
```

Create `contracts/.env`:
```
DEPLOYER_PRIVATE_KEY=your_metamask_testnet_private_key_here
```

### Step 2.3 — Write the USDCTreasury contract

Create `contracts/contracts/USDCTreasury.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title USDCTreasury
 * @notice USDC treasury with scheduled and recurring payments on Arc.
 * @dev Deployed on Arc Testnet. USDC address: 0x3600000000000000000000000000000000000000
 */
contract USDCTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SCHEDULER_ROLE = keccak256("SCHEDULER_ROLE");

    IERC20 public immutable usdc;

    mapping(address => uint256) public userBalances;
    mapping(address => bool) public allowlisted;

    struct Payment {
        address owner;
        address recipient;
        uint256 amount;
        uint64  frequency;
        uint64  nextExecTime;
        bool    active;
        bool    requiresApproval;
    }

    mapping(uint256 => Payment) public payments;
    uint256 public nextPaymentId;

    uint256 public maxSingleTx = 10_000 * 1e6;
    uint256 public minBalance  = 100 * 1e6;
    bool    public paused;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PaymentScheduled(uint256 indexed paymentId, address indexed owner, address indexed recipient, uint256 amount, uint64 frequency);
    event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy);
    event PaymentCancelled(uint256 indexed paymentId);
    event AllowlistUpdated(address indexed recipient, bool status);
    event EmergencyPause(bool paused);

    modifier whenNotPaused() {
        require(!paused, "Treasury: paused");
        _;
    }

    constructor(address _usdc, address _admin) {
        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SCHEDULER_ROLE, _admin);
    }

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Treasury: zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        userBalances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        require(userBalances[msg.sender] >= amount, "Treasury: insufficient balance");
        uint256 contractBalance = usdc.balanceOf(address(this));
        require(contractBalance - amount >= minBalance, "Treasury: would breach minimum");
        userBalances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function schedulePayment(
        address recipient,
        uint256 amount,
        uint64  frequency,
        uint64  delaySeconds
    ) external whenNotPaused returns (uint256 paymentId) {
        require(allowlisted[recipient], "Treasury: recipient not allowlisted");
        require(amount > 0 && amount <= maxSingleTx, "Treasury: invalid amount");
        require(userBalances[msg.sender] >= amount, "Treasury: insufficient balance");

        paymentId = nextPaymentId++;
        payments[paymentId] = Payment({
            owner:            msg.sender,
            recipient:        recipient,
            amount:           amount,
            frequency:        frequency,
            nextExecTime:     uint64(block.timestamp) + delaySeconds,
            active:           true,
            requiresApproval: amount >= (maxSingleTx / 2)
        });

        emit PaymentScheduled(paymentId, msg.sender, recipient, amount, frequency);
    }

    function executePayment(uint256 paymentId) external whenNotPaused nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.active, "Treasury: payment not active");
        require(block.timestamp >= p.nextExecTime, "Treasury: too early");
        require(allowlisted[p.recipient], "Treasury: recipient removed from allowlist");
        require(
            hasRole(SCHEDULER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Treasury: unauthorized"
        );
        require(userBalances[p.owner] >= p.amount, "Treasury: owner insufficient balance");

        userBalances[p.owner] -= p.amount;

        if (p.frequency == 0) {
            p.active = false;
        } else {
            p.nextExecTime = uint64(block.timestamp) + p.frequency;
        }

        usdc.safeTransfer(p.recipient, p.amount);

        emit PaymentExecuted(paymentId, p.recipient, p.amount, msg.sender);
    }

    function cancelPayment(uint256 paymentId) external {
        Payment storage p = payments[paymentId];
        require(p.owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Treasury: unauthorized");
        p.active = false;
        emit PaymentCancelled(paymentId);
    }

    function setAllowlist(address recipient, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlisted[recipient] = status;
        emit AllowlistUpdated(recipient, status);
    }

    function setAllowlistBatch(address[] calldata recipients, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < recipients.length; i++) {
            allowlisted[recipients[i]] = status;
            emit AllowlistUpdated(recipients[i], status);
        }
    }

    function setMaxSingleTx(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxSingleTx = newMax;
    }

    function setMinBalance(uint256 newMin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minBalance = newMin;
    }

    function setPaused(bool _paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function getTotalBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function isDue(uint256 paymentId) external view returns (bool) {
        Payment memory p = payments[paymentId];
        return p.active && block.timestamp >= p.nextExecTime;
    }
}
```

### Step 2.4 — Write the deployment script

Create `contracts/scripts/deploy.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const USDC_ARC_TESTNET = "0x3600000000000000000000000000000000000000";

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 18), "USDC");

  const Treasury = await ethers.getContractFactory("USDCTreasury");
  const treasury = await Treasury.deploy(USDC_ARC_TESTNET, deployer.address);
  await treasury.waitForDeployment();

  const address = await treasury.getAddress();
  console.log("USDCTreasury deployed at:", address);
  console.log("Add this to your .env: TREASURY_CONTRACT_ADDRESS=" + address);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Step 2.5 — Write a test

Create `contracts/test/USDCTreasury.test.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("USDCTreasury", () => {
  it("deploys and sets roles correctly", async () => {
    const [admin] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const ADMIN_ROLE = ethers.ZeroHash;
    expect(await treasury.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    expect(await treasury.paused()).to.be.false;
  });

  it("deposits and withdraws correctly", async () => {
    const [admin, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const depositAmount = 500n * 1_000_000n;

    await usdc.connect(admin).mint(user.address, depositAmount);
    await usdc.connect(user).approve(await treasury.getAddress(), depositAmount);

    await treasury.connect(user).deposit(depositAmount);
    expect(await treasury.userBalances(user.address)).to.equal(depositAmount);
  });
});
```

Create `contracts/contracts/MockERC20.sol` for tests:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;
    constructor(string memory name, string memory symbol, uint8 dec) ERC20(name, symbol) {
        _decimals = dec;
    }
    function decimals() public view override returns (uint8) { return _decimals; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
```

### Step 2.6 — Compile, test, deploy

```bash
# From the contracts/ directory:
npx hardhat compile
npx hardhat test

# Deploy to Arc Testnet:
npx hardhat run scripts/deploy.ts --network arcTestnet
```

You'll see the contract address. **Save it — you need it for all the next steps.**

---

## Part 3 — Backend Scheduler (TypeScript / Node.js)

### Step 3.1 — Set up the backend

```bash
# From project root:
mkdir backend
cd backend
npm init -y
npm pkg set type=module
npm install viem @circle-fin/developer-controlled-wallets node-cron dotenv
npm install --save-dev tsx typescript @types/node
```

Create `backend/.env`:
```
# Arc
ARC_RPC_URL=https://rpc.testnet.arc.network
TREASURY_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS

# Circle
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
DEPLOYER_WALLET_ID=your_circle_wallet_id
DEPLOYER_WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS
```

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"]
  }
}
```

### Step 3.2 — Treasury ABI helper

Create `backend/src/abi.ts`:

```typescript
// Minimal ABI for USDCTreasury — matches your deployed contract
export const TREASURY_ABI = [
  {
    name: "userBalances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTotalBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getPayment",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "owner", type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "frequency", type: "uint64" },
        { name: "nextExecTime", type: "uint64" },
        { name: "active", type: "bool" },
        { name: "requiresApproval", type: "bool" },
      ],
    }],
  },
  {
    name: "nextPaymentId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "executePayment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "PaymentExecuted",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "executedBy", type: "address", indexed: false },
    ],
  },
  {
    name: "PaymentScheduled",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "frequency", type: "uint64", indexed: false },
    ],
  },
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
```

### Step 3.3 — Arc client helper

Create `backend/src/arcClient.ts`:

```typescript
import { createPublicClient, http, defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"),
});
```

### Step 3.4 — Circle wallet helper

Create `backend/src/circleClient.ts`:

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

export async function waitForTx(txId: string, label = "tx"): Promise<string> {
  const terminalStates = new Set(["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"]);
  process.stdout.write(`  Waiting for ${label}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data } = await circleClient.getTransaction({ id: txId });
    const state = data?.transaction?.state;
    process.stdout.write(".");

    if (state && terminalStates.has(state)) {
      console.log(` → ${state}`);
      if (state === "FAILED" || state === "DENIED") throw new Error(`${label} failed: ${state}`);
      return data?.transaction?.txHash ?? "";
    }
  }
  throw new Error(`${label} timed out`);
}
```

### Step 3.5 — Scheduler (the bot that executes due payments)

Create `backend/src/scheduler/index.ts`:

```typescript
import cron from "node-cron";
import { publicClient } from "../arcClient.js";
import { circleClient, waitForTx } from "../circleClient.js";
import { TREASURY_ABI } from "../abi.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;
const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function checkAndExecuteDuePayments() {
  try {
    const nextId = await publicClient.readContract({
      address: TREASURY_ADDRESS,
      abi: TREASURY_ABI,
      functionName: "nextPaymentId",
    });

    console.log(`[Scheduler] Checking ${nextId} payments...`);

    for (let i = 0n; i < nextId; i++) {
      const due = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "isDue",
        args: [i],
      });

      if (!due) continue;

      const payment = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getPayment",
        args: [i],
      });

      if (payment.requiresApproval) {
        console.log(`[Scheduler] Payment ${i} requires approval — skipping for human review`);
        continue;
      }

      console.log(`[Scheduler] Executing payment ${i} → ${payment.recipient} for ${Number(payment.amount) / 1e6} USDC`);

      try {
        const tx = await circleClient.createContractExecutionTransaction({
          walletId: SCHEDULER_WALLET_ID,
          contractAddress: TREASURY_ADDRESS,
          abiFunctionSignature: "executePayment(uint256)",
          abiParameters: [i.toString()],
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });

        const txId = tx.data?.id;
        if (!txId) throw new Error("No transaction ID");

        const txHash = await waitForTx(txId, `payment-${i}`);
        console.log(`[Scheduler] Payment ${i} executed: https://testnet.arcscan.app/tx/${txHash}`);
      } catch (err) {
        console.error(`[Scheduler] Payment ${i} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}

async function watchContractEvents() {
  console.log("[Watcher] Listening for contract events...");

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "PaymentScheduled",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(`[Watcher] New payment scheduled: id=${log.args.paymentId} recipient=${log.args.recipient} amount=${Number(log.args.amount!) / 1e6} USDC`);
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "Deposited",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(`[Watcher] Deposit: user=${log.args.user} amount=${Number(log.args.amount!) / 1e6} USDC`);
      }
    },
  });
}

async function main() {
  console.log("Treasury Scheduler starting...");
  console.log("   Contract:", TREASURY_ADDRESS);

  await watchContractEvents();
  await checkAndExecuteDuePayments();

  cron.schedule("*/5 * * * *", () => {
    console.log(`\n[${new Date().toISOString()}] Cron tick`);
    checkAndExecuteDuePayments();
  });

  console.log("Cron scheduled: every 5 minutes");
}

main().catch(console.error);
```

Add to `backend/package.json` scripts:
```json
{
  "scripts": {
    "scheduler": "tsx --env-file=.env src/scheduler/index.ts"
  }
}
```

Test the scheduler runs:
```bash
cd backend
npm run scheduler
```

---

## Part 4 — Allowlist a recipient

Recipients must be allowlisted before they can receive payments. There's a script for that.

Create `backend/scripts/setup-allowlist.ts`:

```typescript
import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  const recipient = process.argv[2];
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    console.error("Usage: tsx scripts/setup-allowlist.ts <recipient-address>");
    process.exit(1);
  }

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setAllowlist(address,bool)",
    abiParameters: [recipient, "true"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "allowlist");
  console.log(`Allowlisted: https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
```

Run it:
```bash
cd backend
npx tsx --env-file=.env scripts/setup-allowlist.ts 0xRECIPIENT_ADDRESS
```

---

## Part 5 — Frontend Dashboard (React + Vite + Viem)

### Step 5.1 — Set up the React app

```bash
cd ..   # back to project root
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install viem @tanstack/react-query
```

### Step 5.2 — Configure Vite for Arc

Create `frontend/.env`:
```
VITE_TREASURY_ADDRESS=0xYOUR_CONTRACT_ADDRESS
VITE_ARC_RPC=https://rpc.testnet.arc.network
```

### Step 5.3 — Arc client for the browser

Create `frontend/src/lib/arc.ts`:

```typescript
import { createPublicClient, http, defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS as `0x${string}`;
```

### Step 5.4 — Treasury ABI for frontend

Create `frontend/src/lib/abi.ts` — same content as `backend/src/abi.ts` above (copy it).

### Step 5.5 — Treasury data hook

Create `frontend/src/hooks/useTreasury.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { publicClient, TREASURY_ADDRESS } from "../lib/arc";
import { TREASURY_ABI } from "../lib/abi";

export function useTreasuryBalance() {
  return useQuery({
    queryKey: ["treasuryBalance"],
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getTotalBalance",
      });
      return Number(raw) / 1e6;
    },
    refetchInterval: 15_000,
  });
}

export function usePayments(count: number = 10) {
  return useQuery({
    queryKey: ["payments", count],
    queryFn: async () => {
      const nextId = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "nextPaymentId",
      });

      const payments = [];
      const limit = Math.min(Number(nextId), count);

      for (let i = 0; i < limit; i++) {
        const p = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "getPayment",
          args: [BigInt(i)],
        });
        const due = await publicClient.readContract({
          address: TREASURY_ADDRESS,
          abi: TREASURY_ABI,
          functionName: "isDue",
          args: [BigInt(i)],
        });
        payments.push({ id: i, ...p, isDue: due });
      }
      return payments;
    },
    refetchInterval: 30_000,
  });
}

export function useRecentEvents() {
  return useQuery({
    queryKey: ["recentEvents"],
    queryFn: async () => {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;

      const logs = await publicClient.getLogs({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        eventName: "PaymentExecuted",
        fromBlock,
        toBlock: "latest",
      });

      return logs.map(log => ({
        paymentId: log.args.paymentId?.toString(),
        recipient: log.args.recipient,
        amount: Number(log.args.amount ?? 0n) / 1e6,
        executedBy: log.args.executedBy,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber?.toString(),
      }));
    },
    refetchInterval: 30_000,
  });
}
```

### Step 5.6 — Dashboard component

Replace `frontend/src/App.tsx` with a single-card dashboard showing the total balance, scheduled payments table, and recent executions list. (See `frontend/src/App.tsx` in this repo — that's the canonical version.)

### Step 5.7 — Run the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Part 6 — End-to-End Test

Run both systems in separate VSCode terminals:

**Terminal 1 — Scheduler:**
```bash
cd backend && npm run scheduler
```

**Terminal 2 — Frontend:**
```bash
cd frontend && npm run dev
```

### Test flow

1. **Allowlist a recipient** (Part 4 script).

2. **Deposit USDC** — call via Circle SDK or a script:
```bash
npx tsx --env-file=.env scripts/deposit-test.ts
```

3. **Schedule a payment** — `backend/scripts/schedule-payment.ts`:
```typescript
import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function main() {
  const recipient = "0xYOUR_ALLOWLISTED_RECIPIENT_ADDRESS";
  const amountUSDC = 10;
  const amountRaw = (amountUSDC * 1_000_000).toString();
  const frequency = "0";
  const delaySeconds = "30";

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY as `0x${string}`,
    abiFunctionSignature: "schedulePayment(address,uint256,uint64,uint64)",
    abiParameters: [recipient, amountRaw, frequency, delaySeconds],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "schedule payment");
  console.log("Payment scheduled:", `https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
```

4. **Watch** the scheduler pick it up in 30 seconds and execute it.
5. **See it appear** in the dashboard's Recent Executions.

---

## Part 7 — Quick Reference

### Contract addresses (Arc Testnet)
```
USDC:              0x3600000000000000000000000000000000000000
Chain ID:          5042002
RPC:               https://rpc.testnet.arc.network
Explorer:          https://testnet.arcscan.app
USDC faucet:       https://faucet.circle.com
```

### USDC decimals — critical!
```
ERC-20 interface:  6 decimals  → 1 USDC = 1_000_000
Native balance:    18 decimals → always use ERC-20 interface for transfers
```

### Kill switch
```bash
# Pause the contract (emergency):
# Call setPaused(true) via the admin wallet — see backend/scripts/ for templates.
```

---

## Common errors and fixes

**"Treasury: recipient not allowlisted"** → Run `setup-allowlist.ts` for the recipient.

**Circle API 401** → Check `CIRCLE_API_KEY` in `.env` is correct. Keys expire — regenerate in console.

**"insufficient funds for gas"** → Your wallet needs USDC on Arc Testnet. Use https://faucet.circle.com.

**`viem` chain ID mismatch** → Arc Testnet is `5042002`, not `5042`. Double-check in `arcClient.ts`.
