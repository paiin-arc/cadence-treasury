import ConnectWallet from "./components/ConnectWallet";
import cadenceLogoUrl from "./assets/cadence-logo.png";

const TWITTER_URL = "https://twitter.com/paiin_ip";

function scrollToDashboard() {
  document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
}

const PATHS = [
  {
    eyebrow: "DEPOSIT PATH",
    title: "Fund your treasury.",
    body: "Approve once, deposit USDC, and watch your balance update on-chain in seconds.",
    href: "#dashboard",
    illo: "deposit",
  },
  {
    eyebrow: "SCHEDULE PATH",
    title: "Queue a payment.",
    body: "One-off or recurring. Pick the recipient, set the cadence, and the bot fires it on time.",
    href: "#dashboard",
    illo: "schedule",
  },
  {
    eyebrow: "MULTI-PAY",
    title: "Pay 4 wallets in one tx.",
    body: "Bundle salary runs into a single signed transaction — gas-light, audit-friendly.",
    href: "#multipay",
    illo: "multipay",
  },
];

const ILLOS = {
  deposit: (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id="dots-1" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#c9b896" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill="url(#dots-1)" />
      <circle cx="80" cy="100" r="38" fill="none" stroke="#3a2e22" strokeWidth="1.4" />
      <text x="80" y="106" textAnchor="middle" fontSize="22" fill="#3a2e22" fontWeight="600" fontFamily="ui-monospace, monospace">$</text>
      <path d="M 130 100 L 220 100" stroke="#e7593f" strokeWidth="2" strokeDasharray="6 4" />
      <polygon points="220,95 232,100 220,105" fill="#e7593f" />
      <rect x="232" y="72" width="60" height="56" fill="#fff" stroke="#3a2e22" strokeWidth="1.4" />
      <rect x="240" y="80" width="44" height="6" fill="#e7593f" />
      <rect x="240" y="92" width="32" height="3" fill="#3a2e22" opacity="0.4" />
      <rect x="240" y="100" width="38" height="3" fill="#3a2e22" opacity="0.4" />
      <rect x="240" y="108" width="24" height="3" fill="#3a2e22" opacity="0.4" />
      <text x="160" y="180" textAnchor="middle" fontSize="9" fill="#7a6a52" letterSpacing="2" fontFamily="ui-monospace, monospace">USDC → TREASURY</text>
    </svg>
  ),
  schedule: (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id="dots-2" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#c9b896" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill="url(#dots-2)" />
      <rect x="50" y="50" width="220" height="100" fill="#fff" stroke="#3a2e22" strokeWidth="1.4" />
      <line x1="50" y1="76" x2="270" y2="76" stroke="#3a2e22" strokeWidth="1" />
      <circle cx="62" cy="63" r="3" fill="#e7593f" />
      <circle cx="74" cy="63" r="3" fill="#3a2e22" opacity="0.4" />
      <circle cx="86" cy="63" r="3" fill="#3a2e22" opacity="0.4" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={62 + col * 28}
            y={86 + row * 14}
            width="20"
            height="9"
            fill={row === 1 && col === 3 ? "#e7593f" : "#fff"}
            stroke="#3a2e22"
            strokeWidth="0.7"
          />
        ))
      )}
      <text x="160" y="180" textAnchor="middle" fontSize="9" fill="#7a6a52" letterSpacing="2" fontFamily="ui-monospace, monospace">CRON · NEXT EXEC</text>
    </svg>
  ),
  multipay: (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id="dots-3" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#c9b896" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill="url(#dots-3)" />
      <circle cx="160" cy="100" r="22" fill="#e7593f" />
      <text x="160" y="105" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700" fontFamily="ui-monospace, monospace">SIGN</text>
      {[
        { x: 60, y: 50 },
        { x: 260, y: 50 },
        { x: 60, y: 150 },
        { x: 260, y: 150 },
      ].map((p, i) => (
        <g key={i}>
          <line x1="160" y1="100" x2={p.x} y2={p.y} stroke="#3a2e22" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={p.x} cy={p.y} r="14" fill="#fff" stroke="#3a2e22" strokeWidth="1.4" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fill="#3a2e22" fontFamily="ui-monospace, monospace">0x{(i + 1).toString().padStart(2, "0")}</text>
        </g>
      ))}
      <text x="160" y="185" textAnchor="middle" fontSize="9" fill="#7a6a52" letterSpacing="2" fontFamily="ui-monospace, monospace">1 SIGNATURE · 4 WALLETS</text>
    </svg>
  ),
  hero: (
    <svg viewBox="0 0 720 420" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id="hero-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#c9b896" opacity="0.6" />
        </pattern>
      </defs>
      <rect width="720" height="420" fill="url(#hero-dots)" />
      <circle cx="360" cy="210" r="150" fill="none" stroke="#3a2e22" strokeWidth="1.2" strokeDasharray="2 6" />
      <circle cx="360" cy="210" r="100" fill="none" stroke="#3a2e22" strokeWidth="1.2" />
      <circle cx="360" cy="210" r="60" fill="#fff" stroke="#3a2e22" strokeWidth="1.4" />
      <text x="360" y="206" textAnchor="middle" fontSize="13" fill="#3a2e22" fontWeight="700" letterSpacing="2" fontFamily="ui-monospace, monospace">USDC</text>
      <text x="360" y="222" textAnchor="middle" fontSize="9" fill="#7a6a52" letterSpacing="2" fontFamily="ui-monospace, monospace">TREASURY</text>
      {[
        { x: 130, y: 90, label: "DEPLOY" },
        { x: 590, y: 90, label: "DEPOSIT" },
        { x: 130, y: 330, label: "EXECUTE" },
        { x: 590, y: 330, label: "WITHDRAW" },
        { x: 80, y: 210, label: "SCHEDULE" },
        { x: 640, y: 210, label: "ALERT" },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="22" fill="#fff" stroke="#3a2e22" strokeWidth="1.4" />
          <circle cx={n.x} cy={n.y} r="6" fill="#e7593f" />
          <text x={n.x} y={n.y + 38} textAnchor="middle" fontSize="9" fill="#3a2e22" letterSpacing="2" fontFamily="ui-monospace, monospace">{n.label}</text>
        </g>
      ))}
      <path d="M 152 90 Q 240 60, 360 150" fill="none" stroke="#3a2e22" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M 568 90 Q 480 60, 360 150" fill="none" stroke="#3a2e22" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M 152 330 Q 240 360, 360 270" fill="none" stroke="#3a2e22" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M 568 330 Q 480 360, 360 270" fill="none" stroke="#3a2e22" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M 102 210 L 300 210" fill="none" stroke="#e7593f" strokeWidth="1.4" strokeDasharray="4 4" />
      <path d="M 618 210 L 420 210" fill="none" stroke="#e7593f" strokeWidth="1.4" strokeDasharray="4 4" />
    </svg>
  ),
};

export default function Landing() {
  return (
    <div className="landing-sendero">
      <nav className="sn-nav">
        <div className="sn-brand" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <img src={cadenceLogoUrl} alt="Cadence Logo" style={{ width: "22px", height: "22px", objectFit: "contain", borderRadius: "4px" }} />
          CADENCE
        </div>
        <div className="sn-nav-center">
          <a href="#dashboard">DASHBOARD <span className="sn-arrow">↗</span></a>
          <a href="#multipay">MULTI-PAY <span className="sn-arrow">↗</span></a>
          <a href="#cli">CLI <span className="sn-arrow">↗</span></a>
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noreferrer"
          >
            ARCSCAN <span className="sn-arrow">↗</span>
          </a>
        </div>
        <div className="sn-nav-right">
          <ConnectWallet />
        </div>
      </nav>

      <header className="sn-hero">
        <div className="sn-hero-inner">
          <div className="sn-hero-left">
            <h1 className="sn-headline">
              <span className="sn-headline-white">Set the cadence.</span>
              <span className="sn-headline-orange">USDC pays itself.</span>
            </h1>
            <p className="sn-lede">
              Cadence is a self-driving treasury on Arc. Schedule recurring USDC
              payments once — sub-second finality, USDC as gas, every flow
              auditable on ArcScan.
            </p>
            <div className="sn-cta-row">
              <button className="sn-btn sn-btn-primary" onClick={scrollToDashboard}>
                LAUNCH APP <span className="sn-arrow">→</span>
              </button>
              <a className="sn-btn sn-btn-ghost" href="#cli">
                5-MINUTE QUICKSTART
              </a>
            </div>
          </div>
          <div className="sn-hero-right">
            <div className="sn-hero-card">{ILLOS.hero}</div>
            <div className="sn-eyebrow sn-eyebrow-mt">AGENT-NATIVE TREASURY</div>
            <div className="sn-caption">
              One contract from intent to settlement.
            </div>
          </div>
        </div>
      </header>

      <section className="sn-paths" id="paths">
        <div className="sn-paths-grid">
          {PATHS.map((p) => (
            <a className="sn-path-card" href={p.href} key={p.eyebrow}>
              <div className="sn-path-illo">{ILLOS[p.illo as keyof typeof ILLOS]}</div>
              <div className="sn-eyebrow">{p.eyebrow}</div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <div className="sn-path-link">
                OPEN ROUTE <span className="sn-arrow">→</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <footer className="sn-footer">
        <div>CADENCE · ARC TESTNET · CHAIN 5042002</div>
        <a
          className="sn-built-by"
          href={TWITTER_URL}
          target="_blank"
          rel="noreferrer"
        >
          BUILT BY <strong>@paiin_ip</strong> <span className="sn-arrow">→</span>
        </a>
      </footer>
    </div>
  );
}
