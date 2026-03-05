import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const WS = process.env.HOME + "/verto-workspace";
const STATE_FILE = join(WS, "ops/workflow-state.json");
const WORKFLOWS_DIR = join(WS, "workflows");

interface WorkflowDef {
  name: string;
  file: string;
  steps: string[];
}

export async function GET() {
  try {
    // Read workflow state
    let state = {
      active: [] as Record<string, unknown>[],
      completed: [] as Record<string, unknown>[],
      blocked: [] as Record<string, unknown>[],
      stats: {
        totalRuns: 0,
        completedToday: 0,
        approvalsPending: 0,
        avgCycleTimeMs: 0,
      },
    };
    try {
      const raw = await readFile(STATE_FILE, "utf-8");
      state = JSON.parse(raw);
    } catch {
      /* no state file yet */
    }

    // Read workflow definitions to get step names
    const definitions: WorkflowDef[] = [];
    try {
      const files = await readdir(WORKFLOWS_DIR);
      for (const f of files.filter((f) => f.endsWith(".lobster.yml"))) {
        const content = await readFile(join(WORKFLOWS_DIR, f), "utf-8");
        const nameMatch = content.match(/^name:\s*(.+)/m);
        const steps: string[] = [];
        // Extract step IDs from "  - id: <name>" lines
        for (const m of content.matchAll(/^\s+-\s+id:\s*(\S+)/gm)) {
          steps.push(m[1]);
        }
        definitions.push({
          name: nameMatch?.[1]?.trim() ?? f.replace(".lobster.yml", ""),
          file: f,
          steps,
        });
      }
    } catch {
      /* no workflow files */
    }

    return NextResponse.json({
      state: {
        active: state.active ?? [],
        completed: (state.completed ?? []).slice(0, 10), // last 10
        blocked: state.blocked ?? [],
      },
      stats: state.stats ?? {},
      definitions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read workflow data", detail: String(err) },
      { status: 500 },
    );
  }
}
