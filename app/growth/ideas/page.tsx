"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

// ── Types ────────────────────────────────────────────────────────

interface IdeaEvidence {
  niche?: string;
  viability?: string;
  keyword_count?: number;
  avg_cpc?: number;
  total_volume?: number;
  top_keywords?: string[];
  signals_count?: number;
  cross_source_count?: number;
  max_cpc?: number;
  avg_final_score?: number;
  sources?: string[];
  sample_titles?: string[];
}

interface ProposedIdea {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  painkiller: boolean;
  source?: string;
  evidence?: IdeaEvidence;
  status?: string;
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

function IdeaCard({ idea }: { idea: ProposedIdea }) {
  const color = scoreColor(idea.score);
  return (
    <div
      className="rounded-xl border p-4 transition-all hover:shadow-sm"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}06` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h4
            className="text-sm font-medium truncate"
            style={{ color: "var(--charcoal)" }}
          >
            {idea.title}
          </h4>
          <p className="text-[0.65rem] text-mid/60 mt-0.5 line-clamp-2">
            {idea.tagline}
          </p>
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

      {idea.evidence && (
        <div className="mt-2 flex flex-wrap gap-1">
          {idea.evidence.viability && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.viability} viability
            </span>
          )}
          {idea.evidence.avg_cpc != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              ${idea.evidence.avg_cpc?.toFixed(2) ?? idea.evidence.max_cpc?.toFixed(2)} CPC
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
          {idea.evidence.signals_count != null && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/60 text-mid/80">
              {idea.evidence.signals_count} signals
            </span>
          )}
          {(idea.evidence.top_keywords ?? idea.evidence.sample_titles ?? []).slice(0, 3).map((kw, i) => (
            <span
              key={i}
              className="inline-flex px-1.5 py-0.5 rounded text-[0.55rem] bg-warm/40 text-mid/60 italic"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        {idea.source && (
          <span className="text-[0.55rem] text-mid/40">
            via {idea.source}
          </span>
        )}
        {idea.status && idea.status !== "proposed" && (
          <Badge
            color={
              idea.status === "approved"
                ? "var(--olive)"
                : idea.status === "rejected"
                  ? "var(--terracotta)"
                  : "var(--mid)"
            }
          >
            {idea.status}
          </Badge>
        )}
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
}: {
  log: IdeaLog;
  defaultOpen: boolean;
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
                  <IdeaCard key={idea.slug ?? i} idea={idea} />
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
  const queueSize =
    (queue?.queue?.length ?? 0) +
    (queue?.shipped?.length ?? 0) +
    (queue?.rejected?.length ?? 0);

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Proposed",
            value: String(totalProposed),
            color: "var(--olive)",
          },
          {
            label: "Filtered",
            value: String(totalFiltered),
            color: "var(--amber)",
          },
          {
            label: "Painkillers",
            value: String(painkillers.length),
            color: "var(--terracotta)",
          },
          {
            label: "In Queue",
            value: String(queueSize),
            color: "var(--charcoal)",
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              desc: "Cross-validate, score, filter, propose to queue",
              cron: "Sun 02:30 CET",
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
          Cron orchestration via MiniMax-M2.5 (Scout agent). No LLM calls in scoring — pure algorithmic pipeline.
        </p>
      </div>

      {/* Run logs (most recent first, first one expanded) */}
      <div className="space-y-4">
        {logs.map((log, i) => (
          <RunCard
            key={log.timestamp ?? i}
            log={log}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
