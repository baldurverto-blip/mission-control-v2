import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { join } from "path";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const FACTORY_LOOP = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/tools/factory-loop.sh");
const LOG_DIR = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/logs");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, action, reason } = body as {
      slug: string;
      action: "approve" | "reject";
      reason?: string;
    };

    if (!slug || !action) {
      return NextResponse.json({ error: "Missing slug or action" }, { status: 400 });
    }

    const stateFile = join(FACTORY, slug, "state.json");
    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);

    if (state.status !== "awaiting-approval") {
      return NextResponse.json(
        { error: `Project ${slug} is not awaiting approval (status: ${state.status})` },
        { status: 409 }
      );
    }

    if (action === "approve") {
      const now = new Date().toISOString();

      // Update state
      state.status = "shipping";
      state.approved_at = now;
      state.updated_at = now;
      if (!state.phases) state.phases = {};
      if (!state.phases.shipping) state.phases.shipping = {};
      state.phases.shipping.status = "in_progress";
      state.phases.shipping.approved_at = now;
      state.phases.shipping.started_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      // Launch factory loop as fully detached process so it outlives this request
      const logFile = join(LOG_DIR, `factory-ship-${slug}-${Date.now()}.log`);
      const env = { ...process.env } as NodeJS.ProcessEnv;
      delete env.CLAUDECODE;

      const child = spawn(
        "bash",
        [FACTORY_LOOP, slug, "shipping"],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env,
          cwd: join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace"),
        }
      );

      // Pipe output to log file asynchronously
      const { createWriteStream } = await import("fs");
      const logStream = createWriteStream(logFile, { flags: "a" });
      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      // Detach — process runs independently of this request
      child.unref();

      return NextResponse.json({
        status: "approved",
        slug,
        message: `${slug} approved for shipping. Factory loop started (pid: ${child.pid}). Log: ${logFile}`,
        pid: child.pid,
        log: logFile,
      });
    } else {
      // Reject
      const now = new Date().toISOString();
      state.status = "rejected";
      state.rejected_at = now;
      state.rejection_reason = reason ?? "Rejected by founder";
      state.updated_at = now;
      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      return NextResponse.json({
        status: "rejected",
        slug,
        message: `${slug} rejected. Reason: ${reason ?? "No reason given"}`,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
