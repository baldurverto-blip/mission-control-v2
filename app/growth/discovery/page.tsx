"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { FilterBar, FilterSelect, FilterSearch } from "../../components/FilterBar";

interface Signal {
  id: string;
  source: string;
  project: string;
  signal_type: string;
  title: string;
  description: string;
  final_score: number;
  pain_score: number;
  volume_score: number;
  status: string;
  cross_source_count: number;
  discovered_at: string;
  pipeline_tags: string[];
  quality_score: number;
}

interface DiscoveryResponse {
  success: boolean;
  signals: Signal[];
  total?: number;
}

interface Source {
  source: string;
  current_weight: number;
  total_signals: number;
  active_signals: number;
  last_signal: string | null;
}

interface SourcesResponse {
  success: boolean;
  sources: Source[];
}

interface Theme {
  theme_key: string;
  theme_title: string;
  tier: string;
  total_signals: number;
  avg_score: number;
  sources: string[];
  momentum_7d: { direction: string };
}

interface ThemesResponse {
  success: boolean;
  themes: Theme[];
}

const TIER_COLORS: Record<string, string> = {
  hot: "var(--terracotta)",
  warm: "var(--amber)",
  emerging: "var(--olive)",
};

const SOURCE_COLORS: Record<string, string> = {
  reddit: "#FF4500",
  google_trends: "#4285F4",
  keywords_everywhere: "#F4B400",
  g2_reviews: "#FF492C",
  nordic_jobs: "#0A66C2",
};

const VIEW_TABS = [
  { id: "signals", label: "Signals" },
  { id: "themes", label: "Themes" },
  { id: "sources", label: "Sources" },
];

export default function DiscoveryPage() {
  const { data: discData, isOffline, loading, refetch } = useGrowthOps<DiscoveryResponse>("discovery");
  const { data: sourcesData } = useGrowthOps<SourcesResponse>("discovery/sources");
  const { data: themesData } = useGrowthOps<ThemesResponse>("themes");

  const [view, setView] = useState("signals");
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState(false);

  const signals = discData?.signals ?? [];
  const sources = sourcesData?.sources ?? [];
  const themes = themesData?.themes ?? [];

  // Derive stats
  const totalSignals = signals.length;
  const newSignals = signals.filter((s) => s.status === "new" || s.status === "active").length;
  const crossValidated = signals.filter((s) => s.cross_source_count > 1).length;
  const avgScore = totalSignals > 0 ? Math.round(signals.reduce((sum, s) => sum + s.final_score, 0) / totalSignals) : 0;

  // Filter signals
  const projects = [...new Set(signals.map((s) => s.project))];
  const filtered = signals
    .filter((s) => projectFilter === "all" || s.project === projectFilter)
    .filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.final_score - a.final_score);

  const runAction = useCallback(async (endpoint: string) => {
    setActing(true);
    try {
      await fetch(`/api/growth/${endpoint}`, { method: "POST" });
      await refetch();
    } finally {
      setActing(false);
    }
  }, [refetch]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight">Discovery Lake</h1>
            <p className="text-mid text-sm mt-1">Signals, themes, and sources across all channels</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runAction("discovery/run-daily")}
              disabled={acting}
              className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper"
              style={{ backgroundColor: "var(--charcoal)" }}
            >
              Run Daily
            </button>
            <button
              onClick={() => runAction("discovery/cross-validate")}
              disabled={acting}
              className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
              style={{ color: "var(--lilac)", backgroundColor: "var(--lilac-soft)" }}
            >
              Cross-Validate
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="mb-6 fade-up">
          <MetricsBar metrics={[
            { label: "Total", value: String(totalSignals), color: "var(--charcoal)" },
            { label: "New", value: String(newSignals), color: "var(--olive)" },
            { label: "Cross-val", value: String(crossValidated), color: "var(--lilac)" },
            { label: "Avg Score", value: String(avgScore), color: "var(--terracotta)" },
          ]} />
        </div>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {/* View tabs */}
        <div className="mb-5 fade-up" style={{ animationDelay: "0.05s" }}>
          <TabBar tabs={VIEW_TABS} active={view} onChange={setView} />
        </div>

        {/* ─── Signals View ─── */}
        {view === "signals" && (
          <>
            <div className="mb-4 fade-up" style={{ animationDelay: "0.1s" }}>
              <FilterBar>
                <FilterSelect
                  label="Project"
                  value={projectFilter}
                  options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p, label: p }))]}
                  onChange={setProjectFilter}
                />
                <FilterSearch value={search} onChange={setSearch} placeholder="Search signals..." />
              </FilterBar>
            </div>

            {loading ? (
              <p className="text-mid text-sm text-center py-8">Loading signals...</p>
            ) : filtered.length === 0 ? (
              <EmptyState title="No signals" message="Adjust filters or run a discovery cycle" />
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[0.6rem] label-caps text-mid/60">
                  <span className="col-span-5">Signal</span>
                  <span className="col-span-1 text-right">Score</span>
                  <span className="col-span-2">Source</span>
                  <span className="col-span-2">Project</span>
                  <span className="col-span-2">Status</span>
                </div>
                {filtered.slice(0, 50).map((signal, idx) => (
                  <div
                    key={signal.id}
                    className="card grid grid-cols-12 gap-3 items-center !py-3 fade-up"
                    style={{ animationDelay: `${0.1 + idx * 0.02}s` }}
                  >
                    <div className="col-span-5 min-w-0">
                      <p className="text-sm truncate">{signal.title}</p>
                      <span className="text-[0.6rem] text-mid/50">{new Date(signal.discovered_at).toLocaleDateString("en-GB")}</span>
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-sm tabular-nums font-medium" style={{ color: signal.final_score >= 80 ? "var(--terracotta)" : signal.final_score >= 50 ? "var(--amber)" : "var(--mid)" }}>
                        {Math.round(signal.final_score)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <Badge color={SOURCE_COLORS[signal.source] ?? "var(--mid)"}>{signal.source.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge color="var(--lilac)">{signal.project}</Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge color={signal.status === "used" ? "var(--olive)" : signal.status === "new" || signal.status === "active" ? "var(--amber)" : "var(--mid)"}>
                        {signal.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── Themes View ─── */}
        {view === "themes" && (
          <div className="space-y-3">
            {themes.length === 0 ? (
              <EmptyState title="No themes" message="Run discovery to generate themes" />
            ) : (
              themes.map((theme, idx) => (
                <div key={theme.theme_key} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge color={TIER_COLORS[theme.tier] ?? "var(--mid)"}>{theme.tier}</Badge>
                        <span className="text-[0.6rem] text-mid/50">{theme.total_signals} signals</span>
                        {theme.momentum_7d?.direction === "up" && <span className="text-olive text-xs">&#9650;</span>}
                        {theme.momentum_7d?.direction === "down" && <span className="text-terracotta text-xs">&#9660;</span>}
                      </div>
                      <p className="text-sm font-medium">{theme.theme_title}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg tabular-nums" style={{ color: TIER_COLORS[theme.tier], fontFamily: "var(--font-cormorant), Georgia, serif" }}>
                        {Math.round(theme.avg_score)}
                      </p>
                      <p className="text-[0.55rem] text-mid/50">avg score</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {theme.sources.map((src) => (
                      <span key={src} className="text-[0.55rem] px-1.5 py-0.5 rounded bg-warm text-mid">{src}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── Sources View ─── */}
        {view === "sources" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.length === 0 ? (
              <EmptyState title="No sources" message="Sources appear after discovery runs" />
            ) : (
              sources.map((src, idx) => (
                <div key={src.source} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[src.source] ?? "var(--mid)" }}
                      />
                      <span className="text-sm font-medium capitalize">{src.source.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-xs tabular-nums text-mid/60">w:{src.current_weight}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[0.55rem] text-mid/50 label-caps">Total</p>
                      <p className="text-sm tabular-nums">{src.total_signals}</p>
                    </div>
                    <div>
                      <p className="text-[0.55rem] text-mid/50 label-caps">Active</p>
                      <p className="text-sm tabular-nums">{src.active_signals}</p>
                    </div>
                  </div>
                  {src.last_signal && (
                    <p className="text-[0.55rem] text-mid/40 mt-2">
                      Last: {new Date(src.last_signal).toLocaleDateString("en-GB")}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
