"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

// ── Types ────────────────────────────────────────────────────────

interface ScoreBreakdown {
  pain: number;
  monetization: number;
  market_size: number;
  niche_breadth: number;
  specificity: number;
}

interface IdeaVariant {
  angle: string;
  target: string;
  pain_statement: string;
  differentiator: string;
  score: number;
}

interface QualificationDimension {
  score: number;
  reasoning: string;
}

interface IdeaQualification {
  competitive_moat: QualificationDimension;
  strategic_fit: QualificationDimension;
  market_timing: QualificationDimension;
  founder_fit: QualificationDimension;
  gut_check: QualificationDimension;
  verdict: "QUALIFY" | "PARK" | "REJECT";
  verdict_reasoning: string;
  risks?: string[];
  opportunities?: string[];
  qualification_score: number;
  qualified_at?: string;
}

interface IdeaEvidence {
  niche?: string;
  viability?: string;
  keyword_count?: number;
  avg_cpc?: number;
  avg_intent?: number;
  total_volume?: number;
  top_keywords?: string[];
  signals_count?: number;
  cross_source_count?: number;
  max_cpc?: number;
  avg_final_score?: number;
  sources?: string[];
  sample_titles?: string[];
  score_breakdown?: ScoreBreakdown;
  variants?: IdeaVariant[];
  pain_threads?: { title: string; subreddit: string; upvotes: number; quote?: string }[];
  competitors?: string[];
  mini_one_pager?: string;
}

interface ProposedIdea {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  painkiller: boolean;
  source?: string;
  evidence?: IdeaEvidence;
  qualification?: IdeaQualification;
  status?: string;
  refined_at?: string;
  best_variant?: IdeaVariant;
}

interface HotSignal {
  id: string;
  title: string;
  score: number;
  source: string;
  tier: string;
  tags: string[];
}

interface KeywordNiche {
  niche: string;
  tier: string;
  keywords: number;
  avgIntent: number;
  avgCpc: number;
  totalVolume: number;
  topKeywords: { keyword: string; volume: number; intent: number; trend: string }[];
}

interface IdeaLog {
  timestamp: string;
  source: string;
  proposed: ProposedIdea[];
  filtered: { title: string; reason: string }[];
  niches_evaluated: number;
  signals_checked?: number;
  candidates_found?: number;
  dry_run?: boolean;
  _file?: string;
}

interface IdeaQueue {
  queue: ProposedIdea[];
  shipped: ProposedIdea[];
  rejected: ProposedIdea[];
  parked?: ProposedIdea[];
}

// ── Helpers ──────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "var(--terracotta)";
  if (score >= 60) return "var(--amber)";
  if (score >= 40) return "var(--olive)";
  return "var(--mid)";
}

function relTime(ts: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const QUAL_LABELS: Record<string, string> = {
  competitive_moat: "Moat",
  strategic_fit: "Fit",
  market_timing: "Timing",
  founder_fit: "Buildable",
  gut_check: "Gut",
};

const SCORE_LABELS: Record<string, { label: string; weight: string }> = {
  pain: { label: "Pain", weight: "30%" },
  monetization: { label: "Revenue", weight: "25%" },
  market_size: { label: "Market", weight: "20%" },
  niche_breadth: { label: "Niche", weight: "15%" },
  specificity: { label: "Focus", weight: "10%" },
};

const TREND_ICON: Record<string, string> = {
  rising: "\u2197",
  stable: "\u2192",
  declining: "\u2198",
};

// ── Small Components ─────────────────────────────────────────────

function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--warm)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-arc"
        style={{ "--ring-circumference": `${circ}` } as React.CSSProperties} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.3} fontWeight={500}
        style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>{score}</text>
    </svg>
  );
}

function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex-1 h-1 bg-warm/60 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function EvidenceChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-warm/50 rounded-lg px-2.5 py-1.5 text-center">
      <p className="text-[0.7rem] font-medium text-charcoal tabular-nums">{value}</p>
      <p className="text-[0.45rem] text-mid/40 mt-0.5">{label}</p>
    </div>
  );
}

// ── Kanban Column Card ──────────────────────────────────────────

function KanbanCard({
  idea,
  onSelect,
  onAction,
  actionLabel,
  actionLoading,
}: {
  idea: ProposedIdea;
  onSelect: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) {
  const color = scoreColor(idea.score);
  const qual = idea.qualification;

  return (
    <div
      className="rounded-xl border p-3 transition-all hover:shadow-md cursor-pointer group bg-paper"
      style={{ borderColor: `${color}20` }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <ScoreRing score={idea.score} size={32} />
        <div className="min-w-0 flex-1">
          <h4 className="text-[0.75rem] font-medium leading-tight text-charcoal line-clamp-1">{idea.title}</h4>
          <p className="text-[0.55rem] text-mid/50 mt-0.5 line-clamp-2 leading-relaxed">
            {idea.best_variant?.pain_statement ?? idea.tagline}
          </p>
        </div>
      </div>

      {/* Compact chips */}
      <div className="mt-2 flex flex-wrap gap-1">
        {idea.painkiller && (
          <span className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium" style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}>Painkiller</span>
        )}
        {idea.best_variant && (
          <span className="px-1.5 py-0.5 rounded text-[0.5rem]" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>{idea.best_variant.angle}</span>
        )}
        {idea.evidence?.keyword_count != null && idea.evidence.keyword_count > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[0.5rem] bg-warm/80 text-mid/60">{idea.evidence.keyword_count} kw</span>
        )}
        {qual && (
          <span className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium" style={{
            backgroundColor: qual.verdict === "QUALIFY" ? "var(--olive-soft)" : qual.verdict === "PARK" ? "var(--amber-soft)" : "var(--terracotta-soft)",
            color: qual.verdict === "QUALIFY" ? "var(--olive)" : qual.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)",
          }}>{qual.verdict}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-warm/30">
        <span className="text-[0.5rem] text-mid/35">
          {idea.source && `${idea.source}`}
          {idea.refined_at && ` · ${relTime(idea.refined_at)}`}
        </span>
        {onAction && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(); }}
            disabled={actionLoading}
            className="px-2 py-0.5 rounded text-[0.5rem] font-medium transition-all opacity-70 group-hover:opacity-100"
            style={{ backgroundColor: actionLoading ? "var(--warm)" : `${color}12`, color: actionLoading ? "var(--mid)" : color }}
          >
            {actionLoading ? "..." : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Phase Gate Checklist ─────────────────────────────────────────

function PhaseGateChecklist({ idea }: { idea: ProposedIdea }) {
  const breakdown = idea.evidence?.score_breakdown;
  const qual = idea.qualification;
  const status = idea.status ?? "proposed";

  // Gate 1: Proposal criteria (how it entered the pipeline)
  const proposalGates = [
    { label: "Pain signal score", threshold: 50, value: breakdown?.pain ?? null, met: (breakdown?.pain ?? 0) >= 50 },
    { label: "Monetization potential", threshold: 40, value: breakdown?.monetization ?? null, met: (breakdown?.monetization ?? 0) >= 40 },
    { label: "Market size viable", threshold: 30, value: breakdown?.market_size ?? null, met: (breakdown?.market_size ?? 0) >= 30 },
    { label: "Niche specificity", threshold: 20, value: breakdown?.specificity ?? null, met: (breakdown?.specificity ?? 0) >= 20 },
    { label: "Composite score > 50", threshold: 50, value: idea.score, met: idea.score >= 50 },
    { label: "Painkiller signal", threshold: null, value: idea.painkiller ? 1 : 0, met: idea.painkiller },
  ];

  // Gate 2: Refinement criteria
  const hasRefinement = status === "refined" || status === "qualified" || status === "parked";
  const refinementGates = [
    { label: "Reddit pain threads found", value: idea.evidence?.pain_threads?.length ?? 0, met: (idea.evidence?.pain_threads?.length ?? 0) > 0 },
    { label: "Keyword data enriched", value: idea.evidence?.keyword_count ?? 0, met: (idea.evidence?.keyword_count ?? 0) > 0 },
    { label: "Variants generated", value: idea.evidence?.variants?.length ?? 0, met: (idea.evidence?.variants?.length ?? 0) > 0 },
    { label: "Competitors mapped", value: idea.evidence?.competitors?.length ?? 0, met: (idea.evidence?.competitors?.length ?? 0) > 0 },
    { label: "Best angle selected", value: idea.best_variant ? 1 : 0, met: !!idea.best_variant },
    { label: "Search volume > 500/mo", value: idea.evidence?.total_volume ?? 0, met: (idea.evidence?.total_volume ?? 0) > 500 },
  ];

  // Gate 3: Qualification criteria
  const hasQualification = status === "qualified" || status === "parked";
  const qualGates = qual ? [
    { label: "Competitive moat > 60", value: qual.competitive_moat?.score ?? 0, met: (qual.competitive_moat?.score ?? 0) >= 60 },
    { label: "Strategic fit > 60", value: qual.strategic_fit?.score ?? 0, met: (qual.strategic_fit?.score ?? 0) >= 60 },
    { label: "Market timing > 50", value: qual.market_timing?.score ?? 0, met: (qual.market_timing?.score ?? 0) >= 50 },
    { label: "Buildable > 60", value: qual.founder_fit?.score ?? 0, met: (qual.founder_fit?.score ?? 0) >= 60 },
    { label: "Gut check > 50", value: qual.gut_check?.score ?? 0, met: (qual.gut_check?.score ?? 0) >= 50 },
    { label: "Agent verdict: QUALIFY", value: qual.verdict, met: qual.verdict === "QUALIFY" },
    { label: "Blended score >= 75", value: idea.score, met: idea.score >= 75 },
  ] : [];

  const stages = [
    { id: "proposed", label: "1. Proposed", color: "var(--amber)", gates: proposalGates, reached: true, timestamp: null as string | null },
    { id: "refined", label: "2. Refined", color: "var(--lilac)", gates: refinementGates, reached: hasRefinement, timestamp: idea.refined_at ?? null },
    { id: "qualified", label: "3. Qualified", color: "var(--olive)", gates: qualGates, reached: hasQualification, timestamp: qual?.qualified_at ?? null },
  ];

  return (
    <div className="p-3 rounded-lg bg-warm/30 border border-warm/50">
      <p className="label-caps text-[0.55rem] text-mid/50 mb-3">Phase Gate Checklist</p>
      <div className="space-y-3">
        {stages.map((stage) => {
          const passed = stage.gates.filter((g) => g.met).length;
          const total = stage.gates.length;
          const allPassed = passed === total;
          const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

          return (
            <div key={stage.id}>
              {/* Stage header */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem]"
                  style={{
                    backgroundColor: stage.reached ? (allPassed ? `${stage.color}20` : "var(--amber-soft)") : "var(--warm)",
                    color: stage.reached ? (allPassed ? stage.color : "var(--amber)") : "var(--mid)",
                  }}>
                  {stage.reached ? (allPassed ? "\u2713" : "!") : "\u2022"}
                </span>
                <span className="text-[0.6rem] font-medium" style={{ color: stage.reached ? stage.color : "var(--mid)" }}>{stage.label}</span>
                {stage.reached && total > 0 && (
                  <span className="text-[0.5rem] tabular-nums" style={{ color: allPassed ? "var(--olive)" : "var(--amber)" }}>{passed}/{total}</span>
                )}
                {stage.timestamp && (
                  <span className="text-[0.45rem] text-mid/30 ml-auto">{relTime(stage.timestamp)}</span>
                )}
                {!stage.reached && (
                  <span className="text-[0.45rem] text-mid/25 ml-auto">pending</span>
                )}
              </div>

              {/* Gate checks — only show for reached stages */}
              {stage.reached && stage.gates.length > 0 && (
                <div className="ml-6 space-y-0.5">
                  {stage.gates.map((gate, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[0.5rem]" style={{ color: gate.met ? "var(--olive)" : "var(--terracotta)" }}>
                        {gate.met ? "\u2713" : "\u2717"}
                      </span>
                      <span className="text-[0.5rem]" style={{ color: gate.met ? "var(--mid)" : "var(--terracotta)" }}>
                        {gate.label}
                      </span>
                      {gate.value != null && typeof gate.value === "number" && (
                        <span className="text-[0.45rem] text-mid/30 tabular-nums ml-auto">{gate.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress bar for reached stages */}
              {stage.reached && total > 0 && (
                <div className="ml-6 mt-1 h-0.5 bg-warm/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: allPassed ? stage.color : "var(--amber)" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────

function IdeaDrawer({
  idea, onClose, onAction, actionLabel, actionLoading,
}: {
  idea: ProposedIdea; onClose: () => void; onAction?: () => void; actionLabel?: string; actionLoading?: boolean;
}) {
  const color = scoreColor(idea.score);
  const breakdown = idea.evidence?.score_breakdown;
  const qual = idea.qualification;
  const [showOnePager, setShowOnePager] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-charcoal/20 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-paper border-l border-warm overflow-y-auto custom-scroll"
        style={{ animation: "slide-in-right 0.25s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge color={scoreColor(idea.score)}>
                  {idea.status === "proposed" ? "Proposed" : idea.status === "refined" ? "Refined" : idea.status === "qualified" ? "Qualified" : idea.status === "parked" ? "Parked" : idea.status ?? "Proposed"}
                </Badge>
                {idea.painkiller && <Badge color="var(--terracotta)">Painkiller</Badge>}
              </div>
              <h3 className="text-2xl text-charcoal leading-tight">{idea.title}</h3>
              <p className="text-xs text-mid/60 mt-1 leading-relaxed">{idea.tagline}</p>
            </div>
            <div className="flex items-center gap-3">
              <ScoreRing score={idea.score} size={52} />
              <button onClick={onClose} className="text-mid/40 hover:text-charcoal transition-colors text-lg">&times;</button>
            </div>
          </div>

          {/* Phase Gate Checklist — WHY is this idea in its current phase */}
          <PhaseGateChecklist idea={idea} />

          {/* Best variant */}
          {idea.best_variant && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${color}08`, borderLeft: `3px solid ${color}` }}>
              <p className="text-[0.55rem] font-medium text-mid/50 mb-1">BEST ANGLE</p>
              <p className="text-sm font-medium text-charcoal">{idea.best_variant.angle}</p>
              <p className="text-xs text-mid/60 mt-0.5">Target: {idea.best_variant.target}</p>
              <p className="text-xs text-mid/50 mt-1 italic">{idea.best_variant.pain_statement}</p>
              <p className="text-[0.65rem] text-mid/40 mt-1">{idea.best_variant.differentiator}</p>
            </div>
          )}

          {/* Score breakdown */}
          {breakdown && Object.keys(breakdown).length > 0 && (
            <div>
              <p className="label-caps text-[0.55rem] text-mid/50 mb-2">Score Breakdown</p>
              <div className="space-y-1.5">
                {Object.entries(SCORE_LABELS).map(([key, meta]) => {
                  const val = (breakdown as unknown as Record<string, number>)[key];
                  if (val == null) return null;
                  const barColor = val >= 70 ? "var(--olive)" : val >= 45 ? "var(--amber)" : "var(--terracotta)";
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[0.55rem] text-mid/50 w-16 shrink-0 text-right">{meta.label}</span>
                      <MiniBar value={val} color={barColor} />
                      <span className="text-[0.55rem] tabular-nums w-6 text-right" style={{ color: barColor }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Qualification */}
          {qual && (
            <div className="p-3 rounded-lg border" style={{ borderColor: `${qual.verdict === "QUALIFY" ? "var(--olive)" : qual.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)"}30` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.6rem] font-medium text-charcoal">Agent Qualification</span>
                <Badge color={qual.verdict === "QUALIFY" ? "var(--olive)" : qual.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)"}>{qual.verdict}</Badge>
              </div>
              <div className="space-y-1.5 mb-2">
                {Object.entries(QUAL_LABELS).map(([key, label]) => {
                  const dim = (qual as unknown as Record<string, QualificationDimension>)[key];
                  if (!dim) return null;
                  const barColor = dim.score >= 70 ? "var(--olive)" : dim.score >= 45 ? "var(--amber)" : "var(--terracotta)";
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.55rem] text-mid/50 w-16 shrink-0 text-right">{label}</span>
                        <MiniBar value={dim.score} color={barColor} />
                        <span className="text-[0.55rem] tabular-nums w-6 text-right" style={{ color: barColor }}>{dim.score}</span>
                      </div>
                      <p className="text-[0.5rem] text-mid/40 ml-[4.5rem] mt-0.5">{dim.reasoning}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-mid/60 italic mt-2">{qual.verdict_reasoning}</p>
              {qual.risks && qual.risks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-[0.5rem] text-mid/40 mr-1">Risks:</span>
                  {qual.risks.map((r, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[0.5rem]" style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}>{r}</span>
                  ))}
                </div>
              )}
              {qual.opportunities && qual.opportunities.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[0.5rem] text-mid/40 mr-1">Upside:</span>
                  {qual.opportunities.map((o, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[0.5rem]" style={{ backgroundColor: "var(--olive-soft)", color: "var(--olive)" }}>{o}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Market evidence */}
          {idea.evidence && (
            <div>
              <p className="label-caps text-[0.55rem] text-mid/50 mb-2">Market Evidence</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {idea.evidence.total_volume != null && <EvidenceChip label="Volume" value={`${(idea.evidence.total_volume / 1000).toFixed(1)}k/mo`} />}
                {(idea.evidence.avg_cpc ?? idea.evidence.max_cpc) != null && <EvidenceChip label="CPC" value={`$${(idea.evidence.avg_cpc ?? idea.evidence.max_cpc)?.toFixed(2)}`} />}
                {idea.evidence.avg_intent != null && <EvidenceChip label="Intent" value={`${idea.evidence.avg_intent}/100`} />}
                {idea.evidence.keyword_count != null && <EvidenceChip label="Keywords" value={String(idea.evidence.keyword_count)} />}
              </div>
            </div>
          )}

          {/* Variants */}
          {idea.evidence?.variants && idea.evidence.variants.length > 0 && (
            <div>
              <p className="label-caps text-[0.55rem] text-mid/50 mb-2">Variants ({idea.evidence.variants.length})</p>
              <div className="space-y-2">
                {idea.evidence.variants.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-warm/40">
                    <ScoreRing score={v.score} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.7rem] font-medium text-charcoal truncate">{v.angle}</p>
                      <p className="text-[0.55rem] text-mid/50">{v.target}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pain threads */}
          {idea.evidence?.pain_threads && idea.evidence.pain_threads.length > 0 && (
            <div>
              <p className="label-caps text-[0.55rem] text-mid/50 mb-2">Pain Threads ({idea.evidence.pain_threads.length})</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scroll">
                {idea.evidence.pain_threads.map((t, i) => (
                  <div key={i} className="text-[0.6rem] text-mid/60 p-2 rounded-lg bg-warm/30">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.5rem] text-mid/40">r/{t.subreddit}</span>
                      {t.upvotes > 0 && <span className="text-mid/30">{t.upvotes} pts</span>}
                    </div>
                    <p className="text-charcoal/80 mt-0.5">{t.title}</p>
                    {t.quote && <p className="text-mid/40 italic mt-0.5 pl-2 border-l-2 border-warm">&ldquo;{t.quote}&rdquo;</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitors */}
          {idea.evidence?.competitors && idea.evidence.competitors.length > 0 && (
            <div>
              <p className="label-caps text-[0.55rem] text-mid/50 mb-2">Competitors</p>
              <div className="flex flex-wrap gap-1.5">
                {idea.evidence.competitors.map((c, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[0.6rem] bg-warm/60 text-mid/70">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* One-pager */}
          {idea.evidence?.mini_one_pager && (
            <div>
              <button onClick={() => setShowOnePager(!showOnePager)} className="text-[0.6rem] font-medium" style={{ color: "var(--lilac)" }}>
                {showOnePager ? "Hide One-Pager" : "Show Mini One-Pager"}
              </button>
              {showOnePager && (
                <pre className="mt-2 p-3 rounded-lg bg-warm/40 text-[0.55rem] text-mid/70 whitespace-pre-wrap overflow-auto max-h-[300px] custom-scroll leading-relaxed">
                  {idea.evidence.mini_one_pager}
                </pre>
              )}
            </div>
          )}

          {/* Action */}
          {onAction && (
            <div className="sticky bottom-0 pt-3 pb-1 bg-paper border-t border-warm/60">
              <button onClick={onAction} disabled={actionLoading}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: actionLoading ? "var(--warm)" : color, color: actionLoading ? "var(--mid)" : "var(--paper)" }}>
                {actionLoading ? "Working..." : actionLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function IdeasPage() {
  const [logs, setLogs] = useState<IdeaLog[]>([]);
  const [queue, setQueue] = useState<IdeaQueue | null>(null);
  const [hotSignals, setHotSignals] = useState<HotSignal[]>([]);
  const [keywordNiches, setKeywordNiches] = useState<KeywordNiche[]>([]);
  const [keywordDate, setKeywordDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdea, setSelectedIdea] = useState<ProposedIdea | null>(null);
  const [proposing, setProposing] = useState(false);
  const [exploringSlug, setExploringSlug] = useState<string | null>(null);
  const [qualifyingSlug, setQualifyingSlug] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/ideas");
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs ?? []);
        setQueue(data.queue ?? null);
        setHotSignals(data.signals?.hot ?? []);
        setKeywordNiches(data.signals?.keywords?.niches ?? []);
        setKeywordDate(data.signals?.keywords?.date ?? null);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const triggerPropose = async () => {
    setProposing(true);
    try {
      await fetch("/api/factory/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      setTimeout(fetchIdeas, 3000);
    } catch {} finally { setProposing(false); }
  };

  const triggerExplore = async (slug: string) => {
    setExploringSlug(slug);
    try {
      await fetch("/api/factory/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const poll = setInterval(fetchIdeas, 5000);
      setTimeout(() => { clearInterval(poll); setExploringSlug(null); fetchIdeas(); }, 90_000);
    } catch { setExploringSlug(null); }
  };

  const triggerQualify = async (slug: string) => {
    setQualifyingSlug(slug);
    try {
      await fetch("/api/factory/qualify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const poll = setInterval(fetchIdeas, 5000);
      setTimeout(() => { clearInterval(poll); setQualifyingSlug(null); fetchIdeas(); }, 120_000);
    } catch { setQualifyingSlug(null); }
  };

  // Derived
  const queueItems = queue?.queue ?? [];
  const parkedItems = queue?.parked ?? queueItems.filter((q) => q.status === "parked");
  const proposed = queueItems.filter((q) => q.status === "proposed" || !q.status);
  const refined = queueItems.filter((q) => q.status === "refined");
  const qualified = queueItems.filter((q) => q.status === "qualified");
  const factoryReady = qualified.filter((q) => q.score >= 75);
  const totalActive = proposed.length + refined.length + qualified.length;
  const hasSignalFuel = hotSignals.length > 0 || keywordNiches.length > 0;

  // Sync selected idea
  useEffect(() => {
    if (selectedIdea) {
      const all = [...queueItems, ...parkedItems];
      const updated = all.find((q) => q.slug === selectedIdea.slug);
      if (updated) setSelectedIdea(updated);
      if (updated && exploringSlug === updated.slug && updated.status !== "proposed" && updated.status !== "exploring") setExploringSlug(null);
      if (updated && qualifyingSlug === updated.slug && updated.status !== "refined" && updated.status !== "qualifying") setQualifyingSlug(null);
    }
  }, [queueItems, parkedItems, selectedIdea, exploringSlug, qualifyingSlug]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-mid text-sm">Loading...</p></div>;
  }

  // Column config
  const columns = [
    { id: "proposed", label: "Proposed", color: "var(--amber)", ideas: proposed, action: triggerExplore, actionLabel: "Refine", loadingSlug: exploringSlug, desc: "From discovery signals" },
    { id: "refined", label: "Refined", color: "var(--lilac)", ideas: refined, action: triggerQualify, actionLabel: "Qualify", loadingSlug: qualifyingSlug, desc: "Pain + keyword validated" },
    { id: "qualified", label: "Qualified", color: "var(--olive)", ideas: qualified, action: undefined, actionLabel: undefined, loadingSlug: null, desc: "AI agent evaluated" },
  ];

  return (
    <>
      <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <p className="label-caps text-[0.55rem] text-mid/50">Idea Pipeline</p>
              <span className="text-[0.5rem] text-mid/30">
                {totalActive} active · {parkedItems.length} parked · {(queue?.shipped ?? []).length} shipped
              </span>
            </div>
          </div>
          <button onClick={triggerPropose} disabled={proposing}
            className="px-3 py-1.5 rounded-lg text-[0.65rem] font-medium transition-all"
            style={{ backgroundColor: proposing ? "var(--warm)" : "var(--charcoal)", color: proposing ? "var(--mid)" : "var(--paper)" }}>
            {proposing ? "Discovering..." : "Run Proposer"}
          </button>
        </div>

        {/* ── Signal Fuel Bar (horizontal, above kanban) ── */}
        {hasSignalFuel && (
          <div className="card mb-5 fade-up" style={{ padding: "0.75rem 1rem" }}>
            <div className="flex items-start gap-6 overflow-x-auto custom-scroll">
              {/* Hot signals */}
              {hotSignals.length > 0 && (
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: "var(--terracotta)" }} />
                    <span className="text-[0.5rem] font-medium" style={{ color: "var(--terracotta)" }}>HOT SIGNALS</span>
                  </div>
                  <div className="flex gap-2">
                    {hotSignals.slice(0, 4).map((s) => (
                      <div key={s.id} className="w-[180px] flex-shrink-0 p-2 rounded-lg bg-warm/40 border border-warm/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.55rem] font-medium tabular-nums" style={{ color: "var(--terracotta)" }}>{s.score.toFixed(0)}</span>
                          <span className="text-[0.45rem] text-mid/35">{s.source}</span>
                        </div>
                        <p className="text-[0.55rem] text-charcoal mt-1 line-clamp-2 leading-relaxed">{s.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Divider */}
              {hotSignals.length > 0 && keywordNiches.length > 0 && (
                <div className="w-px bg-warm/60 self-stretch flex-shrink-0" />
              )}
              {/* Keyword niches */}
              {keywordNiches.length > 0 && (
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--olive)" }} />
                    <span className="text-[0.5rem] font-medium" style={{ color: "var(--olive)" }}>KEYWORD NICHES</span>
                    {keywordDate && <span className="text-[0.45rem] text-mid/30">{keywordDate}</span>}
                  </div>
                  <div className="flex gap-2">
                    {keywordNiches.filter((n) => n.avgIntent >= 30).slice(0, 4).map((n, i) => (
                      <div key={i} className="w-[160px] flex-shrink-0 p-2 rounded-lg bg-warm/40 border border-warm/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.55rem] font-medium text-charcoal truncate">{n.niche}</span>
                          <span className="text-[0.5rem] tabular-nums" style={{ color: n.avgIntent >= 50 ? "var(--olive)" : "var(--amber)" }}>{n.avgIntent}</span>
                        </div>
                        <p className="text-[0.45rem] text-mid/40 mt-1">{n.totalVolume.toLocaleString()}/mo · ${n.avgCpc.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[0.45rem] text-mid/30 mt-2">
              Discovery signals + keyword data feeding the idea pipeline. Triage runs every 2h — proposed ideas are auto-refined, refined ideas are auto-qualified.
            </p>
          </div>
        )}

        {/* ── Kanban Board ────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 fade-up" style={{ animationDelay: "0.05s" }}>
          {columns.map((col) => (
            <div key={col.id} className="min-h-[400px]">
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b-2" style={{ borderColor: col.color }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className="text-sm font-medium" style={{ color: col.color }}>{col.label}</span>
                  {col.ideas.length > 0 && (
                    <span className="text-[0.6rem] tabular-nums px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${col.color}12`, color: col.color }}>{col.ideas.length}</span>
                  )}
                </div>
                <span className="text-[0.45rem] text-mid/30">{col.desc}</span>
              </div>

              {/* Cards */}
              {col.ideas.length > 0 ? (
                <div className="space-y-2.5">
                  {col.ideas.map((idea) => (
                    <KanbanCard
                      key={idea.slug}
                      idea={idea}
                      onSelect={() => setSelectedIdea(idea)}
                      onAction={col.action ? () => col.action!(idea.slug) : undefined}
                      actionLabel={col.actionLabel}
                      actionLoading={col.loadingSlug === idea.slug}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-warm/60 flex items-center justify-center mb-2">
                    <span className="text-mid/30 text-lg">{col.id === "proposed" ? "?" : col.id === "refined" ? "\u2192" : "\u2713"}</span>
                  </div>
                  <p className="text-[0.6rem] text-mid/40">
                    {col.id === "proposed" && "Discovery signals will appear here when the proposer runs."}
                    {col.id === "refined" && "Proposed ideas move here after Reddit + keyword deep-dive."}
                    {col.id === "qualified" && "Refined ideas move here after AI agent evaluation."}
                  </p>
                  <p className="text-[0.5rem] text-mid/25 mt-1">
                    {col.id === "proposed" && "Weekly cron or manual trigger"}
                    {col.id === "refined" && "Auto-triage every 2h"}
                    {col.id === "qualified" && "Auto-triage every 2h"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Factory Ready Banner ────────────────────────── */}
        {factoryReady.length > 0 && (
          <div className="mt-5 p-4 rounded-xl border-2 fade-up" style={{ borderColor: "var(--charcoal)", backgroundColor: "var(--charcoal)05", animationDelay: "0.1s" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-charcoal">Factory Ready</span>
                <span className="text-[0.6rem] tabular-nums px-1.5 py-0.5 rounded-full bg-charcoal text-paper">{factoryReady.length}</span>
              </div>
              <span className="text-[0.5rem] text-mid/40">Qualified ideas with score 75+ — factory-tick auto-promotes every 10min</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {factoryReady.map((idea) => (
                <KanbanCard key={idea.slug} idea={idea} onSelect={() => setSelectedIdea(idea)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Parked (collapsed) ──────────────────────────── */}
        {parkedItems.length > 0 && (
          <ParkedSection ideas={parkedItems} onSelect={setSelectedIdea} />
        )}

        {/* ── Automation + Sources Footer ─────────────────── */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4 fade-up" style={{ animationDelay: "0.15s" }}>
          {/* Automation flow */}
          <div className="card">
            <p className="label-caps text-[0.55rem] text-mid/40 mb-3">Pipeline Automation</p>
            <div className="space-y-2">
              {[
                { step: "1. Discovery", desc: "KWE + Reddit pain scan", cron: "Sun 01:45 CET", auto: true },
                { step: "2. Propose", desc: "Score signals, create ideas", cron: "Sun 02:30 CET", auto: true },
                { step: "3. Refine", desc: "Reddit deep-dive + variants", cron: "Every 2h (triage)", auto: true },
                { step: "4. Qualify", desc: "Claude Sonnet agent evaluation", cron: "Every 2h (triage)", auto: true },
                { step: "5. Promote", desc: "Score 75+ → App Factory", cron: "Every 10min (factory-tick)", auto: true },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.auto ? "var(--olive)" : "var(--amber)" }} />
                  <span className="text-[0.65rem] font-medium text-charcoal w-24">{s.step}</span>
                  <span className="text-[0.55rem] text-mid/50 flex-1">{s.desc}</span>
                  <span className="text-[0.5rem] text-mid/30">{s.cron}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Discovery sources */}
          <div className="card">
            <p className="label-caps text-[0.55rem] text-mid/40 mb-3">Discovery Sources</p>
            <div className="space-y-2">
              {[
                { label: "Keywords Everywhere", active: true, color: "var(--olive)", desc: "Weekly keyword expansion" },
                { label: "Reddit Pain Scanner", active: true, color: "var(--terracotta)", desc: "Complaint signal mining" },
                { label: "GrowthOps Radar", active: hotSignals.length > 0, color: "var(--amber)", desc: "Cross-source signal scoring" },
                { label: "App Store", active: false, color: "var(--mid)", desc: "Category + review mining" },
                { label: "Indie Hackers", active: false, color: "var(--mid)", desc: "Builder community signals" },
                { label: "Competitor Scan", active: false, color: "var(--mid)", desc: "Feature gap analysis" },
                { label: "Sensor Tower", active: false, color: "var(--mid)", desc: "Download + revenue estimates" },
              ].map((src) => (
                <div key={src.label} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: src.active ? src.color : "var(--warm)" }} />
                  <span className="text-[0.6rem] text-charcoal">{src.label}</span>
                  {!src.active && <span className="text-[0.45rem] text-mid/25">planned</span>}
                  <span className="text-[0.5rem] text-mid/35 ml-auto">{src.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {selectedIdea && (
        <IdeaDrawer
          idea={selectedIdea} onClose={() => setSelectedIdea(null)}
          onAction={
            selectedIdea.status === "proposed" ? () => triggerExplore(selectedIdea.slug) :
            selectedIdea.status === "refined" ? () => triggerQualify(selectedIdea.slug) : undefined
          }
          actionLabel={
            selectedIdea.status === "proposed" ? "Explore & Refine This Idea" :
            selectedIdea.status === "refined" ? "Run Agent Qualification" : undefined
          }
          actionLoading={exploringSlug === selectedIdea.slug || qualifyingSlug === selectedIdea.slug}
        />
      )}

      <style jsx global>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ── Parked Section ──────────────────────────────────────────────

function ParkedSection({ ideas, onSelect }: { ideas: ProposedIdea[]; onSelect: (idea: ProposedIdea) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 fade-up" style={{ animationDelay: "0.1s" }}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-2 group">
        <span className="w-1.5 h-1.5 rounded-full bg-mid/30" />
        <span className="label-caps text-[0.55rem] text-mid/40">Parked</span>
        <span className="text-[0.55rem] text-mid/25">({ideas.length})</span>
        <span className="text-mid/20 text-xs transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>&#x25B6;</span>
      </button>
      {open && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {ideas.map((idea) => (
            <KanbanCard key={idea.slug} idea={idea} onSelect={() => onSelect(idea)} />
          ))}
        </div>
      )}
    </div>
  );
}
