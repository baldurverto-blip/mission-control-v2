import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

const SIGNALS_DIR = resolve(
  process.env.HOME || "/Users/baldurclaw",
  "verto-workspace/research/keyword-signals",
);

const SEEDS_PATH = resolve(
  process.env.HOME || "/Users/baldurclaw",
  "verto-workspace/brain/config/product-seeds.json",
);

function extractScoredCount(markdown: string): number {
  const matches = [...markdown.matchAll(/Scored:\s*(\d+)/g)];
  return matches.reduce((sum, m) => sum + (parseInt(m[1] || "0", 10) || 0), 0);
}

/** GET /api/keywords — return latest keyword signals markdown + metadata */
export async function GET(req: NextRequest) {
  try {
    if (!existsSync(SIGNALS_DIR)) {
      return NextResponse.json({
        success: true,
        markdown: null,
        date: null,
        latest_date: null,
        fallback_used: false,
        fallback_reason: null,
        files: [],
        seeds: null,
      });
    }

    const files = readdirSync(SIGNALS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();

    const latest = files[0] ?? null;
    const requested = req.nextUrl.searchParams.get("file");

    let selectedFile: string | null = null;
    let markdown: string | null = null;
    let date: string | null = null;
    let latestDate: string | null = latest ? latest.replace(".md", "") : null;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;

    const read = (f: string) => readFileSync(resolve(SIGNALS_DIR, f), "utf-8");

    if (requested && files.includes(requested)) {
      selectedFile = requested;
      markdown = read(requested);
      date = requested.replace(".md", "");
    } else if (latest) {
      const latestMd = read(latest);
      const latestScored = extractScoredCount(latestMd);

      if (latestScored > 0) {
        selectedFile = latest;
        markdown = latestMd;
        date = latest.replace(".md", "");
      } else {
        const fallback = files.find((f) => extractScoredCount(read(f)) > 0) ?? null;
        if (fallback) {
          selectedFile = fallback;
          markdown = read(fallback);
          date = fallback.replace(".md", "");
          fallbackUsed = true;
          fallbackReason = `Latest report (${latest.replace(".md", "")}) has 0 scored keywords.`;
        } else {
          selectedFile = latest;
          markdown = latestMd;
          date = latest.replace(".md", "");
        }
      }
    }

    // Load seeds
    let seeds = null;
    if (existsSync(SEEDS_PATH)) {
      try {
        seeds = JSON.parse(readFileSync(SEEDS_PATH, "utf-8"));
      } catch {
        // ignore parse errors
      }
    }

    return NextResponse.json({
      success: true,
      markdown,
      date,
      latest_date: latestDate,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
      selected_file: selectedFile,
      files: files.slice(0, 20),
      seeds,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** POST /api/keywords — trigger a fresh discovery run */
export async function POST(req: NextRequest) {
  const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${GROWTHOPS_URL}/api/discovery/kwe-discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000), // KWE discovery can take 2-3 min
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Timeout or unreachable" },
      { status: 503 },
    );
  }
}
