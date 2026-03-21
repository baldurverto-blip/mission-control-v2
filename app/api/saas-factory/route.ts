import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const FACTORY = join(HOME, "verto-workspace/ops/saas-factory");
const CONFIG_PATH = join(HOME, "verto-workspace/ops/factory/factory-config.json");
const PHASE_AGREEMENTS_PATH = join(HOME, "verto-workspace/brain/templates/phase-agreements.json");

// Phase sequence for SaaS track
const SAAS_PHASES = [
  "research", "validation", "design", "build", "code_review", "quality_gate",
  "monetization", "deploy", "marketing",
];

interface PhaseState {
  status: string;
  score?: number;
  attempt?: number;
  reason?: string;
  summary?: string;
  result?: string;
  completed_at?: string;
}

interface ProjectState {
  slug: string;
  name?: string | null;
  status: string;
  phase: number;
  phases: Record<string, PhaseState>;
  created_at: string;
  updated_at: string;
  failure_reason?: string | null;
  track?: string;
  product_type?: string;
}

interface IdeaQueueEntry {
  slug: string;
  title: string;
  tagline: string;
  score: number;
  painkiller: boolean;
  source: string;
  status?: string;
  segment?: string;
  product_type?: string;
  proposed_at?: string;
  queued_at?: string;
}

interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
  model?: string;
}

async function fileExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

// Phase agreements for artifact audit
type PhaseAgreementsMap = Record<string, Record<string, { label: string; artifacts: { id: string; file: string; label: string }[] }>>;
let _cache: PhaseAgreementsMap | null = null;
async function loadPhaseAgreements(): Promise<PhaseAgreementsMap | null> {
  if (_cache) return _cache;
  try {
    const raw = await readFile(PHASE_AGREEMENTS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const result: PhaseAgreementsMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (!key.startsWith("_")) result[key] = val as PhaseAgreementsMap[string];
    }
    _cache = result;
    return result;
  } catch { return null; }
}

export async function GET() {
  try {
    const projects: (ProjectState & {
      onePager?: string;
      displayName?: string;
      artifactAudit?: Record<string, unknown>;
      e2eResults?: { status: string; tests: number; passed: number; failed: number };
      buildPreview?: Record<string, unknown>;
    })[] = [];

    // Read all SaaS project state files
    const entries = await readdir(FACTORY).catch(() => []);
    for (const entry of entries) {
      const stateFile = join(FACTORY, entry, "state.json");
      try {
        const info = await stat(join(FACTORY, entry));
        if (!info.isDirectory()) continue;
        const raw = await readFile(stateFile, "utf-8");
        const state: ProjectState = JSON.parse(raw);

        let onePager: string | undefined;
        let displayName: string | undefined = state.name ?? undefined;
        try {
          const op = await readFile(join(FACTORY, entry, "one-pager.md"), "utf-8");
          onePager = op.slice(0, 5000);
          if (!displayName) {
            const firstHeading = op.split(/\r?\n/).find((line) => line.startsWith("# "));
            if (firstHeading) {
              displayName = firstHeading.replace(/^#\s+App One-Pager:\s*/i, "").trim();
            }
          }
        } catch { /* no one-pager */ }

        // E2E results
        let e2eResults: { status: string; tests: number; passed: number; failed: number } | undefined;
        try {
          const e2eRaw = await readFile(join(FACTORY, entry, "e2e-results.json"), "utf-8");
          e2eResults = JSON.parse(e2eRaw);
        } catch { /* no e2e */ }

        // Build preview (design colors, screen list, stats)
        let buildPreview: Record<string, unknown> | undefined;
        try {
          const designBrief = await readFile(join(FACTORY, entry, "design-brief.md"), "utf-8");
          const primaryMatch = designBrief.match(/\| `primary`\s*\|\s*(#[0-9A-Fa-f]{6})/);
          const surfaceMatch = designBrief.match(/\| `surface`\s*\|\s*(#[0-9A-Fa-f]{6})/);
          const mascotMatch = designBrief.match(/\*\*Decision\*\*:\s*(YES|NO)/i);
          const toneMatch = designBrief.match(/\*\*Voice\*\*:\s*"([^"]+)"/);
          buildPreview = {
            designColors: { primary: primaryMatch?.[1], surface: surfaceMatch?.[1] },
            hasMascot: mascotMatch?.[1]?.toUpperCase() === "YES",
            designTone: toneMatch?.[1]?.slice(0, 100),
            projectDir: `~/projects/${entry}/`,
          };
        } catch { /* no design brief */ }

        // Dynamic artifact audit
        let artifactAudit: Record<string, unknown> | undefined;
        const agreements = await loadPhaseAgreements();
        if (agreements?.saas) {
          const artifacts: Record<string, { required: string[]; delivered: string[]; missing: string[]; labels: Record<string, string> }> = {};
          for (const [phaseName, phaseDef] of Object.entries(agreements.saas)) {
            const required = phaseDef.artifacts.map((a) => a.file);
            const delivered: string[] = [];
            const missing: string[] = [];
            const labels: Record<string, string> = {};
            for (const art of phaseDef.artifacts) {
              labels[art.file] = art.label;
              if (await fileExists(join(FACTORY, entry, art.file))) {
                delivered.push(art.file);
              } else {
                missing.push(art.file);
              }
            }
            artifacts[phaseName] = { required, delivered, missing, labels };
          }
          artifactAudit = { slug: entry, phase: state.status, artifacts };
        }

        projects.push({ ...state, onePager, displayName, artifactAudit, e2eResults, buildPreview });
      } catch { /* skip */ }
    }

    // Read SaaS idea queue
    let ideaQueue: { queue: IdeaQueueEntry[]; shipped?: IdeaQueueEntry[]; rejected?: IdeaQueueEntry[] } = { queue: [] };
    try {
      const raw = await readFile(join(FACTORY, "idea-queue.json"), "utf-8");
      ideaQueue = JSON.parse(raw);
    } catch { /* empty */ }

    // Read B2B watchlist
    let watchlist: { signals: IdeaQueueEntry[]; count: number } = { signals: [], count: 0 };
    try {
      const raw = await readFile(join(FACTORY, "b2b-watchlist.json"), "utf-8");
      watchlist = JSON.parse(raw);
    } catch { /* empty */ }

    // Read config
    let config = { max_active_projects: 3, quality_gate_threshold: 8 };
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(raw);
    } catch { /* defaults */ }

    // Stats
    const TERMINAL = ["shipped", "rejected", "paused", "parked"];
    const active = projects.filter((p) => !TERMINAL.includes(p.status));
    const shipped = projects.filter((p) => p.status === "shipped");

    // Enrich with phase progress
    const enriched = projects.map((p) => {
      const completedPhases = SAAS_PHASES.filter(
        (ph) => p.phases[ph]?.status === "complete"
      ).length;
      const isTerminal = TERMINAL.includes(p.status);
      const nextIdx = SAAS_PHASES.findIndex((ph) => p.phases[ph]?.status !== "complete");
      const currentPhaseIdx = isTerminal ? -1 : nextIdx === -1 ? -1 : nextIdx;

      return {
        ...p,
        track: "saas",
        trackPhases: SAAS_PHASES,
        currentPhaseIdx,
        completedPhases,
        totalPhases: SAAS_PHASES.length,
        qualityScore: p.phases.quality_gate?.score ?? null,
        qualityAttempt: p.phases.quality_gate?.attempt ?? 0,
        displayName: p.displayName ?? p.name ?? p.slug,
      };
    });

    // Recent pulses (saas-factory related)
    const allPulses: PulseEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      try {
        const raw = await readFile(join(PULSES_DIR, `${date}.jsonl`), "utf-8");
        const parsed = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        allPulses.push(...parsed);
      } catch { /* no pulses */ }
    }
    const factoryPulses = allPulses
      .filter((p) => p.action?.includes("saas-factory") || p.goal?.includes("saas-factory"))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      projects: enriched.filter((p) => p.status !== "rejected"),
      ideaQueue,
      watchlist,
      config,
      stats: {
        active: active.length,
        shipped: shipped.length,
        queued: ideaQueue.queue.length,
        watching: watchlist.signals.length,
      },
      phaseLabels: SAAS_PHASES.map((p) => p.replace("_", " ")),
      activityFeed: factoryPulses.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
