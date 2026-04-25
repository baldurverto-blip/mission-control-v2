import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const FACTORY = join(HOME, "verto-workspace/ops/factory");
const CONFIG_FILE = join(FACTORY, "factory-config.json");
const QUEUE_FILE = join(FACTORY, "idea-queue.json");

function normalizeSlug(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const d = new Date();
  const suffix = `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return clean ? `${clean}-${suffix}` : `idea-${suffix}`;
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

interface IdeaEntry {
  slug: string;
  title?: string;
  score?: number;
  status?: string;
  product_type?: string;
  qualification?: { score?: number; rationale?: string };
  evidence?: Record<string, unknown>;
  tagline?: string;
}

interface FactoryConfig {
  idea_queue_min_score?: number;
  product_type_to_track?: Record<string, string>;
  tracks?: Record<string, { phases?: string[] }>;
}

export async function POST(request: Request) {
  try {
    const { slug } = (await request.json()) as { slug: string };
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const queueRaw = await readFile(QUEUE_FILE, "utf-8");
    const queue = JSON.parse(queueRaw) as { queue: IdeaEntry[]; [k: string]: unknown };

    const idea = queue.queue.find((i) => i.slug === slug);
    if (!idea) return NextResponse.json({ error: `Idea ${slug} not in queue` }, { status: 404 });

    const configRaw = await readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(configRaw) as FactoryConfig;

    const minScore = config.idea_queue_min_score ?? 0;
    const qualScore = idea.qualification?.score ?? idea.score ?? 0;
    if (idea.status !== "qualified") {
      return NextResponse.json({ error: `Idea ${slug} is ${idea.status}, must be qualified` }, { status: 409 });
    }
    if (qualScore < minScore) {
      return NextResponse.json({ error: `Idea ${slug} score ${qualScore} below gate ${minScore}` }, { status: 409 });
    }

    const productType = idea.product_type ?? "b2c-mobile";
    const track = config.product_type_to_track?.[productType] ?? "mobile";
    const trackPhases = config.tracks?.[track]?.phases ?? [
      "research", "validation", "build", "quality_gate", "monetization", "packaging", "shipping",
    ];

    const factorySlug = normalizeSlug(idea.title ?? slug);
    const projectDir = join(FACTORY, factorySlug);

    if (await exists(projectDir)) {
      return NextResponse.json({ error: `Factory slug ${factorySlug} already exists` }, { status: 409 });
    }

    await mkdir(projectDir, { recursive: true });

    const now = new Date().toISOString();
    const phases: Record<string, { status: string; attempt?: number }> = {};
    for (const p of trackPhases) {
      phases[p] = p === "quality_gate" ? { status: "pending", attempt: 0 } : { status: "pending" };
    }

    const state = {
      slug: factorySlug,
      idea_slug: slug,
      name: idea.title ?? null,
      track,
      product_type: productType,
      status: "research",
      phase: 1,
      phases,
      phase_agreement: {},
      created_at: now,
      updated_at: now,
      promoted_via: "mission-control",
    };

    await writeFile(join(projectDir, "state.json"), JSON.stringify(state, null, 2));

    const rationale = idea.qualification?.rationale ?? idea.tagline ?? "";
    const goalMd = `# Project Goal Context

Idea: ${idea.title ?? slug}
Score: ${qualScore}
Rationale: ${rationale}

Promoted from idea queue via Mission Control on ${now}.

## Next step

Factory is currently managed by factory-tick (every 10m) when enabled. To run this
project's loop manually:

    ~/verto-workspace/tools/factory-loop.sh ${factorySlug}
`;
    await writeFile(join(projectDir, "project-goal.md"), goalMd);

    // Remove from queue
    queue.queue = queue.queue.filter((i) => i.slug !== slug);
    await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));

    return NextResponse.json({
      ok: true,
      factorySlug,
      track,
      phases: trackPhases,
      projectDir,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
