/**
 * /vera — Vera Dashboard
 *
 * Auto-resolution hero metric, ticket breakdown by tier,
 * KB health panel, weekly brief card.
 *
 * B0 scaffold — data wiring in B1-B2 core loops.
 */
import { Card } from "../components/Card";

// ── Skeleton placeholder for B0 ───────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 11, color: "var(--mid)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 40, fontWeight: 500, color: "var(--charcoal)", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace" }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

const TIER_COLORS: Record<string, string> = {
  T1: "#16A34A",
  T2: "#D97706",
  T3: "#9333EA",
  T4: "#DC2626",
};

function TierBadge({ tier, count }: { tier: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          background: TIER_COLORS[tier] + "20",
          color: TIER_COLORS[tier],
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "var(--font-dm-mono), monospace",
          fontWeight: 600,
          letterSpacing: "0.08em",
        }}
      >
        {tier}
      </span>
      <span style={{ fontSize: 20, fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--charcoal)" }}>
        {count}
      </span>
    </div>
  );
}

export default function VeraDashboard() {
  // B0 scaffold: static placeholder — data wiring in B1
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 28, fontWeight: 500, color: "var(--charcoal)", marginBottom: 4 }}>
          Service Desk
        </h1>
        <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
          Agent-operated support for SafeBite · HyTrack · GatherSafe · Sync
        </p>
      </div>

      {/* Hero: Auto-resolution rate */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard
          label="Auto-resolution rate"
          value="—"
          sub="Vera handled — tickets without you this week"
        />
        <StatCard
          label="Avg response time"
          value="—"
          sub="For T1 auto-resolved tickets"
        />
        <StatCard
          label="Queue today"
          value="—"
          sub="Tickets requiring attention"
        />
      </div>

      {/* Tier breakdown */}
      <Card>
        <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 11, color: "var(--mid)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
          This week by tier
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <TierBadge tier="T1" count={0} />
          <TierBadge tier="T2" count={0} />
          <TierBadge tier="T3" count={0} />
          <TierBadge tier="T4" count={0} />
        </div>
        <div style={{ marginTop: 16, fontSize: 11, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace" }}>
          T1 auto-resolved · T2 queued for review · T3 human-owned · T4 engineering
        </div>
      </Card>

      {/* KB Health preview */}
      <div style={{ marginTop: 24 }}>
        <Card>
          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 11, color: "var(--mid)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
            KB Health
          </div>
          <div style={{ fontSize: 12, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace" }}>
            Loading KB coverage data…
          </div>
        </Card>
      </div>
    </div>
  );
}
