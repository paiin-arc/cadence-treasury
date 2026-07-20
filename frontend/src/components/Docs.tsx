/**
 * Docs.tsx — animated explainer page for Cadence.
 * All animations are pure SVG <animate> / CSS keyframes (no libs).
 */

export default function Docs() {
  return (
    <div className="docs">
      {/* ============ HERO: The Cadence Loop ============ */}
      <section className="docs-card docs-hero">
        <div className="docs-hero-text">
          <span className="docs-eyebrow">how it works</span>
          <h2>One contract. One bot. Endless cadence.</h2>
          <p>
            You deposit USDC into the treasury, queue a payment with a recipient and a
            cadence, and the scheduler bot fires it on time — forever, until you cancel.
            Sub-second finality. USDC as gas. Every step auditable on ArcScan.
          </p>
        </div>

        <div className="docs-hero-graphic">
          <svg viewBox="0 0 520 360" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <radialGradient id="vaultGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ee5a3a" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#ee5a3a" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#ee5a3a" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="orbitStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ee5a3a" stopOpacity="0" />
                <stop offset="50%" stopColor="#ee5a3a" stopOpacity="1" />
                <stop offset="100%" stopColor="#ee5a3a" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Outer glow */}
            <circle cx="260" cy="180" r="170" fill="url(#vaultGlow)">
              <animate attributeName="r" values="160;180;160" dur="4s" repeatCount="indefinite" />
            </circle>

            {/* Orbit circles */}
            <circle cx="260" cy="180" r="140" fill="none" stroke="#3a2e22" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 5" />
            <circle cx="260" cy="180" r="90" fill="none" stroke="#3a2e22" strokeOpacity="0.18" strokeWidth="1" />

            {/* Center: USDC vault */}
            <circle cx="260" cy="180" r="56" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.5" />
            <text x="260" y="178" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="ui-monospace, monospace" fill="#1a1817">USDC</text>
            <text x="260" y="195" textAnchor="middle" fontSize="9" letterSpacing="2" fontFamily="ui-monospace, monospace" fill="#8b8175">TREASURY</text>

            {/* Four orbital nodes */}
            {[
              { x: 260, y: 40, label: "DEPOSIT" },
              { x: 400, y: 180, label: "SCHEDULE" },
              { x: 260, y: 320, label: "EXECUTE" },
              { x: 120, y: 180, label: "WITHDRAW" },
            ].map((n, i) => (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r="26" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.4" />
                <circle cx={n.x} cy={n.y} r="8" fill="#ee5a3a">
                  <animate
                    attributeName="opacity"
                    values="1;0.3;1"
                    dur="2s"
                    repeatCount="indefinite"
                    begin={`${i * 0.5}s`}
                  />
                </circle>
                <text
                  x={n.x}
                  y={n.y + 44}
                  textAnchor="middle"
                  fontSize="9.5"
                  letterSpacing="2"
                  fontFamily="ui-monospace, monospace"
                  fill="#1a1817"
                  fontWeight="600"
                >
                  {n.label}
                </text>
              </g>
            ))}

            {/* Travelling coin around the orbit */}
            <circle r="6" fill="#ee5a3a">
              <animateMotion
                dur="6s"
                repeatCount="indefinite"
                path="M 260 40 A 140 140 0 0 1 400 180 A 140 140 0 0 1 260 320 A 140 140 0 0 1 120 180 A 140 140 0 0 1 260 40"
              />
            </circle>
          </svg>
        </div>
      </section>

      {/* ============ FEATURE GRID ============ */}
      <div className="docs-grid">
        {/* Scheduler timeline */}
        <section className="docs-card">
          <span className="docs-eyebrow">scheduler bot</span>
          <h3>The bot ticks every minute</h3>
          <p>
            A Node-based cron reads the contract, picks the payments whose
            <code>nextExecTime</code> has passed, and calls <code>executePayment()</code> via
            Circle. Settled in seconds, on-chain forever.
          </p>
          <svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            {/* Track */}
            <line x1="40" y1="100" x2="440" y2="100" stroke="#3a2e22" strokeOpacity="0.2" strokeWidth="2" />

            {/* Tick marks */}
            {Array.from({ length: 9 }).map((_, i) => (
              <line
                key={i}
                x1={40 + i * 50}
                y1="92"
                x2={40 + i * 50}
                y2="108"
                stroke="#3a2e22"
                strokeOpacity="0.25"
                strokeWidth="1"
              />
            ))}

            {/* Scheduled markers */}
            <g>
              <rect x="90" y="60" width="46" height="24" rx="4" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.2" />
              <text x="113" y="76" textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fill="#1a1817">RENT</text>
            </g>
            <g>
              <rect x="200" y="60" width="56" height="24" rx="4" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.2" />
              <text x="228" y="76" textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fill="#1a1817">SALARY</text>
            </g>
            <g>
              <rect x="330" y="60" width="58" height="24" rx="4" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.2" />
              <text x="359" y="76" textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fill="#1a1817">VENDOR</text>
            </g>

            {/* The travelling cursor (the bot) */}
            <g>
              <circle r="9" fill="#ee5a3a">
                <animate
                  attributeName="cx"
                  values="40;113;228;359;440;40"
                  keyTimes="0;0.18;0.42;0.7;0.9;1"
                  dur="6s"
                  repeatCount="indefinite"
                />
                <animate attributeName="cy" values="100" dur="6s" repeatCount="indefinite" />
              </circle>
              <circle r="14" fill="none" stroke="#ee5a3a" strokeWidth="1.5">
                <animate
                  attributeName="cx"
                  values="40;113;228;359;440;40"
                  keyTimes="0;0.18;0.42;0.7;0.9;1"
                  dur="6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="r"
                  values="9;18;9;18;9;18"
                  keyTimes="0;0.18;0.42;0.7;0.9;1"
                  dur="6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;0;1;0;1"
                  keyTimes="0;0.18;0.42;0.7;0.9;1"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>

            {/* Labels */}
            <text x="40" y="130" fontSize="9.5" letterSpacing="1" fontFamily="ui-monospace, monospace" fill="#6f665b">CRON · 60s</text>
            <text x="440" y="130" textAnchor="end" fontSize="9.5" letterSpacing="1" fontFamily="ui-monospace, monospace" fill="#6f665b">FIRE → ARCSCAN</text>
          </svg>
        </section>

        {/* Multi-pay fan-out */}
        <section className="docs-card">
          <span className="docs-eyebrow">multi-pay</span>
          <h3>One signature, four wallets</h3>
          <p>
            <code>schedulePaymentBatch()</code> packs recipients + amounts + frequencies into a
            single transaction. Perfect for payroll, vendor batches, or splitting a payout.
          </p>
          <svg viewBox="0 0 480 220" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            {/* Source */}
            <circle cx="60" cy="110" r="32" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.4" />
            <text x="60" y="107" textAnchor="middle" fontSize="9" letterSpacing="1" fontFamily="ui-monospace, monospace" fill="#1a1817">YOU</text>
            <text x="60" y="120" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, monospace" fill="#8b8175">SIGN ONCE</text>

            {/* Signature pulse */}
            <circle cx="60" cy="110" r="32" fill="none" stroke="#ee5a3a" strokeWidth="2">
              <animate attributeName="r" values="32;46;32" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="2.4s" repeatCount="indefinite" />
            </circle>

            {/* Lines fanning out */}
            {[
              { x: 400, y: 35 },
              { x: 420, y: 90 },
              { x: 420, y: 145 },
              { x: 400, y: 200 },
            ].map((p, i) => (
              <g key={i}>
                <line
                  x1="92"
                  y1="110"
                  x2={p.x - 26}
                  y2={p.y}
                  stroke="#ee5a3a"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-24"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </line>
                <circle cx={p.x} cy={p.y} r="22" fill="#ffffff" stroke="#3a2e22" strokeWidth="1.4" />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fill="#1a1817">
                  0x{(i + 1).toString().padStart(2, "0")}
                </text>
              </g>
            ))}
          </svg>
        </section>

        {/* Architecture stack */}
        <section className="docs-card docs-card-wide">
          <span className="docs-eyebrow">architecture</span>
          <h3>Three layers, one shared truth</h3>
          <p>
            The frontend reads contract state, the bot watches events, the contract is the
            referee. No off-chain ledgers, no shadow database — every balance is on Arc.
          </p>

          <div className="docs-stack">
            <div className="docs-stack-row">
              <div className="docs-stack-badge">FRONTEND</div>
              <div className="docs-stack-body">
                <strong>React + viem + wagmi</strong>
                <span>Dashboard, scheduling, bills. Reads via getLogs + readContract.</span>
              </div>
            </div>
            <div className="docs-stack-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>
            <div className="docs-stack-row docs-stack-row-mid">
              <div className="docs-stack-badge">SCHEDULER</div>
              <div className="docs-stack-body">
                <strong>Node + node-cron + Circle SDK</strong>
                <span>Cron every minute. Reads <code>isDue()</code> → calls <code>executePayment()</code> via dev-controlled wallet.</span>
              </div>
            </div>
            <div className="docs-stack-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>
            <div className="docs-stack-row">
              <div className="docs-stack-badge">CONTRACT</div>
              <div className="docs-stack-body">
                <strong>USDCTreasury.sol on Arc</strong>
                <span>Per-user balances, payment queue, role-gated execution, emergency pause.</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ============ NUMBERED STEPS ============ */}
      <section className="docs-card">
        <span className="docs-eyebrow">5-minute flow</span>
        <h3>From zero to first paid invoice</h3>
        <div className="docs-steps">
          {[
            { n: "01", title: "Connect", body: "Connect your wallet on Arc Testnet via the sidebar." },
            { n: "02", title: "Deposit", body: "Approve + deposit USDC into your treasury balance." },
            { n: "03", title: "Schedule", body: "Pick recipient, amount, and cadence. One tx queues it." },
            { n: "04", title: "Settle", body: "Bot picks it up within 60s and executes it on-chain." },
            { n: "05", title: "Verify", body: "Every flow is auditable on ArcScan in real time." },
          ].map((s) => (
            <div className="docs-step" key={s.n}>
              <span className="docs-step-num">{s.n}</span>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ NETWORK CARD ============ */}
      <section className="docs-card docs-network">
        <span className="docs-eyebrow">network</span>
        <h3>Built for Arc Testnet</h3>
        <div className="docs-network-grid">
          <div><span>Chain ID</span><strong>5042002</strong></div>
          <div><span>RPC</span><strong>rpc.testnet.arc.network</strong></div>
          <div><span>Explorer</span>
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
              testnet.arcscan.app ↗
            </a>
          </div>
          <div><span>USDC</span><strong>0x36000000…0000</strong></div>
          <div><span>Treasury</span>
            <a
              href="https://testnet.arcscan.app/address/0xb4A668f7B45c2BBFB89bCb6853E72bFF464c8F44"
              target="_blank"
              rel="noreferrer"
            >
              0xb4A668f7…64c8F44 ↗
            </a>
          </div>
          <div><span>Faucet</span>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              faucet.circle.com ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
