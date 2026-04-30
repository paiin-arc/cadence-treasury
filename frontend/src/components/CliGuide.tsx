import { useState } from "react";

type Cmd = {
  name: string;
  desc: string;
  code: string;
  notes?: string;
};

const SETUP: Cmd[] = [
  {
    name: "1. Clone & install",
    desc: "Get the repo and install backend deps.",
    code: `git clone https://github.com/paiin-arc/cadence-treasury.git
cd cadence-treasury/backend
npm install`,
  },
  {
    name: "2. Configure .env",
    desc: "Create backend/.env from the template and fill in your Circle keys + treasury address.",
    code: `cp .env.example .env

# backend/.env
ARC_RPC_URL=https://rpc.testnet.arc.network
TREASURY_CONTRACT_ADDRESS=0xb4A668f7B45c2BBFB89bCb6853E72bFF464c8F44
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
DEPLOYER_WALLET_ID=...
DEPLOYER_WALLET_ADDRESS=0x...`,
  },
];

const WALLET_CMDS: Cmd[] = [
  {
    name: "create-wallet",
    desc: "Create a new Circle developer-controlled wallet on Arc Testnet. Prints the wallet ID + address.",
    code: `npx tsx --env-file=.env scripts/create-wallet.ts`,
    notes: "Save the wallet ID into .env as DEPLOYER_WALLET_ID.",
  },
  {
    name: "create-recipient",
    desc: "Spin up a second Circle wallet to use as a payment recipient.",
    code: `npx tsx --env-file=.env scripts/create-recipient.ts`,
  },
];

const TREASURY_CMDS: Cmd[] = [
  {
    name: "deposit",
    desc: "Approve + deposit USDC into your treasury balance in one script.",
    code: `npx tsx --env-file=.env scripts/deposit.ts 50`,
    notes: "Argument is amount in USDC (decimals handled).",
  },
  {
    name: "withdraw",
    desc: "Withdraw USDC from your treasury balance back to your wallet.",
    code: `npx tsx --env-file=.env scripts/withdraw.ts 10`,
  },
  {
    name: "schedule-payment",
    desc: "Queue a one-off or recurring payment to any address.",
    code: `# args: <recipient> <amount-usdc> <freq-seconds> <delay-seconds>
npx tsx --env-file=.env scripts/schedule-payment.ts \\
  0xRecipient... 5 0 60`,
    notes: "frequency=0 → one-off. delay is seconds until first execution.",
  },
  {
    name: "cancel-payment",
    desc: "Cancel a scheduled payment by its ID.",
    code: `npx tsx --env-file=.env scripts/cancel-payment.ts 3`,
  },
];

const ADMIN_CMDS: Cmd[] = [
  {
    name: "grant-admin",
    desc: "Grant DEFAULT_ADMIN_ROLE to another wallet (admin-only).",
    code: `npx tsx --env-file=.env scripts/grant-admin.ts 0xNewAdmin...`,
  },
  {
    name: "set-max-single-tx",
    desc: "Set the per-payment cap. Payments ≥ half this value get auto-flagged for review.",
    code: `npx tsx --env-file=.env scripts/set-max-single-tx.ts 1000`,
  },
  {
    name: "set-min-balance",
    desc: "Set the floor of contract-held USDC that must remain after any withdrawal.",
    code: `npx tsx --env-file=.env scripts/set-min-balance.ts 0`,
  },
  {
    name: "set-paused",
    desc: "Emergency pause / unpause the contract (admin-only).",
    code: `npx tsx --env-file=.env scripts/set-paused.ts true   # pause
npx tsx --env-file=.env scripts/set-paused.ts false  # unpause`,
  },
];

const SCHEDULER_CMDS: Cmd[] = [
  {
    name: "Run the scheduler bot",
    desc: "Start the cron + event watcher. Picks up due payments and executes them via Circle.",
    code: `npm run scheduler`,
    notes: "Or background it with the LaunchAgent under scripts/run-scheduler.sh.",
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="cli-code">
      <button className="cli-copy" onClick={handleCopy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Section({ title, anchor, cmds }: { title: string; anchor: string; cmds: Cmd[] }) {
  return (
    <div className="cli-section" id={anchor}>
      <h3>{title}</h3>
      {cmds.map((c) => (
        <div className="cli-cmd" key={c.name}>
          <div className="cli-cmd-name">{c.name}</div>
          <p className="cli-cmd-desc">{c.desc}</p>
          <CodeBlock code={c.code} />
          {c.notes && <p className="cli-cmd-notes">{c.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export default function CliGuide() {
  return (
    <div className="cli-guide" id="cli">
      <div className="cli-card">
        <div className="cli-header">
          <div>
            <span className="cli-eyebrow">Power user</span>
            <h2>Run Cadence from your terminal</h2>
            <p>
              Every dashboard action is also a one-line script. Use these to
              automate setup, scripted deposits, scheduled payouts, and
              admin controls without opening the UI.
            </p>
          </div>
          <a
            className="cli-github"
            href="https://github.com/paiin-arc/cadence-treasury"
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="16" height="16">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.15 1.17a10.9 10.9 0 0 1 5.74 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.73.12 3.02.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.25 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
            </svg>
            View source
          </a>
        </div>

        <div className="cli-toc">
          <a href="#cli-setup">Setup</a>
          <a href="#cli-wallets">Wallets</a>
          <a href="#cli-treasury">Treasury</a>
          <a href="#cli-admin">Admin</a>
          <a href="#cli-scheduler">Scheduler</a>
        </div>

        <Section title="Setup" anchor="cli-setup" cmds={SETUP} />
        <Section title="Wallets" anchor="cli-wallets" cmds={WALLET_CMDS} />
        <Section title="Treasury actions" anchor="cli-treasury" cmds={TREASURY_CMDS} />
        <Section title="Admin controls" anchor="cli-admin" cmds={ADMIN_CMDS} />
        <Section title="Run the scheduler" anchor="cli-scheduler" cmds={SCHEDULER_CMDS} />
      </div>
    </div>
  );
}
