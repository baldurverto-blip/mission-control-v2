/**
 * /vera/features — Feature Frequency
 *
 * FeatureFrequencyBar chart, full table with JTBD clusters.
 * Sorted by request frequency descending.
 *
 * B0 scaffold — feature tracker integration in B2 core loop.
 */
import { EmptyState } from "../../components/EmptyState";

export default function VeraFeatures() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 28, fontWeight: 500, color: "var(--charcoal)", marginBottom: 4 }}>
          Feature Requests
        </h1>
        <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)" }}>
          Frequency-ranked · JTBD clusters · last updated by Vera
        </p>
      </div>

      {/* Feature frequency chart — wired in B2 */}
      <EmptyState
        title="No feature requests yet"
        message="Vera will track and cluster feature requests here as tickets come in."
      />
    </div>
  );
}
