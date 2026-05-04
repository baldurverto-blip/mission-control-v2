import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const PROMOTE_SCRIPT = join(HOME, "verto-workspace/tools/promote-saas-idea.sh");
const QUEUE_PATH = join(HOME, "verto-workspace/ops/saas-factory/idea-queue.json");

const exec = promisify(execFile);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

interface QueueIdea { slug: string; prism_review?: unknown }

export async function POST(req: Request) {
  let body: { slug?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const slug = body.slug?.trim();
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  try {
    // Gemini calls take 30-90s; allow 180s before we give up.
    await exec(PROMOTE_SCRIPT, ["prism-review", slug], {
      timeout: 180_000,
      maxBuffer: 4_194_304,
    });

    // Re-read the queue to return the freshly-stored review (script writes it back to idea-queue.json).
    const raw = await readFile(QUEUE_PATH, "utf-8");
    const data = JSON.parse(raw) as { queue?: QueueIdea[] };
    const idea = data.queue?.find((i) => i.slug === slug);

    return NextResponse.json({
      ok: true,
      slug,
      review: idea?.prism_review ?? null,
    });
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
