import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; everyMs?: number; tz?: string };
  state: {
    lastRunStatus?: string;
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastDurationMs?: number;
    consecutiveErrors?: number;
  };
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync("/opt/homebrew/bin/openclaw", ["cron", "list", "--json"], {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const data = JSON.parse(stdout);
    const jobs: CronJob[] = (data.jobs ?? []).map(
      (j: Record<string, unknown>) => ({
        id: j.id,
        name: j.name,
        agentId: j.agentId,
        enabled: j.enabled,
        schedule: j.schedule,
        state: j.state ?? {},
      })
    );

    const healthy = jobs.filter(
      (j) => j.enabled && j.state.lastRunStatus === "ok"
    ).length;

    return NextResponse.json({
      jobs,
      total: jobs.length,
      healthy,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to run openclaw cron list", detail: String(err) },
      { status: 500 }
    );
  }
}
