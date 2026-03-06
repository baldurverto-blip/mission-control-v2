import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");

interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
  session_id?: string;
  model?: string;
}

interface PhaseState {
  status: string;
  score?: number;
  attempt?: number;
}

interface ProjectState {
  slug: string;
  status: string;
  phase: number;
  phases: Record<string, PhaseState>;
  created_at: string;
  updated_at: string;
}

interface KPISnapshot {
  week: string;
  date: string;
  traffic: { impressions: number; page_views: number; downloads: number };
  users: { dau: number; wau: number; mau: number; d1_retention: number | null; d7_retention: number | null; d30_retention: number | null };
  revenue: { trial_starts: number; trial_to_paid: number | null; mrr: number; arpu: number };
  churn: { active_subs: number; cancellations: number; churn_rate: number | null; refund_rate: number | null };
}

interface KPIData {
  slug: string;
  ship_date: string;
  snapshots: KPISnapshot[];
  signals: string[];
  actions_taken: string[];
}

interface IdeaQueueEntry {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  painkiller: boolean;
  source: string;
  one_pager?: string;
  queued_at: string;
}

interface IdeaQueue {
  queue: IdeaQueueEntry[];
  shipped: IdeaQueueEntry[];
  rejected: IdeaQueueEntry[];
}

const PHASE_ORDER = [
  "research",
  "validation",
  "build",
  "quality_gate",
  "monetization",
  "packaging",
  "shipping",
  "marketing",
  "promo",
];

export async function GET() {
  try {
    const projects: (ProjectState & { onePager?: string; kpis?: KPIData; e2eResults?: { status: string; tests: number; passed: number; failed: number } })[] = [];

    // Read all project state files
    const entries = await readdir(FACTORY).catch(() => []);
    for (const entry of entries) {
      const stateFile = join(FACTORY, entry, "state.json");
      try {
        const info = await stat(join(FACTORY, entry));
        if (!info.isDirectory()) continue;
        const raw = await readFile(stateFile, "utf-8");
        const state: ProjectState = JSON.parse(raw);

        // Try to read one-pager summary
        let onePager: string | undefined;
        try {
          const op = await readFile(join(FACTORY, entry, "one-pager.md"), "utf-8");
          onePager = op.slice(0, 2000);
        } catch { /* no one-pager yet */ }

        // Try to read KPI data for shipped apps
        let kpis: KPIData | undefined;
        try {
          const kpiRaw = await readFile(join(FACTORY, entry, "kpis.json"), "utf-8");
          kpis = JSON.parse(kpiRaw);
        } catch { /* no kpis yet */ }

        // Try to read E2E test results
        let e2eResults: { status: string; tests: number; passed: number; failed: number } | undefined;
        try {
          const e2eRaw = await readFile(join(FACTORY, entry, "e2e-results.json"), "utf-8");
          e2eResults = JSON.parse(e2eRaw);
        } catch { /* no e2e results yet */ }

        projects.push({ ...state, onePager, kpis, e2eResults });
      } catch { /* skip non-project dirs or missing state */ }
    }

    // Read idea queue
    let ideaQueue: IdeaQueue = { queue: [], shipped: [], rejected: [] };
    try {
      const raw = await readFile(join(FACTORY, "idea-queue.json"), "utf-8");
      ideaQueue = JSON.parse(raw);
    } catch { /* empty queue */ }

    // Read factory config
    let config = { max_active_projects: 3, quality_gate_threshold: 8 };
    try {
      const raw = await readFile(join(FACTORY, "factory-config.json"), "utf-8");
      config = JSON.parse(raw);
    } catch { /* defaults */ }

    // Compute stats
    const building = projects.filter((p) =>
      ["research", "validation", "build", "quality-gate", "monetization", "packaging"].includes(p.status)
    ).length;
    const shipping = projects.filter((p) => p.status === "shipping").length;
    const shipped = projects.filter((p) => p.status === "shipped").length + ideaQueue.shipped.length;
    const attention = projects.filter((p) =>
      p.status === "needs-review" || p.status === "awaiting-approval" || (p.phases.quality_gate?.attempt ?? 0) >= 2
    ).length;
    const queued = ideaQueue.queue.length;

    // Read recent pulses for live activity
    const today = new Date().toISOString().slice(0, 10);
    let allPulses: PulseEvent[] = [];
    try {
      const raw = await readFile(join(PULSES_DIR, `${today}.jsonl`), "utf-8");
      allPulses = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch { /* no pulses today */ }

    // Filter to factory-related pulses (goal contains "factory:" or action starts with "factory")
    const factoryPulses = allPulses
      .filter((p) => p.goal?.includes("factory:") || p.action?.startsWith("factory"))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Build per-slug activity map: most recent pulse per project
    const slugActivity: Record<string, PulseEvent> = {};
    for (const pulse of factoryPulses) {
      const match = pulse.goal?.match(/factory:(\S+)/);
      if (match && !slugActivity[match[1]]) {
        slugActivity[match[1]] = pulse;
      }
    }

    // Enrich projects with computed phase index + KPI summary
    const enriched = projects.map((p) => {
      const currentPhaseIdx = PHASE_ORDER.indexOf(
        p.status.replace("-", "_")
      );
      const completedPhases = PHASE_ORDER.filter(
        (ph) => p.phases[ph]?.status === "complete"
      ).length;

      // Extract latest KPI snapshot for dashboard display
      const latestKPI = p.kpis?.snapshots?.length
        ? p.kpis.snapshots[p.kpis.snapshots.length - 1]
        : null;
      const prevKPI = p.kpis?.snapshots && p.kpis.snapshots.length >= 2
        ? p.kpis.snapshots[p.kpis.snapshots.length - 2]
        : null;

      // Attach latest activity for this project
      const lastActivity = slugActivity[p.slug] ?? null;

      return {
        ...p,
        currentPhaseIdx: currentPhaseIdx >= 0 ? currentPhaseIdx : 0,
        completedPhases,
        totalPhases: PHASE_ORDER.length,
        qualityScore: p.phases.quality_gate?.score ?? null,
        qualityAttempt: p.phases.quality_gate?.attempt ?? 0,
        latestKPI,
        prevKPI,
        activeSignals: p.kpis?.signals?.length ?? 0,
        shipDate: p.kpis?.ship_date ?? null,
        lastActivity,
      };
    });

    // Check if any factory-loop process is actually running
    let loopRunning = false;
    try {
      const ps = execSync("pgrep -f 'factory-loop.sh' 2>/dev/null || true", { encoding: "utf-8" });
      loopRunning = ps.trim().length > 0;
    } catch { /* no process */ }

    // Last pulse timestamp
    const lastPulseAt = factoryPulses.length > 0 ? factoryPulses[0].timestamp : null;

    // Recent factory activity feed (last 10 events)
    const activityFeed = factoryPulses.slice(0, 10).map((p) => ({
      agent: p.agent,
      action: p.action,
      goal: p.goal,
      outcome: p.outcome,
      timestamp: p.timestamp,
      duration_ms: p.duration_ms,
      model: p.model ?? "unknown",
    }));

    return NextResponse.json({
      projects: enriched,
      ideaQueue,
      config,
      stats: { building, shipping, shipped, queued, attention },
      phaseLabels: PHASE_ORDER.map((p) => p.replace("_", " ")),
      activityFeed,
      loopRunning,
      lastPulseAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
