import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { WORKSPACE } from "@/app/lib/paths";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const GROWTH_OPS = join(HOME, "projects/growth-ops");
const B2B_SEEDS = join(HOME, "verto-workspace/brain/config/b2b-seeds.json");
const JTBD_DIR = join(WORKSPACE, "research/b2b-jtbd");
const REVIEWS_DIR = join(WORKSPACE, "research/saas-reviews");

interface JTBDCluster {
  jtbd: string;
  posting_count: number;
  avg_salary: number;
  tool_mentions: string[];
  is_automatable: boolean;
  automation_score: number;
  verticals: string[];
}

interface ComplaintCluster {
  vertical: string;
  complaint_category: string;
  count: number;
  products_affected: string[];
  products_count: number;
  avg_score: number;
}

interface VerticalConfig {
  label: string;
  tier: string;
  agent_native_fit: number;
  saas_competitors: string[];
  job_queries: string[];
}

// ── Helpers ──────────────────────────────────────────────────────

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

async function readLatestReport(dir: string): Promise<{ date: string; content: string } | null> {
  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();
    if (mdFiles.length === 0) return null;
    const content = await readFile(join(dir, mdFiles[0]), "utf-8");
    return { date: mdFiles[0].replace(".md", ""), content };
  } catch {
    return null;
  }
}

function parseJTBDReport(content: string): JTBDCluster[] {
  const clusters: JTBDCluster[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("### ")) continue;
    // Format: ### 1. Task Name [AUTOMATABLE]
    const match = line.match(/^### \d+\.\s+(.+?)(?:\s+\[(AUTOMATABLE|manual)\])?$/);
    if (!match) continue;

    const jtbd = match[1].trim();
    const is_automatable = match[2] === "AUTOMATABLE";
    const metaLine = lines[i + 1] ?? "";

    // Parse: Postings: 16 | Avg salary: $57,315 | Tools: none | Verticals: property_management
    const postings = parseInt(metaLine.match(/Postings:\s*(\d+)/)?.[1] ?? "0");
    const salary = parseInt(metaLine.match(/Avg salary:\s*\$?([\d,]+)/)?.[1]?.replace(",", "") ?? "0");
    const toolsStr = metaLine.match(/Tools:\s*([^|]+)/)?.[1]?.trim() ?? "";
    const tools = toolsStr === "none" ? [] : toolsStr.split(", ").filter(Boolean);
    const vertStr = metaLine.match(/Verticals:\s*(.+)/)?.[1]?.trim() ?? "";
    const verticals = vertStr.split(", ").filter(Boolean);

    clusters.push({
      jtbd,
      posting_count: postings,
      avg_salary: salary,
      tool_mentions: tools,
      is_automatable,
      automation_score: is_automatable ? 0.7 : 0.2,
      verticals,
    });
  }

  return clusters;
}

function parseReviewReport(content: string): ComplaintCluster[] {
  const clusters: ComplaintCluster[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("### ")) continue;
    // Format: ### 1. Ux Design in Property Management
    const match = line.match(/^### \d+\.\s+(.+?)\s+in\s+(.+)$/);
    if (!match) continue;

    const category = match[1].trim().toLowerCase().replace(/ /g, "_");
    const vertical = match[2].trim().toLowerCase().replace(/ /g, "_");
    const metaLine = lines[i + 1] ?? "";

    const count = parseInt(metaLine.match(/Complaints:\s*(\d+)/)?.[1] ?? "0");
    const productsStr = metaLine.match(/Products:\s*([^|]+)/)?.[1]?.trim() ?? "";
    const products = productsStr.split(", ").filter(Boolean);
    const avgScore = parseFloat(metaLine.match(/Avg upvotes:\s*([\d.]+)/)?.[1] ?? "0");

    clusters.push({
      vertical,
      complaint_category: category,
      count,
      products_affected: products,
      products_count: products.length,
      avg_score: avgScore,
    });
  }

  return clusters;
}

// ── Main Handler ─────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Load B2B seeds config
    const seedsConfig = await readJson<{ verticals: Record<string, VerticalConfig> }>(B2B_SEEDS, { verticals: {} });
    const verticals = Object.entries(seedsConfig.verticals).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      tier: cfg.tier,
      agent_fit: cfg.agent_native_fit ?? 0,
      competitors: cfg.saas_competitors?.length ?? 0,
      queries: cfg.job_queries?.length ?? 0,
    }));

    // 2. Parse latest JTBD report
    const jtbdReport = await readLatestReport(JTBD_DIR);
    const jtbdClusters = jtbdReport ? parseJTBDReport(jtbdReport.content) : [];
    const jtbdMeta = jtbdReport
      ? {
          date: jtbdReport.date,
          summary: jtbdReport.content.split("\n").find((l) => l.includes("Jobs scraped"))?.trim() ?? "",
        }
      : null;

    // 3. Parse latest review mining report
    const reviewReport = await readLatestReport(REVIEWS_DIR);
    const complaintClusters = reviewReport ? parseReviewReport(reviewReport.content) : [];
    const reviewMeta = reviewReport
      ? {
          date: reviewReport.date,
          summary: reviewReport.content.split("\n").find((l) => l.includes("Reddit posts"))?.trim() ?? "",
        }
      : null;

    // 4. Compute summary stats
    const totalJTBDs = jtbdClusters.length;
    const automatableJTBDs = jtbdClusters.filter((c) => c.is_automatable).length;
    const totalComplaints = complaintClusters.reduce((s, c) => s + c.count, 0);
    const topCategory = complaintClusters[0]?.complaint_category ?? null;
    const avgSalary = totalJTBDs > 0
      ? Math.round(jtbdClusters.reduce((s, c) => s + c.avg_salary, 0) / totalJTBDs)
      : 0;
    const totalPostings = jtbdClusters.reduce((s, c) => s + c.posting_count, 0);

    // 5. Vertical heat map (which verticals have most data)
    const verticalHeat: Record<string, { jtbds: number; complaints: number; postings: number }> = {};
    for (const c of jtbdClusters) {
      for (const v of c.verticals) {
        if (!verticalHeat[v]) verticalHeat[v] = { jtbds: 0, complaints: 0, postings: 0 };
        verticalHeat[v].jtbds += 1;
        verticalHeat[v].postings += c.posting_count;
      }
    }
    for (const c of complaintClusters) {
      if (!verticalHeat[c.vertical]) verticalHeat[c.vertical] = { jtbds: 0, complaints: 0, postings: 0 };
      verticalHeat[c.vertical].complaints += c.count;
    }

    // 6. Tool landscape (incumbents)
    const toolFreq: Record<string, number> = {};
    for (const c of jtbdClusters) {
      for (const t of c.tool_mentions) {
        toolFreq[t] = (toolFreq[t] ?? 0) + c.posting_count;
      }
    }
    const topTools = Object.entries(toolFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool, count]) => ({ tool, mentions: count }));

    return NextResponse.json({
      verticals,
      jtbd: {
        clusters: jtbdClusters.slice(0, 15),
        total: totalJTBDs,
        automatable: automatableJTBDs,
        totalPostings,
        avgSalary,
        meta: jtbdMeta,
      },
      complaints: {
        clusters: complaintClusters.slice(0, 10),
        total: totalComplaints,
        topCategory,
        meta: reviewMeta,
      },
      verticalHeat,
      topTools,
      summary: {
        totalVerticals: verticals.length,
        tierA: verticals.filter((v) => v.tier === "A").length,
        totalJTBDs,
        automatableJTBDs,
        totalComplaints,
        totalPostings,
        avgSalary,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
