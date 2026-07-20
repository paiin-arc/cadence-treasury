import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Clock,
  Send,
  BarChart3,
  Bell,
  Lock,
} from "lucide-react";
import HeroMapCanvas from "./components/HeroMapCanvas";
import StatCounter from "./components/StatCounter";
import cadenceLogoUrl from "./assets/cadence-logo.png";
import "./styles/Landing.css";

const TWITTER_URL = "https://twitter.com/paiin_ip";

export default function Landing() {
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<"overview" | "multipay" | "crosschain" | "escrow">("overview");

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const launchApp = () => {
    window.location.hash = "#dashboard";
  };

  return (
    <div className="cadence-landing">
      {/* --------------------------------------------------------------------------
          NAVBAR
          -------------------------------------------------------------------------- */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <a href="#" className="landing-brand">
            <img src={cadenceLogoUrl} alt="Cadence Logo" className="landing-brand-logo" />
            <span>CADENCE</span>
          </a>

          <div className="landing-nav-links">
            <a href="#overview" onClick={(e) => { e.preventDefault(); scrollToSection("overview"); }} className="landing-nav-link">
              Showcase
            </a>
            <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection("features"); }} className="landing-nav-link">
              Features
            </a>
            <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollToSection("how-it-works"); }} className="landing-nav-link">
              How It Works
            </a>
            <a href="#architecture" onClick={(e) => { e.preventDefault(); scrollToSection("architecture"); }} className="landing-nav-link">
              Architecture
            </a>
            <a href="#stats" onClick={(e) => { e.preventDefault(); scrollToSection("stats"); }} className="landing-nav-link">
              Metrics
            </a>
          </div>

          <div className="landing-nav-actions">
            <div className="network-badge">
              <span className="dot-pulse" />
              <span>Arc Chain 5042002</span>
            </div>
            <button className="btn-primary-launch" onClick={launchApp}>
              Launch App <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* --------------------------------------------------------------------------
          1. HERO SECTION
          -------------------------------------------------------------------------- */}
      <section className="landing-hero">
        <div className="hero-mesh-background" />
        <HeroMapCanvas />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="hero-tag-badge"
        >
          <Zap size={13} />
          <span>Institutional USDC Treasury Automation on Arc Network</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="hero-headline"
        >
          Automate Global <span className="hero-headline-gradient">Treasury Operations</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hero-subheadline"
        >
          Manage payroll, recurring payments, subscriptions and cross-chain USDC flows from one unified platform.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="hero-cta-group"
        >
          <button className="btn-primary-launch hero-cta-lg" onClick={launchApp}>
            Launch App <ArrowRight size={16} />
          </button>
          <button className="btn-secondary-demo hero-cta-lg" onClick={() => scrollToSection("overview")}>
            View Demo
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="hero-pills-row"
        >
          <div className="hero-pill-item">
            <Zap size={14} className="hero-pill-icon" />
            <span>0.001s Settlement</span>
          </div>
          <div className="hero-pill-item">
            <ShieldCheck size={14} className="hero-pill-icon" />
            <span>Circle CCTP Native</span>
          </div>
          <div className="hero-pill-item">
            <Lock size={14} className="hero-pill-icon" />
            <span>Multi-Sig Thresholds</span>
          </div>
        </motion.div>
      </section>

      {/* --------------------------------------------------------------------------
          2. PRODUCT SHOWCASE (INTERACTIVE DASHBOARD PREVIEW)
          -------------------------------------------------------------------------- */}
      <section className="showcase-section" id="overview">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="showcase-frame"
        >
          <div className="showcase-top-bar">
            <div className="window-dots">
              <span className="window-dot dot-red" />
              <span className="window-dot dot-yellow" />
              <span className="window-dot dot-green" />
            </div>
            <div className="showcase-tabs">
              <button
                className={`showcase-tab-btn ${activeShowcaseTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveShowcaseTab("overview")}
              >
                Overview
              </button>
              <button
                className={`showcase-tab-btn ${activeShowcaseTab === "multipay" ? "active" : ""}`}
                onClick={() => setActiveShowcaseTab("multipay")}
              >
                Multi-Pay Salary
              </button>
              <button
                className={`showcase-tab-btn ${activeShowcaseTab === "crosschain" ? "active" : ""}`}
                onClick={() => setActiveShowcaseTab("crosschain")}
              >
                Cross-Chain CCTP
              </button>
              <button
                className={`showcase-tab-btn ${activeShowcaseTab === "escrow" ? "active" : ""}`}
                onClick={() => setActiveShowcaseTab("escrow")}
              >
                Escrow Vaults
              </button>
            </div>
          </div>

          <div className="showcase-content-area">
            {activeShowcaseTab === "overview" && (
              <div className="showcase-grid-overview">
                <div className="showcase-card">
                  <div className="card-title-muted">Active Treasury Balance</div>
                  <div style={{ display: "flex", alignItems: "baseline", marginTop: "6px" }}>
                    <span className="card-big-num">$1,428,950.00</span>
                    <span className="card-change-badge">▲ +18.4% this month</span>
                  </div>
                  <p style={{ color: "var(--landing-text-secondary)", fontSize: "13px", marginTop: "12px" }}>
                    Connected to Arc Testnet Chain 5042002 · Real-Time USDC Yield Active
                  </p>
                </div>
                <div className="showcase-card">
                  <div className="card-title-muted">System Health</div>
                  <div style={{ color: "#34d399", fontSize: "20px", fontWeight: "700", marginTop: "8px" }}>
                    🟢 100% Operational
                  </div>
                  <p style={{ color: "var(--landing-text-secondary)", fontSize: "12px", marginTop: "8px" }}>
                    Sub-second block finality on Arc
                  </p>
                </div>
              </div>
            )}

            {activeShowcaseTab === "multipay" && (
              <div className="showcase-card">
                <div className="card-title-muted">Queued Salary Payroll Run</div>
                <div style={{ marginTop: "14px" }}>
                  {[
                    { name: "Engineering Core Team", wallets: "4 Wallets", total: "45,000 USDC", status: "Ready to Sign" },
                    { name: "Design & UX Contractors", wallets: "2 Wallets", total: "12,500 USDC", status: "Scheduled" },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "12px",
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "600", color: "#fff", fontSize: "14px" }}>{item.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--landing-text-muted)" }}>{item.wallets}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "700", color: "#c084fc", fontSize: "14px" }}>{item.total}</div>
                        <div style={{ fontSize: "11px", color: "#34d399" }}>{item.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeShowcaseTab === "crosschain" && (
              <div className="showcase-card">
                <div className="card-title-muted">Circle CCTP V2 Cross-Chain Relayer</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "14px" }}>
                  {[
                    { chain: "Arbitrum Sepolia", domain: "Domain 3", status: "Active" },
                    { chain: "Base Sepolia", domain: "Domain 6", status: "Active" },
                    { chain: "Ethereum Sepolia", domain: "Domain 0", status: "Active" },
                  ].map((c, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "8px" }}>
                      <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px" }}>{c.chain}</div>
                      <div style={{ fontSize: "11px", color: "var(--landing-text-muted)", marginTop: "4px" }}>{c.domain}</div>
                      <div style={{ fontSize: "11px", color: "#34d399", marginTop: "8px" }}>🟢 {c.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeShowcaseTab === "escrow" && (
              <div className="showcase-card">
                <div className="card-title-muted">Milestone Escrow Vaults</div>
                <div style={{ marginTop: "12px", color: "var(--landing-text-secondary)", fontSize: "14px" }}>
                  🔒 <strong>Q3 Developer Grant Vault</strong> — 50,000 USDC locked. Milestone 2 release condition pending 2/3 multi-sig signatures.
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* --------------------------------------------------------------------------
          3. FEATURE BENTO GRID
          -------------------------------------------------------------------------- */}
      <section className="section-container" id="features">
        <div className="section-header">
          <div className="section-eyebrow">Institutional Capability</div>
          <h2 className="section-title">Built for Modern Financial Engineering</h2>
          <p className="section-subtitle">
            Enterprise-grade USDC automation primitives engineered for protocol treasuries, DAO operations, and global companies.
          </p>
        </div>

        <div className="bento-grid">
          {/* Card 1: Treasury Management (Large) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bento-card bento-card-large"
          >
            <div className="bento-icon-wrapper">
              <ShieldCheck size={22} />
            </div>
            <h3 className="bento-card-title">◆ Treasury Management</h3>
            <p className="bento-card-desc">
              Multi-signature governance, real-time balance aggregation across 20+ chains, customizable spending thresholds, and automated liquidity routing.
            </p>
          </motion.div>

          {/* Card 2: Payment Scheduling */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bento-card"
          >
            <div className="bento-icon-wrapper">
              <Clock size={22} />
            </div>
            <h3 className="bento-card-title">◆ Payment Scheduling</h3>
            <p className="bento-card-desc">
              Set-and-forget cron triggers for recurring vendor payments and subscriptions using native USDC gas.
            </p>
          </motion.div>

          {/* Card 3: Cross Chain Transfers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bento-card"
          >
            <div className="bento-icon-wrapper">
              <Globe size={22} />
            </div>
            <h3 className="bento-card-title">◆ Cross Chain Transfers</h3>
            <p className="bento-card-desc">
              Circle CCTP V2 integration for zero-slippage, burn-and-mint USDC liquidity transfers across EVM chains.
            </p>
          </motion.div>

          {/* Card 4: Team Payroll (Large) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bento-card bento-card-large"
          >
            <div className="bento-icon-wrapper">
              <Send size={22} />
            </div>
            <h3 className="bento-card-title">◆ Team Payroll</h3>
            <p className="bento-card-desc">
              Execute atomic batch payments to 100+ global contractors and employees in a single signed transaction with instant settlement.
            </p>
          </motion.div>

          {/* Card 5: Transaction Analytics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bento-card"
          >
            <div className="bento-icon-wrapper">
              <BarChart3 size={22} />
            </div>
            <h3 className="bento-card-title">◆ Transaction Analytics</h3>
            <p className="bento-card-desc">
              Real-time cashflow metrics, daily burn velocity, and automated CSV/JSON audit exports for accounting compliance.
            </p>
          </motion.div>

          {/* Card 6: Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bento-card bento-card-large"
          >
            <div className="bento-icon-wrapper">
              <Bell size={22} />
            </div>
            <h3 className="bento-card-title">◆ Notifications</h3>
            <p className="bento-card-desc">
              Instant alerts for high-value transactions, risk threshold breaches, and scheduled payout confirmations via Webhooks, Slack, or Email.
            </p>
          </motion.div>
        </div>
      </section>

      {/* --------------------------------------------------------------------------
          4. HOW CADENCE WORKS
          -------------------------------------------------------------------------- */}
      <section className="section-container" id="how-it-works">
        <div className="section-header">
          <div className="section-eyebrow">Simple Workflow</div>
          <h2 className="section-title">How Cadence Works</h2>
          <p className="section-subtitle">Four simple steps to automate your organization's USDC treasury operations.</p>
        </div>

        <div className="timeline-grid">
          {[
            {
              step: "1",
              title: "Create Treasury",
              desc: "Connect your wallet and initialize a Cadence Vault contract on the Arc Network.",
            },
            {
              step: "2",
              title: "Schedule Payments",
              desc: "Define recipient wallet addresses, USDC amounts, and execution frequencies.",
            },
            {
              step: "3",
              title: "Approve",
              desc: "One-click approval or threshold multi-sig authorization.",
            },
            {
              step: "4",
              title: "Execute",
              desc: "Autonomous smart contract execution with sub-second finality on Arc.",
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="timeline-step-card"
            >
              <div className="step-num-badge">{item.step}</div>
              <h3 className="step-title">{item.title}</h3>
              <p className="step-desc">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------------------
          5. ARCHITECTURE SECTION
          -------------------------------------------------------------------------- */}
      <section className="section-container" id="architecture">
        <div className="section-header">
          <div className="section-eyebrow">System Architecture</div>
          <h2 className="section-title">End-to-End On-Chain Infrastructure</h2>
          <p className="section-subtitle">Engineered with Circle APIs and Arc Network for high-throughput treasury automation.</p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="architecture-container"
        >
          <div className="arch-flow-row">
            <div className="arch-node">
              <div style={{ color: "#c084fc", fontWeight: "700", fontSize: "15px" }}>User / Multi-sig</div>
              <div style={{ color: "var(--landing-text-muted)", fontSize: "12px", marginTop: "4px" }}>Authorized Wallet</div>
            </div>
            <div className="arch-arrow">↗</div>
            <div className="arch-node">
              <div style={{ color: "#38bdf8", fontWeight: "700", fontSize: "15px" }}>Cadence Scheduler</div>
              <div style={{ color: "var(--landing-text-muted)", fontSize: "12px", marginTop: "4px" }}>Arc Smart Contract</div>
            </div>
            <div className="arch-arrow">↗</div>
            <div className="arch-node">
              <div style={{ color: "#34d399", fontWeight: "700", fontSize: "15px" }}>Circle APIs</div>
              <div style={{ color: "var(--landing-text-muted)", fontSize: "12px", marginTop: "4px" }}>CCTP V2 & Gateway</div>
            </div>
            <div className="arch-arrow">↗</div>
            <div className="arch-node">
              <div style={{ color: "#f59e0b", fontWeight: "700", fontSize: "15px" }}>Arc Network</div>
              <div style={{ color: "var(--landing-text-muted)", fontSize: "12px", marginTop: "4px" }}>Sub-second Settlement</div>
            </div>
            <div className="arch-arrow">↗</div>
            <div className="arch-node">
              <div style={{ color: "#ffffff", fontWeight: "700", fontSize: "15px" }}>Recipients</div>
              <div style={{ color: "var(--landing-text-muted)", fontSize: "12px", marginTop: "4px" }}>Global Wallets</div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* --------------------------------------------------------------------------
          6. STATISTICS SECTION
          -------------------------------------------------------------------------- */}
      <section className="section-container" id="stats">
        <div className="stats-grid-4">
          <div className="stat-item-card">
            <div className="stat-value-big">
              <StatCounter value={10} prefix="$" suffix="M+" />
            </div>
            <div className="stat-label-muted">Treasury Volume Automations</div>
          </div>
          <div className="stat-item-card">
            <div className="stat-value-big">
              <StatCounter value={500} suffix="+" />
            </div>
            <div className="stat-label-muted">Scheduled Payments Executed</div>
          </div>
          <div className="stat-item-card">
            <div className="stat-value-big">
              <StatCounter value={20} suffix="+" />
            </div>
            <div className="stat-label-muted">Supported EVM Networks</div>
          </div>
          <div className="stat-item-card">
            <div className="stat-value-big">
              <StatCounter value={100} suffix="%" />
            </div>
            <div className="stat-label-muted">On-Chain Auditable</div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------------
          7. FINAL CTA
          -------------------------------------------------------------------------- */}
      <section className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="final-cta-card"
        >
          <h2 style={{ fontSize: "36px", fontWeight: "800", color: "#ffffff", marginBottom: "16px" }}>
            The Operating System for Global USDC Treasury.
          </h2>
          <p style={{ color: "var(--landing-text-secondary)", fontSize: "16px", marginBottom: "32px" }}>
            Start automating your organization's USDC cashflow in under 3 minutes.
          </p>
          <button className="btn-primary-launch hero-cta-lg" onClick={launchApp}>
            Connect Wallet & Launch App <ArrowRight size={16} />
          </button>
        </motion.div>
      </section>

      {/* --------------------------------------------------------------------------
          FOOTER
          -------------------------------------------------------------------------- */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div>CADENCE · ARC TESTNET CHAIN 5042002 · CIRCLE CCTP V2</div>
          <a href={TWITTER_URL} target="_blank" rel="noreferrer" style={{ color: "var(--landing-text-secondary)", textDecoration: "none" }}>
            BUILT BY <strong>@paiin_ip</strong> →
          </a>
        </div>
      </footer>
    </div>
  );
}
