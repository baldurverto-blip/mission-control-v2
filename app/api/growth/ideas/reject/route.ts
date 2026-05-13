import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, appendFile, copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const QUEUE_PATH = resolve(HOME, "verto-workspace/ops/factory/idea-queue.json");
const REJECTION_LOG = resolve(HOME, "verto-workspace/ops/factory/rejection-log.jsonl");

// Mirror of REASON_CODES in tools/idea-reject.py. Keep in sync.
const REASON_CODES: Record<string, string> = {
  "generic-theme":      "Not a specific pain, just a category",
  "no-acute-pain":      "Nice-to-have, not painkiller",
  "wrong-wealth":       "Target customer won't pay enough",
  "b2c-saturated":      "Too noisy a consumer space",
  "wedge-unclear":      "No obvious first-100-users path",
  "not-factory-fit":    "Doesn't match what Verto ships well",
  "signal-noise":       "Upstream source produced garbage",
  "weak-evidence":      "Single signal, no cross-source confirmation",
  "wrong-persona":      "Audience doesn't match shipped wins",
  "built-wrong-before": "Adjacent attempts have failed",
  "no-distribution":    "No clear acquisition story",
  "boring":             "Wouldn't enjoy building",
  "other":              "Free-text — must supply note",
};

interface QueueShape {
  queue: Record<string, unknown>[];
  rejected?: Record<string, unknown>[];
  parked?: Record<string, unknown>[];
  shipped?: Record<string, unknown>[];
  updated_at?: string;
  count?: number;
  [k: string]: unknown;
}

export async function GET() {
  return NextResponse.json({ reason_codes: REASON_CODES });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = String(body.slug ?? "").trim();
  const reason = String(body.reason_code ?? "").trim();
  const note = body.note ? String(body.note) : "";

  if (!slug || !reason) {
    return NextResponse.json(
      { ok: false, error: "slug and reason_code required" },
      { status: 400 },
    );
  }
  if (!(reason in REASON_CODES)) {
    return NextResponse.json(
      { ok: false, error: `unknown reason_code '${reason}'`, valid: Object.keys(REASON_CODES) },
      { status: 400 },
    );
  }
  if (reason === "other" && !note) {
    return NextResponse.json(
      { ok: false, error: "reason 'other' requires a note" },
      { status: 400 },
    );
  }
  if (!existsSync(QUEUE_PATH)) {
    return NextResponse.json({ ok: false, error: "idea-queue.json missing" }, { status: 500 });
  }

  const raw = await readFile(QUEUE_PATH, "utf-8");
  const d: QueueShape = JSON.parse(raw);

  // Find slug in queue or parked
  let movedFrom: "queue" | "parked" | null = null;
  let moved: Record<string, unknown> | null = null;
  for (const pool of ["queue", "parked"] as const) {
    const arr = d[pool];
    if (!Array.isArray(arr)) continue;
    const idx = arr.findIndex((it) => (it as { slug?: string }).slug === slug);
    if (idx !== -1) {
      moved = arr.splice(idx, 1)[0];
      movedFrom = pool;
      break;
    }
  }

  if (!moved || !movedFrom) {
    return NextResponse.json(
      { ok: false, error: `slug '${slug}' not found in queue or parked` },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  moved.status = "rejected";
  moved.rejected_at = now;
  moved.rejected_by = "mads";
  moved.reason_code = reason;
  moved.reason_note = note;
  moved.rejected_from = movedFrom;

  d.rejected = d.rejected ?? [];
  d.rejected.push(moved);
  d.updated_at = now;

  // Atomic-ish: backup then write
  const backupPath = QUEUE_PATH.replace(/\.json$/, `.json.bak-${now.replace(/[:.]/g, "")}`);
  try {
    await copyFile(QUEUE_PATH, backupPath);
  } catch {
    // non-fatal; continue
  }
  await writeFile(QUEUE_PATH, JSON.stringify(d, null, 2), "utf-8");

  // Append rejection log (jsonl)
  try {
    await mkdir(dirname(REJECTION_LOG), { recursive: true });
    const m = moved as Record<string, unknown>;
    const entry = {
      ts: now,
      slug,
      title: m.title ?? null,
      reason_code: reason,
      reason_note: note,
      source: m.source ?? null,
      score: m.score ?? null,
      from_pool: movedFrom,
    };
    await appendFile(REJECTION_LOG, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    slug,
    reason_code: reason,
    moved_from: movedFrom,
    counts: {
      queue: d.queue?.length ?? 0,
      parked: d.parked?.length ?? 0,
      rejected: d.rejected?.length ?? 0,
    },
  });
}
