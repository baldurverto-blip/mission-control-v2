import { readFile, stat } from "fs/promises";
import { join } from "path";
import { DOCS_INTERNAL, OPS } from "@/app/lib/paths";

export interface BrainDocSummary {
  name: string;
  path: string;
  title: string;
  summary: string;
  modifiedAt: string | null;
  owner: string | null;
  lastVerified: string | null;
  verifiedBy: string | null;
  sourceOfTruth: string | null;
  freshness: "fresh" | "aging" | "stale" | "critical_stale" | "unknown";
}

export interface BrainLogEntry {
  date: string;
  bullets: string[];
}

export interface BrainPromotionEntry {
  date: string;
  type?: string;
  title: string;
  note?: string;
  source_paths?: string[];
  target_docs?: string[];
}

export interface BrainStatus {
  generatedAt: string | null;
  thresholds: {
    freshDays: number;
    agingDays: number;
    staleDays: number;
  } | null;
  counts: {
    total: number;
    fresh: number;
    aging: number;
    stale: number;
    criticalStale: number;
    unknown: number;
    missingMetadata: number;
  };
  staleDocs: BrainDocSummary[];
  recentPromotions: BrainPromotionEntry[];
  contradictions: string[];
  gaps: string[];
}

export interface BrainBrowseSection {
  id: string;
  title: string;
  summary: string;
  docs: BrainDocSummary[];
}

export interface CompanyBrainData {
  docs: BrainDocSummary[];
  coreDocs: BrainDocSummary[];
  canonicalDocs: BrainDocSummary[];
  maintenanceDocs: BrainDocSummary[];
  browseSections: BrainBrowseSection[];
  latestLogEntries: BrainLogEntry[];
  metadataStats: {
    total: number;
    withOwner: number;
    withVerification: number;
    withSourceOfTruth: number;
  };
  status: BrainStatus;
}

const COMPANY_BRAIN_FILES = [
  "wiki-schema.md",
  "wiki-log.md",
  "wiki-lint-rules.md",
  "company-brain-raw-sources-boundary.md",
  "company-brain-rollout-plan.md",
  "company-brain-maintenance-runbook.md",
  "company-brain-promotion-workflow.md",
  "company-brain-company-and-brand.md",
  "company-brain-founder-goals-and-bets.md",
  "company-brain-runtime-map.md",
  "company-brain-product-portfolio.md",
  "company-brain-research-and-signals.md",
  "company-brain-skills-and-tools.md",
  "company-brain-ops-and-governance.md",
] as const;

const CORE_DOC_NAMES = new Set<string>([
  "wiki-schema.md",
  "wiki-log.md",
  "wiki-lint-rules.md",
  "company-brain-raw-sources-boundary.md",
]);

const MAINTENANCE_DOC_NAMES = new Set<string>([
  "company-brain-rollout-plan.md",
  "company-brain-maintenance-runbook.md",
  "company-brain-promotion-workflow.md",
]);

const BROWSE_SECTION_CONFIG = [
  {
    id: "start-here",
    title: "Start here",
    summary: "Foundational pages that explain what Verto is before you dive into domains.",
    names: ["company-brain-company-and-brand.md", "company-brain-founder-goals-and-bets.md", "company-brain-runtime-map.md"],
  },
  {
    id: "products",
    title: "Products",
    summary: "Portfolio status, product-doc clusters, and the path to current app truth.",
    names: ["company-brain-product-portfolio.md"],
  },
  {
    id: "research",
    title: "Research and signals",
    summary: "How evidence is organized, and where curated understanding diverges from raw scans.",
    names: ["company-brain-research-and-signals.md"],
  },
  {
    id: "skills",
    title: "Skills and tools",
    summary: "The reusable operating methods and tool layers that actually power the system.",
    names: ["company-brain-skills-and-tools.md"],
  },
  {
    id: "ops",
    title: "Ops and governance",
    summary: "How work is coordinated, tracked, and governed across the studio.",
    names: ["company-brain-ops-and-governance.md"],
  },
] as const;

function extractTitle(content: string, fallback: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const keyValue = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!keyValue) continue;
    frontmatter[keyValue[1]] = keyValue[2].trim();
  }
  return frontmatter;
}

function extractSummary(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("---") && !line.startsWith("tags:") && !line.startsWith("owner:") && !line.startsWith("last_verified:") && !line.startsWith("verified_by:") && !line.startsWith("source_of_truth:"));

  const useful = lines.filter((line) => !line.startsWith("#"));
  return useful.slice(0, 3).join(" ").slice(0, 240);
}

function parseLogEntries(content: string): BrainLogEntry[] {
  const sections = content.split(/^##\s+/m).slice(1);
  return sections.map((section) => {
    const [heading, ...rest] = section.split("\n");
    const bullets = rest
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
    return { date: heading.trim(), bullets };
  }).filter((entry) => entry.bullets.length > 0).slice(0, 4);
}

function getFreshness(lastVerified: string | null): BrainDocSummary["freshness"] {
  if (!lastVerified) return "unknown";

  const verifiedAt = new Date(`${lastVerified}T00:00:00Z`);
  if (Number.isNaN(verifiedAt.getTime())) return "unknown";

  const ageDays = (Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 21) return "aging";
  if (ageDays <= 45) return "stale";
  return "critical_stale";
}

async function readBrainDoc(name: string): Promise<BrainDocSummary> {
  const path = join(DOCS_INTERNAL, name);
  const [content, stats] = await Promise.all([
    readFile(path, "utf-8"),
    stat(path).catch(() => null),
  ]);
  const frontmatter = extractFrontmatter(content);
  const lastVerified = frontmatter.last_verified ?? null;

  return {
    name,
    path,
    title: extractTitle(content, name.replace(/\.md$/, "")),
    summary: extractSummary(content),
    modifiedAt: stats?.mtime.toISOString() ?? null,
    owner: frontmatter.owner ?? null,
    lastVerified,
    verifiedBy: frontmatter.verified_by ?? null,
    sourceOfTruth: frontmatter.source_of_truth ?? null,
    freshness: getFreshness(lastVerified),
  };
}

async function readStatus(): Promise<BrainStatus> {
  const fallback: BrainStatus = {
    generatedAt: null,
    thresholds: null,
    counts: {
      total: 0,
      fresh: 0,
      aging: 0,
      stale: 0,
      criticalStale: 0,
      unknown: 0,
      missingMetadata: 0,
    },
    staleDocs: [],
    recentPromotions: [],
    contradictions: [],
    gaps: [],
  };

  const raw = await readFile(join(OPS, "company-brain", "status.json"), "utf-8").catch(() => null);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as {
      generatedAt?: string;
      thresholds?: BrainStatus["thresholds"];
      counts?: Partial<BrainStatus["counts"]>;
      staleDocs?: BrainDocSummary[];
      recentPromotions?: BrainPromotionEntry[];
      contradictions?: string[];
      gaps?: string[];
    };

    return {
      generatedAt: parsed.generatedAt ?? null,
      thresholds: parsed.thresholds ?? null,
      counts: {
        total: parsed.counts?.total ?? 0,
        fresh: parsed.counts?.fresh ?? 0,
        aging: parsed.counts?.aging ?? 0,
        stale: parsed.counts?.stale ?? 0,
        criticalStale: parsed.counts?.criticalStale ?? 0,
        unknown: parsed.counts?.unknown ?? 0,
        missingMetadata: parsed.counts?.missingMetadata ?? 0,
      },
      staleDocs: parsed.staleDocs ?? [],
      recentPromotions: parsed.recentPromotions ?? [],
      contradictions: parsed.contradictions ?? [],
      gaps: parsed.gaps ?? [],
    };
  } catch {
    return fallback;
  }
}

export async function getCompanyBrainData(): Promise<CompanyBrainData> {
  const [docs, logContent, status] = await Promise.all([
    Promise.all(COMPANY_BRAIN_FILES.map((name) => readBrainDoc(name))),
    readFile(join(DOCS_INTERNAL, "wiki-log.md"), "utf-8").catch(() => ""),
    readStatus(),
  ]);

  const coreDocs = docs.filter((doc) => CORE_DOC_NAMES.has(doc.name));
  const maintenanceDocs = docs.filter((doc) => MAINTENANCE_DOC_NAMES.has(doc.name));
  const canonicalDocs = docs.filter((doc) => !CORE_DOC_NAMES.has(doc.name) && !MAINTENANCE_DOC_NAMES.has(doc.name));
  const docMap = new Map(docs.map((doc) => [doc.name, doc]));
  const browseSections = BROWSE_SECTION_CONFIG.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    docs: section.names.map((name) => docMap.get(name)).filter((doc): doc is BrainDocSummary => Boolean(doc)),
  })).filter((section) => section.docs.length > 0);

  return {
    docs,
    coreDocs,
    maintenanceDocs,
    canonicalDocs,
    browseSections,
    latestLogEntries: parseLogEntries(logContent),
    metadataStats: {
      total: docs.length,
      withOwner: docs.filter((doc) => Boolean(doc.owner)).length,
      withVerification: docs.filter((doc) => Boolean(doc.lastVerified && doc.verifiedBy)).length,
      withSourceOfTruth: docs.filter((doc) => Boolean(doc.sourceOfTruth)).length,
    },
    status,
  };
}
