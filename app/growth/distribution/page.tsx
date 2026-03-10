"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";
import { relTime } from "../../lib/agents";

// ── Types ────────────────────────────────────────────────────────

interface Layer {
  name: string;
  status: string;
  lastRun: string | null;
  runs: number;
  result: string | null;
  blocking: string[];
}

interface DistributionApp {
  slug: string;
  engineStatus: string;
  layers: Layer[];
  activeLayers: number;
  failedLayers: number;
  reddit: { karma: number; comments: number; subreddits: string[] };
  seo: { blogs: number; faqEntries: number; programmaticPages: number; indexedPages: number };
  tiktok: { drafted: number };
  waitlist: { signups: number; url: string | null };
  updatedAt: string;
}

interface OverviewData {
  pipeline: {
    distribution: {
      apps: DistributionApp[];
      totalActiveLayers: number;
      totalFailedLayers: number;
      status: string;
    };
  };
}

// ── Layer metadata ──────────────────────────────────────────────

const LAYER_META: Record<string, { label: string; icon: string; cadence: string; color: string; agent: string }> = {
  aso: {
    label: "App Store Optimization",
    icon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
    cadence: "30 days",
    color: "var(--olive)",
    agent: "Scout",
  },
  seo: {
    label: "SEO & Landing Pages",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    cadence: "7 days",
    color: "var(--lilac)",
    agent: "Builder",
  },
  social: {
    label: "Social Content Engine",
    icon: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
    cadence: "12 hours",
    color: "var(--terracotta)",
    agent: "Vibe",
  },
  launch: {
    label: "Launch Orchestrator",
    icon: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122",
    cadence: "On-demand",
    color: "var(--amber)",
    agent: "Baldur",
  },
  portfolio: {
    label: "Portfolio Cross-Promo",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    cadence: "7 days",
    color: "var(--lilac)",
    agent: "Builder",
  },
  amplifier: {
    label: "Paid Amplifier",
    icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    cadence: "7 days",
    color: "var(--mid)",
    agent: "Scout",
  },
};

// ── Status helpers ──────────────────────────────────────────────

function statusColor(s: string): string {
  if (s === "complete" || s === "active") return "var(--olive)";
  if (s === "failed") return "var(--terracotta)";
  if (s === "disabled") return "var(--mid)";
  return "var(--amber)";
}

function statusSoft(s: string): string {
  if (s === "complete" || s === "active") return "var(--olive-soft)";
  if (s === "failed") return "var(--terracotta-soft)";
  if (s === "disabled") return "var(--warm)";
  return "var(--amber-soft)";
}

// ── Components ──────────────────────────────────────────────────

function LayerCard({ layer, delay }: { layer: Layer; delay: number }) {
  const meta = LAYER_META[layer.name] ?? { label: layer.name, icon: "", cadence: "—", color: "var(--mid)", agent: "—" };
  const isDisabled = layer.status === "disabled";

  return (
    <div
      className={`card fade-up ${isDisabled ? "opacity-50" : ""}`}
      style={{ animationDelay: `${delay}s`, borderLeft: `3px solid ${meta.color}`, padding: "1rem 1.25rem" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d={meta.icon} />
          </svg>
          <div>
            <p className="text-[0.7rem] font-medium text-charcoal">{meta.label}</p>
            <p className="text-[0.5rem] text-mid/50">Every {meta.cadence} · {meta.agent}</p>
          </div>
        </div>
        <span
          className="text-[0.5rem] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: statusSoft(layer.status), color: statusColor(layer.status) }}
        >
          {layer.status}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-2.5 pt-2 border-t border-warm/40">
        <div>
          <p className="text-[0.5rem] text-mid/50">Runs</p>
          <p className="text-[0.7rem] tabular-nums font-medium text-charcoal">{layer.runs}</p>
        </div>
        <div>
          <p className="text-[0.5rem] text-mid/50">Last run</p>
          <p className="text-[0.7rem] tabular-nums text-charcoal" suppressHydrationWarning>
            {layer.lastRun ? relTime(layer.lastRun) : "never"}
          </p>
        </div>
      </div>

      {/* Result */}
      {layer.result && (
        <p
          className="text-[0.6rem] mt-1.5 leading-snug"
          style={{ color: layer.status === "failed" ? "var(--terracotta)" : "var(--mid)" }}
        >
          {layer.result.length > 120 ? layer.result.slice(0, 120) + "…" : layer.result}
        </p>
      )}

      {/* Blocking items */}
      {layer.blocking.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {layer.blocking.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[0.55rem]" style={{ color: "var(--amber)" }}>
              <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--amber)" }} />
              {b}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelMetrics({ app }: { app: DistributionApp }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
      {/* Reddit */}
      <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center">
        <p
          className="leading-none mb-0.5 tabular-nums"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.3rem", color: "var(--amber)" }}
        >
          {app.reddit.karma}
        </p>
        <p className="label-caps text-[0.45rem] text-mid/60">Reddit Karma</p>
        <p className="text-[0.5rem] text-mid/40 mt-0.5">{app.reddit.comments} comments · {app.reddit.subreddits.length} subs</p>
      </div>

      {/* SEO */}
      <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center">
        <p
          className="leading-none mb-0.5 tabular-nums"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.3rem", color: "var(--lilac)" }}
        >
          {app.seo.indexedPages}
        </p>
        <p className="label-caps text-[0.45rem] text-mid/60">Indexed Pages</p>
        <p className="text-[0.5rem] text-mid/40 mt-0.5">{app.seo.blogs} blog · {app.seo.faqEntries} FAQ · {app.seo.programmaticPages} prog</p>
      </div>

      {/* TikTok */}
      <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center">
        <p
          className="leading-none mb-0.5 tabular-nums"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.3rem", color: "var(--terracotta)" }}
        >
          {app.tiktok.drafted}
        </p>
        <p className="label-caps text-[0.45rem] text-mid/60">TikTok Drafted</p>
      </div>

      {/* Waitlist */}
      <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center">
        <p
          className="leading-none mb-0.5 tabular-nums"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.3rem", color: "var(--olive)" }}
        >
          {app.waitlist.signups}
        </p>
        <p className="label-caps text-[0.45rem] text-mid/60">Waitlist Signups</p>
        {app.waitlist.url && (
          <a
            href={app.waitlist.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.5rem] text-mid/40 hover:text-charcoal mt-0.5 block truncate"
          >
            {app.waitlist.url.replace("https://", "")}
          </a>
        )}
      </div>
    </div>
  );
}

function LayerHealthSummary({ layers }: { layers: Layer[] }) {
  const total = layers.length;
  const active = layers.filter((l) => l.status === "complete" || l.status === "active").length;
  const failed = layers.filter((l) => l.status === "failed").length;
  const pending = layers.filter((l) => l.status === "pending").length;
  const disabled = layers.filter((l) => l.status === "disabled").length;

  return (
    <div className="flex items-center gap-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
      {active > 0 && (
        <div className="h-full rounded-full" style={{ width: `${(active / total) * 100}%`, backgroundColor: "var(--olive)" }} title={`${active} active`} />
      )}
      {pending > 0 && (
        <div className="h-full rounded-full" style={{ width: `${(pending / total) * 100}%`, backgroundColor: "var(--amber)" }} title={`${pending} pending`} />
      )}
      {failed > 0 && (
        <div className="h-full rounded-full" style={{ width: `${(failed / total) * 100}%`, backgroundColor: "var(--terracotta)" }} title={`${failed} failed`} />
      )}
      {disabled > 0 && (
        <div className="h-full rounded-full" style={{ width: `${(disabled / total) * 100}%`, backgroundColor: "var(--mid)", opacity: 0.3 }} title={`${disabled} disabled`} />
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function DistributionPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/overview");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch { /* offline */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading distribution status...</p>
      </div>
    );
  }

  const apps = data?.pipeline?.distribution?.apps ?? [];

  if (apps.length === 0) {
    return (
      <div className="px-8 py-8 max-w-[1440px] mx-auto">
        <EmptyState
          title="No apps in distribution"
          message="Distribution layers activate when apps reach the shipping phase in the App Factory."
        />
      </div>
    );
  }

  // Auto-expand if only one app
  const expanded = expandedApp ?? (apps.length === 1 ? apps[0].slug : null);

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-5">

      {/* ── Summary Strip ────────────────────────────────────── */}
      <div className="card fade-up flex items-center gap-6 flex-wrap" style={{ padding: "1rem 1.5rem" }}>
        <div className="flex-1">
          <p className="text-sm text-mid">
            <span className="font-medium text-charcoal">{apps.length} {apps.length === 1 ? "app" : "apps"}</span>
            <span className="text-mid/40 mx-2">·</span>
            <span style={{ color: "var(--olive)" }}>{data!.pipeline.distribution.totalActiveLayers} active layers</span>
            {data!.pipeline.distribution.totalFailedLayers > 0 && (
              <>
                <span className="text-mid/40 mx-2">·</span>
                <span style={{ color: "var(--terracotta)" }}>{data!.pipeline.distribution.totalFailedLayers} failed</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[
            { label: "ASO", cadence: "30d" },
            { label: "SEO", cadence: "7d" },
            { label: "Social", cadence: "12h" },
            { label: "Launch", cadence: "req" },
            { label: "Portfolio", cadence: "7d" },
            { label: "Amplifier", cadence: "7d" },
          ].map((l) => (
            <div key={l.label} className="text-center">
              <p className="text-[0.5rem] text-mid/50 uppercase">{l.label}</p>
              <p className="text-[0.45rem] text-mid/30">{l.cadence}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Per-App Sections ─────────────────────────────────── */}
      {apps.map((app, appIdx) => {
        const isExpanded = expanded === app.slug;

        return (
          <div key={app.slug} className="fade-up" style={{ animationDelay: `${0.05 + appIdx * 0.05}s` }}>
            {/* App header — clickable */}
            <button
              onClick={() => setExpandedApp(isExpanded ? null : app.slug)}
              className="w-full card text-left transition-all"
              style={{
                borderLeft: `3px solid ${app.engineStatus === "active" ? "var(--olive)" : "var(--mid)"}`,
                borderBottomLeftRadius: isExpanded ? 0 : undefined,
                borderBottomRightRadius: isExpanded ? 0 : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${app.engineStatus === "active" ? "pulse-dot" : ""}`}
                    style={{ backgroundColor: app.engineStatus === "active" ? "var(--olive)" : "var(--mid)" }}
                  />
                  <div>
                    <h3 className="text-lg text-charcoal capitalize" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>
                      {app.slug}
                    </h3>
                    <p className="text-[0.6rem] text-mid/50" suppressHydrationWarning>
                      {app.activeLayers}/6 layers active · Updated {relTime(app.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Mini layer dots */}
                  <div className="hidden sm:flex items-center gap-1">
                    {app.layers.map((l) => (
                      <span
                        key={l.name}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: statusColor(l.status) }}
                        title={`${l.name}: ${l.status}`}
                      />
                    ))}
                  </div>
                  {/* Expand chevron */}
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="1.5"
                    className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Health bar (always visible) */}
              <div className="mt-3">
                <LayerHealthSummary layers={app.layers} />
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border border-t-0 border-warm rounded-b-xl bg-paper/30 px-5 py-5 space-y-4">
                {/* Channel metrics */}
                <ChannelMetrics app={app} />

                {/* Layer cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {app.layers.map((layer, i) => (
                    <LayerCard key={layer.name} layer={layer} delay={0.05 + i * 0.03} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Legend ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-6 text-[0.55rem] text-mid/50 pt-2">
        {[
          { color: "var(--olive)", label: "Active/Complete" },
          { color: "var(--amber)", label: "Pending" },
          { color: "var(--terracotta)", label: "Failed" },
          { color: "var(--mid)", label: "Disabled" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
