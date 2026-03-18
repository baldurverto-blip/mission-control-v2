import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { join } from "path";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const FACTORY_LOOP = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/tools/factory-loop.sh");
const LOG_DIR = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/logs");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const body = await request.json();
    const { action, feedback } = body as {
      action: "approve" | "revise";
      feedback?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const stateFile = join(FACTORY, slug, "state.json");
    const raw = await readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);

    const now = new Date().toISOString();
    if (!state.phases) state.phases = {};
    if (!state.phases.design) state.phases.design = {};

    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.CLAUDECODE;

    if (action === "approve") {
      state.status = "build";
      state.phases.design.approved_at = now;
      state.phases.design.status = "complete";
      state.updated_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      const logFile = join(LOG_DIR, `factory-design-${slug}-${Date.now()}.log`);

      const child = spawn(
        "bash",
        [FACTORY_LOOP, slug, "build"],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env,
          cwd: join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace"),
        }
      );

      const { createWriteStream } = await import("fs");
      const logStream = createWriteStream(logFile, { flags: "a" });
      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      child.unref();

      return NextResponse.json({
        status: "approved",
        message: "Design approved. Build phase starting.",
        pid: child.pid,
        log: logFile,
      });
    } else {
      // revise
      state.status = "design";
      state.phases.design.status = "revision-requested";
      state.phases.design.revision_feedback = feedback ?? "";
      state.updated_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      if (feedback) {
        const notesPath = join(FACTORY, slug, "design-revision-notes.md");
        await writeFile(
          notesPath,
          `# Design Revision Notes\n\n_Requested at: ${now}_\n\n${feedback}\n`,
          "utf-8"
        );
      }

      const logFile = join(LOG_DIR, `factory-design-${slug}-${Date.now()}.log`);

      const child = spawn(
        "bash",
        [FACTORY_LOOP, slug, "design"],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env,
          cwd: join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace"),
        }
      );

      const { createWriteStream } = await import("fs");
      const logStream = createWriteStream(logFile, { flags: "a" });
      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      child.unref();

      return NextResponse.json({
        status: "revision-requested",
        message: "Revision requested. Design phase restarting.",
        pid: child.pid,
        log: logFile,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
