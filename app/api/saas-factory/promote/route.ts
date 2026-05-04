import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const PROMOTE_SCRIPT = join(HOME, "verto-workspace/tools/promote-saas-idea.sh");

const exec = promisify(execFile);

// Slug shape: lowercase letters/digits/hyphens. Anything else is rejected
// before we shell out — defense in depth even though execFile already avoids
// the shell.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function POST(req: Request) {
  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await exec(
      PROMOTE_SCRIPT,
      ["promote", slug, "--yes"],
      { timeout: 30_000, maxBuffer: 1_048_576 },
    );
    return NextResponse.json({ ok: true, slug, stdout, stderr });
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
