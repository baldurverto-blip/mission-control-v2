import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { PRODUCTS_DIR, PULSES_DIR } from "@/app/lib/paths";

const FACTORY_DIR = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const FACTORY_CONFIG = join(FACTORY_DIR, "factory-config.json");
const LIFECYCLE_PHASES = ["discovery", "validation", "build", "distribution", "support"] as const;

// Internal systems — not customer-facing products, excluded from Product Lanes
const INTERNAL_SLUGS = new Set(["vertoos", "growthops"]);

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
  factoryStatus?: string;
  isFactoryProject?: boolean;
  // New fields for focus area + type
  productType?: string;
  focusAreas?: string[];
  description?: string;
  pipelineStage?: string;
  client?: string;
}

interface FocusAreaConfig {
  label: string;
  mission: string;
  kpis: string[];
}

interface ProductConfig {
  name: string;
  type: string;
  focus_areas: string[];
  status: string;
  description?: string;
  client?: string;
  pipeline_stage?: string;
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
  const factoryMatch = g.match(/^factory:(\S+)/);
  if (factoryMatch) return factoryMatch[1];
  if (g.includes("cleansheet")) return "cleansheet";
  if (g.includes("viborg")) return "viborg-ff";
  if (g.startsWith("sync") || g.includes("sync")) return "sync";
  if (g.startsWith("safebite") || g.includes("safebite")) return "safebite";
  if (g.startsWith("growthops") || g.startsWith("content-")) return "growthops";
  if (g.startsWith("vertoos")) return "vertoos";
  return null;
}

// Map factory status to product lifecycle phase
function factoryStatusToLifecycle(status: string): string {
  switch (status) {
    case "research": return "discovery";
    case "validation": return "validation";
    case "build":
    case "quality-gate":
    case "quality_gate": return "build";
    case "monetization":
    case "packaging":
    case "shipping":
    case "awaiting-approval":
    case "marketing":
    case "promo": return "distribution";
    case "shipped": return "support";
    default: return "discovery";
  }
}

// Map advisory pipeline stages to lifecycle phases
function advisoryStageToLifecycle(stage: string): string {
  switch (stage) {
    case "lead":
    case "discovery": return "discovery";
    case "scoping":
    case "proposal": return "validation";
    case "pilot": return "build";
    case "delivery":
    case "paid": return "distribution";
    case "ongoing": return "support";
    default: return "discovery";
  }
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

async function readFactoryConfig(): Promise<{
  focus_areas: Record<string, FocusAreaConfig>;
  products: Record<string, ProductConfig>;
} | null> {
  try {
    const raw = await readFile(FACTORY_CONFIG, "utf-8");
    const config = JSON.parse(raw);
    return {
      focus_areas: config.focus_areas ?? {},
      products: config.products ?? {},
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const config = await readFactoryConfig();
    const productConfigs = config?.products ?? {};
    const focusAreaConfigs = config?.focus_areas ?? {};

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
    const seenSlugs = new Set<string>();

    for (const slug of productDirs) {
      if (INTERNAL_SLUGS.has(slug)) continue;
      let content: string;
      try {
        content = await readFile(join(PRODUCTS_DIR, slug, "PRD.md"), "utf-8");
      } catch {
        continue;
      }

      const fm = extractFrontmatter(content);
      const nameMatch = content.match(/^#\s+(?:PRD:\s*)?(.+)/m);
      const name = nameMatch?.[1]?.trim()?.replace(/\s*—.*/, "") ?? slug;
      const status = fm.status ?? "Draft";
      const pConfig = productConfigs[slug];

      // Use config-driven lifecycle phase for advisory, fallback to frontmatter
      let lifecyclePhase = fm.lifecycle_phase ?? "discovery";
      if (pConfig?.type === "advisory" && pConfig.pipeline_stage) {
        lifecyclePhase = advisoryStageToLifecycle(pConfig.pipeline_stage);
      }

      const phases = extractPhaseChecks(content);

      // Pulse stats
      const productPulses = pulsesByProduct[slug] ?? [];
      const pulseCount7d = productPulses.length;
      const activeAgents = [...new Set(productPulses.map((p) => p.agent))];

      // Stall detection
      const latestPulse = productPulses.length > 0
        ? Math.max(...productPulses.map((p) => new Date(p.timestamp).getTime()))
        : 0;
      const staleDays = latestPulse > 0
        ? Math.floor((Date.now() - latestPulse) / 86400000)
        : 999;
      const isStalled = staleDays >= 2 && lifecyclePhase !== "support";

      seenSlugs.add(slug);
      projects.push({
        slug,
        name: pConfig?.name ?? name,
        status: pConfig?.status ?? status,
        lifecyclePhase,
        pulseCount7d,
        activeAgents,
        staleDays: latestPulse > 0 ? staleDays : -1,
        isStalled,
        phases,
        productType: pConfig?.type,
        focusAreas: pConfig?.focus_areas,
        description: pConfig?.description,
        pipelineStage: pConfig?.pipeline_stage,
        client: pConfig?.client,
      });
    }

    // Add config-only products (not in PRD dirs yet, e.g. advisory engagements)
    for (const [slug, pConfig] of Object.entries(productConfigs)) {
      if (seenSlugs.has(slug) || INTERNAL_SLUGS.has(slug)) continue;

      let lifecyclePhase = "discovery";
      if (pConfig.type === "advisory" && pConfig.pipeline_stage) {
        lifecyclePhase = advisoryStageToLifecycle(pConfig.pipeline_stage);
      }

      const productPulses = pulsesByProduct[slug] ?? [];
      const pulseCount7d = productPulses.length;
      const activeAgents = [...new Set(productPulses.map((p) => p.agent))];
      const latestPulse = productPulses.length > 0
        ? Math.max(...productPulses.map((p) => new Date(p.timestamp).getTime()))
        : 0;
      const staleDays = latestPulse > 0
        ? Math.floor((Date.now() - latestPulse) / 86400000)
        : 999;

      seenSlugs.add(slug);
      projects.push({
        slug,
        name: pConfig.name,
        status: pConfig.status,
        lifecyclePhase,
        pulseCount7d,
        activeAgents,
        staleDays: latestPulse > 0 ? staleDays : -1,
        isStalled: false,
        phases: [],
        productType: pConfig.type,
        focusAreas: pConfig.focus_areas,
        description: pConfig.description,
        pipelineStage: pConfig.pipeline_stage,
        client: pConfig.client,
      });
    }

    // Cross-reference factory projects
    try {
      const factoryEntries = await readdir(FACTORY_DIR).catch(() => []);
      for (const entry of factoryEntries) {
        const stateFile = join(FACTORY_DIR, entry, "state.json");
        try {
          const info = await stat(join(FACTORY_DIR, entry));
          if (!info.isDirectory()) continue;
          const raw = await readFile(stateFile, "utf-8");
          const state = JSON.parse(raw);
          const factoryStatus = state.status as string;

          if (seenSlugs.has(entry)) {
            const existing = projects.find((p) => p.slug === entry);
            if (existing) {
              existing.factoryStatus = factoryStatus;
              // Update lifecycle phase from factory state (overrides PRD frontmatter default)
              existing.lifecyclePhase = factoryStatusToLifecycle(factoryStatus);
            }
          } else {
            let name = entry.charAt(0).toUpperCase() + entry.slice(1);
            try {
              const onePager = await readFile(join(FACTORY_DIR, entry, "one-pager.md"), "utf-8");
              const titleMatch = onePager.match(/^#\s+(?:App One-Pager:\s*)?(.+)/m);
              if (titleMatch) name = titleMatch[1].trim().replace(/\s*[—:].*/g, "").trim();
            } catch { /* use slug */ }

            const lifecyclePhase = factoryStatusToLifecycle(factoryStatus);
            const productPulses = pulsesByProduct[entry] ?? [];
            const pulseCount7d = productPulses.length;
            const activeAgents = [...new Set(productPulses.map((p) => p.agent))];
            const latestPulse = productPulses.length > 0
              ? Math.max(...productPulses.map((p) => new Date(p.timestamp).getTime()))
              : 0;
            const staleDays = latestPulse > 0
              ? Math.floor((Date.now() - latestPulse) / 86400000)
              : 999;

            const pConfig = productConfigs[entry];
            projects.push({
              slug: entry,
              name,
              status: factoryStatus,
              lifecyclePhase,
              pulseCount7d,
              activeAgents,
              staleDays: latestPulse > 0 ? staleDays : -1,
              isStalled: false,
              phases: [],
              factoryStatus,
              isFactoryProject: true,
              productType: pConfig?.type ?? "b2c-mobile",
              focusAreas: pConfig?.focus_areas ?? ["products"],
            });
          }
        } catch { /* skip */ }
      }
    } catch { /* factory dir not available */ }

    // Group projects by focus area for the dashboard
    const byFocusArea: Record<string, ProjectLane[]> = {
      products: [],
      advisory: [],
      engine: [],
    };
    for (const p of projects) {
      const areas = p.focusAreas ?? ["products"];
      for (const area of areas) {
        if (byFocusArea[area]) {
          byFocusArea[area].push(p);
        }
      }
    }

    return NextResponse.json({
      projects,
      byFocusArea,
      focusAreas: focusAreaConfigs,
      lifecyclePhases: [...LIFECYCLE_PHASES],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read projects", detail: String(err) },
      { status: 500 },
    );
  }
}
