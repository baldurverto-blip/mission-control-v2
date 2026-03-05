import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { PRODUCTS_DIR, PULSES_DIR } from "@/app/lib/paths";

const LIFECYCLE_PHASES = ["discovery", "validation", "build", "distribution", "support"] as const;

interface PhaseCheck {
  name: string;
  done: boolean;
}

interface ProjectLane {
  slug: string;
  name: string;
  status: string;
  lifecyclePhase: string;
  pulseCount7d: number;
  activeAgents: string[];
  staleDays: number;
  isStalled: boolean;
  phases: PhaseCheck[];
}

function extractFrontmatter(content: string): Record<string, string> {
  const fm: Record<string, string> = {};
  // YAML frontmatter
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    for (const line of yamlMatch[1].split("\n")) {
      const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)/);
      if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  // Bold-style metadata: **Key:** Value
  for (const m of content.matchAll(/\*\*(\w[\w\s]*?):\*\*\s*(.+)/g)) {
    const key = m[1].trim().toLowerCase().replace(/\s+/g, "_");
    fm[key] = m[2].trim();
  }
  return fm;
}

function extractPhaseChecks(content: string): PhaseCheck[] {
  const phases: PhaseCheck[] = [];
  const phaseRegex = /###\s+Phase\s+\d+[:\s—–-]+(.+)/g;
  let match;
  while ((match = phaseRegex.exec(content)) !== null) {
    const name = match[1].trim();
    // Look at checkboxes following this heading until the next heading
    const start = match.index + match[0].length;
    const nextHeading = content.indexOf("\n##", start);
    const section = content.slice(start, nextHeading === -1 ? undefined : nextHeading);
    const total = (section.match(/- \[[ x]\]/g) || []).length;
    const done = (section.match(/- \[x\]/gi) || []).length;
    phases.push({ name, done: total > 0 && done === total });
  }
  return phases;
}

// Map pulse goals to product slugs
function mapPulseToProduct(goal: string): string | null {
  const g = goal.toLowerCase();
  if (g.startsWith("expedition:")) return null;
  if (g.startsWith("sync") || g.includes("sync")) return "sync";
  if (g.startsWith("growthops") || g.startsWith("content-")) return "growthops";
  if (g.startsWith("vertoos")) return "vertoos";
  return null; // unmapped = system
}

async function readPulsesForDate(date: string): Promise<{ agent: string; goal: string; timestamp: string }[]> {
  try {
    const content = await readFile(join(PULSES_DIR, `${date}.jsonl`), "utf-8");
    return content.trim().split("\n").filter(Boolean).map((l) => {
      const p = JSON.parse(l);
      return { agent: p.agent, goal: p.goal, timestamp: p.timestamp };
    });
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // Read product PRDs
    const dirs = await readdir(PRODUCTS_DIR, { withFileTypes: true });
    const productDirs = dirs.filter((d) => d.isDirectory()).map((d) => d.name);

    // Read 7 days of pulses
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    }
    const allPulses = (await Promise.all(dates.map(readPulsesForDate))).flat();

    // Group pulses by product
    const pulsesByProduct: Record<string, typeof allPulses> = {};
    for (const p of allPulses) {
      const slug = mapPulseToProduct(p.goal);
      if (slug) {
        (pulsesByProduct[slug] ??= []).push(p);
      }
    }

    const projects: ProjectLane[] = [];

    for (const slug of productDirs) {
      let content: string;
      try {
        content = await readFile(join(PRODUCTS_DIR, slug, "PRD.md"), "utf-8");
      } catch {
        continue; // skip dirs without PRD.md
      }

      const fm = extractFrontmatter(content);
      const nameMatch = content.match(/^#\s+(?:PRD:\s*)?(.+)/m);
      const name = nameMatch?.[1]?.trim()?.replace(/\s*—.*/, "") ?? slug;
      const status = fm.status ?? "Draft";
      const lifecyclePhase = fm.lifecycle_phase ?? "discovery";
      const phases = extractPhaseChecks(content);

      // Pulse stats
      const productPulses = pulsesByProduct[slug] ?? [];
      const pulseCount7d = productPulses.length;
      const activeAgents = [...new Set(productPulses.map((p) => p.agent))];

      // Stall detection: no pulse in 48h AND not in support phase
      const latestPulse = productPulses.length > 0
        ? Math.max(...productPulses.map((p) => new Date(p.timestamp).getTime()))
        : 0;
      const staleDays = latestPulse > 0
        ? Math.floor((Date.now() - latestPulse) / 86400000)
        : 999;
      const isStalled = staleDays >= 2 && lifecyclePhase !== "support";

      projects.push({
        slug,
        name,
        status,
        lifecyclePhase,
        pulseCount7d,
        activeAgents,
        staleDays: latestPulse > 0 ? staleDays : -1,
        isStalled,
        phases,
      });
    }

    return NextResponse.json({
      projects,
      lifecyclePhases: [...LIFECYCLE_PHASES],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read projects", detail: String(err) },
      { status: 500 },
    );
  }
}
