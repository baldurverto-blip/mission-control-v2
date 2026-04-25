import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { join } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const ACCEPTANCE_SCRIPT = join(HOME, "verto-workspace/tools/factory-apple-acceptance.sh");
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
    const { action } = body as { action: "approve" };

    if (action !== "approve") {
      return NextResponse.json({ error: "Invalid action — expected 'approve'" }, { status: 400 });
    }

    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);

    const APPROVABLE = ["submitted", "in_review", "rejected_fixing"];
    if (!APPROVABLE.includes(state.status)) {
      return NextResponse.json(
        { error: `Cannot approve from status '${state.status}'. Expected 'submitted', 'in_review', or 'rejected_fixing'.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    state.status = "shipped";
    state.apple_accepted_at = now;
    state.asc_status = "ready_for_distribution";
    state.updated_at = now;

    // Mark shipping phase as complete
    if (!state.phases) state.phases = {};
    if (!state.phases.shipping) state.phases.shipping = {};
    state.phases.shipping.status = "complete";
    state.phases.shipping.apple_accepted_at = now;

    await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

    // Spawn post-acceptance pipeline detached
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.CLAUDECODE;

    const logFile = join(LOG_DIR, `factory-acceptance-${slug}-${Date.now()}.log`);

    const child = spawn(
      "bash",
      [ACCEPTANCE_SCRIPT, slug],
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
      status: "approved",
      message: `${state.name ?? slug} approved by Apple! Post-acceptance pipeline started.`,
      pid: child.pid,
      log: logFile,
    });
  } catch (err) {
    console.error("Apple approve route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
