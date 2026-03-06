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

/** GET /api/keywords — return latest keyword signals markdown + metadata */
export async function GET() {
  try {
    // Find the latest file
    if (!existsSync(SIGNALS_DIR)) {
      return NextResponse.json({
        success: true,
        markdown: null,
        date: null,
        files: [],
        seeds: null,
      });
    }

    const files = readdirSync(SIGNALS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();

    const latest = files[0] ?? null;
    let markdown: string | null = null;
    let date: string | null = null;

    if (latest) {
      markdown = readFileSync(resolve(SIGNALS_DIR, latest), "utf-8");
      date = latest.replace(".md", "");
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
      files: files.slice(0, 10),
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
