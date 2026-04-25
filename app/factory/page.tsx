"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { agent as agentToken, relTime, clockTime } from "@/app/lib/agents";

// ─── Types ───────────────────────────────────────────────────────────

interface PhaseState {
  status: string;
  score?: number;
  attempt?: number;
  stale_since?: string; // ISO timestamp — set when build restarts after this phase was complete
}

interface KPISnapshot {
  week: string;
  date: string;
  traffic: { impressions: number; page_views: number; downloads: number };
  users: { dau: number; wau: number; mau: number; d1_retention: number | null; d7_retention: number | null; d30_retention: number | null };
  revenue: { trial_starts: number; trial_to_paid: number | null; mrr: number; arpu: number };
  churn: { active_subs: number; cancellations: number; churn_rate: number | null; refund_rate: number | null };
}

interface RejectionEntry {
  rejected_at: string;
  guideline: string;
  reason: string;
  build?: number;
  fix?: string;
  resubmitted_at?: string;
}

interface AppleReworkState {
  initiated_at?: string;
  guideline?: string;
  message?: string;
  severity?: string;
  pattern_match?: string;
  is_new_pattern?: boolean;
  fix_plan?: string;
  checklist_status?: string;
  guardrail_draft?: string;
  guardrail_confirmed?: boolean;
  resolved_at?: string;
}

interface PhaseDetail extends PhaseState {
  fixes_applied?: string[];
  summary?: string;
  prior_score?: number;
  owner?: string;
  model?: string;
  trial_days?: number;
  free_trial_scans?: number;
  pricing?: { monthly?: number | { price?: number; product_id?: string }; annual?: number | { price?: number; product_id?: string } };
  changes?: string[];
  operator_tasks?: string[];
  metadata_verified?: Record<string, boolean>;
  outputs?: string[];
  rejections?: RejectionEntry[];
  apple_rework?: AppleReworkState;
}

interface SubCheck {
  id: string;
  label: string;
  score?: string;
  weight?: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

interface ArtifactPhaseAudit {
  required: string[];
  delivered: string[];
  missing: string[];
  labels?: Record<string, string>;
  subChecks?: SubCheck[];
}

interface ArtifactAudit {
  slug: string;
  updated_at: string;
  phase: string;
  phase_state?: string;
  artifacts: Record<string, ArtifactPhaseAudit>;
}

interface BuildPreview {
  stats?: { files?: number; lines?: number; screens?: number; tests?: number; services?: number };
  buildSummary?: string;
  designColors?: { primary?: string; surface?: string; accent?: string };
  designTone?: string;
  hasMascot?: boolean;
  screenList?: string[];
  testCommand?: string;
  projectDir?: string;
}

interface FactoryProject {
  slug: string;
  displayName?: string | null;
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
  artifactAudit?: ArtifactAudit | null;
  buildPreview?: BuildPreview | null;
  track?: string;
  trackPhases?: string[];
  qgReportScore?: number | null;
  qgVerdict?: string | null;
  crVerdict?: string | null;
  crIssues?: { critical: number; high: number } | null;
  current_action?: string | null;
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
  target_audience?: string;
  score: number;
  painkiller: boolean;
  segment?: string;
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
  design: "builder",
  build: "builder",
  "quality gate": "bastion",
  "code review": "bastion",
  monetization: "vibe",
  packaging: "vibe",
  shipping: "builder",
  marketing: "vibe",
  promo: "vibe",
};

const STATUS_LABELS: Record<string, string> = {
  research: "Researching",
  validation: "Validating",
  design: "Designing",
  build: "Building",
  "quality-gate": "Quality Gate",
  "code-review": "Code Review",
  monetization: "Monetizing",
  packaging: "Packaging",
  shipping: "Ready to Ship",
  marketing: "Marketing",
  promo: "Promo",
  shipped: "Shipped",
  submitted: "Submitted",
  "in_review": "In Review",
  "awaiting-approval": "Awaiting Approval",
  "awaiting-design-approval": "Design Review",
  "awaiting-uat": "UAT Testing",
  "needs-review": "Needs Review",
  "rejected_fixing": "Rejected \u2014 Fixing",
  paused: "Paused",
};

const PHASE_ABBREV: Record<string, string> = {
  research: "Res",
  validation: "Val",
  design: "Des",
  build: "Build",
  code_review: "CR",
  "code review": "CR",
  quality_gate: "QG",
  "quality gate": "QG",
  uat: "UAT",
  monetization: "Mon",
  packaging: "Pkg",
  shipping: "Ship",
  deploy: "Deploy",
  marketing: "Mkt",
  promo: "Promo",
};

// Human gates: vertical line AFTER these phases to indicate approval required before next phase
const GATE_AFTER_PHASE = new Set(["design", "quality_gate"]);

const TRACK_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  mobile: { label: "Mobile", color: "#5B6FA8", bg: "rgba(91, 111, 168, 0.12)" },
  saas: { label: "SaaS", color: "#768B5A", bg: "rgba(118, 139, 90, 0.12)" },
  advisory: { label: "Advisory", color: "#C4A048", bg: "rgba(196, 160, 72, 0.12)" },
};

// ─── Page ────────────────────────────────────────────────────────────

export default function FactoryPage() {
  const [data, setData] = useState<FactoryData | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<"queued" | "shipped" | "rejected">("queued");
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<{ slug: string; status: string; message: string } | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [uatLoading, setUatLoading] = useState<string | null>(null);
  const [uatResult, setUatResult] = useState<{ slug: string; status: string; message: string } | null>(null);
  const [uatFeedback, setUatFeedback] = useState("");
  const [uatRejectMode, setUatRejectMode] = useState(false);
  const [simStatus, setSimStatus] = useState<Record<string, "idle" | "building" | "done" | "error">>({});
  const [simMessage, setSimMessage] = useState<Record<string, string>>({});
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ slug: string; status: string; message: string } | null>(null);
  const [rejectionLoading, setRejectionLoading] = useState<string | null>(null);
  const [rejectionResult, setRejectionResult] = useState<{ slug: string; status: string; message: string } | null>(null);
  const [rejectionMode, setRejectionMode] = useState<string | null>(null);
  const [rejectionInput, setRejectionInput] = useState({ guideline: "", message: "" });
  const [appleApproveLoading, setAppleApproveLoading] = useState<string | null>(null);
  const [appleApproveResult, setAppleApproveResult] = useState<{ slug: string; status: string; message: string } | null>(null);

  const handleSimulatorLaunch = async (slug: string) => {
    setSimStatus((s) => ({ ...s, [slug]: "building" }));
    setSimMessage((s) => ({ ...s, [slug]: "Building and installing on simulator..." }));
    try {
      const res = await fetch(`/api/factory/${slug}/simulator`, { method: "POST" });
      const result = await res.json();
      if (result.error) {
        setSimStatus((s) => ({ ...s, [slug]: "error" }));
        setSimMessage((s) => ({ ...s, [slug]: result.error }));
      } else {
        setSimMessage((s) => ({ ...s, [slug]: result.message }));
        // Poll for completion
        const poll = setInterval(async () => {
          try {
            const check = await fetch(`/api/factory/${slug}/simulator`).then((r) => r.json());
            if (check.status === "complete") {
              setSimStatus((s) => ({ ...s, [slug]: "done" }));
              setSimMessage((s) => ({ ...s, [slug]: "App installed and launched on simulator" }));
              clearInterval(poll);
            } else if (check.status === "error") {
              setSimStatus((s) => ({ ...s, [slug]: "error" }));
              setSimMessage((s) => ({ ...s, [slug]: check.lastLine ?? "Build failed" }));
              clearInterval(poll);
            }
          } catch { /* keep polling */ }
        }, 5000);
        // Stop polling after 10 min
        setTimeout(() => clearInterval(poll), 600000);
      }
    } catch {
      setSimStatus((s) => ({ ...s, [slug]: "error" }));
      setSimMessage((s) => ({ ...s, [slug]: "Failed to start simulator build" }));
    }
  };

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
          <p className="label-caps text-mid/70">Loading factory...</p>
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

  const handleUATApproval = async (slug: string, action: "approve" | "reject", feedback?: string) => {
    setUatLoading(slug);
    setUatResult(null);
    try {
      const res = await fetch(`/api/factory/${slug}/uat-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, feedback }),
      });
      const result = await res.json();
      setUatResult({ slug, status: result.status ?? "error", message: result.message ?? result.error });
      setTimeout(fetchData, 2000);
    } catch {
      setUatResult({ slug, status: "error", message: "Failed to submit UAT decision" });
    } finally {
      setUatLoading(slug);
      setTimeout(() => setUatLoading(null), 500);
    }
  };

  const awaitingApproval = projects.filter((p) => p.status === "awaiting-approval");
  const awaitingDesignApproval = projects.filter((p) => p.status === "awaiting-design-approval");
  const awaitingUAT = projects.filter((p) => p.status === "awaiting-uat");
  const needsReviewProjects = projects.filter((p) => p.status === "needs-review" || p.status === "needs_review");

  const handleReset = async (slug: string, action: "resume" | "park" | "restart-phase") => {
    setResetLoading(slug);
    setResetResult(null);
    try {
      const res = await fetch(`/api/factory/${slug}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      setResetResult({ slug, status: result.status ?? "error", message: result.message ?? result.error });
      setTimeout(fetchData, 2000);
    } catch {
      setResetResult({ slug, status: "error", message: "Failed to submit reset action" });
    } finally {
      setResetLoading(null);
    }
  };

  const handleRejection = async (slug: string, guideline?: string, message?: string) => {
    setRejectionLoading(slug);
    setRejectionResult(null);
    try {
      const res = await fetch(`/api/factory/${slug}/rejection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initiate", guideline, message }),
      });
      const result = await res.json();
      setRejectionResult({ slug, status: result.status ?? "error", message: result.message ?? result.error });
      setRejectionMode(null);
      setRejectionInput({ guideline: "", message: "" });
      setTimeout(fetchData, 2000);
    } catch {
      setRejectionResult({ slug, status: "error", message: "Failed to initiate rejection handling" });
    } finally {
      setRejectionLoading(null);
    }
  };

  const handleAppleApproval = async (slug: string) => {
    setAppleApproveLoading(slug);
    setAppleApproveResult(null);
    try {
      const res = await fetch(`/api/factory/${slug}/apple-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const result = await res.json();
      setAppleApproveResult({ slug, status: result.status ?? "error", message: result.message ?? result.error });
      setTimeout(fetchData, 2000);
    } catch {
      setAppleApproveResult({ slug, status: "error", message: "Failed to mark as approved" });
    } finally {
      setAppleApproveLoading(null);
    }
  };

  const appleRejectedProjects = projects.filter((p) => p.status === "rejected_fixing");

  const handlePromote = async (slug: string) => {
    if (!confirm(`Promote "${slug}" into the factory lanes?`)) return;
    try {
      const res = await fetch("/api/factory/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(`Promote failed: ${result.error ?? "unknown error"}`);
        return;
      }
      alert(`Promoted as ${result.factorySlug} (track: ${result.track}).\n\nRun the loop manually when factory is unpaused:\n~/verto-workspace/tools/factory-loop.sh ${result.factorySlug}`);
      setTimeout(fetchData, 500);
    } catch (err) {
      alert(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
            <Link href="/saas-factory" className="text-sm text-mid/60 hover:text-mid transition ml-2">
              SaaS Factory &rarr;
            </Link>
            {isLive ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "#16A34A" }}>
                <span className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: "#4ADE80" }} />
                <span className="text-[0.8rem] text-white font-semibold tracking-wide uppercase">Live</span>
              </span>
            ) : hasRecentActivity ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warm border border-amber/30">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--amber)" }} />
                <span className="text-[0.8rem] text-mid/80 tracking-wide uppercase">
                  Last active {lastPulseAt ? relTime(lastPulseAt) : ""} ago
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warm border border-warm">
                <span className="w-2 h-2 rounded-full bg-mid/30" />
                <span className="text-[0.8rem] text-mid/70 tracking-wide uppercase">Idle</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="label-caps text-mid/60">Capacity</span>
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
            <span className="text-[0.8rem] text-mid tabular-nums">
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
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-warm/50" style={{ backgroundColor: "var(--charcoal)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[0.8rem] text-white/80 font-medium tracking-wide uppercase font-[family-name:var(--font-dm-mono)]">
                Activity Log
              </span>
              {isLive && (
                <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: "#4ADE80" }} />
              )}
            </div>
            <span className="text-[0.7rem] text-white/50 tabular-nums font-[family-name:var(--font-dm-mono)]">
              {activityFeed.length > 0 ? (
                <>
                  {activityFeed.length} recent event{activityFeed.length !== 1 ? "s" : ""}
                  {lastPulseAt && !isLive && (
                    <span className="ml-2 text-white/40">last: {relTime(lastPulseAt)} ago</span>
                  )}
                </>
              ) : (
                "no recent events"
              )}
            </span>
          </div>
          <div className="max-h-[180px] overflow-y-auto scrollbar-hide" style={{ backgroundColor: "#1C1B19" }}>
            {activityFeed.length > 0 ? (
              activityFeed.slice(0, 10).map((event, i) => {
                const token = agentToken(event.agent);
                const age = now - new Date(event.timestamp).getTime();
                const isRecent = age < LIVE_THRESHOLD;
                // Detect event types for enhanced rendering
                const isQGCR = /quality.gate|code.review/i.test(event.action);
                const isRejection = /rejection/i.test(event.action);
                const isHighlight = isQGCR || isRejection;
                // PASS/FAIL detection on ALL events, not just QG/CR
                const outcomeHasFail = /FAIL|BLOCKED|HALTED|crashed|failed|error/i.test(event.outcome);
                const outcomeHasPass = /PASS|complete|passed|success/i.test(event.outcome) && !outcomeHasFail;
                // Extract score from outcome like "Score: 88/100" or "5.20/10"
                const scoreInOutcome = event.outcome.match(/(\d+(?:\.\d+)?)\s*\/\s*(?:10|100)/i);
                // Extract app name from goal "factory:<slug>"
                const slugFromGoal = event.goal?.match(/factory:(.+)/)?.[1]?.replace(/-/g, " ") ?? "";
                // Clean up the outcome for display — strip "PASS: " / "FAIL: " prefix since we show badges
                const cleanOutcome = event.outcome.replace(/^(PASS|FAIL|BLOCKED|HALTED):\s*/i, "");
                return (
                  <div
                    key={`${event.timestamp}-${i}`}
                    className={`flex items-start gap-3 px-4 py-2 border-b border-white/5 transition-opacity ${
                      isRecent ? "opacity-100" : "opacity-60"
                    }`}
                    style={{
                      borderLeft: outcomeHasFail
                        ? "3px solid #ef4444"
                        : outcomeHasPass
                          ? "3px solid #4ade80"
                          : isRejection
                            ? "3px solid var(--terracotta)"
                            : undefined,
                      paddingLeft: isHighlight || outcomeHasFail ? "13px" : undefined,
                    }}
                  >
                    {/* Timestamp */}
                    <span className="text-[0.8rem] text-white/25 tabular-nums flex-shrink-0 pt-0.5 font-[family-name:var(--font-dm-mono)]">
                      {clockTime(event.timestamp)}
                    </span>
                    {/* Agent pip */}
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[0.65rem] text-white font-medium flex-shrink-0 mt-0.5 ${
                        isRecent ? "pulse-dot-subtle" : ""
                      }`}
                      style={{ backgroundColor: token.color }}
                    >
                      {token.label}
                    </span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.8rem] font-medium font-[family-name:var(--font-dm-mono)]" style={{ color: token.color }}>
                          {token.name}
                        </span>
                        <span className="text-[0.75rem] text-white/50 font-[family-name:var(--font-dm-mono)]">
                          {event.action.replace(/-/g, " ")}
                        </span>
                        {event.model && event.model !== "unknown" && (
                          <ModelBadge model={event.model} />
                        )}
                        {outcomeHasPass && (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded font-bold tracking-wider" style={{ backgroundColor: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}>
                            PASS
                          </span>
                        )}
                        {outcomeHasFail && (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded font-bold tracking-wider" style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                            FAIL
                          </span>
                        )}
                        <span className="text-[0.7rem] text-white/15 tabular-nums font-[family-name:var(--font-dm-mono)]">
                          {relTime(event.timestamp)}
                        </span>
                      </div>
                      <p className={`text-[0.8rem] mt-0.5 leading-relaxed font-[family-name:var(--font-dm-mono)] ${outcomeHasFail ? "text-red-400/80" : isHighlight || outcomeHasPass ? "text-white/70" : "text-white/50"}`}>
                        {slugFromGoal && (
                          <span className="text-white/30 mr-1">[{slugFromGoal}]</span>
                        )}
                        {scoreInOutcome ? (
                          <>
                            {cleanOutcome.slice(0, scoreInOutcome.index ? scoreInOutcome.index - (event.outcome.length - cleanOutcome.length) : 0)}
                            <span className="font-bold text-white/90">{scoreInOutcome[0]}</span>
                            {cleanOutcome.slice((scoreInOutcome.index ? scoreInOutcome.index - (event.outcome.length - cleanOutcome.length) : 0) + scoreInOutcome[0].length)}
                          </>
                        ) : (
                          cleanOutcome
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-center py-6">
                <p className="text-[0.8rem] text-white/25 font-[family-name:var(--font-dm-mono)]">
                  No factory activity in the last 3 days
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* ═══ DESIGN REVIEW GATE ══════════════════════════════════════ */}
        {awaitingDesignApproval.map((project) => (
          <DesignReviewPanel key={project.slug} project={project} />
        ))}

        {/* ═══ UAT TESTING GATE ══════════════════════════════════════ */}
        {awaitingUAT.map((project) => {
          const slug = project.slug;
          const displayName = project.displayName ?? slug.replace(/-/g, " ");
          const qg = project.phases.quality_gate;
          const result = uatResult?.slug === slug ? uatResult : null;

          if (result) {
            return (
              <div
                key={slug}
                className="rounded-xl border-2 p-5 text-center fade-up"
                style={{
                  borderColor: result.status === "approved" ? "var(--olive)" : "var(--terracotta)",
                  backgroundColor: result.status === "approved" ? "rgba(118, 135, 90, 0.06)" : "rgba(196, 107, 72, 0.06)",
                }}
              >
                <p className="text-lg" style={{ fontFamily: "var(--font-cormorant)", color: result.status === "approved" ? "var(--olive)" : "var(--terracotta)" }}>
                  {result.status === "approved" ? "UAT Approved — proceeding to monetization" : "UAT Rejected — bouncing back to build"}
                </p>
                <p className="text-xs text-mid/80 mt-1 font-[family-name:var(--font-dm-mono)]">{result.message}</p>
              </div>
            );
          }

          return (
            <div key={slug} className="rounded-xl border-2 overflow-hidden fade-up" style={{ borderColor: "#16A34A", boxShadow: "0 0 30px rgba(22, 163, 74, 0.1)" }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: "rgba(22, 163, 74, 0.06)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#16A34A" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl text-charcoal tracking-tight" style={{ fontFamily: "var(--font-cormorant)" }}>
                      UAT Testing — {displayName}
                    </p>
                    <p className="text-[0.8rem] text-mid/80 font-[family-name:var(--font-dm-mono)]">
                      Quality gate passed{qg?.score ? ` (${qg.score}/10)` : ""} · Test on simulator before shipping
                    </p>
                  </div>
                </div>
                <span className="text-[0.7rem] font-[family-name:var(--font-dm-mono)] px-2 py-1 rounded" style={{ backgroundColor: "rgba(22, 163, 74, 0.12)", color: "#16A34A" }}>
                  uat gate
                </span>
              </div>

              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-mid/80">
                  Build, code review, and quality gate all passed. Test the app on your iOS simulator — if it works as expected, approve to proceed to monetization and packaging.
                </p>

                {/* Simulator launch section */}
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "rgba(22, 163, 74, 0.25)", backgroundColor: "rgba(22, 163, 74, 0.03)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                      <span className="text-sm font-medium text-charcoal">iPhone 17 Pro Simulator</span>
                    </div>
                    <button
                      onClick={() => handleSimulatorLaunch(slug)}
                      disabled={simStatus[slug] === "building"}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: simStatus[slug] === "done" ? "var(--olive)" : simStatus[slug] === "error" ? "var(--terracotta)" : "#16A34A" }}
                    >
                      {simStatus[slug] === "building" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Building...
                        </span>
                      ) : simStatus[slug] === "done" ? (
                        "Rebuild & Launch"
                      ) : simStatus[slug] === "error" ? (
                        "Retry Build"
                      ) : (
                        "Build & Launch on Simulator"
                      )}
                    </button>
                  </div>
                  {simMessage[slug] && (
                    <p className={`text-xs font-[family-name:var(--font-dm-mono)] ${simStatus[slug] === "error" ? "text-terracotta" : simStatus[slug] === "done" ? "text-olive" : "text-mid/70"}`}>
                      {simMessage[slug]}
                    </p>
                  )}
                  {simStatus[slug] === "building" && (
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(22, 163, 74, 0.15)" }}>
                      <div className="h-full rounded-full animate-pulse" style={{ backgroundColor: "#16A34A", width: "60%", transition: "width 2s" }} />
                    </div>
                  )}
                </div>

                {/* Approve / Reject buttons */}
                {!uatRejectMode ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUATApproval(slug, "approve")}
                      disabled={uatLoading === slug}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: "#16A34A" }}
                    >
                      {uatLoading === slug ? "Approving..." : "Approve — Proceed to Monetization"}
                    </button>
                    <button
                      onClick={() => setUatRejectMode(true)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80"
                      style={{ borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={uatFeedback}
                      onChange={(e) => setUatFeedback(e.target.value)}
                      placeholder="What needs to change? Be specific so the builder knows exactly what to fix..."
                      className="w-full border rounded-lg p-3 text-sm bg-warm/50 focus:outline-none focus:ring-2"
                      style={{ borderColor: "var(--terracotta)", minHeight: "80px" }}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { handleUATApproval(slug, "reject", uatFeedback); setUatRejectMode(false); setUatFeedback(""); }}
                        disabled={!uatFeedback.trim() || uatLoading === slug}
                        className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: "var(--terracotta)" }}
                      >
                        Reject & Send Back to Build
                      </button>
                      <button
                        onClick={() => { setUatRejectMode(false); setUatFeedback(""); }}
                        className="px-4 py-2 rounded-lg text-sm border border-mid/20 text-mid/60 hover:border-mid/40"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[0.7rem] text-mid/50 font-[family-name:var(--font-dm-mono)]">
                  Press Build & Launch to install the app on the simulator, then test core features, payments, and onboarding
                </p>
              </div>
            </div>
          );
        })}

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

        {/* ═══ NEEDS REVIEW ══════════════════════════════════════════ */}
        {needsReviewProjects.length > 0 && (
          <Card className="border-[#C4725A]/40 bg-[#C4725A]/[0.08] mb-6">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <h3 className="text-xl tracking-tight" style={{ fontFamily: "var(--font-cormorant)", color: "#C4725A" }}>
                Needs Review ({needsReviewProjects.length})
              </h3>
            </div>
            <div className="px-5 pb-2">
              <p className="label-caps text-mid/60 mb-4">
                These projects hit the circuit breaker and need manual intervention.
              </p>
              {resetResult && (
                <div
                  className="rounded-lg px-4 py-2.5 mb-3 text-sm font-[family-name:var(--font-dm-mono)]"
                  style={{
                    backgroundColor: resetResult.status === "error" ? "rgba(196, 114, 90, 0.1)" : "rgba(118, 139, 90, 0.1)",
                    color: resetResult.status === "error" ? "#C4725A" : "var(--olive)",
                  }}
                >
                  {resetResult.message}
                </div>
              )}
              <div className="space-y-3">
                {needsReviewProjects.map((p) => {
                  const failureCount = p.phases[p.status]?.attempt ?? (p as unknown as Record<string, unknown>).failure_count ?? "?";
                  return (
                    <div
                      key={p.slug}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                      style={{ borderColor: "rgba(196, 114, 90, 0.25)", backgroundColor: "rgba(196, 114, 90, 0.04)" }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#C4725A" }} />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-charcoal">{p.displayName || p.slug.replace(/-/g, " ")}</span>
                          <span className="text-sm text-mid/60 ml-2 font-[family-name:var(--font-dm-mono)]">
                            stuck at {p.status} &middot; {String(failureCount)} failure{failureCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleReset(p.slug, "resume")}
                          disabled={resetLoading === p.slug}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                          style={{ backgroundColor: "var(--olive)" }}
                        >
                          {resetLoading === p.slug ? "..." : "Resume"}
                        </button>
                        <button
                          onClick={() => handleReset(p.slug, "restart-phase")}
                          disabled={resetLoading === p.slug}
                          className="px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 border"
                          style={{ borderColor: "var(--lilac)", color: "var(--lilac)" }}
                        >
                          Restart Phase
                        </button>
                        <button
                          onClick={() => handleReset(p.slug, "park")}
                          disabled={resetLoading === p.slug}
                          className="px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 border"
                          style={{ borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                        >
                          Park
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* ═══ ACTIVE PROJECTS — grouped by track ═══════════════════ */}
        {(() => {
          // Separate active pipeline projects from terminal/submitted ones
          const INACTIVE_STATUSES = ["shipped", "submitted", "in_review", "paused", "parked", "rejected", "archived"];
          const activeProjects = projects.filter((p) => !INACTIVE_STATUSES.includes(p.status));

          // Group active projects by track
          const trackGroups: Record<string, FactoryProject[]> = {};
          for (const p of activeProjects) {
            const track = p.track ?? "mobile";
            if (!trackGroups[track]) trackGroups[track] = [];
            trackGroups[track].push(p);
          }
          // Order: saas first (fewer phases), then mobile, then others
          const trackOrder = ["saas", "mobile", "advisory"];
          const sortedTracks = Object.keys(trackGroups).sort(
            (a, b) => (trackOrder.indexOf(a) === -1 ? 99 : trackOrder.indexOf(a)) - (trackOrder.indexOf(b) === -1 ? 99 : trackOrder.indexOf(b))
          );

          if (activeProjects.length === 0) {
            return (
              <Card className="p-0 overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <p className="label-caps text-mid/80">Active Projects</p>
                </div>
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-mid/70">No active projects</p>
                  <p className="text-xs text-mid/55 mt-1">
                    Add ideas to the queue and the factory will start building
                  </p>
                </div>
              </Card>
            );
          }

          return (
            <div className="space-y-3">
              {sortedTracks.map((track) => {
                const trackProjects = trackGroups[track];
                const trackInfo = TRACK_BADGES[track];
                // Get phases from the first project's trackPhases or fall back to phaseLabels
                const trackPhaseList = trackProjects[0]?.trackPhases ?? phaseLabels;
                return (
                  <Card key={track} className="p-0 overflow-hidden">
                    {/* Track header + phase column labels */}
                    <div className="px-5 pt-3.5 pb-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {trackInfo && (
                            <span
                              className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                              style={{ color: trackInfo.color, backgroundColor: trackInfo.bg }}
                            >
                              {trackInfo.label}
                            </span>
                          )}
                          <span className="text-[0.8rem] text-mid/60 tabular-nums">
                            {trackProjects.length} project{trackProjects.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Phase header row */}
                    <div className="flex items-center gap-3 px-5 pt-2 pb-1.5">
                      <div className="w-48 flex-shrink-0" />
                      <div className="flex-1 flex gap-0.5">
                        {trackPhaseList.map((label, i) => (
                          <React.Fragment key={label}>
                            <div className="flex-1 text-center">
                              <span
                                className="text-[0.65rem] text-mid/70 uppercase tracking-wider font-semibold font-[family-name:var(--font-dm-mono)]"
                                title={label.replace(/_/g, " ")}
                              >
                                {PHASE_ABBREV[label] ?? label.slice(0, 3)}
                              </span>
                            </div>
                            {GATE_AFTER_PHASE.has(label) && i < trackPhaseList.length - 1 && (
                              <div className="flex flex-col items-center justify-center w-3 flex-shrink-0" title="Human approval gate">
                                <div className="w-px h-3" style={{ backgroundColor: "var(--amber)" }} />
                                <svg width="7" height="7" viewBox="0 0 10 10" className="my-0.5">
                                  <circle cx="5" cy="5" r="4" fill="none" stroke="var(--amber)" strokeWidth="1.5" />
                                </svg>
                                <div className="w-px h-3" style={{ backgroundColor: "var(--amber)" }} />
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="w-32 flex-shrink-0" />
                    </div>

                    {/* Project rows */}
                    <div className="divide-y divide-warm/60">
                      {trackProjects.map((p) => (
                        <FactoryProjectRow
                          key={p.slug}
                          project={p}
                          phaseLabels={trackPhaseList}
                          expanded={expandedSlug === p.slug}
                          onToggle={() =>
                            setExpandedSlug(expandedSlug === p.slug ? null : p.slug)
                          }
                          expandedPhases={expandedPhases}
                          onTogglePhase={(key) =>
                            setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                        />
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ APP STORE REVIEW ════════════════════════════════════════ */}
        {(() => {
          const inReviewProjects = projects.filter(
            (p) => p.status === "submitted" || p.status === "in_review"
          );
          if (inReviewProjects.length === 0) return null;
          return (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 pt-3.5 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <p className="label-caps text-mid/80">In Review</p>
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-600">
                      App Store
                    </span>
                  </div>
                  <span className="text-[0.8rem] text-mid/60 tabular-nums">
                    {inReviewProjects.length} app{inReviewProjects.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-warm/60">
                {inReviewProjects.map((p) => {
                  const name = p.displayName ?? p.slug.replace(/-/g, " ");
                  const shippingPhase = p.phases.shipping as PhaseDetail & { notes?: string };
                  const submittedAt = (p as any).submitted_at ?? p.updated_at;
                  const daysSince = Math.floor(
                    (Date.now() - new Date(submittedAt).getTime()) / 86400000
                  );
                  return (
                    <div key={p.slug} className="px-5 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <div>
                            <p className="text-sm font-medium text-charcoal">{name}</p>
                            <p className="text-[0.75rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
                              {shippingPhase?.notes
                                ? (shippingPhase.notes as string).slice(0, 80) + ((shippingPhase.notes as string).length > 80 ? "..." : "")
                                : `Submitted ${daysSince}d ago`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[0.75rem] text-mid/50 tabular-nums font-[family-name:var(--font-dm-mono)]">
                            {p.completedPhases}/{p.totalPhases} phases
                          </span>
                          {p.qualityScore !== null && (
                            <span className="text-[0.75rem] tabular-nums font-medium" style={{ color: p.qualityScore >= 80 ? "#4ade80" : "#fbbf24" }}>
                              QG {p.qualityScore}
                            </span>
                          )}
                          {(p.status === "submitted" || p.status === "in_review") && (
                            <>
                              <button
                                onClick={() => handleAppleApproval(p.slug)}
                                disabled={appleApproveLoading === p.slug}
                                className="px-2 py-1 rounded text-[0.7rem] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                                style={{ backgroundColor: "rgba(74, 222, 128, 0.15)", color: "#16a34a" }}
                              >
                                {appleApproveLoading === p.slug ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin" />
                                  </span>
                                ) : (
                                  "Approved"
                                )}
                              </button>
                              <button
                                onClick={() => setRejectionMode(rejectionMode === p.slug ? null : p.slug)}
                                className="px-2 py-1 rounded text-[0.7rem] font-medium transition-opacity hover:opacity-80"
                                style={{ backgroundColor: "rgba(183, 110, 121, 0.12)", color: "var(--terracotta)" }}
                              >
                                Rejected?
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Rejection input form — expands when "Rejected?" is clicked */}
                      {rejectionMode === p.slug && (
                        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "rgba(183, 110, 121, 0.25)", backgroundColor: "rgba(183, 110, 121, 0.03)" }}>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Guideline (e.g. 2.1(b))"
                              value={rejectionInput.guideline}
                              onChange={(e) => setRejectionInput((prev) => ({ ...prev, guideline: e.target.value }))}
                              className="flex-shrink-0 w-36 px-2 py-1.5 rounded border text-xs font-[family-name:var(--font-dm-mono)]"
                              style={{ borderColor: "rgba(183, 110, 121, 0.3)", backgroundColor: "rgba(255,255,255,0.5)" }}
                            />
                            <input
                              type="text"
                              placeholder="Apple's rejection message..."
                              value={rejectionInput.message}
                              onChange={(e) => setRejectionInput((prev) => ({ ...prev, message: e.target.value }))}
                              className="flex-1 px-2 py-1.5 rounded border text-xs"
                              style={{ borderColor: "rgba(183, 110, 121, 0.3)", backgroundColor: "rgba(255,255,255,0.5)" }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => { setRejectionMode(null); setRejectionInput({ guideline: "", message: "" }); }}
                              className="text-[0.7rem] text-mid/60 hover:text-mid/80"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRejection(p.slug, rejectionInput.guideline || undefined, rejectionInput.message || undefined)}
                              disabled={rejectionLoading === p.slug}
                              className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                              style={{ backgroundColor: "var(--terracotta)" }}
                            >
                              {rejectionLoading === p.slug ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Starting...
                                </span>
                              ) : (
                                "Start Rejection Process"
                              )}
                            </button>
                          </div>
                          {rejectionResult?.slug === p.slug && (
                            <p className={`text-xs font-[family-name:var(--font-dm-mono)] ${rejectionResult.status === "initiated" ? "text-olive" : "text-terracotta"}`}>
                              {rejectionResult.message}
                            </p>
                          )}
                        </div>
                      )}
                      {appleApproveResult?.slug === p.slug && (
                        <p className={`text-xs font-[family-name:var(--font-dm-mono)] ${appleApproveResult.status === "approved" ? "text-olive" : "text-terracotta"}`}>
                          {appleApproveResult.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* ═══ APPLE REJECTED — Rework in Progress ════════════════════ */}
        {appleRejectedProjects.length > 0 && (
          <Card className="p-0 overflow-hidden" style={{ borderColor: "var(--terracotta)", borderWidth: 2, boxShadow: "0 0 30px rgba(183, 110, 121, 0.08)" }}>
            <div className="px-5 pt-3.5 pb-3" style={{ backgroundColor: "rgba(183, 110, 121, 0.06)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <p className="label-caps" style={{ color: "var(--terracotta)", opacity: 0.9 }}>Apple Rejected</p>
                  <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider" style={{ backgroundColor: "rgba(183, 110, 121, 0.12)", color: "var(--terracotta)" }}>
                    Rework
                  </span>
                </div>
                <span className="text-[0.8rem] text-mid/60 tabular-nums">
                  {appleRejectedProjects.length} app{appleRejectedProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="divide-y divide-warm/60">
              {appleRejectedProjects.map((p) => {
                const name = p.displayName ?? p.slug.replace(/-/g, " ");
                const shipping = p.phases.shipping as PhaseDetail;
                const rework = shipping?.apple_rework;
                const rejections = shipping?.rejections ?? [];
                const latestRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;
                const guideline = rework?.guideline ?? latestRejection?.guideline ?? "unknown";
                const rejMessage = rework?.message ?? latestRejection?.reason ?? "";
                const checklistStatus = rework?.checklist_status ?? "pending";

                return (
                  <div key={p.slug} className="px-5 py-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--terracotta)" }} />
                        <div>
                          <p className="text-sm font-medium text-charcoal">{name}</p>
                          <p className="text-[0.75rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
                            Rejection #{rejections.length} · Guideline {guideline}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Checklist status badge */}
                        <span
                          className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                          style={{
                            backgroundColor: checklistStatus === "passed" ? "rgba(74, 222, 128, 0.15)" :
                              checklistStatus === "failed" ? "rgba(183, 110, 121, 0.12)" :
                              checklistStatus === "running" ? "rgba(91, 111, 168, 0.12)" :
                              "rgba(196, 160, 72, 0.12)",
                            color: checklistStatus === "passed" ? "#4ade80" :
                              checklistStatus === "failed" ? "var(--terracotta)" :
                              checklistStatus === "running" ? "#5B6FA8" :
                              "#C4A048",
                          }}
                        >
                          {checklistStatus === "passed" ? "Ready to Resubmit" :
                            checklistStatus === "failed" ? "Issues Found" :
                            checklistStatus === "running" ? "Verifying..." :
                            "Analyzing..."}
                        </span>
                      </div>
                    </div>

                    {/* Rejection message */}
                    {rejMessage && (
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "rgba(183, 110, 121, 0.15)", backgroundColor: "rgba(183, 110, 121, 0.03)" }}>
                        <p className="text-xs text-mid/70">
                          {rejMessage.length > 200 ? rejMessage.slice(0, 200) + "..." : rejMessage}
                        </p>
                      </div>
                    )}

                    {/* Rework progress */}
                    {rework && (
                      <div className="flex items-center gap-4 text-[0.7rem] font-[family-name:var(--font-dm-mono)] text-mid/50">
                        {rework.severity && <span>Severity: {rework.severity}</span>}
                        {rework.pattern_match && <span>Pattern: {rework.pattern_match}</span>}
                        {rework.fix_plan && <span>Fix plan written</span>}
                      </div>
                    )}

                    {/* New pattern banner */}
                    {rework?.is_new_pattern && rework?.guardrail_draft && !rework?.guardrail_confirmed && (
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "rgba(196, 160, 72, 0.3)", backgroundColor: "rgba(196, 160, 72, 0.06)" }}>
                        <p className="text-xs font-medium" style={{ color: "#C4A048" }}>
                          New rejection pattern detected — review guardrail draft and run: <code className="text-[0.65rem] px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(196, 160, 72, 0.12)" }}>bash ~/verto-workspace/tools/factory-guardrail-commit.sh {p.slug}</code>
                        </p>
                      </div>
                    )}

                    {/* Rejection history */}
                    {rejections.length > 1 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-mid/50 hover:text-mid/70">
                          Rejection history ({rejections.length} total)
                        </summary>
                        <div className="mt-1 space-y-1 pl-3 border-l-2" style={{ borderColor: "rgba(183, 110, 121, 0.2)" }}>
                          {rejections.map((r, i) => (
                            <div key={i} className="flex items-baseline gap-2 text-[0.7rem] font-[family-name:var(--font-dm-mono)]">
                              <span className="text-mid/40">{new Date(r.rejected_at).toLocaleDateString()}</span>
                              <span className="font-medium" style={{ color: "var(--terracotta)" }}>{r.guideline}</span>
                              <span className="text-mid/50 truncate">{r.reason?.slice(0, 60)}</span>
                              {r.resubmitted_at && <span className="text-olive">resubmitted</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ═══ SHIPPED PRODUCTS (SaaS / no KPI yet) ═══════════════════ */}
        {(() => {
          const shippedProducts = projects.filter(
            (p) => p.status === "shipped" && !p.latestKPI && p.track && p.track !== "mobile"
          );
          if (shippedProducts.length === 0) return null;
          return (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 pt-3.5 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <p className="label-caps text-mid/80">Shipped</p>
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-olive/15 text-olive">
                      Live
                    </span>
                  </div>
                  <span className="text-[0.8rem] text-mid/60 tabular-nums">
                    {shippedProducts.length} product{shippedProducts.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-warm/60">
                {shippedProducts.map((p) => (
                  <ShippedProductRow key={p.slug} p={p} />
                ))}
              </div>
            </Card>
          );
        })()}


        {/* ═══ IDEA QUEUE ═════════════════════════════════════════════ */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="label-caps text-mid/80">Idea Queue</p>
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
                    className={`px-2.5 py-1 rounded text-[0.8rem] tracking-wide transition-all cursor-pointer capitalize ${
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
                <p className="text-sm text-mid/60 text-center py-4">
                  {queueTab === "queued"
                    ? "No ideas in queue. Scout will populate this from nightly research."
                    : `No ${queueTab} ideas yet.`}
                </p>
              );
            }
            return (
              <div className="space-y-2">
                {items.map((idea) => (
                  <IdeaRow
                    key={idea.slug}
                    idea={idea}
                    onPromote={queueTab === "queued" ? handlePromote : undefined}
                  />
                ))}
              </div>
            );
          })()}
        </Card>

        {/* ═══ TWO-LANE DIAGRAM ═══════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="label-caps text-mid/80 mb-2">Content Engine</p>
            <div className="space-y-1.5">
              <LaneStep agent="scout" label="Nightly Research" />
              <LaneArrow />
              <LaneStep agent="scout" label="Content Opportunities" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Draft + Humanize" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Distribute to Channels" />
            </div>
            <p className="text-[0.75rem] text-mid/60 mt-3 text-center">
              Builds audience + validates ideas
            </p>
          </Card>

          <Card className="p-4">
            <p className="label-caps text-mid/80 mb-2">App Factory</p>
            <div className="space-y-1.5">
              <LaneStep agent="scout" label="Pain Mining + Research" />
              <LaneArrow />
              <LaneStep agent="builder" label="Design Brief" />
              <LaneArrow />
              <LaneStep agent="builder" label="Build from Scaffold" />
              <LaneArrow />
              <LaneStep agent="bastion" label="Quality Gate (8/10)" />
              <LaneArrow />
              <LaneStep agent="vibe" label="Ship + Market" />
            </div>
            <p className="text-[0.75rem] text-mid/60 mt-3 text-center">
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
      <p className="label-caps text-[0.7rem] mt-1">{label}</p>
    </div>
  );
}

function FactoryProjectRow({
  project,
  phaseLabels,
  expanded,
  onToggle,
  expandedPhases,
  onTogglePhase,
}: {
  project: FactoryProject;
  phaseLabels: string[];
  expanded: boolean;
  onToggle: () => void;
  expandedPhases: Record<string, boolean>;
  onTogglePhase: (key: string) => void;
}) {
  const statusColor =
    project.status === "shipped" || project.status === "submitted"
      ? "var(--olive)"
      : project.status === "awaiting-approval"
        ? "var(--amber)"
        : project.status === "awaiting-design-approval"
          ? "#0BBBD4"
          : project.status === "needs-review" || project.status === "rejected_fixing"
            ? "var(--terracotta)"
            : "var(--lilac)";

  const effectivePhases = project.trackPhases ?? phaseLabels;
  const currentPhaseLabel = project.currentPhaseIdx >= 0
    ? effectivePhases[project.currentPhaseIdx]
    : null;
  const currentPhaseKey = currentPhaseLabel ? currentPhaseLabel.replace(" ", "_") : null;
  const currentPhaseDetail = currentPhaseKey ? project.phases[currentPhaseKey] : undefined;
  const currentAgent = currentPhaseDetail?.owner
    ? currentPhaseDetail.owner.toLowerCase()
    : project.currentPhaseIdx >= 0
      ? (PHASE_AGENTS[effectivePhases[project.currentPhaseIdx]] ?? "builder")
      : "main";

  // Determine if this project has recent agent activity
  const activity = project.lastActivity;
  // UI detail page now owns artifact readiness; live activity is presence-based here to avoid render-time time math.
  const hasLiveActivity = Boolean(activity);

  // Progress calculations
  const progressPct = effectivePhases.length > 0
    ? Math.round((project.completedPhases / effectivePhases.length) * 100)
    : 0;
  const phasesRemaining = effectivePhases.length - project.completedPhases;
  const currentPhaseName = currentPhaseLabel
    ? (currentPhaseLabel.replace(/_/g, " "))
    : null;
  const currentPhaseAbbrev = currentPhaseLabel
    ? (PHASE_ABBREV[currentPhaseLabel] ?? currentPhaseLabel.slice(0, 3))
    : null;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-5 py-3 hover:bg-warm/20 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {/* Project name + status + progress summary */}
        <div className="w-48 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center text-[0.7rem] text-white font-medium"
                style={{ backgroundColor: agentToken(currentAgent).color }}
              >
                {(project.displayName ?? project.slug).slice(0, 2).toUpperCase()}
              </span>
              {hasLiveActivity && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper pulse-dot"
                  style={{ backgroundColor: agentToken(activity!.agent).color }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-charcoal truncate">
                {project.displayName ?? project.slug.replace(/-/g, " ")}
              </p>
              {/* Current phase + agent — always visible */}
              {currentPhaseName ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 pulse-dot"
                    style={{ backgroundColor: agentToken(currentAgent).color }}
                  />
                  <span className="text-[0.72rem] font-medium capitalize" style={{ color: agentToken(currentAgent).color }}>
                    {currentPhaseName}
                  </span>
                  <span className="text-[0.68rem] text-mid/50">·</span>
                  <span className="text-[0.68rem] text-mid/60 capitalize">{currentAgent}</span>
                  {hasLiveActivity && activity && (
                    <>
                      <span className="text-[0.68rem] text-mid/50">·</span>
                      <span className="text-[0.68rem] text-mid/50 tabular-nums">{relTime(activity.timestamp)}</span>
                    </>
                  )}
                </div>
              ) : null}
              {/* Live current_action from factory-loop.sh — shows what the loop is doing right now */}
              {project.current_action && (
                <p className="text-[0.66rem] text-mid/55 truncate mt-0.5" title={project.current_action}>
                  {project.current_action}
                </p>
              )}
              {!currentPhaseName && (
                <Badge color={statusColor}>
                  {STATUS_LABELS[project.status] ?? project.status}
                </Badge>
              )}
              {/* Progress summary line */}
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[0.68rem] text-mid/55 tabular-nums">
                  {project.completedPhases}/{effectivePhases.length} phases
                </span>
                <span className="text-[0.68rem] text-mid/40">·</span>
                <span className="text-[0.68rem] tabular-nums" style={{ color: progressPct >= 80 ? "var(--olive)" : progressPct >= 40 ? "var(--amber)" : "var(--mid)" }}>
                  {progressPct}%
                </span>
                {phasesRemaining > 0 && (
                  <>
                    <span className="text-[0.68rem] text-mid/40">·</span>
                    <span className="text-[0.68rem] text-mid/55">
                      {phasesRemaining} to ship
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Phase progress bar */}
        <div className="flex-1 flex gap-0.5">
          {(project.trackPhases ?? phaseLabels).map((label, i) => {
            const phaseKey = label.replace(" ", "_");
            const phaseState = project.phases[phaseKey];
            const isComplete = phaseState?.status === "complete" || phaseState?.status === "drafted";
            // Stale: phase was complete but build has since restarted. Needs re-verification.
            const isStale = isComplete && Boolean((phaseState as { stale_since?: string })?.stale_since);
            const isCurrent = project.currentPhaseIdx >= 0 && i === project.currentPhaseIdx;
            const phaseAgent = PHASE_AGENTS[label];
            const agentColor = phaseAgent ? agentToken(phaseAgent).color : "var(--mid)";
            const phases = project.trackPhases ?? phaseLabels;

            return (
              <React.Fragment key={label}>
                <div
                  className="relative flex-1 h-7 rounded flex items-center justify-center overflow-hidden transition-all"
                  style={{
                    backgroundColor: isCurrent
                      ? `${agentColor}25`
                      : isStale
                        ? "var(--amber-soft, rgba(196, 160, 72, 0.22))"
                        : isComplete
                          ? "var(--olive-soft, rgba(118, 135, 90, 0.22))"
                          : "var(--warm)",
                    borderBottom: isCurrent ? `2px solid ${agentColor}` : undefined,
                  }}
                  title={`${label}: ${phaseState?.status ?? "pending"}${isStale ? " (stale — code changed since, needs re-verification)" : ""}`}
                >
                  {isStale ? (
                    <span className="text-[0.68rem] font-bold" style={{ color: "var(--amber)" }}>!</span>
                  ) : isComplete && (
                    <span className="text-[0.7rem] text-olive font-bold">&#10003;</span>
                  )}
                  {isCurrent && (
                    <span
                      className="text-[0.6rem] font-bold uppercase tracking-wide pulse-dot"
                      style={{ color: agentColor }}
                    >
                      {PHASE_ABBREV[label] ?? label.slice(0, 3)}
                    </span>
                  )}
                </div>
                {GATE_AFTER_PHASE.has(phaseKey) && i < phases.length - 1 && (
                  <div className="flex items-center justify-center w-3 flex-shrink-0">
                    <div className="w-px h-full" style={{ backgroundColor: "var(--amber)" }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Progress + score + expand */}
        <div className="w-32 flex-shrink-0 flex items-center justify-end gap-3">
          <div className="flex flex-col items-end gap-1">
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: progressPct >= 80 ? "var(--olive)" : progressPct >= 40 ? "var(--amber)" : "var(--lilac)",
                }}
              />
            </div>
            {/* QG + CR report badges */}
            {project.qgReportScore != null ? (
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className="text-[0.72rem] font-medium tabular-nums"
                  style={{
                    color: (() => {
                      const s = project.qgReportScore!;
                      const isScale10 = s <= 10;
                      const good = isScale10 ? 8 : 80;
                      const ok = isScale10 ? 6 : 60;
                      return s >= good ? "var(--olive)" : s >= ok ? "var(--amber)" : "var(--terracotta)";
                    })(),
                  }}
                >
                  QG {project.qgReportScore}{project.qgReportScore <= 10 ? "/10" : "/100"}
                  {project.qgVerdict && (
                    <span
                      className="ml-1 text-[0.65rem] px-1 py-0 rounded font-semibold"
                      style={{
                        backgroundColor: project.qgVerdict === "PASS" ? "rgba(118, 135, 90, 0.15)" : "rgba(183, 110, 121, 0.15)",
                        color: project.qgVerdict === "PASS" ? "var(--olive)" : "var(--terracotta)",
                      }}
                    >
                      {project.qgVerdict}
                    </span>
                  )}
                </span>
                {project.crVerdict != null && (
                  <span
                    className="text-[0.68rem] font-medium tabular-nums"
                    style={{ color: project.crVerdict === "PASS" ? "var(--olive)" : "var(--terracotta)" }}
                  >
                    CR: {project.crVerdict}
                    {project.crIssues && (project.crIssues.critical > 0 || project.crIssues.high > 0) && (
                      <span className="text-[0.62rem] text-mid/60 ml-0.5">
                        ({project.crIssues.critical}C/{project.crIssues.high}H)
                      </span>
                    )}
                  </span>
                )}
              </div>
            ) : project.qualityScore !== null ? (
              <span
                className="text-[0.72rem] font-medium tabular-nums"
                style={{
                  color:
                    project.qualityScore >= 80
                      ? "var(--olive)"
                      : project.qualityScore >= 60
                        ? "var(--amber)"
                        : "var(--terracotta)",
                }}
              >
                QG {project.qualityScore}/100
              </span>
            ) : project.crVerdict != null ? (
              <span
                className="text-[0.68rem] font-medium tabular-nums"
                style={{ color: project.crVerdict === "PASS" ? "var(--olive)" : "var(--terracotta)" }}
              >
                CR: {project.crVerdict}
                {project.crIssues && (project.crIssues.critical > 0 || project.crIssues.high > 0) && (
                  <span className="text-[0.62rem] text-mid/60 ml-0.5">
                    ({project.crIssues.critical}C/{project.crIssues.high}H)
                  </span>
                )}
              </span>
            ) : project.qualityAttempt > 0 ? (
              <span className="text-[0.72rem] text-terracotta tabular-nums">
                QG attempt {project.qualityAttempt}
              </span>
            ) : (
              <span className="text-[0.68rem] text-mid/50 tabular-nums">
                {progressPct}% complete
              </span>
            )}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--mid)"
            strokeWidth="2"
            strokeLinecap="round"
            className={`transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
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
              <div className="space-y-3">
                {/* Core Features — extracted from one-pager */}
                {(() => {
                  const text = project.onePager as string;
                  const featMatch = text.match(/##\s+Core Features[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n\n##|$)/i);
                  const features: string[] = [];
                  if (featMatch) {
                    const block = featMatch[1];
                    for (const line of block.split("\n")) {
                      const m = line.match(/^\s*(?:\d+\.|[-*])\s+\*\*([^*]+)\*\*\s*(?:—|-)\s*(.*)/);
                      if (m) features.push(`${m[1].trim()} — ${m[2].trim()}`);
                      else {
                        const m2 = line.match(/^\s*(?:\d+\.|[-*])\s+(.+)/);
                        if (m2 && m2[1].trim()) features.push(m2[1].trim());
                      }
                    }
                  }
                  if (features.length === 0) return null;
                  return (
                    <div>
                      <p className="label-caps text-[0.7rem] mb-2">Core Features</p>
                      <div className="space-y-1.5">
                        {features.map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-[0.78rem] text-charcoal/90 leading-snug">
                            <span className="mt-[3px] flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[0.65rem] font-semibold text-white" style={{ background: "var(--lilac)" }}>{i + 1}</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Rest of one-pager */}
                <details>
                  <summary className="text-[0.75rem] text-mid/70 cursor-pointer select-none hover:text-mid transition-colors">Full one-pager</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-mid leading-relaxed font-[family-name:var(--font-dm-mono)]">
                    {project.onePager}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="text-sm text-mid/70 text-center py-4">
                One-pager not yet generated. Research phase will create it.
              </p>
            )}

            {project.artifactAudit && (
              <div className="mt-4 pt-4 border-t border-warm/50 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="label-caps text-[0.72rem]">Phase Agreement Checklist</p>
                  <span className="text-[0.75rem] text-mid/65">
                    {project.artifactAudit.phase_state ? project.artifactAudit.phase_state.replace(/-/g, " ") : "audit active"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(project.artifactAudit.artifacts).map(([phaseName, audit]) => {
                    const complete = audit.required.length > 0 && audit.missing.length === 0;
                    const active = project.artifactAudit?.phase === phaseName;
                    const phaseToggleKey = `${project.slug}:${phaseName}`;
                    const isPhaseExpanded = expandedPhases[phaseToggleKey] ?? false;
                    return (
                      <div
                        key={phaseName}
                        className="rounded-lg border transition-colors overflow-hidden"
                        style={{
                          borderColor: complete ? "rgba(118, 135, 90, 0.35)" : active ? "rgba(183, 110, 121, 0.35)" : audit.missing.length > 0 ? "rgba(196, 160, 72, 0.35)" : "rgba(201, 183, 159, 0.55)",
                          backgroundColor: complete ? "rgba(118, 135, 90, 0.08)" : active ? "rgba(183, 110, 121, 0.06)" : "rgba(255,255,255,0.45)",
                        }}
                      >
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-warm/10 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onTogglePhase(phaseToggleKey); }}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--mid)"
                              strokeWidth="2"
                              strokeLinecap="round"
                              className={`transition-transform flex-shrink-0 ${isPhaseExpanded ? "rotate-90" : ""}`}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                            <p className="text-[0.8rem] font-medium text-charcoal capitalize">
                              {phaseName.replace(/_/g, " ")}
                            </p>
                            {complete ? (
                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(118, 135, 90, 0.14)", color: "var(--olive)" }}>
                                ready
                              </span>
                            ) : active ? (
                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(183, 110, 121, 0.12)", color: "var(--terracotta)" }}>
                                active
                              </span>
                            ) : audit.missing.length > 0 ? (
                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(196, 160, 72, 0.12)", color: "var(--amber)" }}>
                                pending
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[0.72rem] text-mid/70 tabular-nums">
                            {audit.delivered.length}/{audit.required.length}
                          </span>
                        </div>
                        {isPhaseExpanded && (
                          <div className="px-3 pb-3 fade-up">
                            <div className="space-y-1.5">
                              {audit.required.map((item) => {
                                const delivered = audit.delivered.includes(item);
                                const displayLabel = audit.labels?.[item] ?? item;
                                return (
                                  <div
                                    key={item}
                                    className="flex items-start gap-2 text-[0.76rem] rounded-md px-2 py-1"
                                    style={{ backgroundColor: delivered ? "rgba(118, 135, 90, 0.06)" : "rgba(0,0,0,0.02)" }}
                                  >
                                    <span className="mt-[2px] font-medium" style={{ color: delivered ? "var(--olive)" : "var(--mid)" }}>
                                      {delivered ? "\u2611" : "\u2610"}
                                    </span>
                                    <span className={delivered ? "text-charcoal" : "text-mid/70"}>{displayLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {audit.subChecks && audit.subChecks.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-warm/40 space-y-1">
                                <div className="text-[0.68rem] uppercase tracking-wider text-mid/70 mb-1.5 font-medium">Checks</div>
                                {audit.subChecks.map((c) => {
                                  const color = c.status === "pass" ? "var(--olive)" : c.status === "fail" ? "var(--terracotta)" : "var(--amber)";
                                  const bg = c.status === "pass" ? "rgba(118, 135, 90, 0.08)" : c.status === "fail" ? "rgba(183, 110, 121, 0.10)" : "rgba(196, 160, 72, 0.10)";
                                  const mark = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "!";
                                  return (
                                    <div key={c.id} className="flex items-center gap-2 text-[0.74rem] rounded-md px-2 py-1" style={{ backgroundColor: bg }}>
                                      <span className="font-semibold tabular-nums flex-shrink-0" style={{ color, minWidth: 28 }}>{mark} {c.id}</span>
                                      <span className="text-charcoal flex-1 truncate">{c.label}</span>
                                      {c.score && <span className="text-[0.7rem] tabular-nums text-mid">{c.score}</span>}
                                      {c.detail && (
                                        <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: color, color: "white" }}>{c.detail}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {audit.missing.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-warm/40 text-[0.72rem] text-mid/70">
                                Missing: {audit.missing.map((m) => audit.labels?.[m] ?? m).join(", ")}
                              </div>
                            )}
                            {phaseName === "design" && audit.delivered.includes("design-brief.md") && (
                              <div className="mt-2 pt-2 border-t border-warm/40">
                                <Link
                                  href={`/factory/${project.slug}/design-preview`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium px-2.5 py-1 rounded-md transition-colors"
                                  style={{ color: "var(--amber)", background: "rgba(196,160,72,0.10)" }}
                                >
                                  View Design Brief →
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Phase detail strip */}
            <div className="mt-3 pt-3 border-t border-warm/50 grid grid-cols-4 gap-3">
              <div>
                <p className="label-caps text-[0.7rem] mb-1">Progress</p>
                <p className="text-sm text-charcoal tabular-nums">
                  {project.completedPhases}/{project.totalPhases} phases
                </p>
              </div>
              <div>
                <p className="label-caps text-[0.7rem] mb-1">Quality</p>
                <p className="text-sm text-charcoal tabular-nums">
                  {project.qualityScore !== null
                    ? `${project.qualityScore}/100 (attempt ${project.qualityAttempt})`
                    : "Not yet tested"}
                </p>
              </div>
              <div>
                <p className="label-caps text-[0.7rem] mb-1">Started</p>
                <p className="text-sm text-charcoal">
                  {new Date(project.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Europe/Copenhagen",
                  })}
                </p>
              </div>
              <div className="flex items-end justify-end">
                <Link
                  href={`/factory/${project.slug}/analytics`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8rem] font-medium transition-all hover:bg-warm border border-warm/60"
                  style={{ color: "var(--terracotta)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                  Analytics
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaRow({ idea, onPromote }: { idea: IdeaEntry; onPromote?: (slug: string) => void }) {
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
          className="absolute inset-0 flex items-center justify-center text-[0.75rem] font-medium tabular-nums"
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
        <p className="text-xs text-mid/80 truncate">{idea.tagline}</p>
        {idea.target_audience && (
          <p className="text-[0.75rem] text-mid/60 truncate mt-0.5">{idea.target_audience}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {idea.segment && (
          <span
            className="text-[0.65rem] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider"
            style={{
              color: idea.segment === "b2b" ? "#768B5A" : "#5B6FA8",
              backgroundColor: idea.segment === "b2b" ? "rgba(118, 139, 90, 0.12)" : "rgba(91, 111, 168, 0.12)",
            }}
          >
            {idea.segment === "b2b" ? "SaaS" : "Mobile"}
          </span>
        )}
        {idea.painkiller && (
          <Badge color="var(--terracotta)">painkiller</Badge>
        )}
        <span className="text-[0.75rem] text-mid/60">{idea.source}</span>
        {onPromote && (
          <button
            onClick={() => onPromote(idea.slug)}
            className="text-[0.7rem] px-2 py-1 rounded bg-olive/15 text-olive hover:bg-olive/25 transition-colors border border-olive/30 font-medium tracking-wide"
            title="Create factory project from this idea"
          >
            → Factory
          </button>
        )}
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
            className="w-6 h-6 rounded-md flex items-center justify-center text-[0.7rem] text-white font-medium"
            style={{ backgroundColor: "var(--olive)" }}
          >
            {project.slug.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-medium text-charcoal capitalize">
              {project.slug.replace(/-/g, " ")}
            </p>
            <p className="text-[0.75rem] text-mid/70">
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
          <p className="label-caps text-[0.65rem] text-mid/70 mb-1">Traffic</p>
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
          <p className="label-caps text-[0.65rem] text-mid/70 mb-1">Users</p>
          <div className="space-y-0.5">
            <KPIMetric label="DAU" value={kpi.users.dau} trend={trend(kpi.users.dau, prev?.users.dau)} />
            <KPIMetric label="D1 Ret" value={kpi.users.d1_retention != null ? `${kpi.users.d1_retention}%` : "-"} />
            <KPIMetric label="D7 Ret" value={kpi.users.d7_retention != null ? `${kpi.users.d7_retention}%` : "-"} />
          </div>
        </div>

        {/* Revenue */}
        <div>
          <p className="label-caps text-[0.65rem] text-mid/70 mb-1">Revenue</p>
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
          <p className="label-caps text-[0.65rem] text-mid/70 mb-1">Churn</p>
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
      <span className="text-[0.75rem] text-mid/70">{label}</span>
      <span className={`text-[0.8rem] tabular-nums font-medium ${alert ? "text-terracotta" : "text-charcoal"}`}>
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
      className="text-[0.7rem] ml-0.5"
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
      className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold tracking-widest font-[family-name:var(--font-dm-mono)] flex-shrink-0"
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
        className="w-4 h-4 rounded-full flex items-center justify-center text-[0.65rem] text-white font-medium flex-shrink-0"
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

function ShippedProductRow({ p }: { p: FactoryProject }) {
  const [expanded, setExpanded] = useState(false);
  const name = p.displayName ?? p.slug.replace(/-/g, " ");
  const daysSince = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
  const qgRaw = p.phases.quality_gate;
  const qgScore = qgRaw?.score ?? (qgRaw as unknown as Record<string, unknown> | undefined)?.design_score as number | undefined ?? null;
  const monetizationRaw = p.phases.monetization as unknown as Record<string, unknown> | undefined;
  // Pricing shape: legacy = {monthly: number, annual: number}, new = {monthly: {product_id, price}, annual: {product_id, price}}
  const mpRaw = (p.phases.monetization as { pricing?: Record<string, unknown> } | undefined)?.pricing;
  const priceOf = (v: unknown): number | null =>
    typeof v === "number" ? v : (v && typeof v === "object" && "price" in v && typeof (v as { price: unknown }).price === "number" ? (v as { price: number }).price : null);
  const mp = mpRaw ? { monthly: priceOf(mpRaw.monthly), annual: priceOf(mpRaw.annual) } : undefined;
  const tiersMonthly = (monetizationRaw?.tiers as Record<string,string> | undefined)?.monthly ?? '';
  const notes = (monetizationRaw?.summary ?? monetizationRaw?.notes ?? tiersMonthly) as string | undefined;
  const monthlyMatch = !mp && notes ? notes.match(/\$(\d+\.?\d*)/) : null;
  const monthly = mp?.monthly ?? (monthlyMatch ? parseFloat(monthlyMatch[1]) : null);

  return (
    <div key={p.slug}>
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--olive)" }} />
          <div>
            <p className="text-sm font-medium text-charcoal">{name}</p>
            <p className="text-[0.75rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
              {p.track?.toUpperCase()} · shipped {daysSince}d ago
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {monthly != null && (
            <span className="text-[0.75rem] text-mid/70 tabular-nums font-[family-name:var(--font-dm-mono)]">${monthly}/mo</span>
          )}
          {qgScore !== null && (
            <span className="text-[0.75rem] tabular-nums font-medium" style={{ color: qgScore >= 80 ? "#4ade80" : "#fbbf24" }}>
              QG {qgScore}
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[0.72rem] text-mid/60 hover:text-charcoal transition-colors px-2 py-0.5 rounded border border-warm/40 cursor-pointer"
          >
            {expanded ? "Hide" : "Review"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-warm/40">
          {/* One-pager excerpt */}
          {p.onePager && (
            <div className="mt-3">
              <p className="label-caps text-[0.65rem] text-mid/60 mb-1.5">One-Pager</p>
              <p className="text-[0.78rem] text-mid/80 leading-relaxed font-[family-name:var(--font-dm-mono)] whitespace-pre-wrap">
                {(p.onePager as string).slice(0, 600)}{(p.onePager as string).length > 600 ? "…" : ""}
              </p>
            </div>
          )}
          {/* Build summary */}
          {(p.buildPreview as any)?.buildSummary && (
            <div>
              <p className="label-caps text-[0.65rem] text-mid/60 mb-1.5">What was built</p>
              <p className="text-[0.78rem] text-mid/80 leading-relaxed font-[family-name:var(--font-dm-mono)]">
                {(p.buildPreview as any).buildSummary}
              </p>
            </div>
          )}
          {/* Phase completion */}
          <div>
            <p className="label-caps text-[0.65rem] text-mid/60 mb-1.5">Pipeline</p>
            <p className="text-[0.75rem] text-mid/70 font-[family-name:var(--font-dm-mono)]">
              {p.completedPhases}/{p.totalPhases} phases complete · QG {qgScore ?? "—"}/100
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DesignReviewPanel({ project }: { project: FactoryProject }) {
  const slug = project.slug;
  const displayName = project.displayName ?? slug.replace(/-/g, " ");

  return (
    <div className="rounded-xl border-2 overflow-hidden fade-up" style={{ borderColor: "#0BBBD4", boxShadow: "0 0 30px rgba(11, 187, 212, 0.1)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: "rgba(11, 187, 212, 0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#0BBBD4" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          </div>
          <div>
            <p className="text-xl text-charcoal tracking-tight" style={{ fontFamily: "var(--font-cormorant)" }}>
              Review Design — {displayName}
            </p>
            <p className="text-[0.8rem] text-mid/80 font-[family-name:var(--font-dm-mono)]">
              Design phase complete · Approve to begin build
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] font-[family-name:var(--font-dm-mono)] px-2 py-1 rounded" style={{ backgroundColor: "rgba(11, 187, 212, 0.12)", color: "#0BBBD4" }}>
            design review
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-mid/80">
          Color palette, typography, mascot, and UI direction are ready. Open the preview to evaluate before committing to build.
        </p>
        <div className="flex gap-3">
          <a
            href={`/factory/${slug}/design-preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#0BBBD4", color: "white" }}
          >
            Open Design Preview →
          </a>
          <a
            href={`/factory/${slug}/design-preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80"
            style={{ borderColor: "#0BBBD4", color: "#0BBBD4" }}
          >
            Approve / Revise
          </a>
        </div>
        <p className="text-[0.7rem] text-mid/50 font-[family-name:var(--font-dm-mono)]">
          Approve and Revise buttons are inside the preview page
        </p>
      </div>
    </div>
  );
}

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
  const [showPreview, setShowPreview] = useState(false);

  const qgRaw = project.phases.quality_gate;
  // Normalize: some QG runs write design_score instead of score
  const qgScore = qgRaw?.score ?? (qgRaw as unknown as Record<string, unknown> | undefined)?.design_score as number | undefined ?? null;
  const qg = qgRaw ? { ...qgRaw, score: qgScore } : undefined;
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
        <p className="text-xs text-mid/80 mt-1 font-[family-name:var(--font-dm-mono)]">{result.message}</p>
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
              Ship {project.displayName ?? project.slug.replace(/-/g, " ")}?
            </p>
            <p className="text-[0.8rem] text-mid/80 font-[family-name:var(--font-dm-mono)]">
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
            <p className="label-caps text-[0.65rem] text-mid/70 mb-2">Quality Gate</p>
            <div className="flex items-end gap-3">
              {qg?.prior_score != null && (
                <div className="text-center">
                  <p className="text-2xl font-light tabular-nums text-terracotta/60" style={{ fontFamily: "var(--font-cormorant)" }}>
                    {qg.prior_score}
                  </p>
                  <p className="text-[0.7rem] text-mid/60">before</p>
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
                  {qg?.score ?? "—"}<span className="text-lg text-mid/60">/100</span>
                </p>
                <p className="text-[0.7rem] text-mid/60">
                  after &middot; attempt {qg?.attempt ?? "?"}
                </p>
              </div>
            </div>
            {qg?.summary && (
              <p className="text-[0.75rem] text-mid/80 mt-2 leading-relaxed font-[family-name:var(--font-dm-mono)]">
                {qg.summary}
              </p>
            )}
          </div>

          {/* Monetization */}
          <div className="flex-1 rounded-lg p-3 border border-warm/50">
            <p className="label-caps text-[0.65rem] text-mid/70 mb-2">Monetization</p>
            {(() => {
              // Try structured pricing first, then parse from notes
              const mpRaw = monetization?.pricing;
              const priceOf = (v: unknown): number | null =>
                typeof v === "number" ? v : (v && typeof v === "object" && "price" in v && typeof (v as { price: unknown }).price === "number" ? (v as { price: number }).price : null);
              const mp = mpRaw ? { monthly: priceOf(mpRaw.monthly), annual: priceOf(mpRaw.annual) } : undefined;
              const monetizationRaw = monetization as unknown as Record<string, unknown> | undefined;
              // Flatten tiers object into a parseable string if present
              const tiersMonthly = (monetizationRaw?.tiers as Record<string,string> | undefined)?.monthly ?? '';
              const notes = monetization?.summary ?? monetizationRaw?.notes as string | undefined ?? tiersMonthly;
              const monthlyMatch = !mp && notes ? notes.match(/\$(\d+\.?\d*)\/?month/i) : null;
              const annualMatch = !mp && notes ? notes.match(/\$(\d+\.?\d*)\/?year/i) : null;
              const monthly = mp?.monthly ?? (monthlyMatch ? parseFloat(monthlyMatch[1]) : null);
              const annual = mp?.annual ?? (annualMatch ? parseFloat(annualMatch[1]) : null);
              const trialMatch = !mp && notes ? notes.match(/(\d+)[- ]day free trial/i) : null;
              const trialDays = monetization?.trial_days ?? (trialMatch ? parseInt(trialMatch[1]) : null);

              if (monthly != null) return (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-light tabular-nums text-charcoal" style={{ fontFamily: "var(--font-cormorant)" }}>
                    ${monthly}
                  </p>
                  <span className="text-xs text-mid/60">/mo</span>
                </div>
                <p className="text-[0.75rem] text-mid/70 mt-0.5">
                  {annual != null && <>${annual}/yr &middot; </>}{trialDays ?? 7}-day free trial
                  {monetization?.free_trial_scans != null && ` · ${monetization.free_trial_scans} free scans`}
                </p>
                {monetization?.changes && monetization.changes.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {monetization.changes.map((c, i) => (
                      <p key={i} className="text-[0.7rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">• {c}</p>
                    ))}
                  </div>
                )}
              </div>
              );
              if (monetization?.status === "complete") return (
                <p className="text-sm text-mid/70">Configured — see report</p>
              );
              return <p className="text-sm text-mid/60">Not configured</p>;
            })()}
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
                <span className="w-5 h-5 rounded flex items-center justify-center text-[0.7rem] text-white font-medium" style={{ backgroundColor: "var(--lilac)" }}>B</span>
                <span className="text-[0.8rem] text-charcoal font-medium">
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
                    <span className="text-olive text-[0.75rem] mt-0.5">&#10003;</span>
                    <p className="text-[0.75rem] text-mid/70 leading-relaxed font-[family-name:var(--font-dm-mono)]">{fix}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Operator Tasks */}
        {operatorTasks.length > 0 && (
          <div className="rounded-lg p-3 border border-terracotta/20" style={{ backgroundColor: "rgba(196, 107, 72, 0.03)" }}>
            <p className="label-caps text-[0.65rem] text-terracotta/60 mb-2">
              Operator Tasks — complete before shipping
            </p>
            <div className="space-y-1.5">
              {operatorTasks.map((task, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-3.5 h-3.5 rounded border border-mid/20 flex-shrink-0 mt-0.5" />
                  <p className="text-[0.75rem] text-mid/70 leading-relaxed font-[family-name:var(--font-dm-mono)]">{task}</p>
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
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[0.7rem] font-[family-name:var(--font-dm-mono)]"
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
              <span className="text-[0.8rem] font-medium text-charcoal">E2E Tests</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.75rem] text-mid/80 font-[family-name:var(--font-dm-mono)] tabular-nums">
                {project.e2eResults.passed}/{project.e2eResults.tests} passed
              </span>
              {project.e2eResults.failed > 0 && (
                <span className="text-[0.75rem] text-terracotta font-[family-name:var(--font-dm-mono)] tabular-nums">
                  {project.e2eResults.failed} failed
                </span>
              )}
              {project.e2eResults.status === "skip" && (
                <span className="text-[0.7rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
                  skipped — no simulator
                </span>
              )}
            </div>
          </div>
        )}

        {/* Build Preview — what was actually built */}
        {project.buildPreview && (
          <div className="rounded-lg border border-warm/50 overflow-hidden">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-warm/10 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[0.7rem] text-white font-medium" style={{ backgroundColor: "var(--olive)" }}>
                  ▶
                </span>
                <span className="text-[0.8rem] text-charcoal font-medium">
                  What was built
                </span>
                {project.buildPreview.stats && (
                  <span className="text-[0.7rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
                    {project.buildPreview.stats.files} files &middot; {((project.buildPreview.stats.lines ?? 0) / 1000).toFixed(1)}k lines &middot; {project.buildPreview.stats.screens} screens
                  </span>
                )}
              </div>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="2" strokeLinecap="round"
                className={`transition-transform ${showPreview ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showPreview && (
              <div className="px-3 pb-3 space-y-3 fade-up">
                {/* Build summary */}
                {project.buildPreview.buildSummary && (
                  <p className="text-[0.78rem] text-mid/90 leading-relaxed font-[family-name:var(--font-dm-mono)]">
                    {project.buildPreview.buildSummary}
                  </p>
                )}

                {/* Stats grid */}
                {project.buildPreview.stats && (
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: "Files", value: project.buildPreview.stats.files },
                      { label: "Lines", value: project.buildPreview.stats.lines ? `${(project.buildPreview.stats.lines / 1000).toFixed(1)}k` : null },
                      { label: "Screens", value: project.buildPreview.stats.screens },
                      { label: "Tests", value: project.buildPreview.stats.tests },
                      { label: "Services", value: project.buildPreview.stats.services },
                    ].filter(s => s.value != null).map((s) => (
                      <div key={s.label} className="text-center rounded-md py-1.5 border border-warm/30">
                        <p className="text-lg tabular-nums text-charcoal" style={{ fontFamily: "var(--font-cormorant)" }}>{s.value}</p>
                        <p className="text-[0.6rem] text-mid/60 uppercase tracking-widest">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Design + screens row */}
                <div className="flex gap-3">
                  {/* Design palette */}
                  {project.buildPreview.designColors && (
                    <div className="flex-1 rounded-md p-2 border border-warm/30">
                      <p className="text-[0.65rem] text-mid/60 uppercase tracking-widest mb-1.5">Design</p>
                      <div className="flex items-center gap-2">
                        {project.buildPreview.designColors.primary && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full border border-warm/40" style={{ backgroundColor: project.buildPreview.designColors.primary }} />
                            <span className="text-[0.7rem] font-[family-name:var(--font-dm-mono)] text-mid/70">{project.buildPreview.designColors.primary}</span>
                          </div>
                        )}
                        {project.buildPreview.designColors.surface && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full border border-warm/40" style={{ backgroundColor: project.buildPreview.designColors.surface }} />
                            <span className="text-[0.7rem] font-[family-name:var(--font-dm-mono)] text-mid/70">{project.buildPreview.designColors.surface}</span>
                          </div>
                        )}
                        <span className="text-[0.7rem] text-mid/50 ml-1">
                          {project.buildPreview.hasMascot ? "w/ mascot" : "no mascot"}
                        </span>
                      </div>
                      {project.buildPreview.designTone && (
                        <p className="text-[0.7rem] text-mid/70 mt-1.5 italic leading-snug">
                          &ldquo;{project.buildPreview.designTone}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {/* Screens list */}
                  {project.buildPreview.screenList && project.buildPreview.screenList.length > 0 && (
                    <div className="flex-1 rounded-md p-2 border border-warm/30">
                      <p className="text-[0.65rem] text-mid/60 uppercase tracking-widest mb-1.5">Screens</p>
                      <div className="flex flex-wrap gap-1">
                        {project.buildPreview.screenList.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[0.68rem] font-[family-name:var(--font-dm-mono)] text-mid/80" style={{ backgroundColor: "rgba(0,0,0,0.04)" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulator Test Instructions */}
                <div className="rounded-md border border-warm/30 p-3 space-y-2" style={{ backgroundColor: "rgba(0,0,0,0.02)" }}>
                  {(project.buildPreview as any)?.e2eResults ? (() => {
                    const e2e = (project.buildPreview as any).e2eResults;
                    const verdict = e2e.verdict ?? "UNKNOWN";
                    const verdictColor = verdict === "PASS" ? "var(--olive)" : verdict === "WARN" ? "var(--amber)" : "var(--terracotta)";
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[0.75rem] font-medium text-charcoal">Pre-Approval Tests</p>
                          <span className="text-[0.72rem] font-semibold px-1.5 py-0.5 rounded" style={{ color: verdictColor, backgroundColor: `color-mix(in srgb, ${verdictColor} 12%, transparent)` }}>
                            {verdict}
                          </span>
                        </div>
                        <div className="flex gap-3 text-[0.72rem] font-[family-name:var(--font-dm-mono)]">
                          <span className="text-olive">✓ {e2e.unit?.pass ?? 0} pass</span>
                          {(e2e.unit?.fail ?? 0) > 0 && <span className="text-terracotta">✗ {e2e.unit.fail} fail</span>}
                          {(e2e.unit?.warn ?? 0) > 0 && <span className="text-amber-600">⚠ {e2e.unit.warn} warn</span>}
                          <span className="text-mid/60">E2E {e2e.e2e?.passed ?? 0}/{e2e.e2e?.total ?? 0}</span>
                        </div>
                        {e2e.build_installed && (
                          <p className="text-[0.72rem] text-olive font-[family-name:var(--font-dm-mono)]">
                            ✓ Installed on {e2e.simulator ?? "iPhone 17 Pro"}
                          </p>
                        )}
                        {/* L8: PRD Alignment */}
                        {e2e.alignment && e2e.alignment !== "SKIPPED" && (() => {
                          const al = e2e.alignment as string;
                          const alColor = al === "ALIGNED" ? "var(--olive)" : al === "PARTIAL" ? "var(--amber)" : al === "MISALIGNED" ? "var(--terracotta)" : "var(--mid)";
                          const alIcon = al === "ALIGNED" ? "✓" : al === "PARTIAL" ? "⚠" : al === "MISALIGNED" ? "✗" : "?";
                          const alignReport = (project.buildPreview as any)?.alignmentReport as string | undefined;
                          const screenshotCount = (project.buildPreview as any)?.screenshotCount as number | undefined;
                          // Extract P0 feature checklist section from alignment report
                          const checklistMatch = alignReport?.match(/## P0 Feature Checklist\n([\s\S]*?)(?=## |$)/);
                          const checklist = checklistMatch?.[1]?.trim();
                          return (
                            <div className="mt-2 pt-2 border-t border-warm/30 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-[0.72rem] text-mid/70">PRD Alignment {screenshotCount ? `(${screenshotCount} screenshots)` : ""}</p>
                                <span className="text-[0.7rem] font-semibold font-[family-name:var(--font-dm-mono)] px-1.5 py-0.5 rounded"
                                  style={{ color: alColor, backgroundColor: `color-mix(in srgb, ${alColor} 12%, transparent)` }}>
                                  {alIcon} {al}
                                </span>
                              </div>
                              {checklist && (
                                <div className="text-[0.68rem] font-[family-name:var(--font-dm-mono)] text-mid/70 space-y-0.5 max-h-28 overflow-y-auto leading-relaxed">
                                  {checklist.split("\n").filter(Boolean).slice(0, 10).map((line, i) => (
                                    <p key={i} className={line.includes("❌") ? "text-terracotta/80" : line.includes("⚠️") ? "text-amber-600" : "text-olive/80"}>{line}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })() : (
                    <p className="text-[0.75rem] text-mid/60">Pre-approval tests not yet run</p>
                  )}
                  <div className="pt-1 border-t border-warm/40 space-y-1">
                    <p className="text-[0.72rem] font-medium text-charcoal">Open on Simulator</p>
                    <p className="text-[0.7rem] text-mid/70 font-[family-name:var(--font-dm-mono)]">
                      Tap the app icon on iPhone 17 Pro · these apps require a dev build, not Expo Go
                    </p>
                    {(project.buildPreview as any)?.testCredentials?.email && (
                      <p className="text-[0.7rem] text-mid/60 font-[family-name:var(--font-dm-mono)]">
                        Test account: <span className="text-charcoal">{(project.buildPreview as any).testCredentials.email}</span>
                      </p>
                    )}
                    <p className="text-[0.68rem] text-mid/50 font-[family-name:var(--font-dm-mono)]">
                      password: TestFactory2026!
                    </p>
                  </div>
                </div>
              </div>
            )}
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
                className="w-full px-3 py-2 rounded-lg border border-warm text-sm font-[family-name:var(--font-dm-mono)] placeholder:text-mid/55 focus:outline-none focus:border-terracotta/40"
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
