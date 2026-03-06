import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { KEYWORD_SIGNALS_DIR } from "@/app/lib/paths";

const WATCHLIST_PATH = join(
  process.env.HOME || "/Users/baldurclaw",
  "verto-workspace/brain/config/signal-watchlist.json",
);

interface ParsedKeyword {
  keyword: string;
  volume: number;
  cpc: number;
  intent: number;
  trend: string;
  product: string;
  niche: string;
}

interface DayData {
  date: string;
  credits: number;
  keywords: ParsedKeyword[];
}

function parseSignalFile(content: string, date: string): DayData {
  const credits = parseInt(content.match(/Credits used:\s*(\d+)/)?.[1] || "0", 10);
  const keywords: ParsedKeyword[] = [];

  let currentProduct = "";
  let currentNiche = "";

  for (const line of content.split("\n")) {
    // Track product sections
    const productMatch = line.match(/^## (.+)/);
    if (productMatch) {
      const raw = productMatch[1].trim();
      if (raw.startsWith("Pain Discovery")) currentProduct = "_pain";
      else if (raw.startsWith("General Discovery")) currentProduct = "_general";
      else if (
        !raw.startsWith("High-Viability") &&
        !raw.startsWith("Willingness") &&
        !raw.startsWith("Underserved") &&
        !raw.startsWith("Top 10")
      ) {
        currentProduct = raw.toLowerCase();
      }
      continue;
    }

    // Track niche
    const nicheMatch = line.match(/^### Niche:\s*(.+?)(?:\s*\[.*\])?$/);
    if (nicheMatch) {
      currentNiche = nicheMatch[1].trim();
      continue;
    }

    // Skip Top 10 / summary sections to avoid double-counting
    if (line.startsWith("### Top 10") || line.startsWith("## High-Viability") ||
        line.startsWith("## Willingness") || line.startsWith("## Underserved")) {
      currentProduct = "_summary";
      continue;
    }

    // Parse keyword table rows (skip headers and dividers)
    if (!line.startsWith("|") || line.includes("---") || line.includes("Keyword")) continue;
    if (currentProduct === "_summary") continue;

    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;

    // Handle both "| kw | vol | cpc | intent | trend |" and "| # | kw | vol | cpc | comp | intent | trend |"
    let kw: string, vol: string, cpc: string, intent: string, trend: string;
    if (cells.length >= 7 && /^\d+$/.test(cells[0])) {
      // Numbered top-10 row
      continue; // skip summary rows
    } else {
      kw = cells[0];
      vol = cells[1];
      cpc = cells[2];
      intent = cells[3];
      trend = cells[4];
    }

    const volNum = parseInt(vol.replace(/,/g, ""), 10) || 0;
    const cpcNum = parseFloat(cpc.replace("$", "")) || 0;
    const intentNum = parseInt(intent.replace("/100", ""), 10) || 0;

    if (kw && intentNum > 0) {
      keywords.push({
        keyword: kw,
        volume: volNum,
        cpc: cpcNum,
        intent: intentNum,
        trend: trend || "unknown",
        product: currentProduct,
        niche: currentNiche,
      });
    }
  }

  return { date, credits, keywords };
}

interface TrendKeyword {
  keyword: string;
  product: string;
  niche: string;
  days: { date: string; intent: number; cpc: number; volume: number; trend: string }[];
  latestIntent: number;
  latestCpc: number;
  latestVolume: number;
  latestTrend: string;
  dayCount: number;
  intentDelta: number; // change from first to last appearance
  isWatched: boolean;
}

function loadWatchlist(): string[] {
  if (!existsSync(WATCHLIST_PATH)) return [];
  try {
    return JSON.parse(readFileSync(WATCHLIST_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/** GET /api/keywords/trends — multi-day keyword signals with trend analysis */
export async function GET() {
  try {
    if (!existsSync(KEYWORD_SIGNALS_DIR)) {
      return NextResponse.json({ days: [], trends: [], watchlist: [], creditHistory: [] });
    }

    const files = readdirSync(KEYWORD_SIGNALS_DIR)
      .filter((f) => f.endsWith(".md") && !f.includes("-v"))
      .sort()
      .reverse()
      .slice(0, 14); // last 14 days max

    const watchlist = loadWatchlist();
    const watchSet = new Set(watchlist.map((w) => w.toLowerCase()));

    const days: DayData[] = [];
    for (const f of files) {
      const content = readFileSync(join(KEYWORD_SIGNALS_DIR, f), "utf-8");
      const date = f.replace(".md", "");
      const parsed = parseSignalFile(content, date);
      if (parsed.keywords.length > 0) {
        days.push(parsed);
      }
    }

    // Build keyword trend map across days
    const kwMap = new Map<string, TrendKeyword>();

    for (const day of days) {
      for (const kw of day.keywords) {
        const key = kw.keyword.toLowerCase();
        if (!kwMap.has(key)) {
          kwMap.set(key, {
            keyword: kw.keyword,
            product: kw.product,
            niche: kw.niche,
            days: [],
            latestIntent: 0,
            latestCpc: 0,
            latestVolume: 0,
            latestTrend: "unknown",
            dayCount: 0,
            intentDelta: 0,
            isWatched: watchSet.has(key),
          });
        }
        const entry = kwMap.get(key)!;
        entry.days.push({
          date: day.date,
          intent: kw.intent,
          cpc: kw.cpc,
          volume: kw.volume,
          trend: kw.trend,
        });
      }
    }

    // Compute trend stats
    const trends: TrendKeyword[] = [];
    for (const entry of kwMap.values()) {
      // Sort days chronologically
      entry.days.sort((a, b) => a.date.localeCompare(b.date));
      entry.dayCount = entry.days.length;

      const latest = entry.days[entry.days.length - 1];
      const earliest = entry.days[0];
      entry.latestIntent = latest.intent;
      entry.latestCpc = latest.cpc;
      entry.latestVolume = latest.volume;
      entry.latestTrend = latest.trend;
      entry.intentDelta = latest.intent - earliest.intent;

      trends.push(entry);
    }

    // Sort: watched first, then by dayCount (persistent signals) then intent
    trends.sort((a, b) => {
      if (a.isWatched !== b.isWatched) return a.isWatched ? -1 : 1;
      if (a.dayCount !== b.dayCount) return b.dayCount - a.dayCount;
      return b.latestIntent - a.latestIntent;
    });

    // Credit history for sparkline
    const creditHistory = days
      .map((d) => ({ date: d.date, credits: d.credits }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      days: days.map((d) => ({ date: d.date, credits: d.credits, keywordCount: d.keywords.length })),
      trends: trends.slice(0, 100),
      watchlist,
      creditHistory,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** POST /api/keywords/trends — add/remove from watchlist */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { keyword, action } = body as { keyword: string; action: "watch" | "unwatch" };

    if (!keyword) {
      return NextResponse.json({ error: "keyword required" }, { status: 400 });
    }

    const watchlist = loadWatchlist();
    const lower = keyword.toLowerCase();

    if (action === "watch") {
      if (!watchlist.some((w) => w.toLowerCase() === lower)) {
        watchlist.push(keyword);
      }
    } else {
      const idx = watchlist.findIndex((w) => w.toLowerCase() === lower);
      if (idx !== -1) watchlist.splice(idx, 1);
    }

    writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
    return NextResponse.json({ success: true, watchlist });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
