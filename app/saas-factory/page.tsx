"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { relTime } from "@/app/lib/agents";

type ExpandedPhases = Record<string, boolean>;

// ─── Types ───────────────────────────────────────────────────────────

interface PhaseState {
  status: string;
  score?: number;
  attempt?: number;
  summary?: string;
  result?: string;
}

interface ArtifactPhaseAudit {
  required: string[];
  delivered: string[];
  missing: string[];
  labels?: Record<string, string>;
}

interface ArtifactAudit {
  slug: string;
  phase: string;
  phase_state?: string;
  artifacts: Record<string, ArtifactPhaseAudit>;
}

interface Project {
  slug: string;
  name?: string | null;
  displayName?: string;
  status: string;
  phase: number;
  phases: Record<string, PhaseState>;
  track: string;
  trackPhases: string[];
  currentPhaseIdx: number;
  completedPhases: number;
  totalPhases: number;
  qualityScore: number | null;
  qualityAttempt: number;
  created_at: string;
  updated_at: string;
  onePager?: string;
  product_type?: string;
  artifactAudit?: ArtifactAudit;
}

interface KeyQuote { text?: string; source?: string }
interface IdeaEvidence {
  // Scout-synthesis sources
  pain_signal?: string;
  market_evidence?: string;
  trend?: string;
  competitive_gap?: string;
  suggested_action?: string;
  key_quotes?: KeyQuote[];
  subreddits?: string[];
  // JTBD / cluster sources
  niche?: string;
  signals_count?: number;
  cross_source_count?: number;
  complaint_count?: number;
  sample_titles?: string[];
  jtbd_category?: string;
  tool_mentions?: string[];
  dimensions?: Record<string, number>;
  composite_score?: number;
}
interface IdeaConcept {
  product_name?: string;
  tagline?: string;
  problem_statement?: string;
  target_user?: string;
  core_features?: { feature?: string; description?: string }[];
  differentiator?: string;
  monetization?: string;
  competitive_positioning?: string;
  core_moment?: string;
  retention_hook?: string;
  tell_a_friend_hook?: string;
}
interface MiniOnePager {
  recommendation?: string;       // "QUALIFY" | "PARK" | "REJECT" | etc
  pain_evidence?: unknown[];
  competition?: unknown[];
  score?: number;
  dimension_breakdown?: Record<string, number>;
}
interface PrismPivot {
  name?: string;
  confidence?: string; // "HIGH" | "MEDIUM" | "LOW"
  who?: string;
  wedge?: string;
  validation?: string;
  risk?: string;
  raw?: string;
}
interface PrismReview {
  verdict?: string;          // "BET" | "SPECULATIVE" | "SKIP" | (legacy: "PIVOT" | "REJECT")
  summary?: string;
  pivots?: PrismPivot[];
  rationale?: string;
  change_my_mind?: string[];
  raw_markdown?: string;
  reviewed_at?: string;
  model?: string;
}
interface IdeaQualification {
  verdict?: string;
  verdict_reasoning?: string;
  suggested_angle?: string;
  risks?: string[];
  opportunities?: string[];
  painkiller_strength?: { score?: number; reasoning?: string };
  distribution_clarity?: { score?: number; reasoning?: string };
  market_timing?: { score?: number; reasoning?: string };
  founder_fit?: { score?: number; reasoning?: string };
  gut_check?: { score?: number; reasoning?: string };
  qualification_score?: number;
  qualified_at?: string;
}
interface IdeaEntry {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  status?: string;
  source: string;
  proposed_at?: string;
  segment?: string;
  product_type?: string;
  painkiller?: boolean;
  target_audience?: string;
  evidence?: IdeaEvidence;
  qualification?: IdeaQualification;
  concept?: IdeaConcept;
  mini_one_pager?: MiniOnePager;
  pain_threads?: unknown[];
  jtbd_evidence?: unknown;
  competitors?: unknown[];
  prism_review?: PrismReview;
  promoted_from_watchlist?: boolean;
}

interface WatchlistEntry {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  status?: string;
  source: string;
  watchlisted_at?: string;
  evidence?: {
    signals_count?: number;
    complaint_count?: number;
    sample_titles?: string[];
  };
}

interface SaaSFactoryData {
  projects: Project[];
  ideaQueue: { queue: IdeaEntry[] };
  watchlist: { signals: WatchlistEntry[]; count: number };
  stats: { active: number; shipped: number; queued: number; watching: number };
  phaseLabels: string[];
}

interface ExperimentTraffic { date?: string; visits?: number; conversions?: number; note?: string; source?: string }
interface Experiment {
  exp_slug: string;
  source_idea_slug?: string;
  pivot_name?: string;
  pivot_who?: string;
  pivot_wedge?: string;
  pivot_validation_step?: string;
  pivot_risk?: string;
  pivot_confidence?: string;
  started_at?: string;
  kill_at?: string;
  status?: string;
  thresholds?: { unique_visits?: number; conversions?: number; window_days?: number };
  project_dir?: string;
  deploy_url?: string | null;
  traffic?: ExperimentTraffic[];
  outcome?: string | null;
  outcome_reason?: string | null;
  archived_at?: string | null;
  promoted_to_factory_at?: string | null;
  totals?: { visits: number; conversions: number };
  daysLeft?: number | null;
  thresholdMet?: boolean;
}
interface ValidationLabData {
  active: Experiment[];
  archived: Experiment[];
  stats: { active: number; succeeded: number; failed: number };
}

// ─── Constants ────────────────────────────────────────────────────────

const SAAS_PHASES = ["research", "validation", "design", "build", "code_review", "quality_gate", "monetization", "deploy", "marketing"];
const PHASE_SHORT: Record<string, string> = {
  research: "RES", validation: "VAL", design: "DES", build: "BUILD",
  code_review: "CR", quality_gate: "QG", monetization: "MON",
  deploy: "DEPLOY", marketing: "MKT",
};
const PHASE_LABELS: Record<string, string> = {
  research: "Research", validation: "Validation", design: "Design",
  build: "Build", code_review: "Code Review", quality_gate: "Quality Gate",
  monetization: "Monetization", deploy: "Deploy", marketing: "Marketing",
};

function statusColor(status: string): string {
  switch (status) {
    case "shipped": return "#16A34A";
    case "rejected": case "paused": case "parked": return "#9CA3AF";
    case "awaiting-design-approval": return "#0BBBD4";
    case "build": case "design": return "#D97706";
    case "research": case "validation": return "#2563EB";
    default: return "#6B7280";
  }
}

function phaseStyle(status: string | undefined, isCurrent: boolean) {
  if (!status || status === "pending") return { bg: "bg-warm", text: "text-mid/40" };
  if (status === "complete") return { bg: "bg-teal/20", text: "text-teal" };
  if (status === "failed") return { bg: "bg-terracotta/20", text: "text-terracotta" };
  if (isCurrent) return { bg: "bg-amber/20", text: "text-amber" };
  return { bg: "bg-warm", text: "text-mid/40" };
}

// ─── Component ────────────────────────────────────────────────────────

export default function SaaSFactoryPage() {
  const [data, setData] = useState<SaaSFactoryData | null>(null);
  const [labData, setLabData] = useState<ValidationLabData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedQueueSlug, setExpandedQueueSlug] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<ExpandedPhases>({});
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [prismRunning, setPrismRunning] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);

  const onTogglePhase = useCallback((key: string) => {
    setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const load = useCallback(async () => {
    try {
      const [sfRes, labRes] = await Promise.all([
        fetch("/api/saas-factory"),
        fetch("/api/validation-lab"),
      ]);
      if (!sfRes.ok) throw new Error(`saas-factory ${sfRes.status}`);
      setData(await sfRes.json());
      if (labRes.ok) setLabData(await labRes.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const onPromote = useCallback(async (slug: string, status: string) => {
    const isQualified = status === "qualified";
    const msg = isQualified
      ? `Promote "${slug}" into the SaaS factory? This kicks off the research phase.`
      : `"${slug}" hasn't been qualified yet (current status: ${status}).\n\nThe research phase will run a fresh PRD + market deep-dive anyway. Promote now?`;
    if (!confirm(msg)) return;
    setPromoting(slug);
    setPromoteError(null);
    try {
      const res = await fetch("/api/saas-factory/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        const msg = body?.stdout || body?.stderr || body?.error || `${res.status}`;
        throw new Error(msg.toString().slice(0, 280));
      }
      await load();
    } catch (e) {
      setPromoteError(`${slug}: ${String(e)}`);
    } finally {
      setPromoting(null);
    }
  }, [load]);

  const onSpinUpValidation = useCallback(async (slug: string, pivotIndex: number, pivotName: string) => {
    if (!confirm(
      `Spin up validation experiment from pivot "${pivotName}"?\n\n` +
      `This creates ~/verto-workspace/ops/validation-lab/<slug>/ with the pivot frozen,\n` +
      `a 14-day kill date, and a copy of the landing-page-scaffold at ~/projects/<slug>/.\n\n` +
      `OK to scaffold? (Cancel = metadata only)`
    )) return;

    const noScaffold = !confirm(
      `Copy landing-page-scaffold into ~/projects/<exp-slug>/?\n\n` +
      `OK = copy scaffold (≈30-60s rsync)\n` +
      `Cancel = metadata only, you'll create the project dir manually`
    );

    setValidating(`${slug}#${pivotIndex}`);
    setPromoteError(null);
    try {
      const res = await fetch("/api/saas-factory/spin-up-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pivot_index: pivotIndex, no_scaffold: noScaffold }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        const msg = body?.stdout || body?.stderr || body?.error || `${res.status}`;
        throw new Error(msg.toString().slice(0, 280));
      }
      await load();
      alert(`✓ Experiment spun up: ${body.exp_slug}\n\nSee README at:\n~/verto-workspace/ops/validation-lab/${body.exp_slug}/README.md`);
    } catch (e) {
      setPromoteError(`spin-up ${slug} pivot ${pivotIndex + 1}: ${String(e)}`);
    } finally {
      setValidating(null);
    }
  }, [load]);

  const onPrismReview = useCallback(async (slug: string) => {
    setPrismRunning(slug);
    setPromoteError(null);
    setExpandedQueueSlug(slug); // open the panel so result is visible
    try {
      const res = await fetch("/api/saas-factory/prism-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        const msg = body?.stdout || body?.stderr || body?.error || `${res.status}`;
        throw new Error(msg.toString().slice(0, 280));
      }
      await load();
    } catch (e) {
      setPromoteError(`prism-review ${slug}: ${String(e)}`);
    } finally {
      setPrismRunning(null);
    }
  }, [load]);

  const onReject = useCallback(async (slug: string) => {
    const reason = prompt(`Reject "${slug}"?\n\nOptional reason (visible in rejected log + Discord):`, "");
    if (reason === null) return; // cancelled
    setRejecting(slug);
    setPromoteError(null);
    try {
      const res = await fetch("/api/saas-factory/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        const msg = body?.stdout || body?.stderr || body?.error || `${res.status}`;
        throw new Error(msg.toString().slice(0, 280));
      }
      await load();
    } catch (e) {
      setPromoteError(`${slug}: ${String(e)}`);
    } finally {
      setRejecting(null);
    }
  }, [load]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <div className="p-8 text-terracotta">Error loading SaaS Factory: {error}</div>;
  if (!data) return <div className="p-8 text-mid/60">Loading SaaS Factory...</div>;

  const { projects, ideaQueue, watchlist, stats } = data;

  return (
    <div className="min-h-screen px-6 py-5 fade-up">
      <div className="max-w-[1440px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl text-charcoal tracking-tight">SaaS Factory</h1>
            <Link href="/factory" className="text-sm text-mid/60 hover:text-mid transition ml-2">
              App Factory &rarr;
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "ACTIVE", value: stats.active, color: "var(--amber)" },
            { label: "SHIPPED", value: stats.shipped, color: "var(--teal)" },
            { label: "QUEUED", value: stats.queued, color: "var(--lilac)" },
            { label: "WATCHING", value: stats.watching, color: "var(--terracotta)" },
          ].map((s) => (
            <Card key={s.label}>
              <p className="text-center text-2xl font-mono" style={{ color: s.color }}>{s.value}</p>
              <p className="label-caps text-center text-mid/60 mt-1">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Design Review Gate */}
        {projects.filter((p) => p.status === "awaiting-design-approval").map((p) => (
          <DesignReviewPanel key={p.slug} project={p} />
        ))}

        {/* Projects table */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Badge color="var(--lilac)">SAAS</Badge>
            <span className="text-sm text-mid">{projects.length} projects</span>
          </div>

          {projects.length === 0 ? (
            <Card><p className="text-mid/60 text-sm">No SaaS projects yet. Ideas from the B2B watchlist will appear here once promoted.</p></Card>
          ) : (
            <>
              {/* Phase header row */}
              <div className="flex items-center gap-0 mb-2 px-2">
                <div className="w-[280px]" />
                {SAAS_PHASES.map((ph) => (
                  <div key={ph} className="flex-1 text-center">
                    <span className="label-caps text-[0.65rem] text-mid/50">{PHASE_SHORT[ph]}</span>
                  </div>
                ))}
                <div className="w-[120px]" />
              </div>

              {/* Project rows */}
              <div className="space-y-2">
                {projects.map((p) => {
                  const pct = Math.round((p.completedPhases / p.totalPhases) * 100);
                  return (
                    <Card
                      key={p.slug}
                      className="cursor-pointer hover:border-lilac/30 transition-colors"
                      onClick={() => setExpandedSlug(expandedSlug === p.slug ? null : p.slug)}
                    >
                      <div className="flex items-center gap-0">
                        {/* Project info */}
                        <div className="w-[280px] flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-charcoal">
                              {p.displayName || p.name || p.slug}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge color={statusColor(p.status)}>{p.status}</Badge>
                            {p.qualityScore != null && (
                              <span className="text-[0.7rem] text-mid/60">QG {p.qualityScore}</span>
                            )}
                            <span className="text-[0.7rem] text-mid/40">{relTime(p.updated_at)}</span>
                          </div>
                        </div>

                        {/* Phase cells */}
                        {SAAS_PHASES.map((phase, i) => {
                          const ps = p.phases[phase];
                          const style = phaseStyle(ps?.status, i === p.currentPhaseIdx);
                          const isActive = i === p.currentPhaseIdx;
                          return (
                            <div key={phase} className="flex-1 flex justify-center">
                              <div
                                className={`w-full mx-0.5 h-7 rounded flex items-center justify-center text-[0.7rem] font-medium ${style.bg} ${style.text}`}
                                title={`${PHASE_LABELS[phase]}: ${ps?.status || "pending"}`}
                              >
                                {ps?.status === "complete" ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                ) : isActive ? (
                                  PHASE_SHORT[phase]
                                ) : null}
                              </div>
                            </div>
                          );
                        })}

                        {/* Progress */}
                        <div className="w-[120px] flex-shrink-0 flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 rounded-full bg-warm overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: "var(--teal)" }}
                            />
                          </div>
                          <span className="text-[0.7rem] text-mid/50 w-10 text-right">{pct}%</span>
                          <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`text-mid/30 transition-transform ${expandedSlug === p.slug ? "rotate-180" : ""}`}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded detail — matches AppFactory one-pager pattern */}
                      {expandedSlug === p.slug && (
                        <div className="mt-4 pt-4 border-t border-warm fade-up">
                          <div className="bg-warm/30 rounded-lg p-4 border border-warm/50 space-y-4">
                            {/* One-Pager with core features extraction */}
                            {p.onePager ? (
                              <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                {(() => {
                                  const text = p.onePager as string;

                                  // Strip markdown formatting for display
                                  const cleanMd = (s: string) => s
                                    .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
                                    .replace(/\*([^*]+)\*/g, "$1")       // italic
                                    .replace(/^[-*]\s+/gm, "")          // list bullets
                                    .replace(/^\|.*\|$/gm, "")          // table rows
                                    .replace(/^\s*$/gm, "")             // empty lines
                                    .trim();

                                  // Extract sections — flexible heading matching
                                  const extractSection = (pattern: RegExp) => {
                                    const m = text.match(pattern);
                                    return m?.[1]?.trim() || null;
                                  };

                                  const problem = extractSection(/##\s+Problem[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
                                  const targetRaw = extractSection(/##\s+Target[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
                                  const painRaw = extractSection(/##\s+Pain[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
                                  const painkillerRaw = extractSection(/##\s+Painkiller[^\n]*\n([\s\S]*?)(?=\n##|$)/i);

                                  // Parse target user into clean bullet points
                                  const targetItems: string[] = [];
                                  if (targetRaw) {
                                    for (const line of targetRaw.split("\n")) {
                                      const m = line.match(/^[-*]\s+\*\*(\w+):\*\*\s*(.*)/);
                                      if (m) targetItems.push(`${m[1]}: ${m[2].trim()}`);
                                      else {
                                        const plain = line.replace(/^[-*]\s+/, "").trim();
                                        if (plain) targetItems.push(plain);
                                      }
                                    }
                                  }

                                  // Parse pain evidence — extract from table or plain text
                                  const painItems: string[] = [];
                                  if (painRaw) {
                                    const lines = painRaw.split("\n");
                                    for (const line of lines) {
                                      // Table row: | source | signal | engagement | date |
                                      const cells = line.match(/^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|$/);
                                      if (cells && !cells[1].includes("---") && cells[1].trim().toLowerCase() !== "source") {
                                        painItems.push(`${cells[1].trim()}: ${cells[2].trim()}`);
                                      }
                                    }
                                    // Fallback: no table found, use cleaned text
                                    if (painItems.length === 0) {
                                      const cleaned = cleanMd(painRaw);
                                      if (cleaned) painItems.push(cleaned);
                                    }
                                  }

                                  // Parse painkiller test
                                  const painkillerVerdict = painkillerRaw?.match(/\*\*Verdict:\*\*\s*(\w+)/i)?.[1];

                                  // Extract core features
                                  const featMatch = text.match(/##\s+(?:Core |Painkiller |Key )?Features[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
                                  const features: string[] = [];
                                  if (featMatch) {
                                    for (const line of featMatch[1].split("\n")) {
                                      const m = line.match(/^\s*(?:\d+\.|[-*])\s+\*\*([^*]+)\*\*\s*(?:—|-)\s*(.*)/);
                                      if (m) features.push(`${m[1].trim()} — ${m[2].trim()}`);
                                      else {
                                        const m2 = line.match(/^\s*(?:\d+\.|[-*])\s+(.+)/);
                                        if (m2 && m2[1].trim()) features.push(m2[1].trim());
                                      }
                                    }
                                  }

                                  // Extract score
                                  const scoreMatch = text.match(/Score:\s*(\d+)\/100/i);
                                  const score = scoreMatch?.[1];

                                  return (
                                    <>
                                      {/* Score + Verdict header */}
                                      <div className="flex items-center gap-3">
                                        {score && (
                                          <span className="text-lg font-mono font-medium" style={{ color: parseInt(score) >= 80 ? "var(--olive)" : parseInt(score) >= 60 ? "var(--amber)" : "var(--terracotta)" }}>
                                            {score}/100
                                          </span>
                                        )}
                                        {painkillerVerdict && (
                                          <Badge color={painkillerVerdict.toUpperCase() === "PAINKILLER" ? "var(--olive)" : "var(--amber)"}>
                                            {painkillerVerdict}
                                          </Badge>
                                        )}
                                      </div>

                                      {problem && (
                                        <div>
                                          <p className="label-caps text-[0.7rem] mb-1">Problem</p>
                                          <p className="text-[0.82rem] text-charcoal/90 leading-relaxed">{problem}</p>
                                        </div>
                                      )}

                                      {targetItems.length > 0 && (
                                        <div>
                                          <p className="label-caps text-[0.7rem] mb-1.5">Target User</p>
                                          <div className="space-y-1">
                                            {targetItems.map((t, i) => (
                                              <p key={i} className="text-[0.82rem] text-charcoal/90 leading-relaxed">{t}</p>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {painItems.length > 0 && (
                                        <div>
                                          <p className="label-caps text-[0.7rem] mb-1.5">Pain Evidence</p>
                                          <div className="space-y-1.5">
                                            {painItems.map((item, i) => (
                                              <div key={i} className="flex items-start gap-2 text-[0.78rem] text-mid/80 leading-snug">
                                                <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--terracotta)" }} />
                                                <span>{item}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {features.length > 0 && (
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
                                      )}
                                    </>
                                  );
                                })()}
                                <details onClick={(e) => e.stopPropagation()}>
                                  <summary className="text-[0.75rem] text-mid/70 cursor-pointer select-none hover:text-mid transition-colors">Full one-pager</summary>
                                  <pre className="mt-2 whitespace-pre-wrap text-xs text-mid leading-relaxed font-[family-name:var(--font-dm-mono)]">
                                    {p.onePager}
                                  </pre>
                                </details>
                              </div>
                            ) : (
                              <p className="text-sm text-mid/70 text-center py-4">
                                One-pager not yet generated. Research phase will create it.
                              </p>
                            )}

                            {/* Phase Agreement Checklist */}
                            {p.artifactAudit?.artifacts && (
                              <div className="pt-3 border-t border-warm/50 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="label-caps text-[0.72rem]">Phase Agreement Checklist</p>
                                  <span className="text-[0.75rem] text-mid/65">
                                    {p.artifactAudit.phase_state ? p.artifactAudit.phase_state.replace(/-/g, " ") : "audit active"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {Object.entries(p.artifactAudit.artifacts).map(([phaseName, audit]) => {
                                    const complete = audit.required.length > 0 && audit.missing.length === 0;
                                    const isActive = p.artifactAudit?.phase === phaseName;
                                    const phaseKey = `${p.slug}:${phaseName}`;
                                    const isExpanded = expandedPhases[phaseKey] ?? false;
                                    return (
                                      <div
                                        key={phaseName}
                                        className="rounded-lg border transition-colors overflow-hidden"
                                        style={{
                                          borderColor: complete ? "rgba(118, 135, 90, 0.35)" : isActive ? "rgba(183, 110, 121, 0.35)" : audit.missing.length > 0 ? "rgba(196, 160, 72, 0.35)" : "rgba(201, 183, 159, 0.55)",
                                          backgroundColor: complete ? "rgba(118, 135, 90, 0.08)" : isActive ? "rgba(183, 110, 121, 0.06)" : "rgba(255,255,255,0.45)",
                                        }}
                                      >
                                        <div
                                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-warm/10 transition-colors"
                                          onClick={(e) => { e.stopPropagation(); onTogglePhase(phaseKey); }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <svg
                                              width="10" height="10" viewBox="0 0 24 24" fill="none"
                                              stroke="var(--mid)" strokeWidth="2" strokeLinecap="round"
                                              className={`transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                                            >
                                              <path d="M9 18l6-6-6-6" />
                                            </svg>
                                            <p className="text-[0.8rem] font-medium text-charcoal capitalize">
                                              {(PHASE_LABELS[phaseName] || phaseName.replace(/_/g, " "))}
                                            </p>
                                            {complete ? (
                                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(118, 135, 90, 0.14)", color: "var(--olive)" }}>ready</span>
                                            ) : isActive ? (
                                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(183, 110, 121, 0.12)", color: "var(--terracotta)" }}>active</span>
                                            ) : audit.missing.length > 0 ? (
                                              <span className="text-[0.68rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(196, 160, 72, 0.12)", color: "var(--amber)" }}>pending</span>
                                            ) : null}
                                          </div>
                                          <span className="text-[0.72rem] text-mid/70 tabular-nums">
                                            {audit.delivered.length}/{audit.required.length}
                                          </span>
                                        </div>
                                        {isExpanded && (
                                          <div className="px-3 pb-3">
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
                                                      {delivered ? "☑" : "☐"}
                                                    </span>
                                                    <span className={delivered ? "text-charcoal" : "text-mid/70"}>{displayLabel}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Project meta */}
                            <div className="pt-3 border-t border-warm/50 grid grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="label-caps text-[0.7rem] mb-1">Progress</p>
                                <p className="text-sm text-charcoal tabular-nums">{p.completedPhases}/{p.totalPhases} phases</p>
                              </div>
                              <div>
                                <p className="label-caps text-[0.7rem] mb-1">Quality</p>
                                <p className="text-sm text-charcoal tabular-nums">
                                  {p.qualityScore != null ? `${p.qualityScore}/100` : "Not yet tested"}
                                </p>
                              </div>
                              <div>
                                <p className="label-caps text-[0.7rem] mb-1">Started</p>
                                <p className="text-sm text-charcoal">
                                  {new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })}
                                </p>
                              </div>
                              <div>
                                <p className="label-caps text-[0.7rem] mb-1">Track</p>
                                <p className="text-sm text-charcoal">SaaS (Next.js + Stripe)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Validation Lab — cheap experiments running in 14-day windows */}
        {labData && (labData.active.length > 0 || labData.archived.length > 0) && (
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <p className="label-caps text-mid/80">
                Validation Lab ({labData.stats.active} active{labData.stats.succeeded ? ` · ${labData.stats.succeeded} ready to promote` : ""})
              </p>
              <p className="text-[0.7rem] text-mid/50">14-day kill rule · ship landing + free tool, see if traffic shows up</p>
            </div>

            {labData.active.length === 0 ? (
              <Card><p className="text-mid/60 text-sm">No active experiments. Spin one up from a Prism pivot below.</p></Card>
            ) : (
              <div className="space-y-2">
                {labData.active.map((e) => <ExperimentCard key={e.exp_slug} exp={e} />)}
              </div>
            )}

            {labData.archived.length > 0 && (
              <details className="mt-3">
                <summary className="text-[0.75rem] text-mid/60 cursor-pointer select-none hover:text-mid">
                  Archived experiments ({labData.archived.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {labData.archived.slice(0, 10).map((e) => <ExperimentCard key={e.exp_slug} exp={e} />)}
                </div>
              </details>
            )}
          </section>
        )}

        {/* Idea Queue */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="label-caps text-mid/80">SaaS Idea Queue ({ideaQueue.queue.length})</p>
            <p className="text-[0.7rem] text-mid/50">qualified ideas can be promoted manually</p>
          </div>
          {promoteError && (
            <Card className="mb-2"><p className="text-xs text-terracotta">{promoteError}</p></Card>
          )}
          {ideaQueue.queue.length === 0 ? (
            <Card><p className="text-mid/60 text-sm">No SaaS ideas in queue.</p></Card>
          ) : (
            <div className="space-y-2">
              {ideaQueue.queue.map((idea) => {
                const status = idea.status || "proposed";
                const isQualified = status === "qualified";
                const isPromoting = promoting === idea.slug;
                const isRejecting = rejecting === idea.slug;
                const isPrismRunning = prismRunning === idea.slug;
                const isExpanded = expandedQueueSlug === idea.slug;
                const busy = isPromoting || isRejecting || isPrismRunning;
                return (
                  <Card
                    key={idea.slug}
                    className="cursor-pointer hover:border-lilac/30 transition-colors"
                    onClick={() => setExpandedQueueSlug(isExpanded ? null : idea.slug)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-charcoal">{idea.title}</span>
                          <Badge color="var(--lilac)">{status}</Badge>
                          <span className="text-xs text-mid/50">score: {idea.score}</span>
                          {idea.painkiller && (
                            <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(118, 135, 90, 0.14)", color: "var(--olive)" }}>painkiller</span>
                          )}
                          <span className="text-xs text-mid/40 ml-auto">{idea.source}</span>
                        </div>
                        <p className={`text-xs text-mid/60 mt-1 ${isExpanded ? "" : "line-clamp-1"}`}>{idea.tagline}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onReject(idea.slug)}
                          title="Reject this idea (move to rejected list)"
                          className="px-2.5 py-1.5 rounded text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                        >
                          {isRejecting ? "…" : "Reject"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPrismReview(idea.slug)}
                          title="Ask Prism (Gemini) for PIVOT angles or REJECT confirmation. ~30-90s."
                          className="px-2.5 py-1.5 rounded text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            borderColor: "var(--lilac)",
                            color: "var(--lilac)",
                            backgroundColor: idea.prism_review ? "rgba(152, 153, 193, 0.12)" : "transparent",
                          }}
                        >
                          {isPrismRunning ? "Asking Prism…" : idea.prism_review ? "Re-ask Prism" : "Pivot review"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPromote(idea.slug, status)}
                          title={isQualified ? "Promote into the SaaS factory (research phase)" : `Promote "${status}" idea into the factory (research will re-validate)`}
                          className="px-3 py-1.5 rounded text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            borderColor: "var(--olive)",
                            color: "var(--olive)",
                            backgroundColor: isQualified ? "rgba(118, 135, 90, 0.12)" : "rgba(118, 135, 90, 0.04)",
                          }}
                        >
                          {isPromoting ? "Promoting…" : "Promote →"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-warm fade-up" onClick={(e) => e.stopPropagation()}>
                        <IdeaDetail
                          idea={idea}
                          onSpinUpValidation={onSpinUpValidation}
                          spinningKey={validating}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* B2B Watchlist */}
        <section>
          <p className="label-caps text-mid/80 mb-2">B2B Watchlist ({watchlist.count})</p>
          {watchlist.signals.length === 0 ? (
            <Card><p className="text-mid/60 text-sm">No B2B signals being watched.</p></Card>
          ) : (
            <div className="space-y-2">
              {watchlist.signals
                .sort((a, b) => b.score - a.score)
                .slice(0, 10)
                .map((s) => (
                  <Card key={s.slug}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-charcoal">{s.title}</span>
                        <span className="text-xs font-mono" style={{ color: "var(--terracotta)" }}>
                          {s.score}
                        </span>
                        {s.evidence?.signals_count && (
                          <span className="text-xs text-mid/50">
                            {s.evidence.signals_count} signals
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-mid/40">{s.source}</span>
                    </div>
                    <p className="text-xs text-mid/60 mt-1 line-clamp-1">{s.tagline}</p>
                  </Card>
                ))}
              {watchlist.signals.length > 10 && (
                <p className="text-xs text-mid/40 text-center py-2">
                  + {watchlist.signals.length - 10} more signals
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Validation Lab Experiment Card ───────────────────────────────────

function ExperimentCard({ exp }: { exp: Experiment }) {
  const status = exp.status || "active";
  const totals = exp.totals || { visits: 0, conversions: 0 };
  const vt = exp.thresholds?.unique_visits ?? 100;
  const ct = exp.thresholds?.conversions ?? 10;
  const visitPct = Math.min(100, Math.round((totals.visits / Math.max(1, vt)) * 100));
  const convPct = Math.min(100, Math.round((totals.conversions / Math.max(1, ct)) * 100));
  const daysLeft = exp.daysLeft ?? null;
  const isOverdue = daysLeft !== null && daysLeft < 0 && status === "active";
  const isDeployed = !!exp.deploy_url;
  const readmePath = `~/verto-workspace/ops/validation-lab/${exp.exp_slug}/README.md`;

  const statusColor =
    status === "succeeded" ? "var(--olive)"
    : status === "failed" ? "var(--terracotta)"
    : status === "promoted" ? "var(--lilac)"
    : isOverdue ? "var(--terracotta)"
    : "var(--amber)";

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-charcoal">{exp.pivot_name || exp.exp_slug}</span>
            <Badge color={statusColor}>{status}</Badge>
            {exp.pivot_confidence && (
              <span className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded" style={{ background: confidenceColor(exp.pivot_confidence), color: "white" }}>
                {exp.pivot_confidence.toUpperCase()}
              </span>
            )}
            {!isDeployed && status === "active" && (
              <span
                className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded"
                style={{ background: "var(--terracotta)", color: "white" }}
                title="No deploy_url set yet — see README"
              >
                NOT DEPLOYED
              </span>
            )}
            <span className="text-[0.7rem] text-mid/50 font-mono">{exp.exp_slug}</span>
            {daysLeft !== null && status === "active" && (
              <span className="text-[0.7rem] text-mid/70 ml-auto">
                {isOverdue ? <span style={{ color: "var(--terracotta)" }}>kill date passed</span> : `${daysLeft}d left`}
              </span>
            )}
          </div>

          {exp.pivot_wedge && (
            <p className="text-[0.78rem] text-mid/70 mt-1 line-clamp-2">{exp.pivot_wedge}</p>
          )}

          <div className="grid grid-cols-2 gap-3 mt-2 text-[0.75rem]">
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-mid/60" title="Unique visits to the landing page (manual or pulled from analytics)">Visits</span>
                <span className="font-mono tabular-nums">{totals.visits} / {vt}</span>
              </div>
              <div className="h-1 rounded-full bg-warm overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${visitPct}%`, backgroundColor: visitPct >= 100 ? "var(--olive)" : "var(--amber)" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span
                  className="text-mid/60 cursor-help underline decoration-dotted decoration-mid/30 underline-offset-2"
                  title="Any signal of buyer intent: waitlist signups, free-tool uses, 'notify me' clicks. Pick what fits the wedge — 10 strangers caring enough to act = signal."
                >
                  Conversions
                </span>
                <span className="font-mono tabular-nums">{totals.conversions} / {ct}</span>
              </div>
              <div className="h-1 rounded-full bg-warm overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${convPct}%`, backgroundColor: convPct >= 100 ? "var(--olive)" : "var(--amber)" }} />
              </div>
            </div>
          </div>

          {/* Setup / paths row */}
          <div className="mt-3 pt-2 border-t border-warm/40 space-y-1.5 text-[0.72rem]">
            {/* Deploy state */}
            <div className="flex items-center gap-2">
              <span className="text-mid/60 w-[68px] shrink-0">Site:</span>
              {isDeployed ? (
                <a
                  href={exp.deploy_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lilac hover:underline"
                >
                  {exp.deploy_url} ↗
                </a>
              ) : (
                <span className="text-mid/70">
                  not deployed yet — follow{" "}
                  <button
                    type="button"
                    onClick={() => copy(readmePath)}
                    className="font-mono text-mid hover:text-charcoal transition-colors underline decoration-dotted decoration-mid/40"
                    title="Copy README path"
                  >
                    {readmePath}
                  </button>
                  {", then "}
                  <code className="font-mono text-mid">validation-lab.sh set-url {exp.exp_slug} &lt;url&gt;</code>
                </span>
              )}
            </div>

            {exp.project_dir && (
              <div className="flex items-center gap-2">
                <span className="text-mid/60 w-[68px] shrink-0">Project:</span>
                <button
                  type="button"
                  onClick={() => copy(exp.project_dir || "")}
                  className="font-mono text-mid hover:text-charcoal transition-colors underline decoration-dotted decoration-mid/40"
                  title="Copy project dir path"
                >
                  {(exp.project_dir || "").replace(/^\/Users\/[^/]+/, "~")}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-mid/60 w-[68px] shrink-0">Log:</span>
              <button
                type="button"
                onClick={() => copy(`~/verto-workspace/tools/validation-lab.sh log ${exp.exp_slug} --visits N --conversions N --note ""`)}
                className="font-mono text-mid hover:text-charcoal transition-colors underline decoration-dotted decoration-mid/40"
                title="Copy daily log command"
              >
                validation-lab.sh log {exp.exp_slug} --visits N --conversions N
              </button>
            </div>

            {exp.source_idea_slug && (
              <div className="flex items-center gap-2">
                <span className="text-mid/60 w-[68px] shrink-0">From:</span>
                <span className="font-mono text-mid/80">{exp.source_idea_slug}</span>
              </div>
            )}

            {exp.outcome_reason && (
              <div className="flex items-center gap-2">
                <span className="text-mid/60 w-[68px] shrink-0">Outcome:</span>
                <span className="italic text-mid/80">{exp.outcome_reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Prism Pivot Review Panel ─────────────────────────────────────────

function verdictPalette(verdict: string): { accent: string; tint: string } {
  switch (verdict) {
    case "BET":
    case "PIVOT": // legacy
      return { accent: "var(--olive)", tint: "rgba(118, 135, 90, 0.06)" };
    case "SPECULATIVE":
      return { accent: "var(--amber)", tint: "rgba(196, 160, 72, 0.06)" };
    case "SKIP":
    case "REJECT": // legacy
      return { accent: "var(--terracotta)", tint: "rgba(183, 110, 121, 0.06)" };
    default:
      return { accent: "var(--mid)", tint: "rgba(0,0,0,0.02)" };
  }
}

function confidenceColor(c?: string): string {
  switch ((c || "").toUpperCase()) {
    case "HIGH": return "var(--olive)";
    case "MEDIUM": return "var(--amber)";
    case "LOW": return "var(--terracotta)";
    default: return "var(--mid)";
  }
}

function PrismReviewPanel({
  review,
  sourceSlug,
  onSpinUp,
  spinningKey,
}: {
  review: PrismReview;
  sourceSlug?: string;
  onSpinUp?: (slug: string, pivotIndex: number, pivotName: string) => void;
  spinningKey?: string | null;
}) {
  const verdict = (review.verdict || "UNKNOWN").toUpperCase();
  const { accent, tint } = verdictPalette(verdict);
  const pivots = review.pivots ?? [];

  return (
    <div
      className="rounded-md border p-3 space-y-3"
      style={{ borderColor: accent, backgroundColor: tint }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="label-caps text-[0.7rem] text-mid/70">Prism review</span>
          <span
            className="text-[0.7rem] font-mono px-1.5 py-0.5 rounded"
            style={{ background: accent, color: "white" }}
          >
            {verdict}
          </span>
        </div>
        {review.reviewed_at && (
          <span className="text-[0.7rem] text-mid/60">
            {relTime(review.reviewed_at)}{review.model ? ` · ${review.model}` : ""}
          </span>
        )}
      </div>

      {review.summary && (
        <p className="text-[0.85rem] text-charcoal/95 leading-relaxed">{review.summary}</p>
      )}

      {pivots.length > 0 && (
        <div className="space-y-3">
          {pivots.map((p, i) => {
            const cColor = confidenceColor(p.confidence);
            const spinKey = sourceSlug ? `${sourceSlug}#${i}` : "";
            const isSpinning = spinningKey === spinKey;
            return (
              <div key={i} className="rounded-md border border-warm/60 bg-white/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[0.85rem] font-medium text-charcoal">
                    Pivot {i + 1}{p.name ? `: ${p.name}` : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    {p.confidence && (
                      <span
                        className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: cColor, color: "white" }}
                      >
                        {p.confidence.toUpperCase()}
                      </span>
                    )}
                    {sourceSlug && onSpinUp && (
                      <button
                        type="button"
                        disabled={isSpinning}
                        onClick={() => onSpinUp(sourceSlug, i, p.name || `Pivot ${i + 1}`)}
                        title="Spin up validation experiment from this pivot (creates landing page scaffold + 14-day kill window)"
                        className="text-[0.7rem] font-medium px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderColor: "var(--lilac)", color: "var(--lilac)" }}
                      >
                        {isSpinning ? "Spinning…" : "Validate this angle"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-[0.8rem] leading-snug">
                  {p.who && <p><span className="text-mid/60 font-medium">Who&rsquo;s actually searching: </span><span className="text-charcoal/90">{p.who}</span></p>}
                  {p.wedge && <p><span className="text-mid/60 font-medium">Wedge: </span><span className="text-charcoal/90">{p.wedge}</span></p>}
                  {p.validation && <p><span className="text-mid/60 font-medium">Validation step this week: </span><span className="text-charcoal/90">{p.validation}</span></p>}
                  {p.risk && <p><span className="text-mid/60 font-medium">Risk: </span><span className="text-charcoal/90">{p.risk}</span></p>}
                  {!p.who && !p.wedge && !p.validation && !p.risk && p.raw && (
                    <pre className="whitespace-pre-wrap text-[0.78rem] text-mid/80 font-[family-name:var(--font-dm-mono)]">{p.raw}</pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(review.rationale || (review.change_my_mind && review.change_my_mind.length > 0)) && (
        <div className="space-y-2">
          {review.rationale && (
            <div>
              <p className="label-caps text-[0.7rem] mb-1 text-mid/70">Rationale</p>
              <p className="text-[0.82rem] text-charcoal/90 leading-relaxed">{review.rationale}</p>
            </div>
          )}
          {review.change_my_mind && review.change_my_mind.length > 0 && (
            <div>
              <p className="label-caps text-[0.7rem] mb-1 text-mid/70">What would raise confidence</p>
              <ul className="space-y-1">
                {review.change_my_mind.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.8rem] text-mid/85">
                    <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {review.raw_markdown && (
        <details>
          <summary className="text-[0.7rem] text-mid/60 cursor-pointer select-none hover:text-mid">Raw Prism output</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[0.7rem] text-mid leading-relaxed font-[family-name:var(--font-dm-mono)] max-h-72 overflow-y-auto">
            {review.raw_markdown}
          </pre>
        </details>
      )}
    </div>
  );
}

// ─── Idea Detail (expanded queue card) ────────────────────────────────

function IdeaDetail({
  idea,
  onSpinUpValidation,
  spinningKey,
}: {
  idea: IdeaEntry;
  onSpinUpValidation: (slug: string, pivotIndex: number, pivotName: string) => void;
  spinningKey: string | null;
}) {
  const ev = idea.evidence ?? {};
  const q = idea.qualification;
  const dims = ev.dimensions;
  const concept = idea.concept;
  const mop = idea.mini_one_pager;
  const painThreadsCount = Array.isArray(idea.pain_threads) ? idea.pain_threads.length : 0;
  const competitorsCount = Array.isArray(idea.competitors) ? idea.competitors.length : 0;
  const algoRecommendation = mop?.recommendation; // "QUALIFY" | "PARK" | "REJECT"
  const algoScore = mop?.score ?? ev.composite_score;
  const headlineScore = idea.score;
  const scoresDiverge = typeof algoScore === "number" && Math.abs(headlineScore - algoScore) > 15;

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <p className="label-caps text-[0.7rem] mb-1 text-mid/70">{label}</p>
      <div className="text-[0.82rem] text-charcoal/90 leading-relaxed">{children}</div>
    </div>
  );

  return (
    <div className="bg-warm/30 rounded-lg p-4 border border-warm/50 space-y-4">
      {/* Header meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-mid/70">
        <span><span className="text-mid/50">slug:</span> <span className="font-mono text-charcoal/80">{idea.slug}</span></span>
        {idea.target_audience && <span><span className="text-mid/50">target:</span> {idea.target_audience}</span>}
        {idea.product_type && <span><span className="text-mid/50">type:</span> {idea.product_type}</span>}
        {idea.proposed_at && <span><span className="text-mid/50">proposed:</span> {new Date(idea.proposed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })}</span>}
        {idea.promoted_from_watchlist && <span className="text-olive">↑ from watchlist</span>}
      </div>

      {/* Prism pivot review — most decision-relevant if present */}
      {idea.prism_review && (
        <PrismReviewPanel
          review={idea.prism_review}
          sourceSlug={idea.slug}
          onSpinUp={onSpinUpValidation}
          spinningKey={spinningKey}
        />
      )}

      {/* Algorithm recommendation banner — surfaces REJECT/PARK so it's not buried */}
      {algoRecommendation && algoRecommendation !== "QUALIFY" && (
        <div
          className="rounded-md border-l-4 p-3 text-[0.8rem] leading-relaxed"
          style={{
            borderColor: algoRecommendation === "REJECT" ? "var(--terracotta)" : "var(--amber)",
            backgroundColor: algoRecommendation === "REJECT" ? "rgba(183, 110, 121, 0.08)" : "rgba(196, 160, 72, 0.08)",
            color: "var(--charcoal)",
          }}
        >
          <strong style={{ color: algoRecommendation === "REJECT" ? "var(--terracotta)" : "var(--amber)" }}>
            Algorithm recommends: {algoRecommendation}
          </strong>{" "}
          — algorithmic dimension score{typeof algoScore === "number" ? ` ${algoScore}/100` : ""}
          {painThreadsCount === 0 && ", no pain threads"}
          {competitorsCount === 0 && ", no competitors mapped"}
          . The headline score ({headlineScore}) comes from Scout&apos;s narrative synthesis (KWE volume + commercial intent), not from validated user-pain evidence. Promoting kicks off the research phase which will re-validate.
        </div>
      )}

      {/* Product Concept — what we're actually proposing to build */}
      {concept ? (
        <div className="space-y-3">
          {concept.problem_statement && <Section label="Problem">{concept.problem_statement}</Section>}
          {concept.target_user && <Section label="Target User">{concept.target_user}</Section>}

          {concept.core_features && concept.core_features.length > 0 && (
            <Section label="Core Features">
              <div className="space-y-2">
                {concept.core_features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-[3px] flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem] font-semibold text-white" style={{ background: "var(--lilac)" }}>{i + 1}</span>
                    <div>
                      {f.feature && <p className="font-medium text-charcoal">{f.feature}</p>}
                      {f.description && <p className="text-[0.78rem] text-mid/80 leading-snug">{f.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {concept.core_moment && (
            <Section label="Core Moment">
              <p className="italic text-charcoal/90">{concept.core_moment}</p>
            </Section>
          )}

          {concept.differentiator && <Section label="Differentiator">{concept.differentiator}</Section>}
          {concept.competitive_positioning && <Section label="Positioning">{concept.competitive_positioning}</Section>}
          {concept.monetization && <Section label="Monetization">{concept.monetization}</Section>}
          {concept.retention_hook && <Section label="Retention Hook">{concept.retention_hook}</Section>}
        </div>
      ) : (
        // Fallback when no concept block — show the raw scout fields
        <>
          {ev.pain_signal && <Section label="Pain Signal">{ev.pain_signal}</Section>}
          {ev.market_evidence && <Section label="Market Evidence">{ev.market_evidence}</Section>}
          {ev.trend && <Section label="Trend">{ev.trend}</Section>}
          {ev.competitive_gap && <Section label="Competitive Gap">{ev.competitive_gap}</Section>}
        </>
      )}

      {/* Evidence-quality strip — honest about what's missing */}
      <div className="rounded-md border border-warm/50 bg-white/40 px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[0.75rem]">
        <div className="flex justify-between gap-2">
          <span className="text-mid/70">Pain threads</span>
          <span className="font-mono tabular-nums" style={{ color: painThreadsCount === 0 ? "var(--terracotta)" : "var(--olive)" }}>
            {painThreadsCount}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-mid/70">Competitors</span>
          <span className="font-mono tabular-nums" style={{ color: competitorsCount === 0 ? "var(--terracotta)" : "var(--olive)" }}>
            {competitorsCount}
          </span>
        </div>
        {ev.signals_count !== undefined && (
          <div className="flex justify-between gap-2">
            <span className="text-mid/70">Signals</span>
            <span className="font-mono tabular-nums">{ev.signals_count}</span>
          </div>
        )}
        {ev.complaint_count !== undefined && (
          <div className="flex justify-between gap-2">
            <span className="text-mid/70">Complaints</span>
            <span className="font-mono tabular-nums">{ev.complaint_count}</span>
          </div>
        )}
      </div>

      {ev.key_quotes && ev.key_quotes.length > 0 && (
        <Section label="Key Quotes">
          <div className="space-y-2">
            {ev.key_quotes.slice(0, 5).map((q, i) => (
              <div key={i} className="border-l-2 pl-3 py-0.5" style={{ borderColor: "var(--terracotta)" }}>
                <p className="italic text-charcoal/85">&ldquo;{q.text}&rdquo;</p>
                {q.source && <p className="text-[0.7rem] text-mid/60 mt-1">— {q.source}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {ev.subreddits && ev.subreddits.length > 0 && (
        <Section label="Subreddits Cited">
          <p className="text-[0.78rem] text-mid/80">{ev.subreddits.join(", ")}</p>
        </Section>
      )}

      {ev.sample_titles && ev.sample_titles.length > 0 && (
        <Section label="Sample Source Titles">
          <ul className="space-y-1">
            {ev.sample_titles.slice(0, 5).map((t, i) => (
              <li key={i} className="text-[0.78rem] text-mid/80">&middot; {t}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Score breakdown — only show if dimensions are present and clarify which score they back */}
      {dims && Object.keys(dims).length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="label-caps text-[0.7rem] text-mid/70">Algorithmic Dimensions</p>
            {scoresDiverge && (
              <span className="text-[0.7rem] text-amber">
                composite {algoScore} ≠ headline {headlineScore} (different scorers)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-[0.78rem]">
            {Object.entries(dims).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-mid/70 capitalize">{k.replace(/_/g, " ")}</span>
                <span
                  className="font-mono tabular-nums"
                  style={{ color: v === 0 ? "var(--terracotta)" : v < 40 ? "var(--amber)" : "var(--charcoal)" }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qualification verdict (only present after qualifier ran) */}
      {q && (
        <div className="pt-3 border-t border-warm/50 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="label-caps text-[0.7rem] text-mid/70">Qualification</p>
            {q.verdict && (
              <Badge color={q.verdict === "QUALIFY" ? "var(--olive)" : q.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)"}>
                {q.verdict}
              </Badge>
            )}
            {q.qualification_score !== undefined && (
              <span className="text-[0.75rem] text-mid/70 font-mono">qual score: {q.qualification_score}</span>
            )}
          </div>

          {q.verdict_reasoning && (
            <p className="text-[0.82rem] text-charcoal/90 leading-relaxed">{q.verdict_reasoning}</p>
          )}

          {q.suggested_angle && (
            <Section label="Suggested Angle">{q.suggested_angle}</Section>
          )}

          {/* Dimension scores from qualifier */}
          {(q.painkiller_strength || q.distribution_clarity || q.market_timing || q.founder_fit || q.gut_check) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[0.78rem]">
              {([
                ["Painkiller", q.painkiller_strength],
                ["Distribution", q.distribution_clarity],
                ["Timing", q.market_timing],
                ["Founder Fit", q.founder_fit],
                ["Gut Check", q.gut_check],
              ] as Array<[string, { score?: number; reasoning?: string } | undefined]>)
                .map(([label, d]) => {
                  if (!d) return null;
                  return (
                    <div key={label} className="rounded-md border border-warm/60 p-2 bg-white/40">
                      <div className="flex justify-between items-center">
                        <span className="text-mid/80 font-medium">{label}</span>
                        <span className="font-mono tabular-nums">{d.score ?? "—"}</span>
                      </div>
                      {d.reasoning && <p className="text-[0.72rem] text-mid/70 mt-1 leading-snug">{d.reasoning}</p>}
                    </div>
                  );
                })}
            </div>
          )}

          {q.risks && q.risks.length > 0 && (
            <Section label="Risks">
              <ul className="space-y-1">
                {q.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.78rem] text-mid/80">
                    <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--terracotta)" }} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {q.opportunities && q.opportunities.length > 0 && (
            <Section label="Opportunities">
              <ul className="space-y-1">
                {q.opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.78rem] text-mid/80">
                    <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--olive)" }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Raw JSON fallback for anything we didn't render */}
      <details>
        <summary className="text-[0.72rem] text-mid/60 cursor-pointer select-none hover:text-mid transition-colors">Raw idea record</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[0.7rem] text-mid leading-relaxed font-[family-name:var(--font-dm-mono)] max-h-80 overflow-y-auto">
          {JSON.stringify(idea, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ─── Design Review Panel ───────────────────────────────────────────────

function DesignReviewPanel({ project }: { project: Project }) {
  const slug = project.slug;
  const displayName = project.displayName ?? project.name ?? slug.replace(/-/g, " ");

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
        <span className="text-[0.7rem] font-[family-name:var(--font-dm-mono)] px-2 py-1 rounded" style={{ backgroundColor: "rgba(11, 187, 212, 0.12)", color: "#0BBBD4" }}>
          design review
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-mid/80">
          Color palette, typography, and UI direction are ready. Open the design brief to evaluate before committing to build.
        </p>
        <div className="flex gap-3">
          <a
            href={`/saas-factory/${slug}/design-preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#0BBBD4", color: "white" }}
          >
            Open Design Preview →
          </a>
          <a
            href={`/saas-factory/${slug}/design-preview`}
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
