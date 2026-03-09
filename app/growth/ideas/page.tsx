"use client";

import { useState, useEffect, useCallback } from "react";
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

interface FilteredIdea {
  title: string;
  reason: string;
}

interface IdeaLog {
  timestamp: string;
  source: string;
  proposed: ProposedIdea[];
  filtered: FilteredIdea[];
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
}

// ── Helpers ──────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--terracotta)";
  if (score >= 60) return "var(--amber)";
  if (score >= 40) return "var(--olive)";
  return "var(--mid)";
}

const FILTER_REASON_COLORS: Record<string, string> = {
  "already in queue": "var(--lilac)",
  "viability too low": "var(--amber)",
  "generic/brand/sensitive": "var(--terracotta)",
  "existing product": "var(--olive)",
};

function filterColor(reason: string): string {
  const lower = reason.toLowerCase();
  for (const [key, color] of Object.entries(FILTER_REASON_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--mid)";
}

// ── Components ──────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  proposed: { color: "var(--amber)", label: "Proposed" },
  exploring: { color: "var(--lilac)", label: "Exploring..." },
  refined: { color: "var(--olive)", label: "Refined" },
  qualifying: { color: "var(--lilac)", label: "Qualifying..." },
  qualified: { color: "var(--charcoal)", label: "Qualified" },
  parked: { color: "var(--mid)", label: "Parked" },
  queued: { color: "var(--charcoal)", label: "Queued" },
  approved: { color: "var(--olive)", label: "Approved" },
  rejected: { color: "var(--terracotta)", label: "Rejected" },
};

const SCORE_LABELS: Record<string, { label: string; weight: string }> = {
  pain: { label: "Pain/Intent", weight: "30%" },
  monetization: { label: "Monetization", weight: "25%" },
  market_size: { label: "Market Size", weight: "20%" },
  niche_breadth: { label: "Niche Breadth", weight: "15%" },
  specificity: { label: "Specificity", weight: "10%" },
};

function ScoreBar({ label, weight, value }: { label: string; weight: string; value: number }) {
  const barColor =
    value >= 75 ? "var(--olive)" :
    value >= 50 ? "var(--amber)" :
    value >= 30 ? "var(--terracotta)" : "var(--mid)";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.5rem] text-mid/50 w-[72px] shrink-0 text-right tabular-nums">
        {label} <span className="text-mid/30">({weight})</span>
      </span>
      <div className="flex-1 h-1.5 bg-warm/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-[0.5rem] tabular-nums w-5 text-right" style={{ color: barColor }}>
        {value}
      </span>
    </div>
  );
}

const QUAL_LABELS: Record<string, string> = {
  competitive_moat: "Moat",
  strategic_fit: "Fit",
  market_timing: "Timing",
  founder_fit: "Buildable",
  gut_check: "Gut",
};

function IdeaCard({
  idea,
  onExplore,
  onQualify,
  exploring,
  qualifying,
}: {
  idea: ProposedIdea;
  onExplore?: (slug: string) => void;
  onQualify?: (slug: string) => void;
  exploring?: boolean;
  qualifying?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = scoreColor(idea.score);
  const status = STATUS_STYLES[idea.status ?? "proposed"] ?? STATUS_STYLES.proposed;
  const breakdown = idea.evidence?.score_breakdown;
  const hasBreakdown = breakdown && Object.keys(breakdown).length > 0;
  const isProposed = idea.status === "proposed" || !idea.status;
  const isRefined = idea.status === "refined";
  const isQualified = idea.status === "qualified";
  const isParked = idea.status === "parked";
  const qual = idea.qualification;

  return (
    <div
      className="rounded-xl border p-4 transition-all hover:shadow-sm"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}06` }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className="text-sm font-medium truncate"
              style={{ color: "var(--charcoal)" }}
            >
              {idea.title}
            </h4>
            <Badge color={status.color}>{status.label}</Badge>
          </div>
          <p className="text-[0.65rem] text-mid/60 mt-0.5 line-clamp-2">
            {idea.best_variant?.pain_statement ?? idea.tagline}
          </p>
          {idea.best_variant && (
            <p className="text-[0.6rem] mt-1" style={{ color: "var(--olive)" }}>
              Angle: {idea.best_variant.angle} — Target: {idea.best_variant.target}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {idea.painkiller && (
            <Badge color="var(--terracotta)">Painkiller</Badge>
          )}
          <span
            className="inline-flex items-center justify-center w-9 h-6 rounded-full text-[0.65rem] font-medium tabular-nums"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {idea.score}
          </span>
        </div>
      </div>

      {/* Score breakdown bars (if available) */}
      {hasBreakdown && (
        <div className="mt-3 space-y-1">
          {Object.entries(SCORE_LABELS).map(([key, meta]) => {
            const val = (breakdown as unknown as Record<string, number>)[key];
            if (val == null) return null;
            return (
              <ScoreBar key={key} label={meta.label} weight={meta.weight} value={val} />
            );
          })}
        </div>
      )}

      {/* Evidence chips */}
      {idea.evidence && (
        <div className="mt-2 flex flex-wrap gap-1">
          {idea.evidence.avg_intent != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              Intent: {idea.evidence.avg_intent}/100
            </span>
          )}
          {(idea.evidence.avg_cpc ?? idea.evidence.max_cpc) != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              ${(idea.evidence.avg_cpc ?? idea.evidence.max_cpc)?.toFixed(2)} CPC
            </span>
          )}
          {idea.evidence.total_volume != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.total_volume.toLocaleString()}/mo
            </span>
          )}
          {idea.evidence.keyword_count != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.keyword_count} keywords
            </span>
          )}
          {idea.evidence.cross_source_count != null && idea.evidence.cross_source_count > 0 && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.cross_source_count}x cross-validated
            </span>
          )}
          {idea.evidence.competitors && idea.evidence.competitors.length > 0 && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.competitors.length} competitors mapped
            </span>
          )}
          {idea.evidence.pain_threads && idea.evidence.pain_threads.length > 0 && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.pain_threads.length} pain threads
            </span>
          )}
        </div>
      )}

      {/* Expandable details for refined ideas */}
      {isRefined && idea.evidence?.variants && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[0.55rem] font-medium transition-colors"
            style={{ color: "var(--lilac)" }}
          >
            {expanded ? "Hide details" : `Show ${idea.evidence.variants.length} variant${idea.evidence.variants.length !== 1 ? "s" : ""} + research`}
          </button>
          {expanded && (
            <div className="mt-2 space-y-3">
              {/* Variants */}
              <div className="space-y-2">
                {idea.evidence.variants.map((v, i) => (
                  <div key={i} className="p-2 rounded-lg bg-warm/40 text-[0.6rem]">
                    <div className="flex justify-between items-center">
                      <span className="font-medium" style={{ color: "var(--charcoal)" }}>{v.angle}</span>
                      <span className="tabular-nums" style={{ color: scoreColor(v.score) }}>{v.score}</span>
                    </div>
                    <p className="text-mid/60 mt-0.5">Target: {v.target}</p>
                    <p className="text-mid/50 mt-0.5 italic">{v.pain_statement}</p>
                    <p className="text-mid/40 mt-0.5">{v.differentiator}</p>
                  </div>
                ))}
              </div>
              {/* Pain threads */}
              {idea.evidence.pain_threads && idea.evidence.pain_threads.length > 0 && (
                <div>
                  <p className="label-caps text-[0.5rem] mb-1" style={{ color: "var(--terracotta)" }}>Pain Threads</p>
                  {idea.evidence.pain_threads.slice(0, 5).map((t, i) => (
                    <div key={i} className="text-[0.55rem] text-mid/60 mb-1">
                      <span className="text-mid/40">r/{t.subreddit}</span> {t.title}
                      {t.upvotes > 0 && <span className="text-mid/30 ml-1">({t.upvotes})</span>}
                      {t.quote && <p className="text-mid/40 italic ml-3 mt-0.5">"{t.quote}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Qualification assessment (if available) */}
      {qual && (
        <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: `${qual.verdict === "QUALIFY" ? "var(--olive)" : qual.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)"}30` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.55rem] font-medium" style={{ color: "var(--charcoal)" }}>
              Agent Qualification
            </span>
            <Badge color={qual.verdict === "QUALIFY" ? "var(--olive)" : qual.verdict === "PARK" ? "var(--amber)" : "var(--terracotta)"}>
              {qual.verdict}
            </Badge>
          </div>
          {/* 5 dimension bars */}
          <div className="space-y-1 mb-2">
            {Object.entries(QUAL_LABELS).map(([key, label]) => {
              const dim = (qual as unknown as Record<string, QualificationDimension>)[key];
              if (!dim) return null;
              return (
                <div key={key} className="flex items-center gap-2 group relative">
                  <span className="text-[0.5rem] text-mid/50 w-[52px] shrink-0 text-right">{label}</span>
                  <div className="flex-1 h-1.5 bg-warm/60 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${dim.score}%`,
                      backgroundColor: dim.score >= 70 ? "var(--olive)" : dim.score >= 45 ? "var(--amber)" : "var(--terracotta)",
                    }} />
                  </div>
                  <span className="text-[0.5rem] tabular-nums w-5 text-right" style={{
                    color: dim.score >= 70 ? "var(--olive)" : dim.score >= 45 ? "var(--amber)" : "var(--terracotta)",
                  }}>{dim.score}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[0.55rem] text-mid/60 italic">{qual.verdict_reasoning}</p>
          {qual.risks && qual.risks.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {qual.risks.map((r, i) => (
                <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[0.5rem]" style={{ backgroundColor: "var(--terracotta)10", color: "var(--terracotta)" }}>{r}</span>
              ))}
            </div>
          )}
          {qual.opportunities && qual.opportunities.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {qual.opportunities.map((o, i) => (
                <span key={i} className="inline-flex px-1.5 py-0.5 rounded text-[0.5rem]" style={{ backgroundColor: "var(--olive)10", color: "var(--olive)" }}>{o}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          {idea.source && (
            <span className="text-[0.55rem] text-mid/40">via {idea.source}</span>
          )}
          {idea.refined_at && (
            <span className="text-[0.55rem] text-mid/30">
              refined {formatTimestamp(idea.refined_at)}
            </span>
          )}
          {qual?.qualified_at && (
            <span className="text-[0.55rem] text-mid/30">
              qualified {formatTimestamp(qual.qualified_at)}
            </span>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex gap-1.5">
          {isProposed && onExplore && (
            <button
              onClick={() => onExplore(idea.slug)}
              disabled={exploring}
              className="px-2 py-1 rounded text-[0.55rem] font-medium border transition-all"
              style={{
                borderColor: exploring ? "var(--warm)" : "var(--lilac)",
                color: exploring ? "var(--mid)" : "var(--lilac)",
                backgroundColor: exploring ? "var(--warm)" : "transparent",
              }}
            >
              {exploring ? "Exploring..." : "Explore & Refine"}
            </button>
          )}
          {isRefined && onQualify && (
            <button
              onClick={() => onQualify(idea.slug)}
              disabled={qualifying}
              className="px-2 py-1 rounded text-[0.55rem] font-medium border transition-all"
              style={{
                borderColor: qualifying ? "var(--warm)" : "var(--charcoal)",
                color: qualifying ? "var(--mid)" : "var(--charcoal)",
                backgroundColor: qualifying ? "var(--warm)" : "transparent",
              }}
            >
              {qualifying ? "Qualifying..." : "Qualify with Agent"}
            </button>
          )}
          {isQualified && idea.score >= 75 && (
            <span className="px-2 py-1 rounded text-[0.55rem] font-medium"
              style={{ color: "var(--olive)", backgroundColor: "var(--olive)12" }}>
              Ready for Factory
            </span>
          )}
          {isParked && (
            <span className="px-2 py-1 rounded text-[0.55rem]"
              style={{ color: "var(--mid)" }}>
              Parked — re-evaluate later
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilteredRow({ idea }: { idea: FilteredIdea }) {
  const color = filterColor(idea.reason);
  return (
    <tr className="border-t border-warm/40">
      <td
        className="py-1.5 pr-3 text-xs"
        style={{ color: "var(--charcoal)" }}
      >
        {idea.title}
      </td>
      <td className="py-1.5">
        <Badge color={color}>{idea.reason}</Badge>
      </td>
    </tr>
  );
}

function RunCard({
  log,
  defaultOpen,
  onExplore,
  onQualify,
  exploringSlug,
  qualifyingSlug,
}: {
  log: IdeaLog;
  defaultOpen: boolean;
  onExplore?: (slug: string) => void;
  onQualify?: (slug: string) => void;
  exploringSlug?: string | null;
  qualifyingSlug?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const proposed = log.proposed ?? [];
  const filtered = log.filtered ?? [];
  const total = proposed.length + filtered.length;

  return (
    <div className="card">
      {/* Run header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between text-left"
      >
        <div>
          <p className="label-caps text-[0.55rem] text-mid/60">
            {formatTimestamp(log.timestamp)}
            {log.dry_run && (
              <span className="ml-2 text-amber">(dry run)</span>
            )}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--charcoal)" }}
          >
            {proposed.length} proposed
            <span className="text-mid/40 mx-1">/</span>
            {filtered.length} filtered
            <span className="text-mid/40 mx-1">/</span>
            {log.niches_evaluated ?? total} evaluated
          </p>
          {log.source && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-flex px-1.5 py-0.5 rounded text-[0.5rem] font-medium"
                style={{
                  backgroundColor: log.source === "lake" ? "var(--olive)18" : "var(--lilac)18",
                  color: log.source === "lake" ? "var(--olive)" : "var(--lilac)",
                }}
              >
                {log.source === "lake" ? "Supabase Lake" : log.source === "markdown" ? "KWE Direct" : log.source}
              </span>
              <span className="text-[0.55rem] text-mid/40">
                {log.signals_checked != null &&
                  `${log.signals_checked} signals`}
                {log.signals_checked != null && log.candidates_found != null && " \u00B7 "}
                {log.candidates_found != null &&
                  `${log.candidates_found} candidates`}
              </span>
            </div>
          )}
        </div>
        <span
          className="text-mid/40 text-xs mt-1 transition-transform"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          \u25B6
        </span>
      </button>

      {/* Expandable content */}
      {open && (
        <div className="mt-4 space-y-4">
          {/* Proposed ideas */}
          {proposed.length > 0 && (
            <div>
              <p
                className="label-caps text-[0.55rem] mb-2"
                style={{ color: "var(--olive)" }}
              >
                Proposed Ideas
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {proposed.map((idea, i) => (
                  <IdeaCard key={idea.slug ?? i} idea={idea} onExplore={onExplore} onQualify={onQualify} exploring={exploringSlug === idea.slug} qualifying={qualifyingSlug === idea.slug} />
                ))}
              </div>
            </div>
          )}

          {/* Filtered ideas */}
          {filtered.length > 0 && (
            <div>
              <p
                className="label-caps text-[0.55rem] mb-2"
                style={{ color: "var(--amber)" }}
              >
                Filtered Out
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left label-caps text-[0.5rem] text-mid/60">
                      <th className="pb-2 pr-3">Niche</th>
                      <th className="pb-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f, i) => (
                      <FilteredRow key={i} idea={f} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function IdeasPage() {
  const [logs, setLogs] = useState<IdeaLog[]>([]);
  const [queue, setQueue] = useState<IdeaQueue | null>(null);
  const [loading, setLoading] = useState(true);
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
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const triggerPropose = async () => {
    setProposing(true);
    try {
      await fetch("/api/factory/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setTimeout(fetchIdeas, 3000);
    } catch {
      // ignore
    } finally {
      setProposing(false);
    }
  };

  const triggerExplore = async (slug: string) => {
    setExploringSlug(slug);
    try {
      await fetch("/api/factory/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      // Poll for completion (refining takes ~30-60s)
      const poll = setInterval(async () => {
        await fetchIdeas();
        // Check if status changed from "proposed"
        const updated = queue?.queue?.find((q) => q.slug === slug);
        if (updated && updated.status !== "proposed" && updated.status !== "exploring") {
          clearInterval(poll);
          setExploringSlug(null);
        }
      }, 5000);
      // Safety timeout: stop polling after 90s
      setTimeout(() => {
        clearInterval(poll);
        setExploringSlug(null);
        fetchIdeas();
      }, 90_000);
    } catch {
      setExploringSlug(null);
    }
  };

  const triggerQualify = async (slug: string) => {
    setQualifyingSlug(slug);
    try {
      await fetch("/api/factory/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      // Poll for completion (qualification takes ~30-60s via Sonnet)
      const poll = setInterval(async () => {
        await fetchIdeas();
        const updated = queue?.queue?.find((q) => q.slug === slug);
        if (updated && updated.status !== "refined" && updated.status !== "qualifying") {
          clearInterval(poll);
          setQualifyingSlug(null);
        }
      }, 5000);
      setTimeout(() => {
        clearInterval(poll);
        setQualifyingSlug(null);
        fetchIdeas();
      }, 120_000);
    } catch {
      setQualifyingSlug(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="px-8 py-8 max-w-[1440px] mx-auto">
        <EmptyState
          title="No idea generation logs yet"
          message="Run the idea proposer to generate App Factory ideas from discovery signals"
        />
        <div className="flex justify-center mt-4">
          <button
            onClick={triggerPropose}
            disabled={proposing}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: proposing
                ? "var(--warm)"
                : "var(--charcoal)",
              color: proposing ? "var(--mid)" : "var(--paper)",
            }}
          >
            {proposing ? "Proposing ideas..." : "Run Idea Proposer"}
          </button>
        </div>
      </div>
    );
  }

  // Aggregate stats across all runs
  const totalProposed = logs.reduce(
    (sum, l) => sum + (l.proposed?.length ?? 0),
    0,
  );
  const totalFiltered = logs.reduce(
    (sum, l) => sum + (l.filtered?.length ?? 0),
    0,
  );
  const painkillers = logs.flatMap((l) => l.proposed ?? []).filter(
    (p) => p.painkiller,
  );

  // Status-based queue breakdown
  const queueItems = queue?.queue ?? [];
  const proposedCount = queueItems.filter((q) => q.status === "proposed" || !q.status).length;
  const refinedCount = queueItems.filter((q) => q.status === "refined").length;
  const qualifiedCount = queueItems.filter((q) => q.status === "qualified").length;
  const readyCount = queueItems.filter((q) => (q.status === "qualified" || q.status === "refined") && q.score >= 75).length;
  const parkedCount = queueItems.filter((q) => q.status === "parked").length;

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="label-caps text-[0.55rem] text-mid/60">
            Idea Generation Log
          </p>
          <p className="text-[0.65rem] text-mid/40 mt-0.5">
            {logs.length} run{logs.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <button
          onClick={triggerPropose}
          disabled={proposing}
          className="px-3 py-1.5 rounded-lg text-[0.65rem] font-medium transition-all border"
          style={{
            borderColor: proposing ? "var(--warm)" : "var(--charcoal)",
            color: proposing ? "var(--mid)" : "var(--charcoal)",
            backgroundColor: proposing ? "var(--warm)" : "transparent",
          }}
        >
          {proposing ? "Running..." : "Run Proposer"}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          {
            label: "Proposed",
            value: String(totalProposed),
            color: "var(--amber)",
          },
          {
            label: "Filtered",
            value: String(totalFiltered),
            color: "var(--mid)",
          },
          {
            label: "Painkillers",
            value: String(painkillers.length),
            color: "var(--terracotta)",
          },
          {
            label: "Awaiting Refinement",
            value: String(proposedCount),
            color: "var(--lilac)",
          },
          {
            label: "Factory-Ready",
            value: String(readyCount),
            color: "var(--olive)",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center"
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
            <p className="label-caps text-[0.5rem] text-mid/60">
              {kpi.label}
            </p>
          </div>
        ))}
      </div>

      {/* Pipeline model routing */}
      <div className="card" style={{ borderLeft: "3px solid var(--lilac)" }}>
        <p className="label-caps text-[0.55rem] mb-3" style={{ color: "var(--lilac)" }}>
          Discovery Pipeline — Model Routing
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            {
              step: "1. Keyword Discovery",
              model: "Keywords Everywhere API",
              badge: "KWE",
              badgeColor: "var(--olive)",
              desc: "Pain-language seed expansion across verticals",
              cron: "Sun 01:45 CET",
            },
            {
              step: "2. Pain Scanner",
              model: "Reddit API (PRAW)",
              badge: "PRAW",
              badgeColor: "var(--amber)",
              desc: "Reddit complaint signal mining via r/all",
              cron: "Sun 02:00 CET",
            },
            {
              step: "3. Idea Proposer",
              model: "Algorithmic (Python)",
              badge: "ALGO",
              badgeColor: "var(--terracotta)",
              desc: "Multi-dimensional scoring, filter, propose to queue",
              cron: "Sun 02:30 CET",
            },
            {
              step: "4. Idea Refiner",
              model: "Reddit + KWE + Algorithmic",
              badge: "REFINE",
              badgeColor: "var(--lilac)",
              desc: "Niche-down, competitor analysis, variant scoring, mini one-pager",
              cron: "On-demand or auto",
            },
          ].map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] font-medium"
                  style={{ backgroundColor: `${s.badgeColor}18`, color: s.badgeColor }}
                >
                  {s.badge}
                </span>
                <span className="text-[0.65rem] font-medium" style={{ color: "var(--charcoal)" }}>
                  {s.step}
                </span>
              </div>
              <p className="text-[0.55rem] text-mid/60">{s.model}</p>
              <p className="text-[0.55rem] text-mid/40">{s.desc}</p>
              <p className="text-[0.5rem] text-mid/30">{s.cron}</p>
            </div>
          ))}
        </div>
        <p className="text-[0.5rem] text-mid/30 mt-3">
          Steps 1-3: Cron orchestration via MiniMax-M2.5 (Scout). Step 4: On-demand refinement via Reddit+KWE. No LLM calls — pure algorithmic scoring with 5-dimension breakdown.
        </p>
      </div>

      {/* Active queue ideas (from idea-queue.json) */}
      {queueItems.length > 0 && (
        <div>
          <p className="label-caps text-[0.55rem] mb-3" style={{ color: "var(--charcoal)" }}>
            Idea Queue ({queueItems.length})
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {queueItems.map((idea, i) => (
              <IdeaCard
                key={idea.slug ?? i}
                idea={idea}
                onExplore={triggerExplore}
                onQualify={triggerQualify}
                exploring={exploringSlug === idea.slug}
                qualifying={qualifyingSlug === idea.slug}
              />
            ))}
          </div>
        </div>
      )}

      {/* Run logs (most recent first, first one expanded) */}
      <div className="space-y-4">
        <p className="label-caps text-[0.55rem] text-mid/60">Discovery Run History</p>
        {logs.map((log, i) => (
          <RunCard
            key={log.timestamp ?? i}
            log={log}
            defaultOpen={i === 0}
            onExplore={triggerExplore}
            onQualify={triggerQualify}
            exploringSlug={exploringSlug}
            qualifyingSlug={qualifyingSlug}
          />
        ))}
      </div>
    </div>
  );
}
