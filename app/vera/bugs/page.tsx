/**
 * /vera/bugs — Bug Report Tracker
 *
 * Linked GitHub Issues list, per-issue severity labels, problem records.
 * Filter by app, severity, status.
 *
 * B0 scaffold — GitHub API integration in B2 core loop.
 */
import { EmptyState } from "../../components/EmptyState";

export default function VeraBugs() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 28, fontWeight: 500, color: "var(--charcoal)", marginBottom: 4 }}>
          Bug Reports
        </h1>
        <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
          Vera-classified incidents · linked GitHub Issues · ITIL 4 problem records
        </p>
      </div>

      {/* Filters — wired in B2 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["All apps", "SafeBite", "HyTrack", "GatherSafe", "Sync"].map((label) => (
          <button
            key={label}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontFamily: "var(--font-dm-mono), monospace",
              background: "transparent",
              color: "var(--mid)",
              border: "1px solid var(--warm)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bug list — wired in B2 */}
      <EmptyState
        title="No bug reports yet"
        message="Vera will file structured reports here when it classifies incident tickets."
      />
    </div>
  );
}
