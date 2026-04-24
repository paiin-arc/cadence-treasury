# AI-Powered USDC Treasury on Arc — Complete Build Guide
> Build this with your bare hands in VSCode, step by step.

---

## What you'll build

```
usdc-treasury/
├── contracts/          ← Solidity smart contracts (Hardhat)
├── backend/            ← Node.js: scheduler + AI agents
│   ├── agents/         ← Planner, Risk, Executor agents (Python)
│   └── scheduler/      ← Cron + event watcher (TypeScript)
├── frontend/           ← React dashboard (Vite + Viem)
└── scripts/            ← Deployment & setup scripts
```

---

## Prerequisites — install these first

Open a terminal in VSCode and verify each one:

```bash
node --version      # Need v22+
python3 --version   # Need 3.11+
git --version
```

Install if missing:
- **Node.js v22**: https://nodejs.org (pick LTS)
- **Python 3.11+**: https://python.org/downloads
- **VSCode Extensions**: Install "Solidity" by Nomicfoundation + "Pylance"

---

## Accounts you need — get these before writing any code

### 1. Circle Developer Console
Go to https://console.circle.com → Sign up → Create an API key (Standard Key).

Also register your Entity Secret:
- In the Console: go to "Entity Secret" → follow the wizard
- This gives you a `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`

### 2. OpenGradient wallet ($OPG tokens)
- Install MetaMask: https://metamask.io
- Add Base Sepolia network to MetaMask:
  - Network name: Base Sepolia
  - RPC URL: https://sepolia.base.org
  - Chain ID: 84532
  - Currency: ETH
- Get Base Sepolia ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Get $OPG testnet tokens from: https://faucet.opengradient.ai
- Export your MetaMask private key: MetaMask → Account → Export Private Key
  ⚠️ Use a **dedicated testnet wallet**, never your real wallet

### 3. Arc Testnet USDC
- Go to: https://faucet.circle.com
- Select "Arc Testnet" and request USDC + native tokens

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
__pycache__/
*.pyc
.venv/
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
 * @notice USDC treasury with recurring payments and AI agent integration
 * @dev Deployed on Arc Testnet. USDC address: 0x3600000000000000000000000000000000000000
 */
contract USDCTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Roles ──────────────────────────────────────────────────────────────
    bytes32 public constant AI_EXECUTOR_ROLE = keccak256("AI_EXECUTOR_ROLE");
    bytes32 public constant SCHEDULER_ROLE   = keccak256("SCHEDULER_ROLE");

    // ── State ──────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;

    // User balances (6 decimals — ERC-20 USDC interface)
    mapping(address => uint256) public userBalances;

    // Allowlisted recipients (only these can receive payments)
    mapping(address => bool) public allowlisted;

    // Payment schedule
    struct Payment {
        address owner;
        address recipient;
        uint256 amount;       // in USDC units (6 decimals)
        uint64  frequency;    // seconds between payments; 0 = one-off
        uint64  nextExecTime; // unix timestamp
        bool    active;
        bool    requiresApproval; // if true, needs human sign-off
    }

    mapping(uint256 => Payment) public payments;
    uint256 public nextPaymentId;

    // Safety limits
    uint256 public maxSingleTx    = 10_000 * 1e6;  // 10,000 USDC
    uint256 public aiCapBps       = 500;            // 5% of balance
    uint256 public minBalance     = 100 * 1e6;      // 100 USDC minimum
    bool    public paused;

    // ── Events ────────────────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PaymentScheduled(uint256 indexed paymentId, address indexed owner, address indexed recipient, uint256 amount, uint64 frequency);
    event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy);
    event PaymentCancelled(uint256 indexed paymentId);
    event AllowlistUpdated(address indexed recipient, bool status);
    event AiCapUpdated(uint256 newCapBps);
    event EmergencyPause(bool paused);
    event AuditLog(uint256 indexed paymentId, string ogProofHash, address executedBy);

    // ── Modifiers ─────────────────────────────────────────────────────────
    modifier whenNotPaused() {
        require(!paused, "Treasury: paused");
        _;
    }

    modifier withinAiCap(uint256 amount) {
        uint256 totalBalance = usdc.balanceOf(address(this));
        uint256 cap = (totalBalance * aiCapBps) / 10_000;
        require(amount <= cap, "Treasury: exceeds AI cap");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────
    constructor(address _usdc, address _admin) {
        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SCHEDULER_ROLE, _admin);
    }

    // ── Core Vault ────────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the treasury
     * @dev User must approve this contract first: usdc.approve(address(this), amount)
     */
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Treasury: zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        userBalances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the treasury
     */
    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        require(userBalances[msg.sender] >= amount, "Treasury: insufficient balance");
        uint256 contractBalance = usdc.balanceOf(address(this));
        require(contractBalance - amount >= minBalance, "Treasury: would breach minimum");
        userBalances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ── Payment Engine ────────────────────────────────────────────────────

    /**
     * @notice Schedule a recurring or one-off payment
     * @param recipient   Must be on the allowlist
     * @param amount      In USDC (6 decimals). E.g., 100 USDC = 100_000_000
     * @param frequency   Seconds between payments. 0 = one-off
     * @param delaySeconds When to first execute (seconds from now)
     */
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
            requiresApproval: amount >= (maxSingleTx / 2) // flag large payments
        });

        emit PaymentScheduled(paymentId, msg.sender, recipient, amount, frequency);
    }

    /**
     * @notice Execute a scheduled payment (called by scheduler bot or AI executor)
     * @param paymentId  The payment to execute
     * @param ogProofHash OpenGradient proof hash for audit trail (empty string if human-triggered)
     */
    function executePayment(
        uint256 paymentId,
        string calldata ogProofHash
    ) external whenNotPaused nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.active, "Treasury: payment not active");
        require(block.timestamp >= p.nextExecTime, "Treasury: too early");
        require(allowlisted[p.recipient], "Treasury: recipient removed from allowlist");

        // AI executor has additional cap restriction
        if (hasRole(AI_EXECUTOR_ROLE, msg.sender)) {
            uint256 totalBalance = usdc.balanceOf(address(this));
            uint256 cap = (totalBalance * aiCapBps) / 10_000;
            require(p.amount <= cap, "Treasury: AI cap exceeded");
        } else {
            require(
                hasRole(SCHEDULER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
                "Treasury: unauthorized"
            );
        }

        require(userBalances[p.owner] >= p.amount, "Treasury: owner insufficient balance");

        // Update state before transfer (reentrancy protection)
        userBalances[p.owner] -= p.amount;

        if (p.frequency == 0) {
            p.active = false; // one-off: deactivate
        } else {
            p.nextExecTime = uint64(block.timestamp) + p.frequency;
        }

        usdc.safeTransfer(p.recipient, p.amount);

        emit PaymentExecuted(paymentId, p.recipient, p.amount, msg.sender);

        if (bytes(ogProofHash).length > 0) {
            emit AuditLog(paymentId, ogProofHash, msg.sender);
        }
    }

    /**
     * @notice Cancel a scheduled payment
     */
    function cancelPayment(uint256 paymentId) external {
        Payment storage p = payments[paymentId];
        require(p.owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Treasury: unauthorized");
        p.active = false;
        emit PaymentCancelled(paymentId);
    }

    // ── Admin Functions ───────────────────────────────────────────────────

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

    function setAiCap(uint256 newCapBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCapBps <= 1000, "Treasury: cap max 10%"); // hard ceiling
        aiCapBps = newCapBps;
        emit AiCapUpdated(newCapBps);
    }

    function setMaxSingleTx(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxSingleTx = newMax;
    }

    function setMinBalance(uint256 newMin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minBalance = newMin;
    }

    /// @notice Emergency kill switch — stops all payments immediately
    function setPaused(bool _paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    /// @notice Revoke AI executor role instantly
    function revokeAiRole(address aiExecutor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(AI_EXECUTOR_ROLE, aiExecutor);
    }

    // ── View Functions ────────────────────────────────────────────────────

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function getTotalBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getAiCap() external view returns (uint256) {
        return (usdc.balanceOf(address(this)) * aiCapBps) / 10_000;
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
  console.log("✅ USDCTreasury deployed at:", address);
  console.log("📋 Add this to your .env: TREASURY_CONTRACT_ADDRESS=" + address);
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
    const [admin, user] = await ethers.getSigners();

    // Deploy a mock USDC for local testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const ADMIN_ROLE = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE
    expect(await treasury.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    expect(await treasury.paused()).to.be.false;
    expect(await treasury.aiCapBps()).to.equal(500n);
  });

  it("deposits and withdraws correctly", async () => {
    const [admin, user] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    const Treasury = await ethers.getContractFactory("USDCTreasury");
    const treasury = await Treasury.deploy(await usdc.getAddress(), admin.address);

    const depositAmount = 500n * 1_000_000n; // 500 USDC

    // Mint USDC to user
    await usdc.connect(admin).mint(user.address, depositAmount);

    // Approve treasury
    await usdc.connect(user).approve(await treasury.getAddress(), depositAmount);

    // Deposit
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

# OpenGradient (for agents — set in Part 4)
OG_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
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
  // View functions
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
    name: "getAiCap",
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
  // Write functions
  {
    name: "executePayment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "uint256" },
      { name: "ogProofHash", type: "string" },
    ],
    outputs: [],
  },
  // Events
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
  {
    name: "AuditLog",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "ogProofHash", type: "string", indexed: false },
      { name: "executedBy", type: "address", indexed: false },
    ],
  },
] as const;
```

### Step 3.3 — Arc client helper

Create `backend/src/arcClient.ts`:

```typescript
import { createPublicClient, http, defineChain } from "viem";

// Arc Testnet chain definition
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

// Poll a tx until it completes or fails
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
import { publicClient, arcTestnet } from "../arcClient.js";
import { circleClient, waitForTx } from "../circleClient.js";
import { TREASURY_ABI } from "../abi.js";
import "dotenv/config";

const TREASURY_ADDRESS = process.env.TREASURY_CONTRACT_ADDRESS as `0x${string}`;
const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function checkAndExecuteDuePayments() {
  try {
    // Get total number of payments
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

      // Skip if it requires human approval — those go to the AI suggestion queue
      if (payment.requiresApproval) {
        console.log(`[Scheduler] Payment ${i} requires approval — skipping for human review`);
        continue;
      }

      console.log(`[Scheduler] Executing payment ${i} → ${payment.recipient} for ${Number(payment.amount) / 1e6} USDC`);

      try {
        const tx = await circleClient.createContractExecutionTransaction({
          walletId: SCHEDULER_WALLET_ID,
          contractAddress: TREASURY_ADDRESS,
          abiFunctionSignature: "executePayment(uint256,string)",
          abiParameters: [i.toString(), ""], // empty ogProofHash = human-triggered
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });

        const txId = tx.data?.id;
        if (!txId) throw new Error("No transaction ID");

        const txHash = await waitForTx(txId, `payment-${i}`);
        console.log(`[Scheduler] ✅ Payment ${i} executed: https://testnet.arcscan.app/tx/${txHash}`);
      } catch (err) {
        console.error(`[Scheduler] ❌ Payment ${i} failed:`, err);
        // TODO: add to retry queue / dead-letter log
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
        console.log(`[Watcher] 📅 New payment scheduled: id=${log.args.paymentId} recipient=${log.args.recipient} amount=${Number(log.args.amount!) / 1e6} USDC`);
      }
    },
  });

  publicClient.watchContractEvent({
    address: TREASURY_ADDRESS,
    abi: TREASURY_ABI,
    eventName: "Deposited",
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(`[Watcher] 💰 Deposit: user=${log.args.user} amount=${Number(log.args.amount!) / 1e6} USDC`);
      }
    },
  });
}

async function main() {
  console.log("🚀 Treasury Scheduler starting...");
  console.log("   Contract:", TREASURY_ADDRESS);

  // Watch events in real time
  await watchContractEvents();

  // Run immediately on startup
  await checkAndExecuteDuePayments();

  // Then run every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    console.log(`\n[${new Date().toISOString()}] Cron tick`);
    checkAndExecuteDuePayments();
  });

  console.log("⏰ Cron scheduled: every 5 minutes");
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

## Part 4 — AI Agents (Python + OpenGradient)

### Step 4.1 — Set up Python environment

```bash
# From project root:
mkdir -p backend/agents
cd backend/agents
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install opengradient viem requests python-dotenv
```

Create `backend/agents/.env` (same values as backend/.env plus OG):
```
TREASURY_CONTRACT_ADDRESS=0xYOUR_CONTRACT
OG_PRIVATE_KEY=0xYOUR_TESTNET_METAMASK_PRIVATE_KEY
ARC_RPC_URL=https://rpc.testnet.arc.network
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
AI_EXECUTOR_WALLET_ID=your_circle_ai_executor_wallet_id
```

### Step 4.2 — Treasury data fetcher

Create `backend/agents/treasury_reader.py`:

```python
"""Reads treasury state from Arc using JSON-RPC directly."""
import os
import json
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
    # Function selector for getTotalBalance()
    sig = "0x" + "c9af9b8f"  # keccak256("getTotalBalance()")[0:4] in hex
    # Use eth_call
    result = _eth_call(TREASURY, sig)
    raw = int(result, 16)
    return raw / 10**USDC_DECIMALS

def get_ai_cap() -> float:
    """Get current AI execution cap in USDC."""
    sig = "0x" + "4c3d3c5f"  # keccak256("getAiCap()")[0:4]
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
            # PaymentExecuted(uint256,address,uint256,address) topic
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
            # isDue(uint256)
            is_due_sig = "0x" + "4a3c06ba"
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
```

### Step 4.3 — Planner Agent

Create `backend/agents/planner_agent.py`:

```python
"""
Planner Agent — analyzes treasury state and proposes actions.
Uses OpenGradient TEE LLM with BATCH_HASHED settlement.
"""
import asyncio
import json
import os
import opengradient as og
from dotenv import load_dotenv
from treasury_reader import get_total_balance, get_ai_cap, get_recent_events, get_scheduled_payments

load_dotenv()

llm = og.LLM(private_key=os.environ["OG_PRIVATE_KEY"])

# One-time: approve $OPG for inference payments
# Run this once manually, comment out after:
# llm.ensure_opg_approval(opg_amount=10.0)

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
        # Extract JSON from response if wrapped in markdown
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        proposal = json.loads(match.group()) if match else {"action_type": "no_action", "rationale": "Parse error"}

    # Attach proof
    proposal["og_payment_hash"] = result.payment_hash
    proposal["balance_at_analysis"] = balance
    proposal["ai_cap_at_analysis"] = ai_cap

    print(f"[Planner] Proposal: {json.dumps(proposal, indent=2)}")
    print(f"[Planner] OG proof: {result.payment_hash}")

    return proposal


if __name__ == "__main__":
    proposal = asyncio.run(run_planner())
    print("\nFinal proposal:", json.dumps(proposal, indent=2))
```

### Step 4.4 — Risk Agent

Create `backend/agents/risk_agent.py`:

```python
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

# Hardcoded allowlist for validation (in production, read from contract)
ALLOWLISTED_RECIPIENTS: set[str] = set()  # populate from your contract

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
                    "description": "True if proposal passes all safety checks"
                },
                "risk_score": {
                    "type": "number",
                    "description": "Risk score 0.0 (safe) to 1.0 (dangerous)"
                },
                "rejection_reason": {
                    "type": "string",
                    "description": "Why rejected (empty if approved)"
                },
                "warnings": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Non-blocking concerns"
                }
            },
            "required": ["approved", "risk_score"]
        }
    }
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
        x402_settlement_mode=og.x402SettlementMode.INDIVIDUAL_FULL,  # full audit trail
    )

    # Extract tool call result
    tool_calls = result.chat_output.get("tool_calls", [])
    if tool_calls:
        decision = json.loads(tool_calls[0]["function"]["arguments"])
    else:
        decision = {"approved": False, "risk_score": 1.0, "rejection_reason": "Risk agent error: no tool call"}

    decision["og_proof_hash"] = result.payment_hash
    decision["proposal_hash"] = proposal.get("og_payment_hash", "")

    print(f"[Risk] Decision: approved={decision['approved']} risk={decision.get('risk_score', '?')}")
    print(f"[Risk] OG proof (INDIVIDUAL_FULL): {result.payment_hash}")

    return decision


if __name__ == "__main__":
    # Test with a dummy proposal
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
```

### Step 4.5 — Executor Agent

Create `backend/agents/executor_agent.py`:

```python
"""
Executor Agent — executes approved proposals by calling the treasury contract.
Only runs when Risk Agent approved AND risk_score < 0.4.
"""
import os
import json
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
    import time
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
    Only proceeds if:
    - approved == True
    - risk_score < 0.4
    - action_type is an executable action (not no_action)
    """
    if not risk_decision.get("approved"):
        reason = risk_decision.get("rejection_reason", "Unknown")
        print(f"[Executor] ❌ Skipping — rejected by Risk Agent: {reason}")
        return {"executed": False, "reason": reason}

    if risk_decision.get("risk_score", 1.0) >= 0.4:
        score = risk_decision["risk_score"]
        print(f"[Executor] ❌ Skipping — risk score too high: {score}")
        return {"executed": False, "reason": f"Risk score {score} >= 0.4 threshold"}

    action = proposal.get("action_type")
    payment_id = proposal.get("target_payment_id")

    if action == "no_action" or payment_id is None:
        print("[Executor] ℹ️ No action to execute")
        return {"executed": False, "reason": "No action required"}

    # Combine OG proof hashes from both agents for audit trail
    combined_proof = f"planner:{proposal.get('og_payment_hash','')[:20]}|risk:{risk_decision.get('og_proof_hash','')[:20]}"

    print(f"[Executor] 🚀 Executing payment {payment_id} with proof: {combined_proof}")

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
        print(f"[Executor] ✅ Executed: {result['explorer']}")
        return result

    except Exception as e:
        print(f"[Executor] ❌ Failed: {e}")
        return {"executed": False, "reason": str(e)}


if __name__ == "__main__":
    # Test: this will fail if wallet doesn't have AI_EXECUTOR_ROLE
    print("[Executor] Executor agent ready — needs AI_EXECUTOR_ROLE on contract")
```

### Step 4.6 — Main pipeline runner

Create `backend/agents/run_pipeline.py`:

```python
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

    # Step 1: Planner proposes an action
    print("\n[Pipeline] Step 1: Running Planner Agent...")
    proposal = await run_planner()

    # Step 2: Risk validates
    print("\n[Pipeline] Step 2: Running Risk Agent...")
    risk_decision = await run_risk_agent(proposal)

    # Step 3: Executor acts (if approved)
    print("\n[Pipeline] Step 3: Running Executor Agent...")
    result = run_executor(proposal, risk_decision)

    # Log everything
    log_entry = {
        "timestamp": timestamp,
        "proposal": proposal,
        "risk_decision": risk_decision,
        "execution_result": result,
    }

    # Append to local audit log (in production, write to DB)
    with open("audit_log.jsonl", "a") as f:
        f.write(json.dumps(log_entry) + "\n")

    print(f"\n[Pipeline] ✅ Complete. Executed: {result.get('executed')}")
    return log_entry


if __name__ == "__main__":
    asyncio.run(run_pipeline())
```

Run the full pipeline:
```bash
cd backend/agents
source .venv/bin/activate
python run_pipeline.py
```

---

## Part 5 — Grant the AI Executor Role

Before Phase 4 (AI execution), you need to grant the Circle AI wallet the `AI_EXECUTOR_ROLE` on your contract.

### Step 5.1 — Create a second Circle wallet for the AI executor

Create `backend/scripts/setup-roles.ts`:

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import "dotenv/config";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function main() {
  // Create a separate wallet for the AI executor
  const walletSet = await circleClient.createWalletSet({ name: "AI Executor Wallets" });
  const wallets = await circleClient.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
    metadata: [{ refId: "ai-executor-treasury" }],
  });

  const aiWallet = wallets.data?.wallets?.[0];
  console.log("✅ AI Executor wallet created:");
  console.log("   Address:", aiWallet?.address);
  console.log("   Wallet ID:", aiWallet?.id);
  console.log("\nAdd to your .env:");
  console.log(`AI_EXECUTOR_WALLET_ID=${aiWallet?.id}`);
  console.log(`AI_EXECUTOR_WALLET_ADDRESS=${aiWallet?.address}`);
}

main().catch(console.error);
```

Run it:
```bash
cd backend
npx tsx --env-file=.env scripts/setup-roles.ts
```

### Step 5.2 — Grant roles on the contract

Create `backend/scripts/grant-roles.ts`:

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { ethers } from "ethers"; // npm install ethers
import "dotenv/config";

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function waitForTx(txId: string) {
  const terminal = new Set(["COMPLETE", "CONFIRMED", "FAILED"]);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await circleClient.getTransaction({ id: txId });
    if (data?.transaction?.state && terminal.has(data.transaction.state)) {
      return data.transaction.txHash;
    }
    process.stdout.write(".");
  }
}

async function main() {
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
  const AI_EXECUTOR_ADDRESS = process.env.AI_EXECUTOR_WALLET_ADDRESS!;
  const SCHEDULER_WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

  // Role hashes (keccak256 of role name)
  const AI_EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AI_EXECUTOR_ROLE"));
  const SCHEDULER_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("SCHEDULER_ROLE"));

  console.log("Granting AI_EXECUTOR_ROLE to:", AI_EXECUTOR_ADDRESS);

  // grantRole(bytes32 role, address account)
  const tx = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "grantRole(bytes32,address)",
    abiParameters: [AI_EXECUTOR_ROLE, AI_EXECUTOR_ADDRESS],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  process.stdout.write("Waiting");
  const txHash = await waitForTx(tx.data?.id!);
  console.log(`\n✅ AI_EXECUTOR_ROLE granted: https://testnet.arcscan.app/tx/${txHash}`);

  // Allowlist a test recipient
  const TEST_RECIPIENT = "0x000000000000000000000000000000000000dEaD"; // replace with real address
  const tx2 = await circleClient.createContractExecutionTransaction({
    walletId: SCHEDULER_WALLET_ID,
    contractAddress: TREASURY,
    abiFunctionSignature: "setAllowlist(address,bool)",
    abiParameters: [TEST_RECIPIENT, "true"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  process.stdout.write("Allowlisting");
  const txHash2 = await waitForTx(tx2.data?.id!);
  console.log(`\n✅ Recipient allowlisted: https://testnet.arcscan.app/tx/${txHash2}`);
}

main().catch(console.error);
```

```bash
npm install ethers
npx tsx --env-file=.env scripts/grant-roles.ts
```

---

## Part 6 — Frontend Dashboard (React + Vite + Viem)

### Step 6.1 — Set up the React app

```bash
cd ..   # back to project root
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install viem @tanstack/react-query
```

### Step 6.2 — Configure Vite for Arc

Create `frontend/.env`:
```
VITE_TREASURY_ADDRESS=0xYOUR_CONTRACT_ADDRESS
VITE_ARC_RPC=https://rpc.testnet.arc.network
```

### Step 6.3 — Arc client for the browser

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

### Step 6.4 — Treasury ABI for frontend

Create `frontend/src/lib/abi.ts` — same content as `backend/src/abi.ts` above (copy it).

### Step 6.5 — Treasury data hook

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
      return Number(raw) / 1e6; // Convert from 6-decimal USDC
    },
    refetchInterval: 15_000, // refresh every 15s
  });
}

export function useAiCap() {
  return useQuery({
    queryKey: ["aiCap"],
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: TREASURY_ADDRESS,
        abi: TREASURY_ABI,
        functionName: "getAiCap",
      });
      return Number(raw) / 1e6;
    },
    refetchInterval: 30_000,
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

### Step 6.6 — Dashboard component

Replace `frontend/src/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTreasuryBalance, useAiCap, usePayments, useRecentEvents } from "./hooks/useTreasury";
import { TREASURY_ADDRESS } from "./lib/arc";

const queryClient = new QueryClient();

function formatUSDC(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function Dashboard() {
  const { data: balance, isLoading: balLoading } = useTreasuryBalance();
  const { data: aiCap, isLoading: capLoading } = useAiCap();
  const { data: payments, isLoading: payLoading } = usePayments(10);
  const { data: events, isLoading: evtLoading } = useRecentEvents();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
        🏦 USDC Treasury Dashboard
      </h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 24 }}>
        Contract:{" "}
        <a
          href={`https://testnet.arcscan.app/address/${TREASURY_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#0066cc" }}
        >
          {formatAddress(TREASURY_ADDRESS)}
        </a>{" "}
        · Arc Testnet
      </p>

      {/* Balance Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Total Balance</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1a7f4b" }}>
            {balLoading ? "..." : formatUSDC(balance ?? 0)}
          </div>
          <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>USDC on Arc Testnet</div>
        </div>
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>AI Execution Cap (5%)</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c47a00" }}>
            {capLoading ? "..." : formatUSDC(aiCap ?? 0)}
          </div>
          <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>Max per AI-triggered payment</div>
        </div>
      </div>

      {/* Scheduled Payments */}
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Scheduled Payments</h2>
        {payLoading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : payments?.length === 0 ? (
          <p style={{ color: "#999" }}>No payments scheduled yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>ID</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Recipient</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Amount</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Frequency</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "6px 8px" }}>#{p.id}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>
                    <a
                      href={`https://testnet.arcscan.app/address/${p.recipient}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0066cc" }}
                    >
                      {formatAddress(p.recipient as string)}
                    </a>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {formatUSDC(Number(p.amount) / 1e6)}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {Number(p.frequency) === 0 ? "One-off" : `Every ${Number(p.frequency) / 3600}h`}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {!p.active ? (
                      <span style={{ color: "#999" }}>Completed</span>
                    ) : p.isDue ? (
                      <span style={{ color: "#cc0000", fontWeight: 600 }}>Due now</span>
                    ) : (
                      <span style={{ color: "#1a7f4b" }}>Scheduled</span>
                    )}
                    {p.requiresApproval && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: "#fff3cd", padding: "1px 4px", borderRadius: 3 }}>
                        Needs approval
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Executions */}
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Recent Executions</h2>
        {evtLoading ? (
          <p style={{ color: "#999" }}>Loading...</p>
        ) : events?.length === 0 ? (
          <p style={{ color: "#999" }}>No payments executed yet.</p>
        ) : (
          <div style={{ fontSize: 13 }}>
            {events?.slice(-5).reverse().map((e, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ color: "#1a7f4b", fontWeight: 600 }}>
                  {formatUSDC(e.amount)}
                </span>
                {" → "}
                <span style={{ fontFamily: "monospace" }}>{formatAddress(e.recipient as string)}</span>
                {" · "}
                <a
                  href={`https://testnet.arcscan.app/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#0066cc" }}
                >
                  tx
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ color: "#999", fontSize: 11, marginTop: 16, textAlign: "center" }}>
        Refreshes every 15 seconds · Arc Testnet · Chain ID 5042002
      </p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
```

### Step 6.7 — Run the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Part 7 — End-to-End Test

Run all three systems in separate VSCode terminals:

**Terminal 1 — Scheduler:**
```bash
cd backend && npm run scheduler
```

**Terminal 2 — AI Pipeline:**
```bash
cd backend/agents
source .venv/bin/activate
python run_pipeline.py
```

**Terminal 3 — Frontend:**
```bash
cd frontend && npm run dev
```

### Test flow

1. **Deposit USDC** — call via Circle SDK or a script:
```bash
# backend/scripts/deposit-test.ts
npx tsx --env-file=.env scripts/deposit-test.ts
```

2. **Schedule a payment** — add this script:

Create `backend/scripts/schedule-payment.ts`:
```typescript
import { circleClient, waitForTx } from "../src/circleClient.js";
import "dotenv/config";

const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS!;
const WALLET_ID = process.env.DEPLOYER_WALLET_ID!;

async function main() {
  const recipient = "0xYOUR_ALLOWLISTED_RECIPIENT_ADDRESS";
  const amountUSDC = 10; // 10 USDC
  const amountRaw = (amountUSDC * 1_000_000).toString(); // 6 decimals
  const frequency = "0"; // one-off
  const delaySeconds = "30"; // execute in 30 seconds

  const tx = await circleClient.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress: TREASURY as `0x${string}`,
    abiFunctionSignature: "schedulePayment(address,uint256,uint64,uint64)",
    abiParameters: [recipient, amountRaw, frequency, delaySeconds],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txHash = await waitForTx(tx.data?.id!, "schedule payment");
  console.log("✅ Payment scheduled:", `https://testnet.arcscan.app/tx/${txHash}`);
}

main().catch(console.error);
```

3. **Watch** the scheduler pick it up in 30 seconds and execute it.
4. **See it appear** in the dashboard's Recent Executions.
5. **Run the AI pipeline** — watch it analyze, validate, and (in Phase 4) execute.

---

## Part 8 — Quick Reference

### Contract addresses (Arc Testnet)
```
USDC:              0x3600000000000000000000000000000000000000
Chain ID:          5042002
RPC:               https://rpc.testnet.arc.network
Explorer:          https://testnet.arcscan.app
USDC faucet:       https://faucet.circle.com
OPG faucet:        https://faucet.opengradient.ai
OG explorer:       https://explorer.opengradient.ai
```

### USDC decimals — critical!
```
ERC-20 interface:  6 decimals  → 1 USDC = 1_000_000
Native balance:    18 decimals → always use ERC-20 interface for transfers
```

### Phase rollout
| Phase | What to enable | Command |
|---|---|---|
| 1 | Scheduler only | `npm run scheduler` |
| 2 | Add frontend | `npm run dev` |
| 3 | AI insights (no execution) | Comment out `run_executor()` in pipeline |
| 4 | AI execution | Grant `AI_EXECUTOR_ROLE`, run full pipeline |
| 5 | Raise AI cap | `setAiCap(1000)` = 10% max |

### Kill switches
```bash
# Pause everything (emergency):
npx tsx --env-file=.env scripts/pause.ts

# Revoke AI role:
npx tsx --env-file=.env scripts/revoke-ai.ts
```

---

## Common errors and fixes

**"Treasury: recipient not allowlisted"** → Run `grant-roles.ts` and call `setAllowlist(address, true)`.

**"Treasury: AI cap exceeded"** → AI-triggered payment exceeds 5%. Raise cap with `setAiCap(bps)` or lower payment amount.

**Circle API 401** → Check `CIRCLE_API_KEY` in `.env` is correct. Keys expire — regenerate in console.

**"insufficient funds for gas"** → Your wallet needs USDC on Arc Testnet. Use https://faucet.circle.com.

**OpenGradient `$OPG` approval error** → Run `llm.ensure_opg_approval(opg_amount=10.0)` once, then comment out.

**`viem` chain ID mismatch** → Arc Testnet is `5042002`, not `5042`. Double-check in `arcClient.ts`.
