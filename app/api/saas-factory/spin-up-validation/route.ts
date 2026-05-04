import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const LAB_SCRIPT = join(HOME, "verto-workspace/tools/validation-lab.sh");

const exec = promisify(execFile);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function POST(req: Request) {
  let body: { slug?: string; pivot_index?: number; no_scaffold?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const slug = body.slug?.trim();
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const pivotIndex = Number(body.pivot_index);
  // Pivot index from UI is 0-based; the CLI is 1-based.
  if (!Number.isInteger(pivotIndex) || pivotIndex < 0 || pivotIndex > 9) {
    return NextResponse.json({ error: "invalid pivot_index" }, { status: 400 });
  }

  const args = ["spin-up", slug, "--pivot", String(pivotIndex + 1)];
  if (body.no_scaffold) args.push("--no-scaffold");

  try {
    const { stdout, stderr } = await exec(LAB_SCRIPT, args, {
      // Scaffold copy via rsync can take 30-60s; allow plenty of headroom.
      timeout: 180_000,
      maxBuffer: 4_194_304,
    });
    // Last non-empty stdout line is the new exp_slug (the script prints it explicitly).
    const expSlug = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    return NextResponse.json({ ok: true, exp_slug: expSlug, stdout, stderr });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return NextResponse.json(
      {
        ok: false,
        slug,
        error: e.message,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        exitCode: e.code,
      },
      { status: 500 },
    );
  }
}
