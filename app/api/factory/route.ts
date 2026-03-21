import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const PHASE_AGREEMENTS_PATH = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/brain/templates/phase-agreements.json");

// Cache phase agreements (loaded once per request)
type PhaseAgreementsMap = Record<string, Record<string, { label: string; artifacts: { id: string; file: string; label: string }[] }>>;
let _phaseAgreementsCache: PhaseAgreementsMap | null = null;
async function loadPhaseAgreements(): Promise<PhaseAgreementsMap | null> {
  if (_phaseAgreementsCache) return _phaseAgreementsCache;
  try {
    const raw = await readFile(PHASE_AGREEMENTS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const result: PhaseAgreementsMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (!key.startsWith("_")) result[key] = val as PhaseAgreementsMap[string];
    }
    _phaseAgreementsCache = result;
    return result;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function buildDynamicAudit(
  slug: string,
  track: string,
  currentPhase: string,
  phaseAgreements: PhaseAgreementsMap,
): Promise<ArtifactAudit> {
  const trackAgreements = phaseAgreements[track];
  if (!trackAgreements) {
    return { slug, updated_at: new Date().toISOString(), phase: currentPhase, artifacts: {} };
  }
  const projectDir = join(FACTORY, slug);
  const artifacts: Record<string, ArtifactPhaseAudit> = {};
  for (const [phaseName, phaseDef] of Object.entries(trackAgreements)) {
    const required = phaseDef.artifacts.map((a) => a.file);
    const delivered: string[] = [];
    const missing: string[] = [];
    const labels: Record<string, string> = {};
    for (const art of phaseDef.artifacts) {
      labels[art.file] = art.label;
      if (await fileExists(join(projectDir, art.file))) {
        delivered.push(art.file);
      } else {
        missing.push(art.file);
      }
    }
    artifacts[phaseName] = { required, delivered, missing, labels };
  }
  return { slug, updated_at: new Date().toISOString(), phase: currentPhase, artifacts };
}

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
  reason?: string;
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

interface ArtifactPhaseAudit {
  required: string[];
  delivered: string[];
  missing: string[];
  labels?: Record<string, string>; // file → human label
}

interface ArtifactAudit {
  slug: string;
  updated_at: string;
  phase: string;
  phase_state?: string;
  artifacts: Record<string, ArtifactPhaseAudit>;
}

interface QGCRData {
  qgScore: number | null;       // e.g. 88 (normalised to /100) or 8.8 (if /10 scale)
  qgVerdict: string | null;     // "PASS" or "FAIL"
  crVerdict: string | null;     // "PASS" or "FAIL"
  crIssues: { critical: number; high: number } | null;
}

/** Parse quality-gate-report.md for score + verdict */
async function parseQGReport(projectDir: string): Promise<Pick<QGCRData, "qgScore" | "qgVerdict">> {
  try {
    const text = await readFile(join(projectDir, "quality-gate-report.md"), "utf-8");

    // Verdict: look for PASS or FAIL
    let qgVerdict: string | null = null;
    const verdictMatch = text.match(/Verdict[:\s]*\*{0,2}\s*(PASS|FAIL)/i);
    if (verdictMatch) qgVerdict = verdictMatch[1].toUpperCase();
    // Fallback: "### PASS" or "### FAIL"
    if (!qgVerdict) {
      const headingMatch = text.match(/^###?\s+(PASS|FAIL)/mi);
      if (headingMatch) qgVerdict = headingMatch[1].toUpperCase();
    }
    // Fallback: "Recommendation: PASS"
    if (!qgVerdict) {
      const recMatch = text.match(/Recommendation[:\s]*\*{0,2}\s*(PASS|FAIL)/i);
      if (recMatch) qgVerdict = recMatch[1].toUpperCase();
    }

    // Score: multiple formats
    let qgScore: number | null = null;
    // "Score: 89/100" or "Score:** 88/100" or "Score Achieved:** 88/100"
    const score100Match = text.match(/Score(?:\s+Achieved)?[:\s]*\*{0,2}\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
    if (score100Match) {
      qgScore = parseFloat(score100Match[1]);
    }
    // "FAIL (5.20/10)" or "Score: 8.2/10"
    if (qgScore === null) {
      const score10Match = text.match(/(?:Score|Verdict)[^)]*?(\d+(?:\.\d+)?)\s*\/\s*10(?:\)|\s|\*|$)/i);
      if (score10Match) {
        qgScore = parseFloat(score10Match[1]); // keep in /10 scale
      }
    }
    // "Weighted Average" row in table: "| **Weighted Average** | | | **5.20** |"
    if (qgScore === null) {
      const waMatch = text.match(/Weighted\s+Average[^|]*\|[^|]*\|[^|]*\|\s*\*{0,2}(\d+(?:\.\d+)?)\*{0,2}\s*\|/i);
      if (waMatch) {
        qgScore = parseFloat(waMatch[1]);
      }
    }
    // "### PASS — Score 88/100"
    if (qgScore === null) {
      const dashMatch = text.match(/(PASS|FAIL)\s*(?:—|-)\s*Score\s+(\d+(?:\.\d+)?)\s*\/\s*100/i);
      if (dashMatch) {
        qgScore = parseFloat(dashMatch[2]);
      }
    }

    return { qgScore, qgVerdict };
  } catch {
    return { qgScore: null, qgVerdict: null };
  }
}

/** Parse code-review-report.md for verdict + issue counts */
async function parseCRReport(projectDir: string): Promise<Pick<QGCRData, "crVerdict" | "crIssues">> {
  try {
    const text = await readFile(join(projectDir, "code-review-report.md"), "utf-8");

    // Verdict
    let crVerdict: string | null = null;
    const verdictMatch = text.match(/(?:Verdict|Recommendation)[:\s]*\*{0,2}\s*(PASS|FAIL)/i);
    if (verdictMatch) crVerdict = verdictMatch[1].toUpperCase();

    // Issue counts — only count OPEN (unfixed) critical/high issues
    let critical = 0;
    let high = 0;

    // If verdict is PASS, only look in "New Issues Found" section for open issues
    if (crVerdict === "PASS") {
      const newSection = text.match(/## New Issues Found[\s\S]*?(?=\n## [^N]|$)/i);
      if (newSection) {
        const critInNew = newSection[0].match(/### CRITICAL/gi);
        if (critInNew) critical = critInNew.length;
        const highInNew = newSection[0].match(/### HIGH/gi);
        if (highInNew) high = highInNew.length;
      }
    } else {
      // FAIL verdict — count all issues
      const critMatch = text.match(/(\d+)\s+CRITICAL/i);
      if (critMatch) critical = parseInt(critMatch[1]);
      const highMatch = text.match(/(\d+)\s+HIGH/i);
      if (highMatch) high = parseInt(highMatch[1]);

      // Also count ### CRITICAL section entries (table rows with C1, C2 etc.)
      if (critical === 0) {
        const critSection = text.match(/### CRITICAL[\s\S]*?(?=###\s|$)/i);
        if (critSection) {
          const rows = critSection[0].match(/\|\s*C\d+\s*\|/g);
          if (rows) critical = rows.length;
        }
      }
      if (high === 0) {
        const highSection = text.match(/### HIGH[\s\S]*?(?=###\s|$)/i);
        if (highSection) {
          const rows = highSection[0].match(/\|\s*H\d+\s*\|/g);
          if (rows) high = rows.length;
        }
      }
    }

    const crIssues = (critical > 0 || high > 0) ? { critical, high } : null;
    return { crVerdict, crIssues };
  } catch {
    return { crVerdict: null, crIssues: null };
  }
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
  queued_at?: string;
  status?: string;
  target_audience?: string;
  segment?: string;
  product_type?: string;
}

interface IdeaQueue {
  queue: IdeaQueueEntry[];
  shipped: IdeaQueueEntry[];
  rejected: IdeaQueueEntry[];
}

const MOBILE_PHASES = [
  "research", "validation", "design", "build", "code_review", "quality_gate",
  "monetization", "packaging", "shipping", "marketing", "promo",
];

const SAAS_PHASES = [
  "research", "validation", "design", "build", "code_review", "quality_gate",
  "monetization", "deploy", "marketing",
];

const ADVISORY_PHASES = [
  "discovery", "scoping", "pilot", "delivery", "ongoing",
];

function getPhasesForTrack(track: string): string[] {
  switch (track) {
    case "saas": return SAAS_PHASES;
    case "advisory": return ADVISORY_PHASES;
    default: return MOBILE_PHASES;
  }
}

// Default for backward compatibility
const PHASE_ORDER = MOBILE_PHASES;

export async function GET() {
  try {
    interface BuildPreview {
      stats?: { files?: number; lines?: number; screens?: number; tests?: number; services?: number };
      buildSummary?: string;
      designColors?: { primary?: string; surface?: string; accent?: string };
      designTone?: string;
      hasMascot?: boolean;
      screenList?: string[];
      testCommand?: string;
      projectDir?: string;
    }

    const projects: (ProjectState & { onePager?: string; displayName?: string; kpis?: KPIData; e2eResults?: { status: string; tests: number; passed: number; failed: number }; artifactAudit?: ArtifactAudit; buildPreview?: BuildPreview; qgReportScore?: number | null; qgVerdict?: string | null; crVerdict?: string | null; crIssues?: { critical: number; high: number } | null })[] = [];

    // Read all project state files
    const entries = await readdir(FACTORY).catch(() => []);
    for (const entry of entries) {
      const stateFile = join(FACTORY, entry, "state.json");
      try {
        const info = await stat(join(FACTORY, entry));
        if (!info.isDirectory()) continue;
        const raw = await readFile(stateFile, "utf-8");
        const state: ProjectState = JSON.parse(raw);

        // Display name priority: state.name > one-pager heading > slug
        let onePager: string | undefined;
        let displayName: string | undefined = state.name ?? undefined;
        try {
          const op = await readFile(join(FACTORY, entry, "one-pager.md"), "utf-8");
          onePager = op.slice(0, 2000);
          if (!displayName) {
            const firstHeading = op.split(/\r?\n/).find((line) => line.startsWith('# '));
            if (firstHeading) {
              displayName = firstHeading.replace(/^#\s+App One-Pager:\s*/i, '').trim();
            }
          }
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

        // Try to read artifact audit — fall back to dynamic generation from phase-agreements.json
        let artifactAudit: ArtifactAudit | undefined;
        try {
          const auditRaw = await readFile(join(FACTORY, entry, "artifact-audit.json"), "utf-8");
          artifactAudit = JSON.parse(auditRaw);
        } catch {
          // No manual audit file — dynamically build from phase-agreements.json
          const agreements = await loadPhaseAgreements();
          const effectiveTrack = state.track ?? "mobile";
          if (agreements && effectiveTrack) {
            artifactAudit = await buildDynamicAudit(entry, effectiveTrack, state.status, agreements);
          }
        }

        // Build preview for approval panel
        let buildPreview: BuildPreview | undefined;
        if (state.status === "awaiting-approval" || state.status === "shipped" || state.status === "quality-gate") {
          buildPreview = { projectDir: `~/projects/${entry}/` };

          // Build stats from state.json — support both nested (HyTrack) and flat (ChillLog) formats
          const buildPhase = state.phases?.build as unknown as Record<string, unknown> | undefined;
          if (buildPhase?.stats) {
            buildPreview.stats = buildPhase.stats as BuildPreview["stats"];
          } else if (buildPhase?.files_created != null) {
            // Flat format: files_created, tests_passing ("112/112")
            const testsRaw = buildPhase.tests_passing as string | undefined;
            const testsPassed = testsRaw ? parseInt(testsRaw.split('/')[0]) : undefined;
            buildPreview.stats = {
              files: buildPhase.files_created as number,
              tests: testsPassed,
            };
          }

          // Build summary from build-log.md (first 3 lines after ## Summary)
          try {
            const buildLog = await readFile(join(FACTORY, entry, "build-log.md"), "utf-8");
            const summaryMatch = buildLog.match(/## Summary\n\n([\s\S]*?)(?=\n---|\n##)/);
            if (summaryMatch) buildPreview.buildSummary = summaryMatch[1].trim().slice(0, 300);
          } catch { /* no build log */ }

          // Design brief colors + mascot decision
          try {
            const designBrief = await readFile(join(FACTORY, entry, "design-brief.md"), "utf-8");
            // Extract primary color
            const primaryMatch = designBrief.match(/\| `primary`\s*\|\s*(#[0-9A-Fa-f]{6})/);
            const surfaceMatch = designBrief.match(/\| `surface`\s*\|\s*(#[0-9A-Fa-f]{6})/);
            buildPreview.designColors = {
              primary: primaryMatch?.[1],
              surface: surfaceMatch?.[1],
            };
            // Mascot
            const mascotMatch = designBrief.match(/\*\*Decision\*\*:\s*(YES|NO)/i);
            buildPreview.hasMascot = mascotMatch?.[1]?.toUpperCase() === "YES";
            // Tone
            const toneMatch = designBrief.match(/\*\*Voice\*\*:\s*"([^"]+)"/);
            if (toneMatch) buildPreview.designTone = toneMatch[1].slice(0, 100);
          } catch { /* no design brief */ }

          // Screen list from build log
          try {
            const buildLog = await readFile(join(FACTORY, entry, "build-log.md"), "utf-8");
            const screenMatches = buildLog.match(/app\/\(tabs\)\/(\w+)\.tsx/g);
            if (screenMatches) {
              buildPreview.screenList = [...new Set(screenMatches.map(s => s.replace("app/(tabs)/", "").replace(".tsx", "")))];
            }
          } catch { /* no build log */ }

          buildPreview.testCommand = `cd ~/projects/${entry} && npx expo start`;

          // Pre-approval test results
          try {
            const e2eRaw = await readFile(join(FACTORY, entry, "e2e-results.json"), "utf-8");
            const e2e = JSON.parse(e2eRaw);
            (buildPreview as Record<string, unknown>).e2eResults = e2e;
          } catch { /* not yet run */ }

          // Test credentials (for simulator sign-in instructions)
          try {
            const credsRaw = await readFile(join(FACTORY, entry, "test-credentials.json"), "utf-8");
            const creds = JSON.parse(credsRaw);
            (buildPreview as Record<string, unknown>).testCredentials = { email: creds.email };
          } catch { /* no test account yet */ }

          // PRD alignment report (L8)
          try {
            const alignRaw = await readFile(join(FACTORY, entry, "alignment-report.md"), "utf-8");
            (buildPreview as Record<string, unknown>).alignmentReport = alignRaw.slice(0, 3000);
          } catch { /* not yet run */ }

          // Screenshot count (L8)
          try {
            const { readdir } = await import("fs/promises");
            const screenshotFiles = await readdir(join(FACTORY, entry, "screenshots")).catch(() => []);
            const pngCount = screenshotFiles.filter(f => f.endsWith(".png")).length;
            if (pngCount > 0) (buildPreview as Record<string, unknown>).screenshotCount = pngCount;
          } catch { /* no screenshots */ }
        }

        // Parse QG and CR reports for dashboard badges
        const projectDir = join(FACTORY, entry);
        const { qgScore: qgReportScore, qgVerdict } = await parseQGReport(projectDir);
        const { crVerdict, crIssues } = await parseCRReport(projectDir);

        projects.push({ ...state, onePager, displayName, kpis, e2eResults, artifactAudit, buildPreview, qgReportScore, qgVerdict, crVerdict, crIssues });
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

    // Merge rejected project folders into the rejected queue so UI reflects actual project state.
    const rejectedProjectEntries: IdeaQueueEntry[] = projects
      .filter((p) => p.status === "rejected")
      .map((p) => {
        const research = p.phases.research;
        return {
          slug: p.slug,
          title: p.displayName ?? p.slug.replace(/-/g, " "),
          tagline: p.failure_reason ?? research?.reason ?? "Rejected project",
          score: research?.score ?? 0,
          painkiller: false,
          source: "factory-project-state",
          status: "rejected",
          queued_at: p.updated_at,
        };
      });

    const rejectedBySlug = new Map<string, IdeaQueueEntry>();
    for (const entry of ideaQueue.rejected) rejectedBySlug.set(entry.slug, entry);
    for (const entry of rejectedProjectEntries) {
      rejectedBySlug.set(entry.slug, { ...entry, ...rejectedBySlug.get(entry.slug) });
    }
    ideaQueue.rejected = Array.from(rejectedBySlug.values()).sort((a, b) =>
      new Date(b.queued_at ?? 0).getTime() - new Date(a.queued_at ?? 0).getTime()
    );

    // Compute stats
    const building = projects.filter((p) =>
      ["research", "validation", "design", "build", "quality-gate", "monetization", "packaging"].includes(p.status)
    ).length;
    const shipping = projects.filter((p) => p.status === "shipping").length;
    const shipped = projects.filter((p) => p.status === "shipped" || p.status === "submitted").length + ideaQueue.shipped.length;
    const attention = projects.filter((p) =>
      p.status === "needs-review" || p.status === "awaiting-approval" || (p.phases.quality_gate?.attempt ?? 0) >= 2
    ).length;
    const queued = ideaQueue.queue.length;

    // Read recent pulses for live activity (last 3 days for continuity)
    const allPulses: PulseEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      try {
        const raw = await readFile(join(PULSES_DIR, `${date}.jsonl`), "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          try { allPulses.push(JSON.parse(line)); } catch { /* skip malformed line */ }
        }
      } catch { /* no pulses for this date */ }
    }

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

    // Statuses where the project is fully done (no "current" dot)
    const TERMINAL_STATUSES = ["shipped", "rejected", "paused"];

    // Enrich projects with computed phase index + KPI summary
    const enriched = projects.map((p) => {
      // Read track from state for track-aware phase calculation
      const track = (p as any).track ?? "mobile";
      const trackPhases = getPhasesForTrack(track);
      const completedPhases = trackPhases.filter(
        (ph) => p.phases[ph]?.status === "complete"
      ).length;
      // Derive current phase from actual phase data, not top-level status
      // "submitted" means app is in review but distribution phases (marketing/promo) may still be active
      const isTerminal = TERMINAL_STATUSES.includes(p.status);
      const nextIncompleteIdx = trackPhases.findIndex((ph) => p.phases[ph]?.status !== "complete");
      const currentPhaseIdx = isTerminal
        ? -1  // fully done
        : nextIncompleteIdx === -1 ? -1 : nextIncompleteIdx;

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
        track,
        trackPhases,
        currentPhaseIdx,  // -1 = terminal (no active phase), 0+ = active phase index
        completedPhases,
        totalPhases: trackPhases.length,
        qualityScore: p.phases.quality_gate?.score ?? null,
        qualityAttempt: p.phases.quality_gate?.attempt ?? 0,
        latestKPI,
        prevKPI,
        activeSignals: p.kpis?.signals?.length ?? 0,
        shipDate: p.kpis?.ship_date ?? null,
        lastActivity,
        artifactAudit: p.artifactAudit ?? null,
        displayName: (p as typeof p & { displayName?: string }).displayName ?? null,
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
      projects: enriched.filter((p) => p.status !== "rejected"),
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
