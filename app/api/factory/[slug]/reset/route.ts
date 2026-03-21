import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

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
    const { action } = body as { action: "resume" | "park" | "restart-phase" };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const FACTORY = await resolveFactoryDir(slug);
    const stateFile = join(FACTORY, slug, "state.json");
    const raw = readFileSync(stateFile, "utf-8");
    const state = JSON.parse(raw);
    const now = new Date().toISOString();

    if (action === "resume") {
      // Reset failure count, set current phase to pending, update status to current phase name
      state.failure_count = 0;
      const currentPhase = state.status;
      if (state.phases && state.phases[currentPhase]) {
        state.phases[currentPhase].status = "pending";
      }
      // If status is "needs-review" or "needs_review", derive phase from the last non-complete phase
      if (currentPhase === "needs-review" || currentPhase === "needs_review") {
        const phaseOrder = [
          "research", "validation", "design", "build", "code_review",
          "quality_gate", "monetization", "packaging", "shipping",
        ];
        const stuckPhase = phaseOrder.find(
          (ph) => state.phases?.[ph] && state.phases[ph].status !== "complete"
        );
        if (stuckPhase) {
          state.status = stuckPhase;
          state.phases[stuckPhase].status = "pending";
        }
      }
      state.updated_at = now;

      writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

      return NextResponse.json({
        status: "resumed",
        slug,
        message: `${slug} resumed. Failure count reset, phase set to pending.`,
      });
    }

    if (action === "park") {
      state.status = "parked";
      state.updated_at = now;

      writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

      return NextResponse.json({
        status: "parked",
        slug,
        message: `${slug} parked. No further factory processing.`,
      });
    }

    if (action === "restart-phase") {
      const currentPhase = state.status;
      // For needs-review, find the stuck phase
      let targetPhase = currentPhase;
      if (currentPhase === "needs-review" || currentPhase === "needs_review") {
        const phaseOrder = [
          "research", "validation", "design", "build", "code_review",
          "quality_gate", "monetization", "packaging", "shipping",
        ];
        targetPhase = phaseOrder.find(
          (ph) => state.phases?.[ph] && state.phases[ph].status !== "complete"
        ) ?? currentPhase;
      }

      if (state.phases && state.phases[targetPhase]) {
        state.phases[targetPhase].status = "pending";
      }
      state.failure_count = 0;
      state.status = targetPhase;
      state.updated_at = now;

      writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

      return NextResponse.json({
        status: "restarted",
        slug,
        phase: targetPhase,
        message: `${slug} phase "${targetPhase}" restarted. Failure count reset.`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
