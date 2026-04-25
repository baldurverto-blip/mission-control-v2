"use client";

import { useEffect, useState, useCallback } from "react";

// ── Targets from distribution strategy (2026-04-06) ────────────

interface Target {
  label: string;
  metric: string;
  current: number;
  target30: number;
  target60: number;
  target90: number;
  unit: string;
  category: "b2c" | "b2b" | "brand" | "revenue";
}

interface PortfolioData {
  counts: { live: number; inPipeline: number; parked: number; rejected: number; awaitingReview: number };
  totals: {
    mrr: number;
    downloads30d: number;
    activeSubs: number;
    waitlistSignups: number;
    redditKarma: number;
    redditComments: number;
    seoPages: number;
  };
  apps: Array<{
    slug: string;
    status: string;
    downloads30d: number;
    mrr: number | null;
    redditKarma: number;
    seoPages: number;
  }>;
}

// ── Helpers ─────────────────────────────────────────────────────

function getPhaseTarget(t: Target, phase: 30 | 60 | 90): number {
  if (phase === 30) return t.target30;
  if (phase === 60) return t.target60;
  return t.target90;
}

function progress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function progressColor(pct: number): string {
  if (pct >= 80) return "var(--olive)";
  if (pct >= 40) return "var(--amber)";
  return "var(--terracotta)";
}

function categoryLabel(cat: string): string {
  if (cat === "b2c") return "B2C Apps";
  if (cat === "b2b") return "B2B SaaS";
  if (cat === "brand") return "Brand & Channels";
  if (cat === "revenue") return "Revenue";
  return cat;
}

function categoryColor(cat: string): string {
  if (cat === "b2c") return "var(--terracotta)";
  if (cat === "b2b") return "var(--lilac)";
  if (cat === "brand") return "var(--amber)";
  if (cat === "revenue") return "var(--olive)";
  return "var(--mid)";
}

// Strategy start date: 2026-04-06
const STRATEGY_START = new Date("2026-04-06");

function getCurrentPhase(): { phase: 30 | 60 | 90; daysIn: number; daysLeft: number } {
  const now = new Date();
  const daysElapsed = Math.floor((now.getTime() - STRATEGY_START.getTime()) / 86400000);
  if (daysElapsed < 30) return { phase: 30, daysIn: daysElapsed, daysLeft: 30 - daysElapsed };
  if (daysElapsed < 60) return { phase: 60, daysIn: daysElapsed, daysLeft: 60 - daysElapsed };
  return { phase: 90, daysIn: Math.min(daysElapsed, 90), daysLeft: Math.max(0, 90 - daysElapsed) };
}

// ── Page ────────────────────────────────────────────────────────

export default function ScoreboardPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [viewPhase, setViewPhase] = useState<30 | 60 | 90>(getCurrentPhase().phase);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio-kpis");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch { /* offline */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 120_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const { phase: currentPhase, daysIn, daysLeft } = getCurrentPhase();

  // Build targets from portfolio data
  const safebite = data?.apps?.find((a) => a.slug === "safebite");
  const gathersafe = data?.apps?.find((a) => a.slug === "the-worst-part-about-a-gluten-allergy-is") ?? data?.apps?.find((a) => a.slug === "gathersafe");

  const targets: Target[] = [
    // B2C
    {
      label: "SafeBite Downloads",
      metric: "safebite_downloads",
      current: safebite?.downloads30d ?? 0,
      target30: 100, target60: 500, target90: 1500,
      unit: "downloads",
      category: "b2c",
    },
    {
      label: "GatherSafe Downloads",
      metric: "gathersafe_downloads",
      current: gathersafe?.downloads30d ?? 0,
      target30: 50, target60: 200, target90: 500,
      unit: "downloads",
      category: "b2c",
    },
    {
      label: "Portfolio Live Apps",
      metric: "live_apps",
      current: data?.counts?.live ?? 0,
      target30: 3, target60: 5, target90: 7,
      unit: "apps",
      category: "b2c",
    },
    {
      label: "SEO Pages Indexed",
      metric: "seo_pages",
      current: data?.totals?.seoPages ?? 0,
      target30: 100, target60: 150, target90: 200,
      unit: "pages",
      category: "b2c",
    },
    // Brand & Channels
    {
      label: "Reddit Karma",
      metric: "reddit_karma",
      current: data?.totals?.redditKarma ?? 0,
      target30: 1200, target60: 2000, target90: 3000,
      unit: "karma",
      category: "brand",
    },
    {
      label: "Reddit Comments",
      metric: "reddit_comments",
      current: data?.totals?.redditComments ?? 0,
      target30: 250, target60: 400, target90: 600,
      unit: "comments",
      category: "brand",
    },
    // Revenue
    {
      label: "Total MRR",
      metric: "total_mrr",
      current: data?.totals?.mrr ?? 0,
      target30: 500, target60: 2000, target90: 5000,
      unit: "DKK",
      category: "revenue",
    },
    {
      label: "Active Subscribers",
      metric: "active_subs",
      current: data?.totals?.activeSubs ?? 0,
      target30: 10, target60: 40, target90: 100,
      unit: "subs",
      category: "revenue",
    },
  ];

  const grouped = targets.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, Target[]>);

  const categoryOrder = ["revenue", "b2c", "brand", "b2b"];

  // Overall score
  const overallPct = targets.length > 0
    ? Math.round(targets.reduce((sum, t) => sum + progress(t.current, getPhaseTarget(t, viewPhase)), 0) / targets.length)
    : 0;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading scoreboard...</p>
      </div>
    );
  }

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-6">

      {/* Header */}
      <div className="fade-up">
        <h1 className="text-2xl text-charcoal" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>
          Distribution Scoreboard
        </h1>
        <p className="text-sm text-mid mt-1">
          Strategy targets from Apr 6, 2026 — Day {daysIn}, {daysLeft > 0 ? `${daysLeft}d left in phase` : "phase complete"}
        </p>
      </div>

      {/* Phase selector + overall score */}
      <div className="card fade-up flex items-center justify-between flex-wrap gap-4" style={{ padding: "1rem 1.5rem", animationDelay: "0.05s" }}>
        <div className="flex items-center gap-2">
          {([30, 60, 90] as const).map((p) => (
            <button
              key={p}
              onClick={() => setViewPhase(p)}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                backgroundColor: viewPhase === p ? "var(--charcoal)" : "transparent",
                color: viewPhase === p ? "var(--paper)" : "var(--mid)",
                fontWeight: viewPhase === p ? 500 : 400,
              }}
            >
              {p} Days
              {p === currentPhase && (
                <span className="ml-1 text-[0.7rem]" style={{ color: viewPhase === p ? "var(--paper)" : "var(--olive)" }}>
                  (now)
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Overall score */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[0.75rem] text-mid/70 uppercase tracking-wide">Overall</p>
            <p
              className="text-2xl tabular-nums"
              style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: progressColor(overallPct) }}
            >
              {overallPct}%
            </p>
          </div>
          <div className="w-20 h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${overallPct}%`, backgroundColor: progressColor(overallPct) }}
            />
          </div>
        </div>
      </div>

      {/* Target groups */}
      {categoryOrder.filter((cat) => grouped[cat]).map((cat, catIdx) => (
        <div key={cat} className="space-y-3 fade-up" style={{ animationDelay: `${0.1 + catIdx * 0.05}s` }}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor(cat) }} />
            <h2 className="text-lg text-charcoal" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>
              {categoryLabel(cat)}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {grouped[cat].map((t) => {
              const target = getPhaseTarget(t, viewPhase);
              const pct = progress(t.current, target);

              return (
                <div
                  key={t.metric}
                  className="card"
                  style={{ borderLeft: `3px solid ${categoryColor(cat)}`, padding: "1rem 1.25rem" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[0.8rem] font-medium text-charcoal">{t.label}</p>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span
                          className="text-xl tabular-nums"
                          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: progressColor(pct) }}
                        >
                          {t.current.toLocaleString()}
                        </span>
                        <span className="text-[0.75rem] text-mid/60">
                          / {target.toLocaleString()} {t.unit}
                        </span>
                      </div>
                    </div>
                    <span
                      className="text-[0.7rem] px-2 py-0.5 rounded-full font-medium tabular-nums"
                      style={{
                        backgroundColor: pct >= 80 ? "var(--olive-soft)" : pct >= 40 ? "var(--amber-soft)" : "var(--terracotta-soft)",
                        color: progressColor(pct),
                      }}
                    >
                      {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: progressColor(pct) }}
                    />
                  </div>

                  {/* Phase targets */}
                  <div className="flex items-center gap-4 mt-2 text-[0.7rem] text-mid/60">
                    <span className={viewPhase === 30 ? "font-medium text-charcoal" : ""}>30d: {t.target30.toLocaleString()}</span>
                    <span className={viewPhase === 60 ? "font-medium text-charcoal" : ""}>60d: {t.target60.toLocaleString()}</span>
                    <span className={viewPhase === 90 ? "font-medium text-charcoal" : ""}>90d: {t.target90.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Strategy note */}
      <div className="card fade-up text-center" style={{ padding: "1.25rem", animationDelay: "0.3s" }}>
        <p className="text-[0.8rem] text-mid/70">
          Targets from the Distribution Strategy approved Apr 6, 2026.
          Data refreshes every 2 minutes from portfolio KPIs.
        </p>
        <p className="text-[0.7rem] text-mid/50 mt-1">
          Overall score = average progress across all targets for the selected phase.
        </p>
      </div>
    </div>
  );
}
