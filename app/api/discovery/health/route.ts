import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const FACTORY_DIR = resolve(HOME, "verto-workspace/ops/factory");
const SAAS_FACTORY_DIR = resolve(HOME, "verto-workspace/ops/saas-factory");
const QUEUE_PATH = resolve(FACTORY_DIR, "idea-queue.json");
const SAAS_QUEUE_PATH = resolve(SAAS_FACTORY_DIR, "idea-queue.json");
const ROUTER_STATS_PATH = resolve(FACTORY_DIR, "signal-router-stats.json");
const SEEDS_PATH = resolve(HOME, "verto-workspace/brain/config/product-seeds.json");

// W8 of lively-foraging-armadillo. Surfaces ideation pipeline health for the
// /growth/ideas page. Filesystem-only — no Supabase access required from MC.

interface IdeaEntry {
  slug?: string;
  title?: string;
  source?: string;
  score?: number;
  segment?: string;
  proposed_at?: string;
  last_evidence_at?: string;
  re_proposed?: boolean;
  evidence?: { themed_seed?: string; niche?: string };
}

interface ProposalSummary {
  slug: string;
  title: string;
  score: number;
  source: string;
  segment: string;
  proposed_at: string;
  re_proposed: boolean;
  themed_seed: string | null;
}

function safeJSON<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function loadQueueEntries(): IdeaEntry[] {
  const out: IdeaEntry[] = [];
  for (const p of [QUEUE_PATH, SAAS_QUEUE_PATH]) {
    const data = safeJSON<{
      queue?: IdeaEntry[];
      shipped?: IdeaEntry[];
      rejected?: IdeaEntry[];
      parked?: IdeaEntry[];
    }>(p, {});
    for (const bucket of ["queue", "shipped", "rejected", "parked"] as const) {
      for (const e of data[bucket] ?? []) out.push(e);
    }
  }
  return out;
}

function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function primarySource(s?: string): string {
  if (!s) return "unknown";
  // queue entries often have comma-joined sources — take the first as primary.
  return s.split(",")[0].trim() || "unknown";
}

export async function GET() {
  const entries = loadQueueEntries();

  // ── Section 1: ideas proposed in last 7d, by source ──
  const last7d: ProposalSummary[] = [];
  for (const e of entries) {
    const at = e.last_evidence_at ?? e.proposed_at;
    if (!at) continue;
    if (daysSince(at) <= 7) {
      last7d.push({
        slug: e.slug ?? "?",
        title: e.title ?? "?",
        score: Number(e.score ?? 0),
        source: primarySource(e.source),
        segment: e.segment ?? "?",
        proposed_at: at,
        re_proposed: !!e.re_proposed,
        themed_seed: e.evidence?.themed_seed ?? null,
      });
    }
  }
  last7d.sort((a, b) => Date.parse(b.proposed_at) - Date.parse(a.proposed_at));

  const proposed7dBySource: Record<string, number> = {};
  for (const p of last7d) {
    proposed7dBySource[p.source] = (proposed7dBySource[p.source] ?? 0) + 1;
  }

  // ── Section 2: classification events vs proposals (backlog proxy) ──
  const stats = safeJSON<{
    total?: number;
    by_source?: Record<string, { total?: number }>;
    last_updated?: string;
    _note?: string;
  }>(ROUTER_STATS_PATH, {});

  const proposed30dBySource: Record<string, number> = {};
  for (const e of entries) {
    const at = e.last_evidence_at ?? e.proposed_at;
    if (!at) continue;
    if (daysSince(at) <= 30) {
      const s = primarySource(e.source);
      proposed30dBySource[s] = (proposed30dBySource[s] ?? 0) + 1;
    }
  }

  const sourceBacklog: {
    source: string;
    classification_events_cumulative: number;
    proposed_last_30d: number;
    backlog_proxy: number;
  }[] = [];
  const allSourcesSet = new Set([
    ...Object.keys(stats.by_source ?? {}),
    ...Object.keys(proposed30dBySource),
  ]);
  const allSources = Array.from(allSourcesSet);
  for (const src of allSources) {
    const events = stats.by_source?.[src]?.total ?? 0;
    const proposed30 = proposed30dBySource[src] ?? 0;
    sourceBacklog.push({
      source: src,
      classification_events_cumulative: events,
      proposed_last_30d: proposed30,
      backlog_proxy: Math.max(0, events - proposed30),
    });
  }
  sourceBacklog.sort((a, b) => b.backlog_proxy - a.backlog_proxy);

  // ── Section 3: seed coverage — which W2 seeds anchor recent kwe-derived ideas ──
  const seedsCfg = safeJSON<{ pain_discovery?: string[] }>(SEEDS_PATH, {});
  const seeds = seedsCfg.pain_discovery ?? [];
  const seedHits: Record<string, number> = {};
  for (const e of entries) {
    const at = e.last_evidence_at ?? e.proposed_at;
    if (!at || daysSince(at) > 30) continue;
    if (!primarySource(e.source).startsWith("kwe_")) continue;
    const niche = (e.evidence?.niche ?? e.title ?? "").toLowerCase();
    for (const seed of seeds) {
      // Loose substring match: seed keywords often appear in niche/title
      // (e.g. seed 'beekeeper hive log app' → niche 'beekeeper hive log').
      const kw = seed.replace(/ app$/i, "").toLowerCase();
      if (kw.length >= 4 && niche.includes(kw)) {
        seedHits[seed] = (seedHits[seed] ?? 0) + 1;
        break;
      }
    }
  }
  const seedCoverage = {
    seeds_total: seeds.length,
    seeds_with_recent_hit: Object.keys(seedHits).length,
    coverage_pct:
      seeds.length > 0
        ? Math.round((Object.keys(seedHits).length / seeds.length) * 100)
        : 0,
    top_hits: Object.entries(seedHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([seed, count]) => ({ seed, count })),
  };

  return NextResponse.json({
    success: true,
    generated_at: new Date().toISOString(),
    proposed_last_7d: last7d,
    proposed_7d_by_source: proposed7dBySource,
    classification: {
      events_total_cumulative: stats.total ?? 0,
      last_updated: stats.last_updated ?? null,
      note: stats._note ?? null,
      _doc:
        "These counters track CLASSIFICATION EVENTS (one increment per signal " +
        "passed through the Signal Router), not actual lake row inserts. The " +
        "lake row count is much smaller because the inserter scripts have " +
        "narrower scope than the router. See plan lively-foraging-armadillo W1.5.",
    },
    source_backlog: sourceBacklog,
    seed_coverage_30d: seedCoverage,
    _doc: {
      proposed_last_7d:
        "Idea-queue entries with last_evidence_at (or proposed_at) within the last 7 days, across queue/shipped/rejected/parked/saas.",
      backlog_proxy:
        "classification_events_cumulative minus proposed_last_30d. Loose proxy for 'how many classified signals haven't yet become ideas' — high values flag a source that classifies a lot but rarely produces qualifying clusters.",
      seed_coverage_30d:
        "What fraction of pain_discovery seeds anchored at least one kwe-sourced idea proposal in the last 30 days. Substring match on the seed keyword vs the idea's niche/title — a rough but useful indicator that W2 seeds are reaching the proposer.",
    },
  });
}
