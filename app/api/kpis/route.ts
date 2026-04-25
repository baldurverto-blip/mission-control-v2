import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import {
  INBOX_MD,
  RESEARCH,
  FAILURES_DIR,
  SKILLS_DIR,
  TASKS_JSON,
} from "@/app/lib/paths";
import { getWeekNumber } from "@/app/lib/helpers";
import { getCronList } from "@/app/lib/openclaw-cache";

async function countFiles(dir: string): Promise<number> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function recentFailures(): Promise<number> {
  try {
    const files = await readdir(FAILURES_DIR);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const f of files) {
      const fstat = await stat(join(FAILURES_DIR, f));
      if (fstat.mtimeMs > weekAgo) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

async function getScoutScore(): Promise<number> {
  try {
    const files = await readdir(RESEARCH);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();
    if (mdFiles.length === 0) return 0;

    const content = await readFile(join(RESEARCH, mdFiles[0]), "utf-8");
    const buildMatches = content.match(/\bBUILD\b/g) ?? [];
    const researchMatches = content.match(/\bRESEARCH\b/g) ?? [];
    return buildMatches.length + researchMatches.length;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const WORKFLOW_STATE = join(
      process.env.HOME ?? "/Users/baldurclaw",
      "verto-workspace/ops/workflow-state.json"
    );

    const [tasksContent, inboxContent, cronResult, researchCount, failureCount, skillsCount, scoutScore, workflowState] =
      await Promise.all([
        readFile(TASKS_JSON, "utf-8").catch(() => "[]"),
        readFile(INBOX_MD, "utf-8").catch(() => ""),
        getCronList().catch(() => ({ jobs: [], raw: '{"jobs":[]}' })),
        countFiles(RESEARCH),
        recentFailures(),
        countFiles(SKILLS_DIR),
        getScoutScore(),
        readFile(WORKFLOW_STATE, "utf-8").catch(() => '{"stats":{}}'),
      ]);

    let tasks: Array<{ status?: string }> = [];
    try {
      const parsed = JSON.parse(tasksContent);
      tasks = Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
    } catch {
      tasks = [];
    }

    const inboxOpen = (inboxContent.match(/^\s*-\s*\[ \]/gm) ?? []).length;
    const taskDone = tasks.filter((task) => task.status === "done").length;
    const taskOpen = tasks.length > 0
      ? tasks.filter((task) => task.status && task.status !== "done").length
      : inboxOpen;

    const cronJobs = cronResult.jobs ?? [];
    const cronTotal = cronJobs.length;
    const cronHealthy = cronJobs.filter(
      (j: { enabled: boolean; state?: { lastRunStatus?: string } }) =>
        j.enabled && j.state?.lastRunStatus === "ok"
    ).length;

    const heartbeat = cronJobs.find(
      (j: { name: string }) => j.name === "heartbeat"
    );
    const heartbeatAge = heartbeat?.state?.lastRunAtMs
      ? Date.now() - heartbeat.state.lastRunAtMs
      : null;

    const now = new Date();
    const weekNum = getWeekNumber(now);
    const dayOfWeek = now.getDay() || 7;

    let daysSinceFailure: number | null = null;
    if (failureCount === 0) {
      daysSinceFailure = 7;
    } else {
      try {
        const files = await readdir(FAILURES_DIR);
        const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();
        if (mdFiles.length > 0) {
          const fstat = await stat(join(FAILURES_DIR, mdFiles[0]));
          daysSinceFailure = Math.floor(
            (Date.now() - fstat.mtimeMs) / 86_400_000
          );
        }
      } catch {
        daysSinceFailure = null;
      }
    }

    const wfState = JSON.parse(workflowState);
    const wfStats = wfState.stats ?? {};
    const wfActive = (wfState.active ?? []).length;
    const wfApproval = wfStats.approvalsPending ?? 0;

    return NextResponse.json({
      roadmap: { done: taskDone, total: Math.max(tasks.length, 1) },
      taskboard: { open: taskOpen, done: taskDone, total: tasks.length > 0 ? tasks.length : inboxOpen, source: tasks.length > 0 ? "ops/tasks.json" : "brain/INBOX.md (fallback)" },
      week: { number: weekNum, day: dayOfWeek },
      cron: { healthy: cronHealthy, total: cronTotal, heartbeatAgeMs: heartbeatAge },
      inbox: { open: inboxOpen, role: "parking_lot", source: "brain/INBOX.md" },
      research: { count: researchCount, scoutScore },
      failures: { recent: failureCount, daysSince: daysSinceFailure },
      skills: { count: skillsCount },
      workflows: { active: wfActive, approvalPending: wfApproval, completedToday: wfStats.completedToday ?? 0, totalRuns: wfStats.totalRuns ?? 0 },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to compute KPIs", detail: String(err) },
      { status: 500 }
    );
  }
}
