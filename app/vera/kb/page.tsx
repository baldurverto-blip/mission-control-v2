/**
 * /vera/kb — Knowledge Base Health
 *
 * Per-product tab panels: file list, coverage status, gaps, corrections log.
 * Products: SafeBite · HyTrack · GatherSafe · Sync · Company
 *
 * B0 scaffold — KB scan and QMD integration in B2 core loop.
 */
import { Card } from "../../components/Card";

const PRODUCTS = ["SafeBite", "HyTrack", "GatherSafe", "Sync", "Company"] as const;

function CoverageDot({ status }: { status: "green" | "amber" | "red" }) {
  const colors = { green: "#16A34A", amber: "#D97706", red: "#DC2626" };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[status],
        marginRight: 6,
      }}
    />
  );
}

export default function VeraKB() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 28, fontWeight: 500, color: "var(--charcoal)", marginBottom: 4 }}>
          Knowledge Base
        </h1>
        <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
          brain/vera-kb/ — file-based, QMD-indexed
        </p>
      </div>

      {/* Product tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--warm)", paddingBottom: 0 }}>
        {PRODUCTS.map((product) => (
          <button
            key={product}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontFamily: "var(--font-dm-mono), monospace",
              background: "transparent",
              color: "var(--mid)",
              border: "none",
              borderBottom: product === "SafeBite" ? "2px solid var(--charcoal)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {product}
          </button>
        ))}
      </div>

      {/* Product KB status — wired in B2 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <CoverageDot status="red" />
          <span style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
            Coverage not yet scanned
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace" }}>
          KB health scan wired in B2 core loop.
          Source: <code>~/verto-workspace/brain/vera-kb/products/safebite/</code>
        </div>
      </Card>

      {/* Coverage gaps — wired in B2 */}
      <div style={{ marginTop: 20 }}>
        <Card>
          <div style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 11, color: "var(--mid)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
            Coverage gaps this week
          </div>
          <div style={{ fontSize: 12, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace" }}>
            No escalation data yet — gaps appear here when Vera can't find KB coverage.
          </div>
        </Card>
      </div>
    </div>
  );
}
