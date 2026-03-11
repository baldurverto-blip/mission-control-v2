"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { EmptyState } from "../components/EmptyState";
import { AGENTS, relTime, agent as agentToken } from "../lib/agents";
import { B2BLane } from "../components/B2BLane";

// ── Types ────────────────────────────────────────────────────────

interface PipelineStage {
  totalSignals?: number;
  newThisWeek?: number;
  hot?: number;
  warm?: number;
  emerging?: number;
  activeSignals?: number;
  status: string;
  // ideation
  proposed?: number;
  refined?: number;
  qualified?: number;
  total?: number;
  shipped?: number;
  // content
  queued?: number;
  approved?: number;
  posted?: number;
  rejected?: number;
  totalEngagements?: number;
  pendingComments?: number;
  // distribution
  apps?: DistributionApp[];
  totalActiveLayers?: number;
  totalFailedLayers?: number;
  // feedback
  lastIngest?: string | null;
  activeSignalsArr?: { slug: string; signals: string[] }[];
  totalBlogPosts?: number;
  totalFaqEntries?: number;
  totalIndexedPages?: number;
}

interface DistributionApp {
  slug: string;
  engineStatus: string;
  layers: { name: string; status: string; lastRun: string | null; runs: number; result: string | null; blocking: string[] }[];
  activeLayers: number;
  failedLayers: number;
  reddit: { karma: number; comments: number; subreddits: string[] };
  seo: { blogs: number; faqEntries: number; programmaticPages: number; indexedPages: number };
  tiktok: { drafted: number };
  waitlist: { signups: number; url: string | null };
}

interface FactoryProject {
  slug: string;
  status: string;
  phase: number;
  completedPhases: number;
  totalPhases: number;
  qualityScore: number | null;
  qualityAttempt: number;
}

interface AttentionItem {
  type: string;
  slug?: string;
  message: string;
  severity: "error" | "warning" | "info";
}

interface ActivityItem {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  timestamp: string;
  duration_ms: number;
  model: string;
}

interface OverviewData {
  pipeline: {
    discovery: PipelineStage;
    ideation: PipelineStage;
    content: PipelineStage;
    distribution: PipelineStage & { apps: DistributionApp[]; totalActiveLayers: number; totalFailedLayers: number };
    feedback: PipelineStage & { lastIngest: string | null; activeSignals: { slug: string; signals: string[] }[]; totalBlogPosts: number; totalFaqEntries: number; totalIndexedPages: number };
  };
  factory: { building: number; shipping: number; shipped: number; attention: number; projects: FactoryProject[] };
  attention: AttentionItem[];
  activity: ActivityItem[];
  temperature: number;
  growthOpsOnline: boolean;
}

// ── Pipeline Node Icons (inline SVG paths) ──────────────────────

const STAGE_ICONS: Record<string, string> = {
  discovery: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  ideation: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  content: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  distribution: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
  feedback: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
};

const STAGE_COLORS: Record<string, string> = {
  discovery: "var(--olive)",
  ideation: "var(--amber)",
  content: "var(--lilac)",
  distribution: "var(--terracotta)",
  feedback: "var(--mid)",
};

const STAGE_HREFS: Record<string, string> = {
  discovery: "/growth/signals",
  ideation: "/growth/ideas",
  content: "/growth/queue",
  distribution: "/growth/distribution",
  feedback: "/growth/history",
};

// ── Temperature helpers ─────────────────────────────────────────

function tempLabel(t: number): string {
  if (t <= 20) return "Cold";
  if (t <= 40) return "Cool";
  if (t <= 60) return "Warming";
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

// ── Severity helpers ────────────────────────────────────────────

function severityColor(s: string): string {
  if (s === "error") return "var(--terracotta)";
  if (s === "warning") return "var(--amber)";
  return "var(--mid)";
}

function severitySoft(s: string): string {
  if (s === "error") return "var(--terracotta-soft)";
  if (s === "warning") return "var(--amber-soft)";
  return "var(--warm)";
}

// ── Status helpers ──────────────────────────────────────────────

function statusDotColor(s: string): string {
  if (s === "active" || s === "complete") return "var(--olive)";
  if (s === "failed" || s === "error" || s === "offline") return "var(--terracotta)";
  if (s === "pending" || s === "idle") return "var(--warm)";
  return "var(--mid)";
}

// ── Sub-components ──────────────────────────────────────────────

function TemperatureRing({ value, size = 72 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (value / 100) * circ;
  const color = tempColor(value);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--warm)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          className="ring-arc" style={{ "--ring-circumference": `${circ}` } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="leading-none tabular-nums"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, fontSize: "1.4rem", color }}
        >
          {value}°
        </span>
      </div>
    </div>
  );
}

function PipelineNode({
  name,
  icon,
  color,
  href,
  metric,
  metricLabel,
  status,
  isLast,
  delay,
}: {
  name: string;
  icon: string;
  color: string;
  href: string;
  metric: number;
  metricLabel: string;
  status: string;
  isLast: boolean;
  delay: number;
}) {
  return (
    <div className="flex items-center flex-1 min-w-0">
      <Link
        href={href}
        className="flex-1 min-w-[100px] group fade-up"
        style={{ animationDelay: `${delay}s` }}
      >
        <div className="relative rounded-xl border border-warm bg-paper/60 px-3 py-3 transition-all hover:bg-paper hover:border-warm hover:shadow-sm hover:-translate-y-0.5 text-center">
          {/* Health dot */}
          <span
            className={`absolute top-2 right-2 w-2 h-2 rounded-full ${status === "active" ? "pulse-dot" : ""}`}
            style={{ backgroundColor: statusDotColor(status) }}
          />
          {/* Icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-1.5">
            <path d={icon} />
          </svg>
          {/* Metric */}
          <p
            className="leading-none tabular-nums"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.5rem", color }}
          >
            {metric}
          </p>
          <p className="label-caps text-[0.8rem] mt-0.5 text-mid/80">{metricLabel}</p>
          {/* Stage label */}
          <p className="text-[0.75rem] mt-1.5 pt-1.5 border-t border-warm/60 capitalize transition-colors group-hover:opacity-80" style={{ color }}>
            {name} →
          </p>
        </div>
      </Link>
      {/* Connector */}
      {!isLast && (
        <div className="flex items-center px-1">
          <svg width="20" height="8" viewBox="0 0 20 8" className="text-warm">
            <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
            <polyline points="14,1.5 18,4 14,6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

function ModuleCard({
  title,
  color,
  href,
  delay,
  children,
}: {
  title: string;
  color: string;
  href: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="card fade-up block group"
      style={{ animationDelay: `${delay}s`, borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="label-caps text-[0.75rem]" style={{ color }}>{title}</p>
        <span className="text-[0.7rem] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color }}>
          Open →
        </span>
      </div>
      {children}
    </Link>
  );
}

function MiniBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
      {segments.map((seg) =>
        seg.value > 0 ? (
          <div
            key={seg.label}
            className="h-full rounded-full transition-all"
            style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.value} ${seg.label}`}
          />
        ) : null,
      )}
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[0.8rem] text-mid/70">{label}</span>
      <span className="text-[0.8rem] tabular-nums font-medium" style={{ color: color ?? "var(--charcoal)" }}>{value}</span>
    </div>
  );
}

function LayerDots({ layers }: { layers: { name: string; status: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {layers.map((l) => (
        <div key={l.name} className="flex items-center gap-0.5" title={`${l.name}: ${l.status}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDotColor(l.status) }} />
          <span className="text-[0.7rem] text-mid/70 uppercase">{l.name.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Phase progress bar for factory ──────────────────────────────

const PHASE_LABELS = ["res", "val", "bld", "qg", "mon", "pkg", "shp", "mkt", "pro"];

function PhaseBar({ completedPhases, totalPhases, status }: { completedPhases: number; totalPhases: number; status: string }) {
  return (
    <div className="flex gap-0.5">
      {PHASE_LABELS.map((label, i) => {
        const done = i < completedPhases;
        const isTerminal = ["shipped", "submitted", "rejected", "paused"].includes(status);
        const current = i === completedPhases && !isTerminal;
        return (
          <div
            key={label}
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{
              backgroundColor: done
                ? "var(--olive)"
                : current
                  ? "var(--amber)"
                  : "var(--warm)",
            }}
            title={`${label}: ${done ? "done" : current ? "current" : "pending"}`}
          />
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function GrowthOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    const iv = setInterval(fetchData, 45_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading growth engine...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-8 py-8 max-w-[1440px] mx-auto">
        <EmptyState offline title="Unable to load" message="Could not read growth pipeline state" />
      </div>
    );
  }

  const { pipeline, factory, attention, activity, temperature } = data;
  const { discovery, ideation, content, distribution, feedback } = pipeline;

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-5">

      {/* ── Hero: Temperature + Key Flow ─────────────────────── */}
      <div className="card fade-up flex items-center gap-6 flex-wrap" style={{ padding: "1rem 1.5rem" }}>
        <TemperatureRing value={temperature} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-mid mb-1">
            <span className="font-medium" style={{ color: tempColor(temperature) }}>{tempLabel(temperature)}</span>
            <span className="text-mid/60 mx-2">·</span>
            <span className="text-mid/80">{factory.building + factory.shipping} building · {factory.shipped} shipped</span>
          </p>
          {/* Flow summary */}
          <div className="flex items-center gap-2 text-sm text-mid/80">
            <span className="tabular-nums" style={{ color: "var(--olive)" }}>{discovery.totalSignals}</span>
            <span className="text-mid/55">signals →</span>
            <span className="tabular-nums" style={{ color: "var(--amber)" }}>{ideation.total}</span>
            <span className="text-mid/55">ideas →</span>
            <span className="tabular-nums" style={{ color: "var(--lilac)" }}>{content.posted}</span>
            <span className="text-mid/55">posted →</span>
            <span className="tabular-nums" style={{ color: "var(--terracotta)" }}>{distribution.apps.length}</span>
            <span className="text-mid/55">distributing</span>
          </div>
        </div>
        {/* Attention count */}
        {attention.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--terracotta-soft)" }}>
            <span className="w-2 h-2 rounded-full attention-pulse" style={{ backgroundColor: "var(--terracotta)" }} />
            <span className="text-xs" style={{ color: "var(--terracotta)" }}>
              {attention.filter((a) => a.severity === "error").length > 0
                ? `${attention.filter((a) => a.severity === "error").length} issues`
                : `${attention.length} items`}
            </span>
          </div>
        )}
      </div>

      {/* ── Pipeline River ───────────────────────────────────── */}
      <div className="flex items-stretch gap-0">
        <PipelineNode
          name="Discovery" icon={STAGE_ICONS.discovery} color={STAGE_COLORS.discovery}
          href={STAGE_HREFS.discovery} metric={discovery.totalSignals ?? 0} metricLabel="signals"
          status={discovery.status} isLast={false} delay={0.05}
        />
        <PipelineNode
          name="Ideation" icon={STAGE_ICONS.ideation} color={STAGE_COLORS.ideation}
          href={STAGE_HREFS.ideation} metric={ideation.total ?? 0} metricLabel="ideas"
          status={ideation.status} isLast={false} delay={0.1}
        />
        <PipelineNode
          name="Content" icon={STAGE_ICONS.content} color={STAGE_COLORS.content}
          href={STAGE_HREFS.content} metric={(content.queued ?? 0) + (content.approved ?? 0) + (content.posted ?? 0)} metricLabel="items"
          status={content.status} isLast={false} delay={0.15}
        />
        <PipelineNode
          name="Distribution" icon={STAGE_ICONS.distribution} color={STAGE_COLORS.distribution}
          href={STAGE_HREFS.distribution} metric={distribution.totalActiveLayers ?? 0} metricLabel="active layers"
          status={distribution.status} isLast={false} delay={0.2}
        />
        <PipelineNode
          name="Feedback" icon={STAGE_ICONS.feedback} color={STAGE_COLORS.feedback}
          href={STAGE_HREFS.feedback} metric={(feedback.totalBlogPosts ?? 0) + (feedback.totalFaqEntries ?? 0)} metricLabel="SEO pages"
          status={feedback.status} isLast delay={0.25}
        />
      </div>

      {/* ── Module Detail Cards (2×3 grid) ───────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Discovery Module */}
        <ModuleCard title="Discovery" color={STAGE_COLORS.discovery} href="/growth/signals" delay={0.3}>
          <MetricRow label="Total signals" value={discovery.totalSignals ?? 0} color="var(--olive)" />
          <MetricRow label="New this week" value={discovery.newThisWeek ?? 0} />
          <div className="flex items-center gap-2 mt-1.5">
            {[
              { n: discovery.hot ?? 0, c: "var(--terracotta)", l: "hot" },
              { n: discovery.warm ?? 0, c: "var(--amber)", l: "warm" },
              { n: discovery.emerging ?? 0, c: "var(--olive)", l: "emerging" },
            ].map((tier) => (
              <span key={tier.l} className="flex items-center gap-0.5 text-[0.75rem]" style={{ color: tier.c }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.c }} />
                {tier.n}
              </span>
            ))}
          </div>
          <MiniBar
            segments={[
              { value: discovery.hot ?? 0, color: "var(--terracotta)", label: "hot" },
              { value: discovery.warm ?? 0, color: "var(--amber)", label: "warm" },
              { value: discovery.emerging ?? 0, color: "var(--olive)", label: "emerging" },
            ]}
          />
        </ModuleCard>

        {/* Ideation Module */}
        <ModuleCard title="Ideation" color={STAGE_COLORS.ideation} href="/growth/ideas" delay={0.35}>
          <MetricRow label="Proposed" value={ideation.proposed ?? 0} />
          <MetricRow label="Refined" value={ideation.refined ?? 0} />
          <MetricRow label="Qualified" value={ideation.qualified ?? 0} color="var(--olive)" />
          <MetricRow label="Shipped" value={ideation.shipped ?? 0} />
          <MiniBar
            segments={[
              { value: ideation.proposed ?? 0, color: "var(--warm)", label: "proposed" },
              { value: ideation.refined ?? 0, color: "var(--amber)", label: "refined" },
              { value: ideation.qualified ?? 0, color: "var(--olive)", label: "qualified" },
            ]}
          />
        </ModuleCard>

        {/* Content Module */}
        <ModuleCard title="Content" color={STAGE_COLORS.content} href="/growth/queue" delay={0.4}>
          <MetricRow label="Pending approval" value={content.queued ?? 0} color={(content.queued ?? 0) > 0 ? "var(--lilac)" : undefined} />
          <MetricRow label="Approved" value={content.approved ?? 0} />
          <MetricRow label="Published" value={content.posted ?? 0} color="var(--olive)" />
          <MetricRow label="Engagements" value={content.totalEngagements ?? 0} />
          <MiniBar
            segments={[
              { value: content.posted ?? 0, color: "var(--olive)", label: "posted" },
              { value: content.approved ?? 0, color: "var(--lilac)", label: "approved" },
              { value: content.queued ?? 0, color: "var(--amber)", label: "queued" },
              { value: content.rejected ?? 0, color: "var(--terracotta)", label: "rejected" },
            ]}
          />
        </ModuleCard>

        {/* Distribution Module */}
        <ModuleCard title="Distribution" color={STAGE_COLORS.distribution} href="/growth/distribution" delay={0.45}>
          {distribution.apps.length === 0 ? (
            <p className="text-[0.8rem] text-mid/60 italic py-2">No apps in distribution yet</p>
          ) : (
            distribution.apps.map((app) => (
              <div key={app.slug} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between">
                  <span className="text-[0.8rem] font-medium text-charcoal capitalize">{app.slug}</span>
                  <span className="text-[0.7rem] px-1.5 py-0.5 rounded-full" style={{
                    backgroundColor: app.engineStatus === "active" ? "var(--olive-soft)" : "var(--warm)",
                    color: app.engineStatus === "active" ? "var(--olive)" : "var(--mid)",
                  }}>
                    {app.activeLayers}/6 layers
                  </span>
                </div>
                <LayerDots layers={app.layers} />
              </div>
            ))
          )}
        </ModuleCard>

        {/* Feedback Module */}
        <ModuleCard title="Feedback & SEO" color={STAGE_COLORS.feedback} href="/growth/history" delay={0.5}>
          <MetricRow label="Blog posts" value={feedback.totalBlogPosts} />
          <MetricRow label="FAQ entries" value={feedback.totalFaqEntries} />
          <MetricRow label="Indexed pages" value={feedback.totalIndexedPages} />
          <MetricRow
            label="Last KPI ingest"
            value={feedback.lastIngest ? relTime(feedback.lastIngest) : "never"}
            color={feedback.lastIngest ? undefined : "var(--mid)"}
          />
          {feedback.activeSignals.length > 0 && (
            <div className="mt-1 pt-1 border-t border-warm/60">
              {feedback.activeSignals.map((s) => (
                <div key={s.slug} className="text-[0.75rem]">
                  <span className="text-mid/80">{s.slug}:</span>{" "}
                  <span style={{ color: "var(--amber)" }}>{s.signals.join(", ")}</span>
                </div>
              ))}
            </div>
          )}
        </ModuleCard>

        {/* Engagement Module */}
        <ModuleCard title="Engagement" color="var(--amber)" href="/growth/engagement" delay={0.55}>
          {distribution.apps.length === 0 ? (
            <p className="text-[0.8rem] text-mid/60 italic py-2">No engagement data yet</p>
          ) : (
            distribution.apps.map((app) => (
              <div key={app.slug} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between">
                  <span className="text-[0.8rem] font-medium text-charcoal capitalize">{app.slug}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[0.75rem] text-mid/80">
                    <span className="tabular-nums font-medium" style={{ color: "var(--amber)" }}>{app.reddit.karma}</span> karma
                  </span>
                  <span className="text-[0.75rem] text-mid/80">
                    <span className="tabular-nums font-medium">{app.reddit.comments}</span> comments
                  </span>
                  <span className="text-[0.75rem] text-mid/80">
                    <span className="tabular-nums font-medium">{app.reddit.subreddits.length}</span> subs
                  </span>
                </div>
                {app.waitlist.signups > 0 && (
                  <span className="text-[0.75rem] text-mid/80 block mt-0.5">
                    <span className="tabular-nums font-medium" style={{ color: "var(--olive)" }}>{app.waitlist.signups}</span> waitlist signups
                  </span>
                )}
              </div>
            ))
          )}
        </ModuleCard>
      </div>

      {/* ── B2B Discovery Lane ─────────────────────────────── */}
      <B2BLane />

      {/* ── Attention Items ──────────────────────────────────── */}
      {attention.length > 0 && (
        <div className="card fade-up" style={{ animationDelay: "0.6s" }}>
          <p className="label-caps text-[0.75rem] mb-2">Needs Attention</p>
          <div className="space-y-1">
            {attention.slice(0, 8).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[0.8rem]"
                style={{ backgroundColor: severitySoft(item.severity) }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: severityColor(item.severity) }} />
                <span style={{ color: severityColor(item.severity) }}>{item.message}</span>
              </div>
            ))}
            {attention.length > 8 && (
              <p className="text-[0.75rem] text-mid/60 pl-3">+{attention.length - 8} more</p>
            )}
          </div>
        </div>
      )}

      {/* ── Factory Alignment ────────────────────────────────── */}
      {factory.projects.length > 0 && (
        <div className="card fade-up" style={{ animationDelay: "0.65s" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="label-caps text-[0.75rem]">Factory Alignment</p>
            <Link href="/factory" className="text-[0.75rem] text-mid/70 hover:text-charcoal transition-colors">
              Open Factory →
            </Link>
          </div>
          <div className="space-y-2.5">
            {factory.projects.map((p) => (
              <div key={p.slug}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.7rem] font-medium text-charcoal capitalize">{p.slug}</span>
                    <span
                      className="text-[0.7rem] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          p.status === "shipped" ? "var(--olive-soft)"
                          : p.status === "awaiting-approval" ? "var(--amber-soft)"
                          : p.status === "needs-review" ? "var(--terracotta-soft)"
                          : "var(--warm)",
                        color:
                          p.status === "shipped" ? "var(--olive)"
                          : p.status === "awaiting-approval" ? "var(--amber)"
                          : p.status === "needs-review" ? "var(--terracotta)"
                          : "var(--mid)",
                      }}
                    >
                      {p.status.replace("-", " ")}
                    </span>
                  </div>
                  <span className="text-[0.75rem] text-mid/70 tabular-nums">{p.completedPhases}/{p.totalPhases}</span>
                </div>
                <PhaseBar completedPhases={p.completedPhases} totalPhases={p.totalPhases} status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Activity ──────────────────────────────────── */}
      {activity.length > 0 && (
        <div className="card fade-up" style={{ animationDelay: "0.7s" }}>
          <p className="label-caps text-[0.75rem] mb-2">Recent Activity</p>
          <div className="space-y-0.5 max-h-[240px] overflow-y-auto custom-scroll">
            {activity.slice(0, 10).map((evt, i) => {
              const tok = agentToken(evt.agent);
              const isErr = evt.outcome.toLowerCase().includes("fail") || evt.outcome.toLowerCase().includes("error");
              return (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-warm/30 last:border-0">
                  {/* Time */}
                  <span className="text-[0.75rem] text-mid/60 tabular-nums w-8 flex-shrink-0 pt-0.5" suppressHydrationWarning>
                    {relTime(evt.timestamp)}
                  </span>
                  {/* Agent badge */}
                  <span
                    className="text-[0.7rem] px-1 py-0.5 rounded font-medium flex-shrink-0"
                    style={{ backgroundColor: tok.soft, color: tok.color }}
                  >
                    {tok.label}
                  </span>
                  {/* Action + outcome */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[0.8rem] text-mid/70">{evt.action}</span>
                    <p
                      className="text-[0.8rem] truncate"
                      style={{ color: isErr ? "var(--terracotta)" : "var(--charcoal)" }}
                    >
                      {evt.outcome}
                    </p>
                  </div>
                  {/* Model badge */}
                  {evt.model && evt.model !== "unknown" && (
                    <span className="text-[0.8rem] px-1 py-0.5 rounded bg-warm/50 text-mid/70 flex-shrink-0">
                      {evt.model}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
