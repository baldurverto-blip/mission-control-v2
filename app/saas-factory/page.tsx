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
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<ExpandedPhases>({});

  const onTogglePhase = useCallback((key: string) => {
    setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/saas-factory");
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

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

        {/* Idea Queue */}
        <section>
          <p className="label-caps text-mid/80 mb-2">SaaS Idea Queue ({ideaQueue.queue.length})</p>
          {ideaQueue.queue.length === 0 ? (
            <Card><p className="text-mid/60 text-sm">No SaaS ideas in queue.</p></Card>
          ) : (
            <div className="space-y-2">
              {ideaQueue.queue.map((idea) => (
                <Card key={idea.slug}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-charcoal">{idea.title}</span>
                      <Badge color="var(--lilac)">{idea.status || "proposed"}</Badge>
                      <span className="text-xs text-mid/50">score: {idea.score}</span>
                    </div>
                    <span className="text-xs text-mid/40">{idea.source}</span>
                  </div>
                  <p className="text-xs text-mid/60 mt-1 line-clamp-1">{idea.tagline}</p>
                </Card>
              ))}
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
