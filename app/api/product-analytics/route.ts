import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");
const SUPABASE_URL = "https://doxlsxmnmmzowwphdmxi.supabase.co";

// ─── Types ───────────────────────────────────────────────────────────

interface KPISnapshot {
  week: string;
  date: string;
  traffic: { impressions: number; page_views: number; downloads: number };
  users: { dau: number; wau: number; mau: number; d1_retention: number | null; d7_retention: number | null; d30_retention: number | null };
  revenue: { trial_starts: number; trial_to_paid: number | null; mrr: number; arpu: number };
  churn: { active_subs: number; cancellations: number; churn_rate: number | null; refund_rate: number | null };
}

interface KPIData {
  slug: string;
  ship_date: string;
  snapshots: KPISnapshot[];
  signals: string[];
  actions_taken: string[];
}

interface WaitlistEntry {
  email: string;
  source: string;
  created_at: string;
}

// ─── Supabase Helpers ────────────────────────────────────────────────

async function fetchWaitlistCount(slug: string): Promise<number> {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return 0;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?project=eq.${slug}&select=id&order=created_at.desc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "count=exact",
          "Content-Type": "application/json",
        },
      }
    );
    // Total count comes from content-range header: "0-N/TOTAL"
    const range = res.headers.get("content-range");
    if (range) {
      const total = range.split("/")[1];
      if (total && total !== "*") return parseInt(total, 10);
    }
    // Fallback: count the returned items
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

async function fetchRecentSignups(slug: string): Promise<WaitlistEntry[]> {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?project=eq.${slug}&select=email,source,created_at&order=created_at.desc&limit=5`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ─── RevenueCat API ─────────────────────────────────────────────────

interface RevenueCatOverview {
  mrr: number;
  activeSubscriptions: number;
  trialsStarted: number;
  activeTrials: number;
  revenue: number;
  refunds: number;
  trialConversion: number | null;
  churnRate: number | null;
  installs: number;
}

// RevenueCat app IDs per product (add new apps here)
const RC_APP_IDS: Record<string, string> = {
  safebite: "app1a2b3c4d5e", // placeholder — update with real app ID from RC dashboard
};

async function fetchRevenueCatMetrics(slug: string): Promise<RevenueCatOverview | null> {
  const apiKey = process.env.REVENUECAT_SECRET_KEY;
  if (!apiKey) return null;

  try {
    // RevenueCat v2 Overview endpoint
    const res = await fetch("https://api.revenuecat.com/v2/projects/-/metrics/overview", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error("[RC] API error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    const metrics = data.metrics ?? data;

    return {
      mrr: metrics.mrr ?? metrics.monthly_recurring_revenue ?? 0,
      activeSubscriptions: metrics.active_subscriptions_count ?? metrics.active_subscribers ?? 0,
      trialsStarted: metrics.trial_starts ?? 0,
      activeTrials: metrics.active_trials ?? 0,
      revenue: metrics.revenue ?? 0,
      refunds: metrics.refunds ?? 0,
      trialConversion: metrics.trial_conversion ?? null,
      churnRate: metrics.churn_rate ?? null,
      installs: metrics.installs ?? 0,
    };
  } catch (err) {
    console.error("[RC] Fetch error:", err);
    return null;
  }
}

// ─── Vercel Web Analytics ────────────────────────────────────────────

// Vercel project IDs per product landing page (add new apps here)
const VERCEL_PROJECT_IDS: Record<string, string> = {
  "chilllog": "prj_SP05kI0iUtsud4uo1qXLnpdZSBh8",
  safebite: "prj_2jHxzL2tnq6sfhcNlbZZtCvuhjoc",
  brief: "prj_QiRX3n88KBT1SBzYlfO1wEKQCnYx",
};

interface VercelAnalytics {
  visitors: number;
  pageViews: number;
  bounceRate: number;
  topPages: { key: string; total: number }[];
  source: "vercel-analytics";
}

async function fetchVercelAnalytics(slug: string): Promise<VercelAnalytics | null> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = VERCEL_PROJECT_IDS[slug];
  if (!token || !projectId) return null;

  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().replace(/\.\d{3}Z$/, "Z");
  const toStr = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const teamParam = teamId ? `&teamId=${teamId}` : "";

  try {
    // Fetch overview and top pages in parallel
    const [overviewRes, pagesRes] = await Promise.all([
      fetch(
        `https://vercel.com/api/web-analytics/overview?projectId=${projectId}&environment=production&from=${fromStr}&to=${toStr}${teamParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `https://vercel.com/api/web-analytics/pages?projectId=${projectId}&environment=production&from=${fromStr}&to=${toStr}&limit=5${teamParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    if (!overviewRes.ok) {
      console.error("[Vercel] Overview error:", overviewRes.status);
      return null;
    }

    const overview = await overviewRes.json();
    const pages = pagesRes.ok ? await pagesRes.json() : { data: [] };

    return {
      visitors: overview.total ?? overview.visitors ?? 0,
      pageViews: overview.pageViews ?? 0,
      bounceRate: overview.bounceRate ?? 0,
      topPages: (pages.data ?? []).slice(0, 5).map((p: { key: string; total: number }) => ({
        key: p.key,
        total: p.total,
      })),
      source: "vercel-analytics",
    };
  } catch (err) {
    console.error("[Vercel] Analytics fetch error:", err);
    return null;
  }
}

// ─── SEO Learnings Reader ───────────────────────────────────────────

interface SEOMetrics {
  blogPosts: number;
  faqEntries: number;
  programmaticPages: number;
  totalIndexedPages: number;
  latestPost: { slug: string; primary_keyword: string; published_at: string } | null;
  initializedAt: string | null;
}

async function readSEOMetrics(slug: string): Promise<SEOMetrics> {
  try {
    const raw = await readFile(join(FACTORY, slug, "seo-learnings.json"), "utf-8");
    const data = JSON.parse(raw);
    const posts = data.blog_posts ?? [];
    const latestPost = posts.length > 0 ? posts[posts.length - 1] : null;
    return {
      blogPosts: posts.length,
      faqEntries: data.faq_entries ?? 0,
      programmaticPages: data.programmatic_pages ?? 0,
      totalIndexedPages: data.total_indexed_pages ?? 0,
      latestPost,
      initializedAt: data.initialized_at ?? null,
    };
  } catch {
    return { blogPosts: 0, faqEntries: 0, programmaticPages: 0, totalIndexedPages: 0, latestPost: null, initializedAt: null };
  }
}

// ─── Factory KPI Reader ──────────────────────────────────────────────

async function readFactoryKPIs(slug: string): Promise<KPIData | null> {
  try {
    const raw = await readFile(join(FACTORY, slug, "kpis.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readFactoryState(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(FACTORY, slug, "state.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── GET Handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  try {
    // Fetch all data sources in parallel
    const [waitlistCount, recentSignups, kpis, state, rcMetrics, seoMetrics, vercelAnalytics] = await Promise.all([
      fetchWaitlistCount(slug),
      fetchRecentSignups(slug),
      readFactoryKPIs(slug),
      readFactoryState(slug),
      fetchRevenueCatMetrics(slug),
      readSEOMetrics(slug),
      fetchVercelAnalytics(slug),
    ]);

    // Aggregate waitlist sources
    const sourceCounts: Record<string, number> = {};
    // We only have the last 5 from recent signups, but that gives a signal
    for (const entry of recentSignups) {
      const src = entry.source || "direct";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    // Extract latest KPI snapshot
    const latestKPI = kpis?.snapshots?.length
      ? kpis.snapshots[kpis.snapshots.length - 1]
      : null;

    // Prefer live RevenueCat API data, fall back to factory KPI snapshots
    const revenueCat = rcMetrics
      ? {
          mrr: rcMetrics.mrr,
          activeSubscriptions: rcMetrics.activeSubscriptions,
          trialsStarted: rcMetrics.trialsStarted,
          activeTrials: rcMetrics.activeTrials,
          revenue: rcMetrics.revenue,
          refunds: rcMetrics.refunds,
          trialConversion: rcMetrics.trialConversion,
          churnRate: rcMetrics.churnRate,
          installs: rcMetrics.installs,
          source: "revenuecat-api" as const,
        }
      : {
          mrr: latestKPI?.revenue?.mrr ?? 0,
          activeSubscriptions: latestKPI?.churn?.active_subs ?? 0,
          trialsStarted: latestKPI?.revenue?.trial_starts ?? 0,
          activeTrials: 0,
          revenue: 0,
          refunds: 0,
          trialConversion: latestKPI?.revenue?.trial_to_paid ?? null,
          churnRate: latestKPI?.churn?.churn_rate ?? null,
          installs: 0,
          source: "factory-kpi" as const,
        };

    // Landing page traffic: prefer Vercel Analytics (live), fall back to factory KPI snapshots
    const landingTraffic = {
      visitors: vercelAnalytics?.visitors ?? 0,
      pageViews: vercelAnalytics?.pageViews ?? latestKPI?.traffic?.page_views ?? 0,
      bounceRate: vercelAnalytics?.bounceRate ?? 0,
      topPages: vercelAnalytics?.topPages ?? [],
      source: vercelAnalytics ? "vercel-analytics" as const : "factory-kpi" as const,
    };

    // TODO: Wire ASC API when review approved
    const appStore = {
      impressions: latestKPI?.traffic?.impressions ?? 0,
      pageViews: latestKPI?.traffic?.page_views ?? 0,
      downloads: latestKPI?.traffic?.downloads ?? 0,
      conversionRate: null as number | null,
    };

    // Compute App Store conversion rate if data available
    if (appStore.impressions > 0 && appStore.downloads > 0) {
      appStore.conversionRate = Math.round((appStore.downloads / appStore.impressions) * 10000) / 100;
    }

    return NextResponse.json({
      slug,
      status: (state as Record<string, unknown>)?.status ?? "unknown",
      waitlist: {
        count: waitlistCount,
        target: 500, // default waitlist target
        recentSignups,
        sourceCounts,
      },
      kpis: {
        snapshots: kpis?.snapshots ?? [],
        latest: latestKPI,
        shipDate: kpis?.ship_date ?? (kpis as unknown as Record<string, string>)?.shipped_at ?? null,
        signals: kpis?.signals ?? [],
      },
      revenueCat,
      appStore,
      landingTraffic,
      seo: seoMetrics,
      factoryState: state,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
