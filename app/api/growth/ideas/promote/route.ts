import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";

const HOME = process.env.HOME || "/Users/baldurclaw";
const QUEUE_PATH = resolve(HOME, "verto-workspace/ops/factory/idea-queue.json");

interface QueueShape {
  queue: Record<string, unknown>[];
  parked?: Record<string, unknown>[];
  rejected?: Record<string, unknown>[];
  shipped?: Record<string, unknown>[];
  updated_at?: string;
  [k: string]: unknown;
}

/**
 * Move an idea from `parked` → `queue`.
 *
 * Companion to the parking quarantine introduced 2026-05-12 (synthesis_bridge.py
 * now routes Scout-synth to parked by default). The reject-sweep UI surfaces
 * parked ideas under the "Include parked" toggle; this endpoint is how the
 * keepers escape the quarantine.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = String(body.slug ?? "").trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
  }
  if (!existsSync(QUEUE_PATH)) {
    return NextResponse.json({ ok: false, error: "idea-queue.json missing" }, { status: 500 });
  }

  const raw = await readFile(QUEUE_PATH, "utf-8");
  const d: QueueShape = JSON.parse(raw);

  const parked = d.parked ?? [];
  const idx = parked.findIndex((it) => (it as { slug?: string }).slug === slug);
  if (idx === -1) {
    return NextResponse.json(
      { ok: false, error: `slug '${slug}' not found in parked` },
      { status: 404 },
    );
  }

  const moved = parked.splice(idx, 1)[0];
  const now = new Date().toISOString();
  moved.status = "queued";
  moved.promoted_at = now;
  moved.promoted_by = "mads";
  // Strip the parking metadata so the idea looks like a normal queued item
  delete moved.parked_reason;
  delete moved.parked_at;
  delete moved.parked_note;

  d.queue = d.queue ?? [];
  d.queue.push(moved);
  d.updated_at = now;

  const backupPath = QUEUE_PATH.replace(/\.json$/, `.json.bak-${now.replace(/[:.]/g, "")}`);
  try {
    await copyFile(QUEUE_PATH, backupPath);
  } catch {
    /* non-fatal */
  }
  await writeFile(QUEUE_PATH, JSON.stringify(d, null, 2), "utf-8");

  return NextResponse.json({
    ok: true,
    slug,
    counts: {
      queue: d.queue.length,
      parked: parked.length,
      rejected: d.rejected?.length ?? 0,
    },
  });
}
