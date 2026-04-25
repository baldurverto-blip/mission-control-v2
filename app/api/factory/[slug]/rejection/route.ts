import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { join } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const REJECTION_SCRIPT = join(HOME, "verto-workspace/tools/factory-apple-rejection.sh");
const LOG_DIR = join(HOME, "verto-workspace/logs");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const FACTORY = await resolveFactoryDir(slug);
    const stateFile = join(FACTORY, slug, "state.json");

    const body = await request.json();
    const { action, guideline, message } = body as {
      action: "initiate";
      guideline?: string;
      message?: string;
    };

    if (action !== "initiate") {
      return NextResponse.json({ error: "Invalid action — expected 'initiate'" }, { status: 400 });
    }

    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);

    // Validate: only submitted/in_review or shipped apps can be flagged as rejected
    const REJECTION_ALLOWED = ["submitted", "in_review", "shipped", "rejected_fixing"];
    if (!REJECTION_ALLOWED.includes(state.status)) {
      return NextResponse.json(
        { error: `Cannot initiate rejection for status '${state.status}'. Expected 'submitted', 'in_review', or 'shipped'.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Ensure phases.shipping exists
    if (!state.phases) state.phases = {};
    if (!state.phases.shipping) state.phases.shipping = {};
    if (!Array.isArray(state.phases.shipping.rejections)) {
      state.phases.shipping.rejections = [];
    }

    // Append rejection entry
    state.phases.shipping.rejections.push({
      rejected_at: now,
      guideline: guideline ?? "unknown",
      reason: message ?? "",
    });

    // Set rework state
    state.status = "rejected_fixing";
    state.phases.shipping.apple_rework = {
      initiated_at: now,
      guideline: guideline ?? null,
      message: message ?? null,
      checklist_status: "pending",
    };
    state.updated_at = now;

    await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

    // Spawn rework script detached
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.CLAUDECODE;

    const logFile = join(LOG_DIR, `factory-rejection-${slug}-${Date.now()}.log`);

    const child = spawn(
      "bash",
      [REJECTION_SCRIPT, slug],
      {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env,
        cwd: join(HOME, "verto-workspace"),
      }
    );

    const { createWriteStream } = await import("fs");
    const logStream = createWriteStream(logFile, { flags: "a" });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.unref();

    return NextResponse.json({
      status: "initiated",
      message: `Rejection rework started for ${slug}. Guideline: ${guideline ?? "pending analysis"}.`,
      pid: child.pid,
      log: logFile,
    });
  } catch (err) {
    console.error("Rejection route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const FACTORY = await resolveFactoryDir(slug);
    const stateFile = join(FACTORY, slug, "state.json");

    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);

    const shipping = state.phases?.shipping ?? {};
    const appleRework = shipping.apple_rework ?? null;
    const rejections = shipping.rejections ?? [];

    // Read fix plan summary if it exists
    let fixPlanSummary: string | null = null;
    if (appleRework?.fix_plan) {
      try {
        const planPath = join(HOME, "verto-workspace", appleRework.fix_plan);
        const planContent = await readFile(planPath, "utf-8");
        fixPlanSummary = planContent.slice(0, 1000);
      } catch { /* fix plan not written yet */ }
    }

    return NextResponse.json({
      status: state.status,
      apple_rework: appleRework,
      rejections,
      fix_plan_summary: fixPlanSummary,
    });
  } catch (err) {
    console.error("Rejection GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
