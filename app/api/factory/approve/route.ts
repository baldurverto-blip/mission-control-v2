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
      // Reject → rework (never terminal: if the idea made it this far, the idea is good)
      const now = new Date().toISOString();

      // Write rework brief so Builder knows what to fix
      const reworkBriefPath = join(FACTORY, slug, "rework-brief.md");
      const reworkCount = (state.phases?.build?.rework_count ?? 0) + 1;
      const reworkBrief = [
        `# Rework Brief (founder rejection — attempt ${reworkCount})`,
        ``,
        `**Rejection reason:** ${reason ?? "Rejected by founder"}`,
        ``,
        `The app was rejected during the pre-shipping approval gate. Do NOT rebuild from scratch — apply targeted fixes to address the rejection reason above.`,
        ``,
        `## What to check`,
        `- Review \`ops/factory/${slug}/pre-approval-report.md\` for the full pre-approval test results`,
        `- Review \`ops/factory/${slug}/prd.md\` Section 2 for the P0 feature requirements`,
        `- Fix only what is broken — do not change features that are already working`,
      ].join("\n");
      await writeFile(reworkBriefPath, reworkBrief);

      // Reset shipping phase so pre-approval re-runs after the rework
      if (!state.phases) state.phases = {};
      if (!state.phases.shipping) state.phases.shipping = {};
      delete state.phases.shipping.approved_at;
      state.phases.shipping.status = "pending";

      // Route back to build for rework
      state.status = "build";
      state.phases.build = {
        ...(state.phases.build ?? {}),
        status: "rework_pending",
        rework_count: reworkCount,
        rework_requested_at: now,
      };
      // Preserve rejection info for audit trail but don't kill the project
      state.last_rejection = { reason: reason ?? "Rejected by founder", rejected_at: now };
      delete state.rejected_at;
      delete state.rejection_reason;
      state.updated_at = now;

      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      // Launch factory loop to pick up the rework (detached)
      const logFile = join(LOG_DIR, `factory-rework-${slug}-${Date.now()}.log`);
      const env = { ...process.env } as NodeJS.ProcessEnv;
      delete env.CLAUDECODE;

      const child = spawn(
        "bash",
        [FACTORY_LOOP, slug],
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
        status: "rework",
        slug,
        message: `${slug} routed back to build for rework. Reason: ${reason ?? "No reason given"}. Loop started (pid: ${child.pid}).`,
        pid: child.pid,
        log: logFile,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
