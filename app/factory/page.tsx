"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { StatusDot } from "../components/StatusDot";
import { agent as agentToken, relTime, clockTime } from "@/app/lib/agents";

// ─── Types ───────────────────────────────────────────────────────────

interface PhaseState {
  status: string;
  score?: number;
  attempt?: number;
}

interface KPISnapshot {
  week: string;
  date: string;
  traffic: { impressions: number; page_views: number; downloads: number };
  users: { dau: number; wau: number; mau: number; d1_retention: number | null; d7_retention: number | null; d30_retention: number | null };
  revenue: { trial_starts: number; trial_to_paid: number | null; mrr: number; arpu: number };
  churn: { active_subs: number; cancellations: number; churn_rate: number | null; refund_rate: number | null };
}

interface PhaseDetail extends PhaseState {
  fixes_applied?: string[];
  summary?: string;
  prior_score?: number;
  model?: string;
  trial_days?: number;
  free_trial_scans?: number;
  pricing?: { monthly: number; annual: number };
  changes?: string[];
  operator_tasks?: string[];
  metadata_verified?: Record<string, boolean>;
  outputs?: string[];
}

interface FactoryProject {
  slug: string;
  status: string;
  phase: number;
  phases: Record<string, PhaseDetail>;
  created_at: string;
  updated_at: string;
  currentPhaseIdx: number;
  completedPhases: number;
  totalPhases: number;
  qualityScore: number | null;
  qualityAttempt: number;
  onePager?: string;
  latestKPI?: KPISnapshot | null;
  prevKPI?: KPISnapshot | null;
  activeSignals?: number;
  shipDate?: string | null;
  lastActivity?: ActivityEvent | null;
  e2eResults?: { status: string; tests: number; passed: number; failed: number } | null;
}

interface ActivityEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  timestamp: string;
  duration_ms: number;
  model?: string;
}

interface IdeaEntry {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  painkiller: boolean;
  source: string;
  queued_at: string;
}

interface FactoryData {
  projects: FactoryProject[];
  ideaQueue: { queue: IdeaEntry[]; shipped: IdeaEntry[]; rejected: IdeaEntry[] };
  config: { max_active_projects: number; quality_gate_threshold: number };
  stats: { building: number; shipping: number; shipped: number; queued: number; attention: number };
  phaseLabels: string[];
  activityFeed: ActivityEvent[];
  loopRunning: boolean;
  lastPulseAt: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const PHASE_AGENTS: Record<string, string> = {
  research: "scout",
  validation: "scout",
  build: "builder",
  "quality gate": "bastion",
  monetization: "vibe",
  packaging: "vibe",
  shipping: "builder",
  marketing: "vibe",
  promo: "vibe",
};

const STATUS_LABELS: Record<string, string> = {
  research: "Researching",
  validation: "Validating",
  build: "Building",
  "quality-gate": "Quality Gate",
  monetization: "Monetizing",
  packaging: "Packaging",
  shipping: "Ready to Ship",
  marketing: "Marketing",
  promo: "Promo",
  shipped: "Shipped",
  "awaiting-approval": "Awaiting Approval",
  "needs-review": "Needs Review",
  paused: "Paused",
};

// ─── Page ────────────────────────────────────────────────────────────

export default function FactoryPage() {
  const [data, setData] = useState<FactoryData | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<"queued" | "shipped" | "rejected">("queued");
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<{ slug: string; status: string; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/factory").then((r) => r.json()).catch(() => null);
    if (res && !res.error) setData(res);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="breathe">
          <p className="label-caps text-mid/50">Loading factory...</p>
        </div>
      </div>
    );
  }

  const { projects, ideaQueue, stats, phaseLabels, config, activityFeed, loopRunning, lastPulseAt } = data;

  const handleApproval = async (slug: string, action: "approve" | "reject", reason?: string) => {
    setApprovalLoading(slug);
    setApprovalResult(null);
    try {
      const res = await fetch("/api/factory/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action, reason }),
      });
      const result = await res.json();
      setApprovalResult({ slug, status: result.status ?? "error", message: result.message ?? result.error });
      // Refresh data after approval
      setTimeout(fetchData, 2000);
    } catch {
      setApprovalResult({ slug, status: "error", message: "Failed to submit approval" });
    } finally {
      setApprovalLoading(null);
    }
  };

  const awaitingApproval = projects.filter((p) => p.status === "awaiting-approval");

  const LIVE_THRESHOLD = 30 * 60 * 1000;
  const now = Date.now();
  // LIVE = a factory-loop process is actually running right now
  const isLive = loopRunning;
  // Recent = pulse within last 30 min (loop may have finished but was recently active)
  const hasRecentActivity = activityFeed.some(
    (e) => now - new Date(e.timestamp).getTime() < LIVE_THRESHOLD
  );

  return (
    <div className="min-h-screen px-6 py-5 fade-up">
      <div className="max-w-[1440px] mx-auto space-y-4">
        {/* ═══ HEADER ═════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl text-charcoal tracking-tight">App Factory</h1>
            {isLive ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "#16A34A" }}>
                <span className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: "#4ADE80" }} />
                <span className="text-[0.6rem] text-white font-semibold tracking-wide uppercase">Live</span>
              </span>
            ) : hasRecentActivity ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warm border border-amber/30">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--amber)" }} />
                <span className="text-[0.6rem] text-mid/60 tracking-wide uppercase">
                  Last active {lastPulseAt ? relTime(lastPulseAt) : ""} ago
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warm border border-warm">
                <span className="w-2 h-2 rounded-full bg-mid/30" />
                <span className="text-[0.6rem] text-mid/50 tracking-wide uppercase">Idle</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="label-caps text-mid/40">Capacity</span>
            <div className="flex gap-0.5">
              {Array.from({ length: config.max_active_projects }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-sm transition-colors"
                  style={{
                    backgroundColor: i < stats.building
                      ? "var(--lilac)"
                      : "var(--warm)",
                  }}
                />
              ))}
            </div>
            <span className="text-[0.6rem] text-mid tabular-nums">
              {stats.building}/{config.max_active_projects}
            </span>
          </div>
        </div>

        {/* ═══ KPI STRIP ══════════════════════════════════════════════ */}
        <div className="grid grid-cols-5 gap-3">
          <KPIChip label="Building" value={stats.building} color="var(--lilac)" />
          <KPIChip label="Shipping" value={stats.shipping} color="var(--amber)" />
          <KPIChip label="Shipped" value={stats.shipped} color="var(--olive)" />
          <KPIChip label="Queued" value={stats.queued} color="var(--mid)" />
          <KPIChip
            label="Attention"
            value={stats.attention}
            color="var(--terracotta)"
            pulse={stats.attention > 0}
          />
        </div>

        {/* ═══ ACTIVITY LOG ════════════════════════════════════════════ */}
        {activityFeed.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-warm/50" style={{ backgroundColor: "var(--charcoal)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[0.6rem] text-white/80 font-medium tracking-wide uppercase font-[family-name:var(--font-dm-mono)]">
                  Activity Log
                </span>
                {isLive && (
                  <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: "#4ADE80" }} />
                )}
              </div>
              <span className="text-[0.5rem] text-white/30 tabular-nums font-[family-name:var(--font-dm-mono)]">
                {activityFeed.length} event{activityFeed.length !== 1 ? "s" : ""} today
                {lastPulseAt && !isLive && (
                  <span className="ml-2 text-white/20">last: {relTime(lastPulseAt)} ago</span>
                )}
              </span>
            </div>
            <div className="max-h-[180px] overflow-y-auto scrollbar-hide" style={{ backgroundColor: "#1C1B19" }}>
              {activityFeed.slice(0, 10).map((event, i) => {
                const token = agentToken(event.agent);
                const age = now - new Date(event.timestamp).getTime();
                const isRecent = age < LIVE_THRESHOLD;
                return (
                  <div
                    key={`${event.timestamp}-${i}`}
                    className={`flex items-start gap-3 px-4 py-2 border-b border-white/5 transition-opacity ${
                      isRecent ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    {/* Timestamp */}
                    <span className="text-[0.6rem] text-white/25 tabular-nums flex-shrink-0 pt-0.5 font-[family-name:var(--font-dm-mono)]">
                      {clockTime(event.timestamp)}
                    </span>
                    {/* Agent pip */}
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[0.4rem] text-white font-medium flex-shrink-0 mt-0.5 ${
                        isRecent ? "pulse-dot-subtle" : ""
                      }`}
                      style={{ backgroundColor: token.color }}
                    >
                      {token.label}
                    </span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.65rem] font-medium font-[family-name:var(--font-dm-mono)]" style={{ color: token.color }}>
                          {token.name}
                        </span>
                        <span className="text-[0.55rem] text-white/30 font-[family-name:var(--font-dm-mono)]">
                          {event.action.replace(/-/g, " ")}
                        </span>
                        {event.model && event.model !== "unknown" && (
                          <ModelBadge model={event.model} />
                        )}
                        <span className="text-[0.5rem] text-white/15 tabular-nums font-[family-name:var(--font-dm-mono)]">
                          {relTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-[0.6rem] text-white/50 mt-0.5 leading-relaxed font-[family-name:var(--font-dm-mono)]">
                        {event.outcome}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ═══ APPROVAL GATE ═════════════════════════════════════════ */}
        {awaitingApproval.map((project) => (
          <ApprovalPanel
            key={project.slug}
            project={project}
            onApprove={(slug) => handleApproval(slug, "approve")}
            onReject={(slug, reason) => handleApproval(slug, "reject", reason)}
            loading={approvalLoading === project.slug}
            result={approvalResult?.slug === project.slug ? approvalResult : null}
          />
        ))}

        {/* ═══ ACTIVE PROJECTS ════════════════════════════════════════ */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <p className="label-caps text-mid/60">Active Projects</p>
            {projects.length > 0 && (
              <span className="text-[0.6rem] text-mid/40 tabular-nums">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Phase column headers */}
          <div className="px-5 flex items-center gap-3 mb-1">
            <div className="w-36 flex-shrink-0" />
            <div className="flex-1 grid grid-cols-9 gap-0.5">
              {phaseLabels.map((label) => (
                <p
                  key={label}
                  className="text-center text-[0.5rem] text-mid/35 uppercase tracking-[0.15em] truncate"
                >
                  {label.replace("quality gate", "QG")}
                </p>
              ))}
            </div>
            <div className="w-24 flex-shrink-0" />
          </div>

          {/* Project rows */}
          {projects.length > 0 ? (
            <div className="divide-y divide-warm/60">
              {projects.map((p) => (
                <FactoryProjectRow
                  key={p.slug}
                  project={p}
                  phaseLabels={phaseLabels}
                  expanded={expandedSlug === p.slug}
                  onToggle={() =>
                    setExpandedSlug(expandedSlug === p.slug ? null : p.slug)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-mid/50">No active projects</p>
              <p className="text-xs text-mid/30 mt-1">
                Add ideas to the queue and the factory will start building
              </p>
            </div>
          )}
        </Card>

        {/* ═══ POST-SHIP KPI TRACKING ═══════════════════════════════ */}
        {(() => {
          const shippedProjects = projects.filter(
            (p) => p.status === "shipped" && p.latestKPI
          );
          if (shippedProjects.length === 0) return null;
          return (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="label-caps text-mid/60">Post-Ship Performance</p>
                <span className="text-[0.6rem] text-mid/40 tabular-nums">
                  {shippedProjects.length} app{shippedProjects.length !== 1 ? "s" : ""} tracking
                </span>
              </div>
              <div className="space-y-3">
                {shippedProjects.map((p) => (
                  <KPICard key={p.slug} project={p} />
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ═══ IDEA QUEUE ═════════════════════════════════════════════ */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="label-caps text-mid/60">Idea Queue</p>
            <div className="flex gap-1 bg-warm/50 p-0.5 rounded-md">
              {(["queued", "shipped", "rejected"] as const).map((tab) => {
                const count =
                  tab === "queued"
                    ? ideaQueue.queue.length
                    : tab === "shipped"
                      ? ideaQueue.shipped.length
                      : ideaQueue.rejected.length;
                return (
                  <button
                    key={tab}
                    onClick={() => setQueueTab(tab)}
                    className={`px-2.5 py-1 rounded text-[0.6rem] tracking-wide transition-all cursor-pointer capitalize ${
                      queueTab === tab
                        ? "bg-paper text-charcoal shadow-sm"
                        : "text-mid hover:text-charcoal"
                    }`}
                  >
                    {tab}
                    {count > 0 && (
                      <span className="ml-1 tabular-nums opacity-50">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Queue items */}
          {(() => {
            const items =
              queueTab === "queued"
                ? ideaQueue.queue
                : queueTab === "shipped"
                  ? ideaQueue.shipped
                  : ideaQueue.rejected;
            if (items.length === 0) {
              return (
                <p className="text-sm text-mid/40 text-center py-4">
                  {queueTab === "queued"
                    ? "No ideas in queue. Scout will populate this from nightly research."
                    : `No ${queueTab} ideas yet.`}
                </p>
              );
            }
            return (
              <div className="space-y-2">
                {items.map((idea) => (
                  <IdeaRow key={idea.slug} idea={idea} />
                ))}
              </div>
            );
          })()}
        </Card>

        {/* ═══ TWO-LANE DIAGRAM ═══════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="label-caps text-mid/60 mb-2">Content Engine</p>
            <div className="space-y-1.5">
              <LaneStep agent="scout" label="Nightly Research" />
              <LaneArrow />
              <LaneStep agent="scout" label="Content Opportunities" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Draft + Humanize" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Distribute to Channels" />
            </div>
            <p className="text-[0.55rem] text-mid/40 mt-3 text-center">
              Builds audience + validates ideas
            </p>
          </Card>

          <Card className="p-4">
            <p className="label-caps text-mid/60 mb-2">App Factory</p>
            <div className="space-y-1.5">
              <LaneStep agent="scout" label="Pain Mining + Research" />
              <LaneArrow />
              <LaneStep agent="builder" label="Build from Scaffold" />
              <LaneArrow />
              <LaneStep agent="bastion" label="Quality Gate (8/10)" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Ship + Market" />
            </div>
            <p className="text-[0.55rem] text-mid/40 mt-3 text-center">
              Turns ideas into shipped apps
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function KPIChip({
  label,
  value,
  color,
  pulse = false,
}: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className={`card p-3 text-center ${pulse ? "attention-pulse" : ""}`}>
      <p
        className="text-2xl font-light tabular-nums"
        style={{ fontFamily: "var(--font-cormorant)", color }}
      >
        {value}
      </p>
      <p className="label-caps text-[0.5rem] mt-1">{label}</p>
    </div>
  );
}

function FactoryProjectRow({
  project,
  phaseLabels,
  expanded,
  onToggle,
}: {
  project: FactoryProject;
  phaseLabels: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor =
    project.status === "shipped"
      ? "var(--olive)"
      : project.status === "awaiting-approval"
        ? "var(--amber)"
        : project.status === "needs-review"
          ? "var(--terracotta)"
          : "var(--lilac)";

  const currentAgent = PHASE_AGENTS[phaseLabels[project.currentPhaseIdx]] ?? "builder";

  // Determine if this project has recent agent activity
  const activity = project.lastActivity;
  const activityAge = activity
    ? Date.now() - new Date(activity.timestamp).getTime()
    : Infinity;
  const hasLiveActivity = activityAge < 30 * 60 * 1000; // 30 min

  return (
    <div>
      <div
        className="flex items-center gap-3 px-5 py-3 hover:bg-warm/20 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {/* Project name + status + live activity */}
        <div className="w-36 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-[0.5rem] text-white font-medium"
                style={{ backgroundColor: agentToken(currentAgent).color }}
              >
                {project.slug.slice(0, 2).toUpperCase()}
              </span>
              {hasLiveActivity && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper pulse-dot"
                  style={{ backgroundColor: agentToken(activity!.agent).color }}
                />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal truncate capitalize">
                {project.slug.replace(/-/g, " ")}
              </p>
              {hasLiveActivity && activity ? (
                <div className="flex flex-col">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0"
                      style={{ backgroundColor: agentToken(activity.agent).color }}
                    />
                    <span className="text-[0.6rem] font-semibold" style={{ color: agentToken(activity.agent).color }}>
                      {agentToken(activity.agent).name}
                    </span>
                    <span className="text-[0.55rem] text-mid/60">
                      {activity.action.replace(/-/g, " ")}
                    </span>
                    {activity.model && activity.model !== "unknown" && (
                      <ModelBadge model={activity.model} />
                    )}
                    <span className="text-[0.5rem] text-mid/35 tabular-nums">{relTime(activity.timestamp)}</span>
                  </span>
                </div>
              ) : (
                <Badge color={statusColor}>
                  {STATUS_LABELS[project.status] ?? project.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Phase progress bar (9 columns) */}
        <div className="flex-1 grid grid-cols-9 gap-0.5">
          {phaseLabels.map((label, i) => {
            const phaseKey = label.replace(" ", "_");
            const phaseState = project.phases[phaseKey];
            const isComplete = phaseState?.status === "complete";
            const isCurrent = i === project.currentPhaseIdx;
            const phaseAgent = PHASE_AGENTS[label];
            const agentColor = phaseAgent ? agentToken(phaseAgent).color : "var(--mid)";

            return (
              <div
                key={label}
                className="relative h-7 rounded flex items-center justify-center overflow-hidden transition-all"
                style={{
                  backgroundColor: isCurrent
                    ? `${agentColor}25`
                    : isComplete
                      ? "var(--olive-soft, rgba(118, 135, 90, 0.12))"
                      : "var(--warm)",
                  borderBottom: isCurrent ? `2px solid ${agentColor}` : undefined,
                }}
                title={`${label}: ${phaseState?.status ?? "pending"}`}
              >
                {isComplete && (
                  <span className="text-[0.5rem] text-olive/60">&#10003;</span>
                )}
                {isCurrent && (
                  <span
                    className="w-3 h-3 rounded-full pulse-dot"
                    style={{ backgroundColor: agentColor }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Score + expand indicator */}
        <div className="w-24 flex-shrink-0 flex items-center justify-end gap-2">
          {project.qualityScore !== null && (
            <span
              className="text-sm font-medium tabular-nums"
              style={{
                color:
                  project.qualityScore >= 8
                    ? "var(--olive)"
                    : project.qualityScore >= 6
                      ? "var(--amber)"
                      : "var(--terracotta)",
              }}
            >
              {project.qualityScore}/10
            </span>
          )}
          {project.qualityAttempt > 0 && project.qualityScore === null && (
            <span className="text-[0.6rem] text-terracotta">
              attempt {project.qualityAttempt}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--mid)"
            strokeWidth="2"
            strokeLinecap="round"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* ─── Expanded One-Pager ─────────────────────── */}
      {expanded && (
        <div className="px-5 pb-4 fade-up">
          <div className="bg-warm/30 rounded-lg p-4 border border-warm/50">
            {project.onePager ? (
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-xs text-mid leading-relaxed font-[family-name:var(--font-dm-mono)]">
                  {project.onePager}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-mid/50 text-center py-4">
                One-pager not yet generated. Research phase will create it.
              </p>
            )}
            {/* Phase detail strip */}
            <div className="mt-3 pt-3 border-t border-warm/50 grid grid-cols-3 gap-3">
              <div>
                <p className="label-caps text-[0.5rem] mb-1">Progress</p>
                <p className="text-sm text-charcoal tabular-nums">
                  {project.completedPhases}/{project.totalPhases} phases
                </p>
              </div>
              <div>
                <p className="label-caps text-[0.5rem] mb-1">Quality</p>
                <p className="text-sm text-charcoal tabular-nums">
                  {project.qualityScore !== null
                    ? `${project.qualityScore}/10 (attempt ${project.qualityAttempt})`
                    : "Not yet tested"}
                </p>
              </div>
              <div>
                <p className="label-caps text-[0.5rem] mb-1">Started</p>
                <p className="text-sm text-charcoal">
                  {new Date(project.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Europe/Copenhagen",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaRow({ idea }: { idea: IdeaEntry }) {
  const scoreColor =
    idea.score >= 80
      ? "var(--olive)"
      : idea.score >= 70
        ? "var(--amber)"
        : "var(--mid)";

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-warm/30 transition-colors">
      {/* Score ring */}
      <div className="relative w-10 h-10 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="var(--warm)"
            strokeWidth="2.5"
          />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={scoreColor}
            strokeWidth="2.5"
            strokeDasharray={`${(idea.score / 100) * 100.5} 100.5`}
            strokeLinecap="round"
            className="gauge-arc"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[0.55rem] font-medium tabular-nums"
          style={{ color: scoreColor }}
        >
          {idea.score}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-charcoal truncate capitalize">
          {idea.title || idea.slug.replace(/-/g, " ")}
        </p>
        <p className="text-xs text-mid/60 truncate">{idea.tagline}</p>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {idea.painkiller && (
          <Badge color="var(--terracotta)">painkiller</Badge>
        )}
        <span className="text-[0.55rem] text-mid/40">{idea.source}</span>
      </div>
    </div>
  );
}

function KPICard({ project }: { project: FactoryProject }) {
  const kpi = project.latestKPI;
  const prev = project.prevKPI;
  if (!kpi) return null;

  const trend = (current: number, previous: number | undefined | null) => {
    if (previous == null || previous === 0) return null;
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 1) return null;
    return pct;
  };

  return (
    <div className="bg-warm/20 rounded-lg p-4 border border-warm/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center text-[0.5rem] text-white font-medium"
            style={{ backgroundColor: "var(--olive)" }}
          >
            {project.slug.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-medium text-charcoal capitalize">
              {project.slug.replace(/-/g, " ")}
            </p>
            <p className="text-[0.55rem] text-mid/50">
              {kpi.week} &middot; {project.shipDate ? `Shipped ${new Date(project.shipDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            </p>
          </div>
        </div>
        {(project.activeSignals ?? 0) > 0 && (
          <Badge color="var(--terracotta)">
            {project.activeSignals} signal{(project.activeSignals ?? 0) !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Traffic */}
        <div>
          <p className="label-caps text-[0.45rem] text-mid/50 mb-1">Traffic</p>
          <div className="space-y-0.5">
            <KPIMetric
              label="Downloads"
              value={kpi.traffic.downloads}
              trend={trend(kpi.traffic.downloads, prev?.traffic.downloads)}
            />
            <KPIMetric
              label="Impressions"
              value={kpi.traffic.impressions}
              trend={trend(kpi.traffic.impressions, prev?.traffic.impressions)}
            />
            <KPIMetric
              label="Conv Rate"
              value={kpi.traffic.page_views > 0 ? `${((kpi.traffic.downloads / kpi.traffic.page_views) * 100).toFixed(0)}%` : "-"}
            />
          </div>
        </div>

        {/* Users */}
        <div>
          <p className="label-caps text-[0.45rem] text-mid/50 mb-1">Users</p>
          <div className="space-y-0.5">
            <KPIMetric label="DAU" value={kpi.users.dau} trend={trend(kpi.users.dau, prev?.users.dau)} />
            <KPIMetric label="D1 Ret" value={kpi.users.d1_retention != null ? `${kpi.users.d1_retention}%` : "-"} />
            <KPIMetric label="D7 Ret" value={kpi.users.d7_retention != null ? `${kpi.users.d7_retention}%` : "-"} />
          </div>
        </div>

        {/* Revenue */}
        <div>
          <p className="label-caps text-[0.45rem] text-mid/50 mb-1">Revenue</p>
          <div className="space-y-0.5">
            <KPIMetric
              label="MRR"
              value={`$${kpi.revenue.mrr}`}
              trend={trend(kpi.revenue.mrr, prev?.revenue.mrr)}
            />
            <KPIMetric label="Trial\u2192Paid" value={kpi.revenue.trial_to_paid != null ? `${kpi.revenue.trial_to_paid}%` : "-"} />
            <KPIMetric label="ARPU" value={`$${kpi.revenue.arpu}`} />
          </div>
        </div>

        {/* Churn */}
        <div>
          <p className="label-caps text-[0.45rem] text-mid/50 mb-1">Churn</p>
          <div className="space-y-0.5">
            <KPIMetric
              label="Rate"
              value={kpi.churn.churn_rate != null ? `${kpi.churn.churn_rate}%` : "-"}
              alert={kpi.churn.churn_rate != null && kpi.churn.churn_rate > 12}
            />
            <KPIMetric label="Active Subs" value={kpi.churn.active_subs} />
            <KPIMetric
              label="Refunds"
              value={kpi.churn.refund_rate != null ? `${kpi.churn.refund_rate}%` : "-"}
              alert={kpi.churn.refund_rate != null && kpi.churn.refund_rate > 10}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KPIMetric({
  label,
  value,
  trend,
  alert = false,
}: {
  label: string;
  value: string | number;
  trend?: number | null;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.55rem] text-mid/50">{label}</span>
      <span className={`text-[0.6rem] tabular-nums font-medium ${alert ? "text-terracotta" : "text-charcoal"}`}>
        {value}
        {trend !== undefined && <TrendArrow value={trend ?? null} />}
      </span>
    </div>
  );
}

function TrendArrow({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value > 0;
  return (
    <span
      className="text-[0.5rem] ml-0.5"
      style={{ color: up ? "var(--olive)" : "var(--terracotta)" }}
    >
      {up ? "\u2191" : "\u2193"}{Math.abs(value).toFixed(0)}%
    </span>
  );
}

const MODEL_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  "Opus 4.6":       { bg: "#6B21A8", fg: "#E9D5FF", label: "OPUS" },
  "opus":           { bg: "#6B21A8", fg: "#E9D5FF", label: "OPUS" },
  "Sonnet 4.6":     { bg: "#1D4ED8", fg: "#BFDBFE", label: "SONNET" },
  "sonnet":         { bg: "#1D4ED8", fg: "#BFDBFE", label: "SONNET" },
  "MiniMax-M2.5":   { bg: "#374151", fg: "#9CA3AF", label: "MINIMAX" },
  "minimax":        { bg: "#374151", fg: "#9CA3AF", label: "MINIMAX" },
  "MiniMax-M2.1":   { bg: "#374151", fg: "#6B7280", label: "MM-2.1" },
  "minimax-m2.1":   { bg: "#374151", fg: "#6B7280", label: "MM-2.1" },
  "codex":          { bg: "#065F46", fg: "#A7F3D0", label: "CODEX" },
};

function ModelBadge({ model }: { model: string }) {
  const style = MODEL_STYLES[model] ?? { bg: "#374151", fg: "#9CA3AF", label: model.toUpperCase() };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[0.4rem] font-bold tracking-widest font-[family-name:var(--font-dm-mono)] flex-shrink-0"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}

function LaneStep({ agent, label }: { agent: string; label: string }) {
  const token = agentToken(agent);
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{ backgroundColor: `${token.color}10` }}>
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[0.4rem] text-white font-medium flex-shrink-0"
        style={{ backgroundColor: token.color }}
      >
        {token.label}
      </span>
      <span className="text-xs text-charcoal">{label}</span>
    </div>
  );
}

function LaneArrow() {
  return (
    <div className="flex justify-center">
      <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="var(--warm)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 0v10M1 7l3 3 3-3" />
      </svg>
    </div>
  );
}

// ─── Approval Panel ──────────────────────────────────────────────────

function ApprovalPanel({
  project,
  onApprove,
  onReject,
  loading,
  result,
}: {
  project: FactoryProject;
  onApprove: (slug: string) => void;
  onReject: (slug: string, reason?: string) => void;
  loading: boolean;
  result: { status: string; message: string } | null;
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showFixes, setShowFixes] = useState(false);

  const qg = project.phases.quality_gate;
  const build = project.phases.build;
  const monetization = project.phases.monetization;
  const packaging = project.phases.packaging;

  // Combine operator tasks from monetization + packaging
  const operatorTasks = [
    ...(monetization?.operator_tasks ?? []),
    ...(packaging?.operator_tasks ?? []),
  ];

  // Result feedback
  if (result) {
    return (
      <div
        className="rounded-xl border-2 p-5 text-center fade-up"
        style={{
          borderColor: result.status === "approved" ? "var(--olive)" : result.status === "rejected" ? "var(--terracotta)" : "var(--mid)",
          backgroundColor: result.status === "approved" ? "rgba(118, 135, 90, 0.06)" : "rgba(196, 107, 72, 0.06)",
        }}
      >
        <p className="text-lg" style={{ fontFamily: "var(--font-cormorant)", color: result.status === "approved" ? "var(--olive)" : "var(--terracotta)" }}>
          {result.status === "approved" ? "Approved — shipping started" : result.status === "rejected" ? "Rejected" : "Error"}
        </p>
        <p className="text-xs text-mid/60 mt-1 font-[family-name:var(--font-dm-mono)]">{result.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber/40 bg-paper overflow-hidden fade-up" style={{ boxShadow: "0 0 30px rgba(196, 160, 72, 0.08)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: "rgba(196, 160, 72, 0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--amber)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-xl text-charcoal tracking-tight" style={{ fontFamily: "var(--font-cormorant)" }}>
              Ship {project.slug.replace(/-/g, " ")}?
            </p>
            <p className="text-[0.6rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
              Approval required before shipping to App Store
            </p>
          </div>
        </div>
        <Badge color="var(--amber)">awaiting approval</Badge>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Quality Journey */}
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg p-3 border border-warm/50">
            <p className="label-caps text-[0.45rem] text-mid/50 mb-2">Quality Gate</p>
            <div className="flex items-end gap-3">
              {qg?.prior_score != null && (
                <div className="text-center">
                  <p className="text-2xl font-light tabular-nums text-terracotta/60" style={{ fontFamily: "var(--font-cormorant)" }}>
                    {qg.prior_score}
                  </p>
                  <p className="text-[0.5rem] text-mid/40">before</p>
                </div>
              )}
              {qg?.prior_score != null && (
                <svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="var(--olive)" strokeWidth="1.5" strokeLinecap="round" className="mb-2">
                  <path d="M2 7h16M14 2l4 5-4 5" />
                </svg>
              )}
              <div className="text-center">
                <p
                  className="text-3xl font-light tabular-nums"
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    color: (qg?.score ?? 0) >= 80 ? "var(--olive)" : (qg?.score ?? 0) >= 60 ? "var(--amber)" : "var(--terracotta)",
                  }}
                >
                  {qg?.score ?? "—"}<span className="text-lg text-mid/40">/100</span>
                </p>
                <p className="text-[0.5rem] text-mid/40">
                  after &middot; attempt {qg?.attempt ?? "?"}
                </p>
              </div>
            </div>
            {qg?.summary && (
              <p className="text-[0.55rem] text-mid/60 mt-2 leading-relaxed font-[family-name:var(--font-dm-mono)]">
                {qg.summary}
              </p>
            )}
          </div>

          {/* Monetization */}
          <div className="flex-1 rounded-lg p-3 border border-warm/50">
            <p className="label-caps text-[0.45rem] text-mid/50 mb-2">Monetization</p>
            {monetization?.pricing ? (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-light tabular-nums text-charcoal" style={{ fontFamily: "var(--font-cormorant)" }}>
                    ${monetization.pricing.monthly}
                  </p>
                  <span className="text-xs text-mid/40">/mo</span>
                </div>
                <p className="text-[0.55rem] text-mid/50 mt-0.5">
                  ${monetization.pricing.annual}/yr &middot; {monetization.trial_days ?? 7}-day free trial
                  {monetization.free_trial_scans != null && ` &middot; ${monetization.free_trial_scans} free scans`}
                </p>
                {monetization.changes && monetization.changes.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {monetization.changes.map((c, i) => (
                      <p key={i} className="text-[0.5rem] text-mid/40 font-[family-name:var(--font-dm-mono)]">• {c}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-mid/40">Not configured</p>
            )}
          </div>
        </div>

        {/* Security Fixes */}
        {build?.fixes_applied && build.fixes_applied.length > 0 && (
          <div className="rounded-lg border border-warm/50 overflow-hidden">
            <button
              onClick={() => setShowFixes(!showFixes)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-warm/10 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[0.5rem] text-white font-medium" style={{ backgroundColor: "var(--lilac)" }}>B</span>
                <span className="text-[0.6rem] text-charcoal font-medium">
                  {build.fixes_applied.length} security fixes applied by Builder
                </span>
              </div>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="2" strokeLinecap="round"
                className={`transition-transform ${showFixes ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showFixes && (
              <div className="px-3 pb-3 space-y-1 fade-up">
                {build.fixes_applied.map((fix, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-olive text-[0.55rem] mt-0.5">&#10003;</span>
                    <p className="text-[0.55rem] text-mid/70 leading-relaxed font-[family-name:var(--font-dm-mono)]">{fix}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Operator Tasks */}
        {operatorTasks.length > 0 && (
          <div className="rounded-lg p-3 border border-terracotta/20" style={{ backgroundColor: "rgba(196, 107, 72, 0.03)" }}>
            <p className="label-caps text-[0.45rem] text-terracotta/60 mb-2">
              Operator Tasks — complete before shipping
            </p>
            <div className="space-y-1.5">
              {operatorTasks.map((task, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-3.5 h-3.5 rounded border border-mid/20 flex-shrink-0 mt-0.5" />
                  <p className="text-[0.55rem] text-mid/70 leading-relaxed font-[family-name:var(--font-dm-mono)]">{task}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Packaging Verification */}
        {packaging?.metadata_verified && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(packaging.metadata_verified).map(([key, ok]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[0.5rem] font-[family-name:var(--font-dm-mono)]"
                style={{
                  backgroundColor: ok ? "rgba(118, 135, 90, 0.08)" : "rgba(196, 107, 72, 0.08)",
                  color: ok ? "var(--olive)" : "var(--terracotta)",
                }}
              >
                {ok ? "✓" : "✗"} {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {/* E2E Test Results */}
        {project.e2eResults && (
          <div
            className="rounded-lg p-3 border flex items-center justify-between"
            style={{
              borderColor: project.e2eResults.status === "pass" ? "rgba(118, 135, 90, 0.3)" : project.e2eResults.status === "fail" ? "rgba(196, 107, 72, 0.3)" : "rgba(0,0,0,0.1)",
              backgroundColor: project.e2eResults.status === "pass" ? "rgba(118, 135, 90, 0.04)" : project.e2eResults.status === "fail" ? "rgba(196, 107, 72, 0.04)" : "rgba(0,0,0,0.02)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {project.e2eResults.status === "pass" ? "✓" : project.e2eResults.status === "fail" ? "✗" : "⊘"}
              </span>
              <span className="text-[0.6rem] font-medium text-charcoal">E2E Tests</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.55rem] text-mid/60 font-[family-name:var(--font-dm-mono)] tabular-nums">
                {project.e2eResults.passed}/{project.e2eResults.tests} passed
              </span>
              {project.e2eResults.failed > 0 && (
                <span className="text-[0.55rem] text-terracotta font-[family-name:var(--font-dm-mono)] tabular-nums">
                  {project.e2eResults.failed} failed
                </span>
              )}
              {project.e2eResults.status === "skip" && (
                <span className="text-[0.5rem] text-mid/40 font-[family-name:var(--font-dm-mono)]">
                  skipped — no simulator
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {!rejectMode ? (
            <>
              <button
                onClick={() => onApprove(project.slug)}
                disabled={loading}
                className="flex-1 py-3 rounded-lg text-white font-medium text-sm tracking-wide transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "var(--olive)" }}
              >
                {loading ? "Approving..." : "Approve & Ship"}
              </button>
              <button
                onClick={() => setRejectMode(true)}
                disabled={loading}
                className="px-5 py-3 rounded-lg font-medium text-sm tracking-wide transition-all hover:bg-warm/40 cursor-pointer border border-warm"
                style={{ color: "var(--terracotta)" }}
              >
                Reject
              </button>
            </>
          ) : (
            <div className="flex-1 space-y-2 fade-up">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="w-full px-3 py-2 rounded-lg border border-warm text-sm font-[family-name:var(--font-dm-mono)] placeholder:text-mid/30 focus:outline-none focus:border-terracotta/40"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onReject(project.slug, rejectReason); setRejectMode(false); }}
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg text-white font-medium text-sm cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: "var(--terracotta)" }}
                >
                  {loading ? "Rejecting..." : "Confirm Reject"}
                </button>
                <button
                  onClick={() => { setRejectMode(false); setRejectReason(""); }}
                  className="px-4 py-2 rounded-lg text-sm text-mid hover:text-charcoal transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
