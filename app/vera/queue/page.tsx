/**
 * /vera/queue — Ticket Queue
 *
 * Filterable ticket list: All / T2 Review / T3 Escalated / T4 Critical
 * Right panel: AIReplyDraft (T2) | EscalationCard (T3) | T4AlertCard (T4)
 *
 * B0 scaffold — ticket list and panel wiring in B1-B2 core loops.
 */
import { EmptyState } from "../../components/EmptyState";

export default function VeraQueue() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 28, fontWeight: 500, color: "var(--charcoal)", marginBottom: 4 }}>
          Queue
        </h1>
        <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
          T2 review · T3 escalations · T4 critical
        </p>
      </div>

      {/* Filter tabs — wired in B1 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--warm)", paddingBottom: 12 }}>
        {["All", "T2 Review", "T3 Escalated", "T4 Critical"].map((label) => (
          <button
            key={label}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              fontFamily: "var(--font-dm-mono), monospace",
              background: label === "All" ? "var(--charcoal)" : "transparent",
              color: label === "All" ? "var(--paper)" : "var(--mid)",
              border: "1px solid var(--warm)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ticket list — wired in B1 */}
      <EmptyState
        title="Queue is clear"
        message="Vera handled everything."
      />
    </div>
  );
}
