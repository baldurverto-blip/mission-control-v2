import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const LOG_DIR = resolve(HOME, "verto-workspace/research/idea-proposals");
const QUEUE_PATH = resolve(HOME, "verto-workspace/ops/factory/idea-queue.json");
const SIGNALS_DIR = resolve(HOME, "verto-workspace/research/keyword-signals");
const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

// ── Helpers ────────────────────────────────────────────────────────

/** Parse keyword signals markdown into structured data */
function parseKeywordSignals(markdown: string): { niche: string; tier: string; keywords: number; avgIntent: number; avgCpc: number; totalVolume: number; topKeywords: { keyword: string; volume: number; intent: number; trend: string }[] }[] {
  const niches: ReturnType<typeof parseKeywordSignals> = [];
  const nicheRegex = /### Niche: (.+?) \[(\w+)\]\n\nKeywords: (\d+) \| Avg Intent: (\d+)\/100 \| Avg CPC: \$([0-9.]+) \| Total Volume: ([0-9,]+)\/mo\n\n\|.*\n\|.*\n([\s\S]*?)(?=\n###|\n## |$)/g;

  let match;
  while ((match = nicheRegex.exec(markdown)) !== null) {
    const rows = match[7].trim().split("\n").filter((r) => r.startsWith("|"));
    const topKeywords = rows.slice(0, 5).map((row) => {
      const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
      return {
        keyword: cols[0] ?? "",
        volume: parseInt(cols[1]?.replace(/,/g, "") ?? "0"),
        intent: parseInt(cols[3]?.replace(/\/100/, "") ?? "0"),
        trend: cols[4] ?? "stable",
      };
    });

    niches.push({
      niche: match[1],
      tier: match[2],
      keywords: parseInt(match[3]),
      avgIntent: parseInt(match[4]),
      avgCpc: parseFloat(match[5]),
      totalVolume: parseInt(match[6].replace(/,/g, "")),
      topKeywords,
    });
  }

  return niches;
}

/** Fetch high-scoring signals from GrowthOps radar */
async function fetchHotSignals(): Promise<{ id: string; title: string; score: number; source: string; tier: string; tags: string[] }[]> {
  try {
    const res = await fetch(`${GROWTHOPS_URL}/api/radar?tier=hot&limit=10`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.signals ?? []).map((s: Record<string, unknown>) => ({
      id: s.id ?? "",
      title: s.title ?? "",
      score: s.final_score ?? 0,
      source: s.source ?? "",
      tier: s.radar_tier ?? "hot",
      tags: s.pipeline_tags ?? [],
    }));
  } catch {
    return [];
  }
}

// ── Main Handler ──────────────────────────────────────────────────

/** GET /api/growth/ideas — return idea queue + logs + signal context */
export async function GET() {
  try {
    // 1. Load idea proposal logs (most recent first)
    let logs: unknown[] = [];
    if (existsSync(LOG_DIR)) {
      const files = readdirSync(LOG_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 10);

      for (const file of files) {
        try {
          const raw = JSON.parse(readFileSync(resolve(LOG_DIR, file), "utf-8"));
          const entries = Array.isArray(raw) ? raw : [raw];
          for (const entry of entries) {
            logs.push({ ...entry, _file: file });
          }
        } catch {
          // skip corrupt files
        }
      }
    }

    // 2. Load current queue
    let queue = null;
    if (existsSync(QUEUE_PATH)) {
      try {
        queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"));
      } catch {}
    }

    // 3. Load latest keyword signals (structured)
    let keywordNiches: ReturnType<typeof parseKeywordSignals> = [];
    let keywordDate: string | null = null;
    if (existsSync(SIGNALS_DIR)) {
      const files = readdirSync(SIGNALS_DIR)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      if (files.length > 0) {
        const md = readFileSync(resolve(SIGNALS_DIR, files[0]), "utf-8");
        keywordNiches = parseKeywordSignals(md);
        keywordDate = files[0].replace(".md", "");
      }
    }

    // 4. Fetch hot signals from radar (above threshold)
    const hotSignals = await fetchHotSignals();

    return NextResponse.json({
      success: true,
      logs,
      queue,
      signals: {
        hot: hotSignals,
        keywords: {
          date: keywordDate,
          niches: keywordNiches,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
