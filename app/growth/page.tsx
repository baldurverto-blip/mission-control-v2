"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "../components/EmptyState";

// ── Types ────────────────────────────────────────────────────────

interface Stats {
  discoveries: number;
  contentGenerated: number;
  postsPublished: number;
}

interface QueueStats {
  queued: number;
  approved: number;
  rejected: number;
}

interface RadarStats {
  active_signals: number;
  hot: number;
  warm: number;
  emerging: number;
  new_this_week: number;
}

interface EngagementStats {
  stats: {
    total_engagements: number;
    pending_comments: number;
  };
}

interface ProcessStage {
  stage: string;
  coverage: "full" | "partial" | "none";
}

interface ProcessMap {
  stages: ProcessStage[];
  summary: { full: number; partial: number; none: number };
}

interface DashboardData {
  stats: Stats | null;
  queueStats: QueueStats | null;
  radarStats: RadarStats | null;
  engagementStats: EngagementStats | null;
  processMap: ProcessMap | null;
  campaigns: { total: number; active: number };
  tiktok: { pending: number; ready: number };
}

// ── Temperature ──────────────────────────────────────────────────

function computeTemperature(d: DashboardData): number {
  const { stats, queueStats, radarStats, engagementStats, processMap } = d;
  if (!stats) return 0;

  const velocity = Math.min(
    (stats.postsPublished / Math.max(stats.contentGenerated, 1)) * 100,
    100,
  );
  const freshness = radarStats
    ? Math.min(
        (radarStats.new_this_week / Math.max(radarStats.active_signals, 1)) * 100,
        100,
      )
    : 0;
  const throughput = queueStats
    ? Math.max(0, 100 - queueStats.queued * 15)
    : 50;
  const engagement =
    engagementStats && engagementStats.stats.total_engagements > 0 ? 80 : 0;
  const automation = processMap ? (processMap.summary.full / 7) * 100 : 0;

  return Math.round(
    velocity * 0.3 +
      freshness * 0.25 +
      throughput * 0.2 +
      engagement * 0.15 +
      automation * 0.1,
  );
}

function tempLabel(t: number): string {
  if (t <= 20) return "Cold";
  if (t <= 40) return "Cool";
  if (t <= 60) return "Warming Up";
  if (t <= 80) return "Running Hot";
  return "On Fire";
}

function tempColor(t: number): string {
  if (t <= 20) return "var(--mid)";
  if (t <= 40) return "var(--lilac)";
  if (t <= 60) return "var(--amber)";
  if (t <= 80) return "var(--olive)";
  return "var(--terracotta)";
}

// ── Icons ────────────────────────────────────────────────────────

const ICONS = {
  queue:
    "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  discovery: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  radar:
    "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  engagement:
    "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  tiktok:
    "M9 19c-4.286 1.35-4.286-2.55-6-3m12 5v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0019 4.77 5.07 5.07 0 0018.91 1S17.73.65 15 2.48a13.38 13.38 0 00-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 004 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 008 18.13V22",
  campaigns:
    "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
};

const COVERAGE_COLORS: Record<string, string> = {
  full: "var(--olive)",
  partial: "var(--amber)",
  none: "var(--warm)",
};

// ── Section Card ─────────────────────────────────────────────────

function SectionCard({
  title,
  href,
  accent,
  primary,
  secondary,
  icon,
  children,
  delay,
}: {
  title: string;
  href: string;
  accent: string;
  primary: string | number;
  secondary: string;
  icon: string;
  children?: React.ReactNode;
  delay: number;
}) {
  return (
    <Link
      href={href}
      className="card fade-up block group"
      style={{ animationDelay: `${delay}s`, borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start gap-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0 mt-0.5"
        >
          <path d={icon} />
        </svg>
        <div className="flex-1 min-w-0">
          <p
            className="leading-none mb-1 tabular-nums"
            style={{
              color: accent,
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontWeight: 400,
              fontSize: "1.75rem",
            }}
          >
            {primary}
          </p>
          <p className="label-caps text-[0.5rem] text-mid/60">{secondary}</p>
          {children}
        </div>
      </div>
      <p
        className="text-[0.55rem] mt-3 pt-2 border-t border-warm transition-colors group-hover:opacity-80"
        style={{ color: accent }}
      >
        {title} →
      </p>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────

const EMPTY_DATA: DashboardData = {
  stats: null,
  queueStats: null,
  radarStats: null,
  engagementStats: null,
  processMap: null,
  campaigns: { total: 0, active: 0 },
  tiktok: { pending: 0, ready: 0 },
};

export default function GrowthDashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [isOffline, setIsOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsR, queueR, radarR, engR, healthR, pmR, campR, ttR] =
          await Promise.all([
            fetch("/api/growth/stats").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/queue/stats").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/radar/stats").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/engagement/stats").then((r) => r.json()).catch(() => null),
            fetch("/api/growthops").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/process-map").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/campaigns").then((r) => r.json()).catch(() => null),
            fetch("/api/growth/tiktok").then((r) => r.json()).catch(() => null),
          ]);

        if (healthR?.status === "offline" || statsR?.offline) {
          setIsOffline(true);
          setLoaded(true);
          return;
        }

        setIsOffline(false);
        setData({
          stats: statsR?.success !== false ? statsR : null,
          queueStats: queueR?.success !== false ? queueR : null,
          radarStats: radarR?.success !== false ? radarR : null,
          engagementStats: engR?.success !== false ? engR : null,
          processMap: pmR?.stages ? pmR : null,
          campaigns: {
            total: campR?.campaigns?.length ?? 0,
            active: campR?.campaigns?.filter((c: { status: string }) => c.status === "active").length ?? 0,
          },
          tiktok: {
            pending: ttR?.items?.filter((i: { status: string }) => i.status === "pending_approval").length ?? 0,
            ready: ttR?.items?.filter((i: { status: string }) => i.status === "approved").length ?? 0,
          },
        });
      } catch {
        setIsOffline(true);
      }
      setLoaded(true);
    }

    fetchAll();
    const iv = setInterval(fetchAll, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Always compute — uses defaults when data is null
  const temp = computeTemperature(data);
  const color = tempColor(temp);
  const label = tempLabel(temp);

  const discovered = data.stats?.discoveries ?? 0;
  const created = data.stats?.contentGenerated ?? 0;
  const published = data.stats?.postsPublished ?? 0;
  const queued = data.queueStats?.queued ?? 0;
  const approved = data.queueStats?.approved ?? 0;
  const rejected = data.queueStats?.rejected ?? 0;
  const activeSignals = data.radarStats?.active_signals ?? 0;
  const newThisWeek = data.radarStats?.new_this_week ?? 0;
  const hot = data.radarStats?.hot ?? 0;
  const warm = data.radarStats?.warm ?? 0;
  const emerging = data.radarStats?.emerging ?? 0;
  const totalEngagements = data.engagementStats?.stats?.total_engagements ?? 0;
  const pendingComments = data.engagementStats?.stats?.pending_comments ?? 0;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading...</p>
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="px-8 py-8 max-w-[1440px] mx-auto">
        <EmptyState
          offline
          title="Backend offline"
          message="Growth-Ops server is not reachable on :3002"
        />
      </div>
    );
  }

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-6">
      {/* ── Temperature ──────────────────────────────────── */}
      <div className="card fade-up" style={{ padding: "1.5rem 2rem" }}>
        <div className="flex items-center gap-4 mb-3">
          <p
            className="leading-none tabular-nums"
            style={{
              color,
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontWeight: 300,
              fontSize: "3rem",
            }}
          >
            {temp}°
          </p>
          <div className="flex-1">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--warm)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${temp}%`,
                  backgroundColor: color,
                  transition: "width 1s ease-out, background-color 0.5s ease",
                }}
              />
            </div>
            <p className="text-[0.55rem] text-mid/60 mt-1 label-caps">{label}</p>
          </div>
        </div>
        <p className="text-sm text-mid">
          <span className="tabular-nums">{discovered}</span>
          <span className="text-mid/40 mx-1.5">→</span>
          <span className="tabular-nums">{created}</span>
          <span className="text-mid/40 mx-1"> created </span>
          <span className="text-mid/40 mx-1.5">→</span>
          <span className="tabular-nums">{published}</span>
          <span className="text-mid/40 mx-1"> published</span>
        </p>
      </div>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <div
        className="grid grid-cols-3 sm:grid-cols-6 gap-3 fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        {[
          { label: "Signals", value: discovered, color: "var(--olive)" },
          { label: "Created", value: created, color: "var(--lilac)" },
          { label: "Published", value: published, color: "var(--charcoal)" },
          { label: "Queue", value: queued, color: "var(--lilac)" },
          { label: "Hot", value: hot, color: "var(--terracotta)" },
          { label: "Engaged", value: totalEngagements, color: "var(--amber)" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center transition-all hover:bg-paper hover:border-warm"
          >
            <p
              className="leading-none mb-0.5 tabular-nums"
              style={{
                color: kpi.color,
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontWeight: 400,
                fontSize: "1.5rem",
              }}
            >
              {kpi.value}
            </p>
            <p className="label-caps text-[0.5rem] text-mid/60">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Section Cards (3×2) ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Queue"
          href="/growth/queue"
          accent="var(--lilac)"
          primary={queued}
          secondary={`${approved} approved · ${rejected} rejected`}
          icon={ICONS.queue}
          delay={0.1}
        >
          {queued + approved + rejected > 0 && (
            <div
              className="flex gap-0.5 mt-2 h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {approved > 0 && (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(approved / (queued + approved + rejected)) * 100}%`,
                    backgroundColor: "var(--olive)",
                  }}
                />
              )}
              {queued > 0 && (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(queued / (queued + approved + rejected)) * 100}%`,
                    backgroundColor: "var(--lilac)",
                  }}
                />
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Discovery"
          href="/growth/discovery"
          accent="var(--olive)"
          primary={discovered}
          secondary={`${newThisWeek} this week`}
          icon={ICONS.discovery}
          delay={0.15}
        />

        <SectionCard
          title="Radar"
          href="/growth/radar"
          accent="var(--terracotta)"
          primary={activeSignals}
          secondary="active signals"
          icon={ICONS.radar}
          delay={0.2}
        >
          <div className="flex items-center gap-2 mt-2">
            {[
              { n: hot, c: "var(--terracotta)", l: "hot" },
              { n: warm, c: "var(--amber)", l: "warm" },
              { n: emerging, c: "var(--olive)", l: "emerging" },
            ].map((tier) => (
              <span
                key={tier.l}
                className="flex items-center gap-1 text-[0.5rem]"
                style={{ color: tier.c }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: tier.c }}
                />
                {tier.n}
              </span>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Engagement"
          href="/growth/engagement"
          accent="var(--amber)"
          primary={totalEngagements}
          secondary={pendingComments > 0 ? `${pendingComments} pending` : "no pending"}
          icon={ICONS.engagement}
          delay={0.25}
        />

        <SectionCard
          title="TikTok"
          href="/growth/tiktok"
          accent="var(--charcoal)"
          primary={data.tiktok.pending}
          secondary={data.tiktok.ready > 0 ? `${data.tiktok.ready} ready` : "fresh start"}
          icon={ICONS.tiktok}
          delay={0.3}
        />

        <SectionCard
          title="Campaigns"
          href="/growth/campaigns"
          accent="var(--lilac)"
          primary={data.campaigns.total}
          secondary={`${data.campaigns.active} active`}
          icon={ICONS.campaigns}
          delay={0.35}
        />
      </div>

      {/* ── Pipeline Health ──────────────────────────────── */}
      {data.processMap && (
        <div className="card fade-up" style={{ animationDelay: "0.4s" }}>
          <p className="label-caps text-[0.55rem] mb-3">Pipeline Health</p>
          <div className="flex flex-wrap gap-3">
            {data.processMap.stages.map((s) => (
              <div key={s.stage} className="flex-1 min-w-[80px]">
                <p className="label-caps text-[0.5rem] text-mid/60 mb-1 capitalize">
                  {s.stage}
                </p>
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: COVERAGE_COLORS[s.coverage] }}
                />
              </div>
            ))}
          </div>
          <p className="text-[0.55rem] text-mid/50 mt-2">
            {data.processMap.summary.full} full · {data.processMap.summary.partial}{" "}
            partial · {data.processMap.summary.none} pending
          </p>
        </div>
      )}
    </div>
  );
}
