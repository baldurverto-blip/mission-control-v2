"use client";

// W8 of lively-foraging-armadillo. Surfaces ideation pipeline health on
// /growth/ideas. Reads from /api/discovery/health (filesystem-only on the
// server side — no Supabase access from MC).

import { useEffect, useState } from "react";

interface SourceBacklogRow {
  source: string;
  classification_events_cumulative: number;
  proposed_last_30d: number;
  backlog_proxy: number;
}

interface SeedHit {
  seed: string;
  count: number;
}

interface HealthData {
  generated_at: string;
  proposed_last_7d: { slug: string; title: string; source: string; segment: string; score: number; proposed_at: string; re_proposed: boolean; themed_seed: string | null }[];
  proposed_7d_by_source: Record<string, number>;
  classification: {
    events_total_cumulative: number;
    last_updated: string | null;
    note: string | null;
  };
  source_backlog: SourceBacklogRow[];
  seed_coverage_30d: {
    seeds_total: number;
    seeds_with_recent_hit: number;
    coverage_pct: number;
    top_hits: SeedHit[];
  };
}

export default function DiscoveryHealthCard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovery/health")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setData(d as HealthData);
        else setError(d.error ?? "Unknown error");
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="card mb-5 fade-up" style={{ padding: "0.75rem 1rem" }}>
        <p className="text-[0.7rem]" style={{ color: "var(--terracotta)" }}>
          Discovery health unavailable: {error}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card mb-5 fade-up" style={{ padding: "0.75rem 1rem" }}>
        <p className="text-[0.7rem] text-mid/70">Loading discovery health…</p>
      </div>
    );
  }

  const total7d = data.proposed_last_7d.length;
  const reProposed7d = data.proposed_last_7d.filter((p) => p.re_proposed).length;
  const themed7d = data.proposed_last_7d.filter((p) => p.themed_seed).length;
  const top7dSources = Object.entries(data.proposed_7d_by_source)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topBacklog = data.source_backlog.slice(0, 4);

  return (
    <div className="card mb-5 fade-up" style={{ padding: "0.85rem 1rem" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="label-caps text-[0.7rem] text-mid/70">Pipeline Health</p>
        <span className="text-[0.65rem] text-mid/50" title={data.classification.note ?? undefined}>
          {data.classification.events_total_cumulative.toLocaleString()} classification events ·{" "}
          last router update {data.classification.last_updated ? relTimeShort(data.classification.last_updated) : "—"}
        </span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1.2fr 1fr" }}>
        {/* ── Last 7 days ──────────────────────────────── */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--olive)" }}>
              {total7d}
            </span>
            <span className="text-[0.7rem] text-mid/70">ideas in last 7d</span>
          </div>
          {(reProposed7d > 0 || themed7d > 0) && (
            <p className="text-[0.65rem] text-mid/60 mb-2">
              {reProposed7d > 0 && <>{reProposed7d} re-proposed · </>}
              {themed7d > 0 && <>{themed7d} themed</>}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {top7dSources.length === 0 ? (
              <span className="text-[0.65rem] text-mid/50">no proposals yet — waiting for next cron run</span>
            ) : (
              top7dSources.map(([src, n]) => (
                <div key={src} className="flex items-center justify-between text-[0.7rem]">
                  <span className="text-mid/80 truncate">{src}</span>
                  <span className="text-mid/60 tabular-nums">{n}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Source backlog ──────────────────────────── */}
        <div>
          <p className="text-[0.7rem] text-mid/70 mb-2">
            Source backlog{" "}
            <span className="text-mid/40" title="classification_events_cumulative − proposed_last_30d. High values = source classifies a lot but rarely produces qualifying clusters.">
              ⓘ
            </span>
          </p>
          <div className="flex flex-col gap-0.5">
            {topBacklog.length === 0 ? (
              <span className="text-[0.65rem] text-mid/50">no router stats yet</span>
            ) : (
              topBacklog.map((row) => (
                <div key={row.source} className="flex items-center justify-between text-[0.7rem]">
                  <span className="text-mid/80 truncate flex-1">{row.source}</span>
                  <span className="text-mid/60 tabular-nums ml-2">
                    {row.classification_events_cumulative.toLocaleString()} − {row.proposed_last_30d} ={" "}
                    <span style={{ color: row.backlog_proxy > 200 ? "var(--terracotta)" : "var(--mid)" }}>
                      {row.backlog_proxy.toLocaleString()}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Seed coverage ───────────────────────────── */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--lilac)" }}>
              {data.seed_coverage_30d.seeds_with_recent_hit}/{data.seed_coverage_30d.seeds_total}
            </span>
            <span className="text-[0.7rem] text-mid/70">
              KWE seeds hit ({data.seed_coverage_30d.coverage_pct}%)
            </span>
          </div>
          {data.seed_coverage_30d.top_hits.length === 0 ? (
            <span className="text-[0.65rem] text-mid/50">no kwe-sourced ideas in 30d window</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.seed_coverage_30d.top_hits.slice(0, 5).map(({ seed, count }) => (
                <div key={seed} className="flex items-center justify-between text-[0.7rem]">
                  <span className="text-mid/80 truncate flex-1" title={seed}>
                    {seed}
                  </span>
                  <span className="text-mid/60 tabular-nums ml-2">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function relTimeShort(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
