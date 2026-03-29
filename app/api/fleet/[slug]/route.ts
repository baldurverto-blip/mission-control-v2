import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { FACTORY_DIR, SAAS_FACTORY_DIR } from "@/app/lib/paths";

async function findProjectDir(slug: string): Promise<string | null> {
  for (const base of [FACTORY_DIR, SAAS_FACTORY_DIR]) {
    const dir = join(base, slug);
    try {
      const info = await stat(dir);
      if (info.isDirectory()) return dir;
    } catch { /* not here */ }
  }
  return null;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function readMd(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function parseQGReport(dir: string) {
  const text = await readMd(join(dir, "quality-gate-report.md"));
  if (!text) return { score: null, verdict: null };

  let verdict: string | null = null;
  const vm = text.match(/(?:Verdict|Recommendation)[:\s]*\*{0,2}\s*(PASS|FAIL)/i)
    ?? text.match(/^###?\s+(PASS|FAIL)/mi);
  if (vm) verdict = vm[1].toUpperCase();

  let score: number | null = null;
  const s100 = text.match(/Score(?:\s+Achieved)?[:\s]*\*{0,2}\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
  if (s100) score = parseFloat(s100[1]);
  if (score === null) {
    const s10 = text.match(/(\d+(?:\.\d+)?)\s*\/\s*10(?:\)|\s|$)/i);
    if (s10) score = parseFloat(s10[1]) * 10;
  }
  return { score, verdict };
}

async function parseCRReport(dir: string) {
  const text = await readMd(join(dir, "code-review-report.md"));
  if (!text) return { verdict: null, criticalIssues: 0, highIssues: 0 };

  let verdict: string | null = null;
  const vm = text.match(/(?:Verdict|Recommendation)[:\s]*\*{0,2}\s*(PASS|FAIL)/i);
  if (vm) verdict = vm[1].toUpperCase();

  let critical = 0, high = 0;
  const cm = text.match(/(\d+)\s+CRITICAL/i);
  if (cm) critical = parseInt(cm[1]);
  const hm = text.match(/(\d+)\s+HIGH/i);
  if (hm) high = parseInt(hm[1]);

  return { verdict, criticalIssues: critical, highIssues: high };
}

async function countScreenshots(dir: string): Promise<number> {
  try {
    const files = await readdir(join(dir, "screenshots"));
    return files.filter((f) => f.endsWith(".png") || f.endsWith(".jpg")).length;
  } catch {
    return 0;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const dir = await findProjectDir(slug);
  if (!dir) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    // Read all data sources in parallel
    const [
      state,
      kpis,
      distState,
      e2eResults,
      qg,
      cr,
      screenshotCount,
      seoLearnings,
      appStoreListing,
    ] = await Promise.all([
      readJson<Record<string, unknown>>(join(dir, "state.json")),
      readJson<Record<string, unknown>>(join(dir, "kpis.json")),
      readJson<Record<string, unknown>>(join(dir, "distribution-state.json")),
      readJson<Record<string, unknown>>(join(dir, "e2e-results.json")),
      parseQGReport(dir),
      parseCRReport(dir),
      countScreenshots(dir),
      readJson<Record<string, unknown>>(join(dir, "seo-learnings.json")),
      readMd(join(dir, "app-store-listing.md")),
    ]);

    if (!state) {
      return NextResponse.json({ error: "No state.json found" }, { status: 404 });
    }

    // Build overview
    const overview = {
      slug,
      name: state.name ?? slug,
      track: state.track ?? "mobile",
      status: state.status,
      productType: state.product_type,
      createdAt: state.created_at,
      updatedAt: state.updated_at,
      failureReason: state.failure_reason ?? null,
      phases: state.phases,
    };

    // Analytics from kpis.json
    const analytics = kpis
      ? {
          shipDate: kpis.shipped_at ?? null,
          lastIngested: kpis.last_ingested ?? null,
          appStore: kpis.app_store ?? null,
          revenue: kpis.revenue ?? null,
          retention: kpis.retention ?? null,
          waitlist: kpis.waitlist ?? null,
          signals: kpis.signals ?? [],
          signalsLastEvaluated: kpis.signals_last_evaluated ?? null,
        }
      : null;

    // Distribution
    const distribution = {
      reddit: kpis ? (kpis.reddit ?? null) : null,
      seo: seoLearnings
        ? {
            blogPosts: (seoLearnings as Record<string, unknown>).blog_posts
              ? ((seoLearnings as Record<string, unknown>).blog_posts as unknown[]).length
              : 0,
            faqEntries: seoLearnings.faq_entries ?? 0,
            programmaticPages: seoLearnings.programmatic_pages ?? 0,
            totalIndexedPages: seoLearnings.total_indexed_pages ?? 0,
          }
        : null,
      engine: distState ?? null,
      landingUrl: (kpis?.waitlist as Record<string, unknown>)?.landing_page_url ?? null,
    };

    // Health
    const health = {
      qualityGate: qg,
      codeReview: cr,
      e2e: e2eResults ?? null,
      screenshotCount,
    };

    // Marketing summary
    const marketing = {
      reddit: kpis ? (kpis.reddit ?? null) : null,
      seo: distribution.seo,
      waitlist: kpis ? (kpis.waitlist ?? null) : null,
      hasAppStoreListing: !!appStoreListing,
    };

    return NextResponse.json({
      overview,
      analytics,
      distribution,
      health,
      marketing,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
