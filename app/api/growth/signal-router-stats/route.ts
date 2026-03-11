import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const STATS_PATH = resolve(HOME, "verto-workspace/ops/factory/signal-router-stats.json");
const DROPS_PATH = resolve(HOME, "verto-workspace/ops/factory/signal-drops.jsonl");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const stats = await readJson<{
      total: number;
      b2c: number;
      b2b: number;
      prosumer: number;
      irrelevant: number;
      by_source: Record<string, { total: number; b2c: number; b2b: number; prosumer: number; irrelevant: number }>;
      by_method: { rule: number; llm: number; fallback: number };
      last_updated: string | null;
    }>(STATS_PATH, {
      total: 0, b2c: 0, b2b: 0, prosumer: 0, irrelevant: 0,
      by_source: {}, by_method: { rule: 0, llm: 0, fallback: 0 },
      last_updated: null,
    });

    // Count recent drops
    let recentDrops = 0;
    try {
      const dropsRaw = await readFile(DROPS_PATH, "utf-8");
      const lines = dropsRaw.trim().split("\n").filter(Boolean);
      recentDrops = lines.length;
    } catch {
      // No drops file yet
    }

    // Calculate drop rate
    const dropRate = stats.total > 0 ? ((stats.irrelevant / stats.total) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      success: true,
      ...stats,
      recent_drops: recentDrops,
      drop_rate: parseFloat(dropRate),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
