"use client";

import { useState } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

interface RadarSignal {
  id: string;
  source: string;
  project: string | null;
  signal_type: string;
  title: string;
  description: string;
  final_score: number;
  status: string;
  radar_tier: string;
  discovered_at: string;
  cross_source_count: number;
}

interface RadarResponse {
  success: boolean;
  signals: RadarSignal[];
}

const TIER_CONFIG: Record<string, { color: string; label: string }> = {
  hot: { color: "var(--terracotta)", label: "Hot" },
  warm: { color: "var(--amber)", label: "Warm" },
  emerging: { color: "var(--olive)", label: "Emerging" },
};

export default function RadarPage() {
  const { data, isOffline, loading } = useGrowthOps<RadarResponse>("radar");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isOffline) return <EmptyState offline />;

  const signals = data?.signals ?? [];
  const tiers = ["hot", "warm", "emerging"];
  const grouped = Object.fromEntries(tiers.map((t) => [t, signals.filter((s) => s.radar_tier === t)]));

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Radar</h1>
        <p className="text-mid text-sm mb-6">Opportunity signals organized by tier</p>
        <MetricsBar metrics={tiers.map((t) => ({
          label: TIER_CONFIG[t].label,
          value: String(grouped[t].length),
          color: TIER_CONFIG[t].color,
        }))} />
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : signals.length === 0 ? (
          <EmptyState title="Radar empty" message="No radar signals found" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {tiers.map((tier) => (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TIER_CONFIG[tier].color }} />
                  <span className="label-caps text-[0.6rem]">{TIER_CONFIG[tier].label}</span>
                  <span className="text-[0.6rem] text-mid/50">{grouped[tier].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[tier].map((signal, idx) => (
                    <div
                      key={signal.id}
                      className="card !p-3 fade-up cursor-pointer"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                      onClick={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm leading-snug line-clamp-2">{signal.title}</p>
                        <span className="text-sm tabular-nums flex-shrink-0 font-medium" style={{ color: TIER_CONFIG[tier].color }}>
                          {Math.round(signal.final_score)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {signal.project && <Badge color="var(--lilac)">{signal.project}</Badge>}
                        <span className="text-[0.55rem] text-mid/50">{signal.source.replace(/_/g, " ")}</span>
                      </div>
                      {expandedId === signal.id && (
                        <div className="mt-2 pt-2 border-t border-warm">
                          <p className="text-xs text-mid leading-relaxed">{signal.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  {grouped[tier].length === 0 && (
                    <p className="text-xs text-mid/50 text-center py-4">No {tier} signals</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
