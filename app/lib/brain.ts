import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { DOCS_INTERNAL, OPS, PROPOSALS_DIR, SKILLS_DIR, TASKS_JSON, WORKSPACE } from "@/app/lib/paths";

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
  learningLoop: BrainLearningLoopHealth;
}

export interface LearningLoopOutputSummary {
  name: string | null;
  path: string | null;
  modifiedAt: string | null;
  reviewedCount: number | null;
  queueCounts: {
    researchWiki: number;
    companyBrain: number;
    skills: number;
    tasks: number;
    proposals: number;
  };
  recommendedNextPromotions: string[];
}

export interface LearningLoopTaskSummary {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

export interface BrainLearningLoopHealth {
  latestOutput: LearningLoopOutputSummary;
  wiki: {
    pageCount: number;
    logModifiedAt: string | null;
    latestLogEntry: string | null;
    freshCount: number;
    staleCount: number;
  };
  downstream: {
    skillsTotal: number;
    wikiLoopSkillExists: boolean;
    openLearningTasks: LearningLoopTaskSummary[];
    recentProposalCount: number;
  };
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
  "company-brain-learning-system.md",
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
  {
    id: "learning",
    title: "Learning system",
    summary: "How raw evidence becomes wiki synthesis, Company Brain updates, skills, tasks, and proposals.",
    names: ["company-brain-learning-system.md"],
  },
] as const;

const RESEARCH_ROOT = join(WORKSPACE, "research");
const RESEARCH_OUTPUTS_DIR = join(RESEARCH_ROOT, "outputs");
const RESEARCH_WIKI_DIR = join(RESEARCH_ROOT, "wiki");

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


function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countSectionItems(content: string, heading: string): number {
  const section = content.match(new RegExp(`^###\\s+${escapeRegex(heading)}\\n([\\s\\S]*?)(?=^###\\s+|^##\\s+|(?![\\s\\S]))`, "m"))?.[1] ?? "";
  return (section.match(/^- `[^`]+`/gm) ?? []).length;
}

function parseRecommendedNextPromotions(content: string): string[] {
  const section = content.match(/^##\s+Recommended next promotions\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/m)?.[1] ?? "";
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ""))
    .slice(0, 5);
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(path);
    if (entry.isFile()) return [path];
    return [];
  }));
  return nested.flat();
}

async function readLatestLearningLoopOutput(): Promise<LearningLoopOutputSummary> {
  const files = (await readdir(RESEARCH_OUTPUTS_DIR).catch(() => [] as string[]))
    .filter((name) => name.endsWith("-wiki-learning-loop.md"))
    .sort();
  const latest = files.at(-1) ?? null;
  if (!latest) {
    return {
      name: null,
      path: null,
      modifiedAt: null,
      reviewedCount: null,
      queueCounts: { researchWiki: 0, companyBrain: 0, skills: 0, tasks: 0, proposals: 0 },
      recommendedNextPromotions: [],
    };
  }

  const path = join(RESEARCH_OUTPUTS_DIR, latest);
  const [content, stats] = await Promise.all([
    readFile(path, "utf-8").catch(() => ""),
    stat(path).catch(() => null),
  ]);
  const reviewedCount = Number(content.match(/^- Candidate files:\s+(\d+)/m)?.[1] ?? NaN);

  return {
    name: latest,
    path: `research/outputs/${latest}`,
    modifiedAt: stats?.mtime.toISOString() ?? null,
    reviewedCount: Number.isFinite(reviewedCount) ? reviewedCount : null,
    queueCounts: {
      researchWiki: countSectionItems(content, "research/wiki/"),
      companyBrain: countSectionItems(content, "docs/internal/company-brain-*.md"),
      skills: countSectionItems(content, "brain/skills/"),
      tasks: countSectionItems(content, "ops/tasks.json"),
      proposals: countSectionItems(content, "brain/proposals/"),
    },
    recommendedNextPromotions: parseRecommendedNextPromotions(content),
  };
}

async function readLearningTasks(): Promise<LearningLoopTaskSummary[]> {
  const raw = await readFile(TASKS_JSON, "utf-8").catch(() => "[]");
  try {
    const parsed = JSON.parse(raw) as Array<{ id?: string; title?: string; status?: string; priority?: string; tags?: string[] }>;
    return parsed
      .filter((task) => task.status !== "done")
      .filter((task) => task.tags?.some((tag) => ["learning-loop", "company-brain", "research"].includes(tag)) || /learn|brain|wiki/i.test(task.title ?? ""))
      .map((task) => ({
        id: task.id ?? "unknown",
        title: task.title ?? "Untitled",
        status: task.status ?? "unknown",
        priority: task.priority,
      }))
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function getBrainLearningLoopHealth(): Promise<BrainLearningLoopHealth> {
  const [latestOutput, wikiFiles, wikiLogStats, wikiLogContent, skillFiles, learningTasks, proposalFiles] = await Promise.all([
    readLatestLearningLoopOutput(),
    listFilesRecursive(RESEARCH_WIKI_DIR),
    stat(join(RESEARCH_WIKI_DIR, "log.md")).catch(() => null),
    readFile(join(RESEARCH_WIKI_DIR, "log.md"), "utf-8").catch(() => ""),
    readdir(SKILLS_DIR).catch(() => [] as string[]),
    readLearningTasks(),
    readdir(PROPOSALS_DIR).catch(() => [] as string[]),
  ]);

  const wikiMarkdownFiles = wikiFiles.filter((path) => path.endsWith(".md"));
  const wikiStats = await Promise.all(wikiMarkdownFiles.map(async (path) => ({ path, stats: await stat(path).catch(() => null) })));
  const now = Date.now();
  const freshCount = wikiStats.filter(({ stats }) => stats && (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24) <= 7).length;
  const staleCount = wikiStats.filter(({ stats }) => stats && (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24) > 21).length;
  const latestLogEntry = wikiLogContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .at(-1) ?? null;
  const proposalStats = await Promise.all(proposalFiles
    .filter((name) => name.endsWith(".md"))
    .map(async (name) => stat(join(PROPOSALS_DIR, name)).catch(() => null)));
  const recentProposalCount = proposalStats.filter((stats) => stats && (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24) <= 30).length;

  return {
    latestOutput,
    wiki: {
      pageCount: wikiMarkdownFiles.length,
      logModifiedAt: wikiLogStats?.mtime.toISOString() ?? null,
      latestLogEntry,
      freshCount,
      staleCount,
    },
    downstream: {
      skillsTotal: skillFiles.filter((name) => name.endsWith(".md")).length,
      wikiLoopSkillExists: skillFiles.includes("wiki-learning-loop.md"),
      openLearningTasks: learningTasks,
      recentProposalCount,
    },
  };
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
  const [docs, logContent, status, learningLoop] = await Promise.all([
    Promise.all(COMPANY_BRAIN_FILES.map((name) => readBrainDoc(name))),
    readFile(join(DOCS_INTERNAL, "wiki-log.md"), "utf-8").catch(() => ""),
    readStatus(),
    getBrainLearningLoopHealth(),
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
    learningLoop,
  };
}
