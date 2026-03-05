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
  posted?: number;
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
  history:
    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  campaigns:
    "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
};

const COVERAGE_COLORS: Record<string, string> = {
  full: "var(--olive)",
  partial: "var(--amber)",
  none: "var(--warm)",
};

// ── Radial Gauge ─────────────────────────────────────────────────

function RadialGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const radius = 70;
  const strokeWidth = 10;
  const cx = 90;
  const cy = 85;
  const circumference = Math.PI * radius; // half circle
  const fillLength = (value / 100) * circumference;
  const dashArray = `${fillLength} ${circumference}`;

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="105" viewBox="0 0 180 105">
        {/* Background arc */}
        <path
          d={describeArc(cx, cy, radius)}
          fill="none"
          stroke="var(--warm)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={describeArc(cx, cy, radius)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          className="gauge-arc"
        />
        {/* Center number */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontWeight: 300,
            fontSize: "2.5rem",
            fill: color,
          }}
        >
          {value}°
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          style={{
            fontFamily: "var(--font-dm-mono), monospace",
            fontWeight: 400,
            fontSize: "0.5rem",
            fill: "var(--mid)",
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
          }}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number): string {
  // Half circle from left to right (180° arc)
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

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

// ── Pipeline Stage ──────────────────────────────────────────────

function PipelineStage({ stage, coverage, isLast }: { stage: string; coverage: string; isLast: boolean }) {
  const isFull = coverage === "full";
  const isPartial = coverage === "partial";

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex-1 min-w-[60px]">
        <p className="label-caps text-[0.45rem] text-mid/60 mb-1.5 capitalize truncate">
          {stage}
        </p>
        <div
          className="h-6 rounded-lg flex items-center justify-center relative overflow-hidden"
          style={{
            backgroundColor: isFull
              ? "var(--olive-soft)"
              : isPartial
                ? "var(--amber-soft)"
                : "transparent",
            border: isFull
              ? "1.5px solid var(--olive)"
              : isPartial
                ? "1.5px solid var(--amber)"
                : "1.5px dashed var(--mid)",
            borderColor: isFull
              ? "var(--olive)"
              : isPartial
                ? "var(--amber)"
                : "var(--warm)",
          }}
        >
          {isFull && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {isPartial && (
            <div className="absolute inset-0 flex">
              <div className="w-1/2 h-full" style={{ backgroundColor: "var(--amber)", opacity: 0.15 }} />
            </div>
          )}
          {!isFull && !isPartial && (
            <span className="text-[0.5rem] text-mid/30">—</span>
          )}
        </div>
      </div>
      {/* Connector arrow */}
      {!isLast && (
        <div className="flex items-center px-1 pt-4">
          <svg width="16" height="8" viewBox="0 0 16 8" className="text-mid/20">
            <line x1="0" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1" />
            <polyline points="10,1 14,4 10,7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Tier Bar ────────────────────────────────────────────────────

function TierBar({ hot, warm, emerging }: { hot: number; warm: number; emerging: number }) {
  const total = hot + warm + emerging;
  if (total === 0) return null;
  return (
    <div className="flex gap-0.5 mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
      {hot > 0 && (
        <div
          className="h-full rounded-full"
          style={{ width: `${(hot / total) * 100}%`, backgroundColor: "var(--terracotta)" }}
          title={`${hot} hot`}
        />
      )}
      {warm > 0 && (
        <div
          className="h-full rounded-full"
          style={{ width: `${(warm / total) * 100}%`, backgroundColor: "var(--amber)" }}
          title={`${warm} warm`}
        />
      )}
      {emerging > 0 && (
        <div
          className="h-full rounded-full"
          style={{ width: `${(emerging / total) * 100}%`, backgroundColor: "var(--olive)" }}
          title={`${emerging} emerging`}
        />
      )}
    </div>
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
  const posted = data.queueStats?.posted ?? 0;
  const activeSignals = data.radarStats?.active_signals ?? 0;
  const newThisWeek = data.radarStats?.new_this_week ?? 0;
  const hot = data.radarStats?.hot ?? 0;
  const warm = data.radarStats?.warm ?? 0;
  const emerging = data.radarStats?.emerging ?? 0;
  const totalEngagements = data.engagementStats?.stats?.total_engagements ?? 0;
  const pendingComments = data.engagementStats?.stats?.pending_comments ?? 0;
  const inPipeline = created - published;

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
      {/* ── Temperature — Radial Gauge ────────────────────── */}
      <div className="card fade-up" style={{ padding: "1.5rem 2rem" }}>
        <RadialGauge value={temp} color={color} label={label} />
        <p className="text-sm text-mid text-center mt-2">
          <span className="tabular-nums">{discovered}</span>
          <span className="text-mid/40 mx-1.5">→</span>
          <span className="tabular-nums">{created}</span>
          <span className="text-mid/40 mx-1"> created </span>
          <span className="text-mid/40 mx-1.5">→</span>
          <span className="tabular-nums">{published}</span>
          <span className="text-mid/40 mx-1"> published</span>
        </p>
      </div>

      {/* ── KPI Strip with Delta Indicators ───────────────── */}
      <div
        className="grid grid-cols-3 sm:grid-cols-6 gap-3 fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        {[
          { label: "Signals", value: discovered, color: "var(--olive)", delta: newThisWeek, deltaLabel: "new" },
          { label: "Created", value: created, color: "var(--lilac)", delta: null, deltaLabel: "" },
          { label: "Published", value: published, color: "var(--charcoal)", delta: null, deltaLabel: "" },
          { label: "Queue", value: queued, color: "var(--lilac)", delta: approved, deltaLabel: "approved" },
          { label: "Hot", value: hot, color: "var(--terracotta)", delta: null, deltaLabel: "" },
          { label: "Engaged", value: totalEngagements, color: "var(--amber)", delta: pendingComments, deltaLabel: "pending" },
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
            {kpi.delta !== null && kpi.delta > 0 && (
              <p className="text-[0.5rem] mt-0.5 tabular-nums" style={{ color: kpi.color, opacity: 0.7 }}>
                +{kpi.delta} {kpi.deltaLabel}
              </p>
            )}
            {kpi.delta !== null && kpi.delta === 0 && (
              <p className="text-[0.5rem] mt-0.5 text-mid/30">—</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Section Cards (2×2) ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Queue Card — with pulsing dot when items pending */}
        <SectionCard
          title="Queue"
          href="/growth/queue"
          accent="var(--lilac)"
          primary={queued}
          secondary={`${approved} approved · ${rejected} rejected`}
          icon={ICONS.queue}
          delay={0.1}
        >
          {queued > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: "var(--lilac)" }} />
              <span className="text-[0.5rem] text-lilac/70">{queued} pending approval</span>
            </div>
          )}
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

        {/* Signals Card — with tier bar */}
        <SectionCard
          title="Signals"
          href="/growth/signals"
          accent="var(--olive)"
          primary={discovered}
          secondary={`${newThisWeek} this week`}
          icon={ICONS.discovery}
          delay={0.15}
        >
          <TierBar hot={hot} warm={warm} emerging={emerging} />
          <div className="flex items-center gap-2 mt-1.5">
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

        {/* Engagement Card — with empty state */}
        <SectionCard
          title="Engagement"
          href="/growth/engagement"
          accent="var(--amber)"
          primary={totalEngagements}
          secondary={pendingComments > 0 ? `${pendingComments} pending` : "no pending"}
          icon={ICONS.engagement}
          delay={0.2}
        >
          {totalEngagements === 0 && (
            <div className="flex items-center gap-2 mt-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span className="text-[0.5rem] text-mid/30 italic">waiting for signals</span>
            </div>
          )}
        </SectionCard>

        {/* History Card — FIXED: shows published count, not TikTok data */}
        <SectionCard
          title="History"
          href="/growth/history"
          accent="var(--charcoal)"
          primary={published}
          secondary={inPipeline > 0 ? `${inPipeline} in pipeline` : "all published"}
          icon={ICONS.history}
          delay={0.25}
        >
          {/* Mini bar showing pipeline breakdown */}
          {created > 0 && (
            <div className="flex gap-0.5 mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(published / created) * 100}%`,
                  backgroundColor: "var(--charcoal)",
                }}
                title={`${published} published`}
              />
              {inPipeline > 0 && (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(inPipeline / created) * 100}%`,
                    backgroundColor: "var(--warm)",
                    border: "1px solid var(--mid)",
                    opacity: 0.3,
                  }}
                  title={`${inPipeline} in pipeline`}
                />
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Pipeline Health — Segmented Gauge ─────────────── */}
      {data.processMap && (
        <div className="card fade-up" style={{ animationDelay: "0.4s" }}>
          <p className="label-caps text-[0.55rem] mb-3">Pipeline Health</p>
          <div className="flex items-end gap-0">
            {data.processMap.stages.map((s, i) => (
              <PipelineStage
                key={s.stage}
                stage={s.stage}
                coverage={s.coverage}
                isLast={i === data.processMap!.stages.length - 1}
              />
            ))}
          </div>
          <p className="text-[0.55rem] text-mid/50 mt-3">
            <span style={{ color: "var(--olive)" }}>{data.processMap.summary.full} full</span>
            {" · "}
            <span style={{ color: "var(--amber)" }}>{data.processMap.summary.partial} partial</span>
            {" · "}
            <span style={{ color: "var(--mid)", opacity: 0.5 }}>{data.processMap.summary.none} pending</span>
          </p>
        </div>
      )}
    </div>
  );
}
