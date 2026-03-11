import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const WATCHLIST_PATH = resolve(HOME, "verto-workspace/ops/factory/b2b-watchlist.json");
const QUEUE_PATH = resolve(HOME, "verto-workspace/ops/factory/idea-queue.json");

interface WatchlistSignal {
  slug: string;
  title: string;
  tagline: string;
  target_audience?: string;
  score: number;
  segment: string;
  product_type?: string;
  source: string;
  signal_ids?: string[];
  evidence?: Record<string, unknown>;
  status: string;
  proposed_at?: string;
  watchlisted_at?: string;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const watchlist = await readJson<{ signals: WatchlistSignal[]; count: number; updated_at: string | null }>(
      WATCHLIST_PATH,
      { signals: [], count: 0, updated_at: null },
    );

    return NextResponse.json({
      success: true,
      ...watchlist,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: Pull a B2B idea from watchlist into the factory queue
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug } = body;

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    // Read watchlist
    const watchlist = await readJson<{ signals: WatchlistSignal[]; count: number; updated_at: string | null }>(
      WATCHLIST_PATH,
      { signals: [], count: 0, updated_at: null },
    );

    const idx = watchlist.signals.findIndex((s) => s.slug === slug);
    if (idx === -1) {
      return NextResponse.json({ error: `Slug '${slug}' not found in watchlist` }, { status: 404 });
    }

    // Remove from watchlist
    const [idea] = watchlist.signals.splice(idx, 1);
    watchlist.count = watchlist.signals.length;
    watchlist.updated_at = new Date().toISOString();

    // Add to factory queue as "proposed" with founder source
    const queue = await readJson<{ queue: unknown[]; shipped: unknown[]; rejected: unknown[]; parked?: unknown[]; updated_at?: string }>(
      QUEUE_PATH,
      { queue: [], shipped: [], rejected: [] },
    );

    const queueIdea = {
      ...idea,
      status: "proposed",
      source: `${idea.source} (pulled from watchlist)`,
      pulled_from_watchlist: true,
      pulled_at: new Date().toISOString(),
    };

    queue.queue.push(queueIdea);
    queue.updated_at = new Date().toISOString();

    // Write both files
    await writeFile(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
    await writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2));

    return NextResponse.json({
      success: true,
      message: `Pulled '${idea.title}' into factory queue`,
      slug,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
