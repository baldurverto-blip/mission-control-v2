import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { WORKSPACE, OPS } from "@/app/lib/paths";

// The Cockpit route — the one pull surface for "how are we doing + what needs me".
// Reads live SSOT the brain already writes (never recalls, never fabricates):
//   - ops/health.json                              (health meta-monitor)
//   - GATES.md                                     (Mads's open taps)
//   - capabilities/distribute/reviews/weekly-latest.md   (distribution-review)
//   - fastlane-lite/data/content_queue.jsonl + reads.jsonl (content engine)
//   - capabilities/discover/queue.md               (demand loop)
//   - RigLog leads via Supabase (if creds wired)   (fake-door demand read)
// Every reader is defensive: a missing/garbled source degrades to a null section,
// never a 500. The cockpit shows "unavailable" rather than lying.

const REVIEW_MD = join(WORKSPACE, "capabilities/distribute/reviews/weekly-latest.md");
const DATA_DIR = join(WORKSPACE, "capabilities/distribute/appstore/fastlane-lite/data");
const QUEUE_JSONL = join(DATA_DIR, "content_queue.jsonl");
const READS_JSONL = join(DATA_DIR, "reads.jsonl");
const GATES_MD = join(WORKSPACE, "GATES.md");
const DEMAND_MD = join(WORKSPACE, "capabilities/discover/queue.md");
const HEALTH_JSON = join(OPS, "health.json");

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function mtimeISO(path: string): Promise<string | null> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return null;
  }
}

// ── health.json ──────────────────────────────────────────────────
async function readHealth() {
  const raw = await readText(HEALTH_JSON);
  if (!raw) return null;
  try {
    const h = JSON.parse(raw);
    return {
      checkedAt: h.checked_at ?? null,
      loaded: h.loaded ?? 0,
      unhealthy: h.unhealthy ?? 0,
      muted: h.muted ?? 0,
      plistsOnDisk: h.plists_on_disk ?? 0,
      plistsUnloaded: h.plists_unloaded ?? 0,
      jobs: (h.jobs ?? [])
        .map((j: Record<string, unknown>) => ({
          label: String(j.label ?? "").replace(/^com\.verto\./, ""),
          status: j.status ?? "ok",
          lastExit: j.last_exit ?? "",
          ageH: typeof j.age_h === "number" ? j.age_h : -1,
          reasons: j.reasons ?? "",
        }))
        // surface the problems first; healthy jobs after
        .sort((a: { status: string }, b: { status: string }) => {
          const rank = (s: string) => (s === "unhealthy" ? 0 : s === "muted" ? 1 : 2);
          return rank(a.status) - rank(b.status);
        }),
    };
  } catch {
    return null;
  }
}

// ── GATES.md ─────────────────────────────────────────────────────
async function readGates() {
  const raw = await readText(GATES_MD);
  if (!raw) return null;
  const SEV: Record<string, string> = { "🔴": "red", "🟠": "orange", "🟡": "yellow" };
  const groups: { severity: string; heading: string; items: { n: string; title: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  for (const line of raw.split("\n")) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const emoji = Object.keys(SEV).find((e) => h[1].includes(e));
      if (emoji) {
        cur = { severity: SEV[emoji], heading: h[1].replace(/[🔴🟠🟡🟢]/g, "").trim(), items: [] };
        groups.push(cur);
      } else {
        cur = null; // green / non-severity section → not a gate that needs Mads
      }
      continue;
    }
    if (!cur) continue;
    const item = line.match(/^(\d+[a-z]?)\.\s+\*\*(.+?)\*\*/);
    if (item) cur.items.push({ n: item[1], title: item[2].replace(/[.:]\s*$/, "") });
  }
  const openCount = groups.reduce((s, g) => s + g.items.length, 0);
  return { openCount, groups: groups.filter((g) => g.items.length > 0), updatedAt: await mtimeISO(GATES_MD) };
}

// ── weekly-latest.md (distribution-review) ───────────────────────
async function readReview() {
  const raw = await readText(REVIEW_MD);
  if (!raw) return null;
  const fmDate = raw.match(/^date:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const noop = raw.match(/^noop_streak:\s*(\d+)/m)?.[1] ?? null;

  const sectionBody = (letter: string): string => {
    // NOTE: no `m` flag — with it, `$` matches every line-end and truncates a
    // multi-line section to its first line. Anchor the start on `\n##` instead
    // so `$` means true end-of-string and multi-item sections (G) capture fully.
    const re = new RegExp(`\\n##\\s+${letter}\\.[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`);
    return raw.match(re)?.[1]?.trim() ?? "";
  };

  const headline = sectionBody("A").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const nextMoves = sectionBody("G")
    .split("\n")
    .map((l) => l.match(/^\d+\.\s+\*\*(.+?)\*\*/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((t) => t.replace(/[.:]\s*$/, ""));

  return { date: fmDate, noopStreak: noop, headline, nextMoves, updatedAt: await mtimeISO(REVIEW_MD) };
}

// ── content engine (queue + reads) ───────────────────────────────
function parseJsonl(raw: string): Record<string, unknown>[] {
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, unknown> => x !== null);
}

async function readEngine() {
  const qraw = await readText(QUEUE_JSONL);
  const rraw = await readText(READS_JSONL);
  if (qraw === null && rraw === null) return null;

  const rows = qraw ? parseJsonl(qraw) : [];
  const byStatus: Record<string, number> = {};
  const byAppPlatform: Record<string, { app: string; platform: string; status: string; count: number }> = {};
  for (const r of rows) {
    const status = String(r.status ?? "unknown");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const app = String(r.app ?? "?");
    const platform = String(r.platform ?? r.channel ?? "?");
    const key = `${app}|${platform}|${status}`;
    if (!byAppPlatform[key]) byAppPlatform[key] = { app, platform, status, count: 0 };
    byAppPlatform[key].count += 1;
  }

  const reads = rraw ? parseJsonl(rraw) : [];
  const readsBySource: Record<string, number> = {};
  for (const r of reads) {
    const src = String(r.source ?? r.platform ?? "unknown");
    readsBySource[src] = (readsBySource[src] ?? 0) + 1;
  }

  return {
    totalRows: rows.length,
    byStatus,
    queue: Object.values(byAppPlatform).sort(
      (a, b) => a.app.localeCompare(b.app) || a.platform.localeCompare(b.platform),
    ),
    readsBySource,
    totalReads: reads.length,
    updatedAt: await mtimeISO(QUEUE_JSONL),
  };
}

// ── demand loop (queue.md activity feed) ─────────────────────────
async function readDemand() {
  const raw = await readText(DEMAND_MD);
  if (!raw) return null;
  const entries: { date: string | null; title: string }[] = [];
  for (const line of raw.split("\n")) {
    const h = line.match(/^##\s+(.*)$/);
    if (!h) continue;
    const dateMatch = h[1].match(/(\d{4}-\d{2}-\d{2})/);
    entries.push({
      date: dateMatch?.[1] ?? null,
      title: h[1].replace(/\d{4}-\d{2}-\d{2}\s*—?\s*/, "").trim(),
    });
  }
  return { latest: entries.slice(0, 6), updatedAt: await mtimeISO(DEMAND_MD) };
}

// ── RigLog fake-door leads (Supabase, if creds wired) ────────────
async function readLeads() {
  const url = process.env.RIGLOG_SUPABASE_URL;
  const key = process.env.RIGLOG_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return {
      wired: false,
      note: "Add RIGLOG_SUPABASE_URL + RIGLOG_SUPABASE_SERVICE_KEY to Mission Control .env.local (from the riglog-landing Vercel project) to show live demand-read counts.",
    };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${url}/rest/v1/riglog_leads?select=created_at&order=created_at.desc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "User-Agent": "verto-mission-control", // Supabase REST drops UA-less requests
        Prefer: "count=exact",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { wired: true, error: `Supabase ${res.status}` };
    const rows = (await res.json()) as { created_at: string }[];
    const contentRange = res.headers.get("content-range"); // "0-24/25"
    const count = contentRange?.split("/")?.[1];
    return {
      wired: true,
      count: count ? Number(count) : rows.length,
      latest: rows[0]?.created_at ?? null,
    };
  } catch (e) {
    return { wired: true, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function GET() {
  const [health, gates, review, engine, demand, leads] = await Promise.all([
    readHealth(),
    readGates(),
    readReview(),
    readEngine(),
    readDemand(),
    readLeads(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health,
    gates,
    review,
    engine,
    demand,
    leads,
  });
}
