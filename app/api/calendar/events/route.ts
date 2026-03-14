import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { OPS, CALENDAR_EVENTS_JSON, FACTORY_DIR } from "../../../lib/paths";

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────

export type EventCategory =
  | "factory"
  | "signals"
  | "distribution"
  | "seo"
  | "system"
  | "task"
  | "milestone";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM 24h
  endTime?: string;
  category: EventCategory;
  color: string;
  allDay?: boolean;
  count?: number;
  description?: string;
  source: "cron" | "launchagent" | "task" | "milestone";
  enabled?: boolean;
}

// ── Category colours ───────────────────────────────────────────────

const CATEGORY_COLORS: Record<EventCategory, string> = {
  factory: "#76875A",
  signals: "#9899C1",
  distribution: "#BC6143",
  seo: "#C9A227",
  system: "#8B8078",
  task: "#2A2927",
  milestone: "#BC6143",
};

const CRON_CATEGORY_MAP: Record<string, EventCategory> = {
  "factory-tick": "factory",
  "idea-triage": "factory",
  "kpi-ingest": "factory",
  "cross-app-learner": "factory",
  "market-learning": "factory",
  "synthesis-bridge": "factory",
  "lake-to-ideas": "factory",
  "kwe": "signals",
  "reddit-pain-scanner": "signals",
  "tiktok-trend-scout": "signals",
  "app-store-review-miner": "signals",
  "reddit-app-seeker": "signals",
  "saas-review-miner": "signals",
  "job-ad-jtbd": "signals",
  "distribution-tick": "distribution",
  "tiktok-post-morning": "distribution",
  "tiktok-post-afternoon": "distribution",
  "tiktok-post-evening": "distribution",
  "reddit-engage": "distribution",
  "seo-content-gen": "seo",
  "qmd-reindex": "system",
  "signal-crossvalidate": "signals",
  "nightly-research": "signals",
  "research-top3": "signals",
  "tech-intel": "signals",
  "zero-to-mrr": "distribution",
  "morning-brief": "system",
  "evening-brief": "system",
  "governance-review": "system",
  "security-posture": "system",
  "memory-hygiene": "system",
  "self-improvement": "system",
  "skill-crystallization": "system",
  "nightly-improvement": "system",
};

function getCronCategory(name: string): EventCategory {
  const lower = name.toLowerCase();
  for (const [key, cat] of Object.entries(CRON_CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  if (lower.includes("tiktok")) return "distribution";
  if (lower.includes("reddit")) return "signals";
  if (lower.includes("factory") || lower.includes("idea")) return "factory";
  if (lower.includes("seo") || lower.includes("content")) return "seo";
  return "system";
}

// ── Cron expression parser ─────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  const result = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [base, step] = part.split("/");
      const start = base === "*" ? min : parseInt(base);
      const stepNum = parseInt(step);
      for (let i = start; i <= max; i += stepNum) result.add(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      for (let i = s; i <= e; i++) result.add(i);
    } else {
      const n = parseInt(part);
      if (!isNaN(n)) result.add(n);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cronOccurrences(
  expr: string,
  from: Date,
  to: Date
): { date: string; time: string }[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return [];
  const [minField, hourField, , , dowField] = parts;

  const minutes = parseCronField(minField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const dows = parseCronField(dowField, 0, 6); // 0=Sunday

  const results: { date: string; time: string }[] = [];
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const dow = current.getDay();
    if (dowField === "*" || dows.includes(dow)) {
      for (const h of hours) {
        for (const m of minutes) {
          const occ = new Date(current);
          occ.setHours(h, m, 0, 0);
          if (occ >= from && occ <= end) {
            results.push({
              date: localDateKey(current),
              time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
            });
          }
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return results;
}

// ── Hardcoded macOS LaunchAgent jobs ──────────────────────────────

interface LaunchAgentJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule:
    | { kind: "cron"; expr: string }
    | { kind: "interval"; everyMs: number };
}

const LAUNCHAGENT_JOBS: LaunchAgentJob[] = [
  {
    id: "la-synthesis-bridge",
    name: "synthesis-bridge",
    enabled: true,
    schedule: { kind: "cron", expr: "15 2 * * *" },
  },
  {
    id: "la-lake-to-ideas",
    name: "lake-to-ideas",
    enabled: true,
    schedule: { kind: "cron", expr: "30 2 * * *" },
  },
  {
    id: "la-idea-triage",
    name: "idea-triage",
    enabled: true,
    schedule: { kind: "interval", everyMs: 21_600_000 }, // 6h
  },
];

// ── OpenClaw cron interface ────────────────────────────────────────

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; everyMs?: number; tz?: string };
  state: { nextRunAtMs?: number };
}

// ── Event generator ───────────────────────────────────────────────

function msToRunsPerDay(ms: number): number {
  return Math.max(1, Math.round(86_400_000 / ms));
}

function generateCronEvents(
  job: { id: string; name: string; enabled: boolean; schedule: { kind: string; expr?: string; everyMs?: number } },
  from: Date,
  to: Date,
  source: "cron" | "launchagent"
): CalendarEvent[] {
  if (!job.enabled) return [];

  const category = getCronCategory(job.name);
  const color = CATEGORY_COLORS[category];
  const { schedule } = job;
  const events: CalendarEvent[] = [];

  if (schedule.kind === "interval" && schedule.everyMs) {
    const runsPerDay = msToRunsPerDay(schedule.everyMs);
    const current = new Date(from);
    current.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (current <= end) {
      events.push({
        id: `${job.id}-${localDateKey(current)}`,
        title: job.name,
        date: localDateKey(current),
        category,
        color,
        allDay: true,
        count: runsPerDay,
        source,
        enabled: job.enabled,
      });
      current.setDate(current.getDate() + 1);
    }
    return events;
  }

  if (schedule.kind === "cron" && schedule.expr) {
    const occurrences = cronOccurrences(schedule.expr, from, to);

    // Group by date
    const byDate: Record<string, typeof occurrences> = {};
    for (const occ of occurrences) {
      if (!byDate[occ.date]) byDate[occ.date] = [];
      byDate[occ.date].push(occ);
    }

    for (const [date, occs] of Object.entries(byDate)) {
      if (occs.length > 4) {
        // Consolidate high-frequency day
        events.push({
          id: `${job.id}-${date}`,
          title: job.name,
          date,
          category,
          color,
          allDay: true,
          count: occs.length,
          source,
          enabled: job.enabled,
        });
      } else {
        for (const occ of occs) {
          events.push({
            id: `${job.id}-${occ.date}-${occ.time.replace(":", "")}`,
            title: job.name,
            date: occ.date,
            time: occ.time,
            category,
            color,
            allDay: false,
            source,
            enabled: job.enabled,
          });
        }
      }
    }
    return events;
  }

  return events;
}

// ── Factory milestones ─────────────────────────────────────────────

function getFactoryMilestones(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  if (!existsSync(FACTORY_DIR)) return events;
  try {
    const entries = readdirSync(FACTORY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const slug of entries) {
      const stateFile = join(FACTORY_DIR, slug, "state.json");
      if (!existsSync(stateFile)) continue;
      try {
        const state = JSON.parse(readFileSync(stateFile, "utf-8"));
        const name = state.name || slug;

        // Phase completion milestones
        if (state.phases) {
          for (const [phase, data] of Object.entries(
            state.phases as Record<string, { completed_at?: string; status?: string }>
          )) {
            if (data.completed_at) {
              const d = new Date(data.completed_at);
              events.push({
                id: `factory-${slug}-${phase}`,
                title: `${name}: ${phase} done`,
                date: localDateKey(d),
                category: "milestone",
                color: CATEGORY_COLORS.milestone,
                source: "milestone",
                description: `Phase ${phase} completed for ${name}`,
              });
            }
          }
        }

        // Current notable status
        if (state.status === "awaiting-approval") {
          events.push({
            id: `factory-${slug}-approval`,
            title: `${name}: awaiting approval`,
            date: new Date().toISOString().slice(0, 10),
            category: "milestone",
            color: CATEGORY_COLORS.milestone,
            source: "milestone",
            description: `${name} is ready for approval`,
          });
        } else if (state.status === "shipped") {
          events.push({
            id: `factory-${slug}-shipped`,
            title: `${name}: in App Store`,
            date: new Date().toISOString().slice(0, 10),
            category: "milestone",
            color: CATEGORY_COLORS.milestone,
            source: "milestone",
            description: `${name} is live in the App Store`,
          });
        }
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* skip */
  }
  return events;
}

// ── Custom tasks ───────────────────────────────────────────────────

function getCustomTasks(from: Date, to: Date): CalendarEvent[] {
  if (!existsSync(CALENDAR_EVENTS_JSON)) return [];
  try {
    const tasks = JSON.parse(
      readFileSync(CALENDAR_EVENTS_JSON, "utf-8")
    ) as CalendarEvent[];
    if (!Array.isArray(tasks)) return [];
    return tasks.filter((t) => {
      if (!t.date) return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= from && d <= to;
    });
  } catch {
    return [];
  }
}

// ── Main handler ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromStr =
    searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const toStr = searchParams.get("to") || fromStr;

  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T23:59:59");

  // 1. Fetch openclaw cron jobs
  let cronJobs: CronJob[] = [];
  try {
    const { stdout } = await execFileAsync(
      "/opt/homebrew/bin/openclaw",
      ["cron", "list", "--json"],
      { timeout: 15_000 }
    );
    const data = JSON.parse(stdout);
    cronJobs = (data.jobs ?? []) as CronJob[];
  } catch {
    /* proceed with empty */
  }

  // 2. Deduplicate: if a job name matches a LaunchAgent, skip the openclaw version
  const laNames = new Set(LAUNCHAGENT_JOBS.map((j) => j.name));
  const filteredCrons = cronJobs.filter(
    (j) => !laNames.has(j.name.toLowerCase())
  );

  // 3. Generate events
  const cronEvents = filteredCrons.flatMap((job) =>
    generateCronEvents(job, from, to, "cron")
  );
  const laEvents = LAUNCHAGENT_JOBS.flatMap((job) =>
    generateCronEvents(job as unknown as CronJob, from, to, "launchagent")
  );

  // 4. Factory milestones (not date-filtered — they're sparse, just include all)
  const milestones = getFactoryMilestones();

  // 5. Custom tasks
  const tasks = getCustomTasks(from, to);

  // 6. Merge and sort
  const all = [...cronEvents, ...laEvents, ...milestones, ...tasks].sort(
    (a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    }
  );

  return NextResponse.json(all);
}
