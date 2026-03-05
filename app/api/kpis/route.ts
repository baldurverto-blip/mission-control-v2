import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  ROADMAP_MD,
  INBOX_MD,
  RESEARCH,
  FAILURES_DIR,
  SKILLS_DIR,
} from "@/app/lib/paths";
import { parseCheckboxes, getWeekNumber } from "@/app/lib/helpers";

const execFileAsync = promisify(execFile);

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

    const [roadmapContent, inboxContent, cronResult, researchCount, failureCount, skillsCount, scoutScore, workflowState] =
      await Promise.all([
        readFile(ROADMAP_MD, "utf-8").catch(() => ""),
        readFile(INBOX_MD, "utf-8").catch(() => ""),
        execFileAsync("/opt/homebrew/bin/openclaw", ["cron", "list", "--json"], {
          timeout: 15_000,
          maxBuffer: 2 * 1024 * 1024,
        }).catch(() => ({ stdout: '{"jobs":[]}' })),
        countFiles(RESEARCH),
        recentFailures(),
        countFiles(SKILLS_DIR),
        getScoutScore(),
        readFile(WORKFLOW_STATE, "utf-8").catch(() => '{"stats":{}}'),
      ]);

    // Roadmap
    const roadmap = parseCheckboxes(roadmapContent);

    // Inbox
    const inboxOpen = (inboxContent.match(/^-\s*\[ \]/gm) ?? []).length;

    // Cron health
    const cronData = JSON.parse(cronResult.stdout);
    const cronJobs = cronData.jobs ?? [];
    const cronTotal = cronJobs.length;
    const cronHealthy = cronJobs.filter(
      (j: { enabled: boolean; state?: { lastRunStatus?: string } }) =>
        j.enabled && j.state?.lastRunStatus === "ok"
    ).length;

    // Heartbeat age
    const heartbeat = cronJobs.find(
      (j: { name: string }) => j.name === "heartbeat"
    );
    const heartbeatAge = heartbeat?.state?.lastRunAtMs
      ? Date.now() - heartbeat.state.lastRunAtMs
      : null;

    // Week progress
    const now = new Date();
    const weekNum = getWeekNumber(now);
    const dayOfWeek = now.getDay() || 7;

    // Days since failure
    let daysSinceFailure: number | null = null;
    if (failureCount === 0) {
      daysSinceFailure = 7; // clean week
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

    // Workflow stats
    const wfState = JSON.parse(workflowState);
    const wfStats = wfState.stats ?? {};
    const wfActive = (wfState.active ?? []).length;
    const wfApproval = wfStats.approvalsPending ?? 0;

    return NextResponse.json({
      roadmap: { done: roadmap.done, total: roadmap.total },
      week: { number: weekNum, day: dayOfWeek },
      cron: { healthy: cronHealthy, total: cronTotal, heartbeatAgeMs: heartbeatAge },
      inbox: { open: inboxOpen },
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
