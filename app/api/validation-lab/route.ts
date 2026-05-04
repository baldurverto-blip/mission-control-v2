import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const LAB_DIR = join(HOME, "verto-workspace/ops/validation-lab");

interface TrafficEntry {
  date?: string;
  visits?: number;
  conversions?: number;
  source?: string;
  note?: string;
}

interface Experiment {
  exp_slug: string;
  source_idea_slug?: string;
  pivot_name?: string;
  pivot_who?: string;
  pivot_wedge?: string;
  pivot_validation_step?: string;
  pivot_risk?: string;
  pivot_confidence?: string;
  started_at?: string;
  kill_at?: string;
  status?: string;
  thresholds?: { unique_visits?: number; conversions?: number; window_days?: number };
  project_dir?: string;
  deploy_url?: string | null;
  traffic?: TrafficEntry[];
  outcome?: string | null;
  outcome_reason?: string | null;
  archived_at?: string | null;
  promoted_to_factory_at?: string | null;
  promoted_to_factory_slug?: string | null;
}

interface ExperimentSummary extends Experiment {
  totals: { visits: number; conversions: number };
  daysLeft: number | null;
  thresholdMet: boolean;
}

function summarize(e: Experiment): ExperimentSummary {
  const visits = (e.traffic ?? []).reduce((acc, t) => acc + (t.visits || 0), 0);
  const conversions = (e.traffic ?? []).reduce((acc, t) => acc + (t.conversions || 0), 0);
  const vt = e.thresholds?.unique_visits ?? 0;
  const ct = e.thresholds?.conversions ?? 0;
  const thresholdMet = visits >= vt && conversions >= ct;

  let daysLeft: number | null = null;
  if (e.kill_at) {
    const killMs = Date.parse(e.kill_at);
    if (!Number.isNaN(killMs)) {
      daysLeft = Math.ceil((killMs - Date.now()) / 86_400_000);
    }
  }

  return { ...e, totals: { visits, conversions }, daysLeft, thresholdMet };
}

async function loadFromDir(dir: string): Promise<ExperimentSummary[]> {
  const out: ExperimentSummary[] = [];
  let entries: string[];
  try { entries = await readdir(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === "archived" || entry.startsWith(".") || entry.endsWith(".md")) continue;
    const expPath = join(dir, entry);
    try {
      const info = await stat(expPath);
      if (!info.isDirectory()) continue;
      const raw = await readFile(join(expPath, "experiment.json"), "utf-8");
      const data = JSON.parse(raw) as Experiment;
      out.push(summarize(data));
    } catch { /* skip malformed */ }
  }
  return out;
}

export async function GET() {
  try {
    const active = await loadFromDir(LAB_DIR);
    const archived = await loadFromDir(join(LAB_DIR, "archived"));

    // Sort active by daysLeft ascending (urgent first), archived by archived_at desc.
    active.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    archived.sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""));

    return NextResponse.json({
      active,
      archived,
      stats: {
        active: active.filter((e) => e.status === "active").length,
        succeeded: active.filter((e) => e.status === "succeeded").length,
        failed: archived.filter((e) => e.status === "failed").length + active.filter((e) => e.status === "failed").length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
