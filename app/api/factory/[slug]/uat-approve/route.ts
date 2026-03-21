import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { join } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

const FACTORY_LOOP = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/tools/factory-loop.sh");
const LOG_DIR = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/logs");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const FACTORY = await resolveFactoryDir(slug);

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const body = await request.json();
    const { action, feedback } = body as {
      action: "approve" | "reject";
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
    if (!state.phases.uat) state.phases.uat = {};

    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.CLAUDECODE;

    if (action === "approve") {
      state.status = "monetization";
      state.phases.uat.status = "complete";
      state.phases.uat.approved_at = now;
      state.phases.uat.tester = "mads";
      state.updated_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      const logFile = join(LOG_DIR, `factory-uat-${slug}-${Date.now()}.log`);

      const child = spawn(
        "bash",
        [FACTORY_LOOP, slug, "monetization"],
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
        message: "UAT approved. Proceeding to monetization.",
        pid: child.pid,
      });
    } else {
      // Reject — bounce back to build with UAT feedback
      state.status = "build";
      state.phases.uat.status = "rejected";
      state.phases.uat.rejected_at = now;
      state.phases.build.status = "pending";
      state.phases.code_review.status = "pending";
      state.phases.quality_gate.status = "pending";
      state.updated_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      // Write UAT feedback as rework-brief so builder knows what to fix
      if (feedback) {
        const reworkPath = join(FACTORY, slug, "rework-brief.md");
        const reworkContent = `# Rework Brief — UAT Rejection by Mads

> ${now}

## What needs to change

${feedback}

## Rules
- Fix ONLY the issues Mads identified above
- Do not refactor or rebuild — targeted fixes only
- Run \`npx tsc --noEmit\` after fixes
`;
        await writeFile(reworkPath, reworkContent);
      }

      return NextResponse.json({
        status: "rejected",
        message: "UAT rejected. Bouncing back to build with feedback.",
      });
    }
  } catch (err) {
    console.error("UAT approve error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
