import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";
import { join } from "path";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const FACTORY_LOOP = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/tools/factory-loop.sh");

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
      // Update state to shipping
      state.status = "shipping";
      state.approved_at = new Date().toISOString();
      state.updated_at = new Date().toISOString();
      await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n");

      // Start factory loop in background (shipping → marketing → promo)
      const cmd = `cd "${join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace")}" && bash "${FACTORY_LOOP}" "${slug}" shipping`;
      exec(cmd, { env: { ...process.env, CLAUDECODE: undefined } });

      return NextResponse.json({
        status: "approved",
        slug,
        message: `${slug} approved for shipping. Factory loop resumed.`,
      });
    } else {
      // Reject
      state.status = "rejected";
      state.rejected_at = new Date().toISOString();
      state.rejection_reason = reason ?? "Rejected by founder";
      state.updated_at = new Date().toISOString();
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
