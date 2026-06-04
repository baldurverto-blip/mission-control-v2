import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { FACTORY_DIR, SAAS_FACTORY_DIR } from "@/app/lib/paths";
import { getFleetRegistryEntry } from "@/app/lib/fleet-registry";
import { fetchPostHogFleetMetrics } from "@/app/lib/posthog-fleet";
import {
  fetchRevenueCatFleetMetrics,
  metricsForRevenueCatRegistryEntry,
  summarizeRevenueCat,
} from "@/app/lib/revenuecat-fleet";
import { buildDataQuality, buildRecommendation, buildTemperature, summarizePostHog } from "@/app/lib/fleet-insights";

interface PhaseState {
  status: string;
  score?: number;
  completed_at?: string;
}

interface ProjectState {
  slug: string;
  name?: string | null;
  status: string;
  phase: number;
  phases: Record<string, PhaseState>;
  track?: string;
  product_type?: string;
  created_at: string;
  updated_at: string;
  failure_reason?: string | null;
  update_in_review?: boolean;
  update_version?: string;
}

interface KPIFile {
  slug: string;
  shipped_at?: string;
  app_store?: {
    status?: string;
    downloads_30d?: number;
    impressions_30d?: number | null;
    last_updated?: string;
  };
  revenue?: {
    status?: string;
    mrr?: number | null;
    active_subs?: number | null;
    active_trials?: number | null;
    revenue_28d?: number | null;
    active_users_28d?: number | null;
    new_customers_28d?: number | null;
    churn_rate?: number | null;
    trial_starts?: number | null;
    trial_to_paid_rate?: number | null;
  };
  retention?: {
    status?: string;
    dau?: number | null;
    wau?: number | null;
    mau?: number | null;
    d1?: number | null;
    d7?: number | null;
    d30?: number | null;
  };
  reddit?: {
    total_comments?: number;
    posted_comments?: number;
    latest_karma?: number;
  };
  waitlist?: {
    signup_count?: number;
    landing_page_url?: string;
  };
  seo?: {
    blog_posts?: number;
    total_indexed_pages?: number;
  };
  signals?: { type: string; severity: string; message: string }[];
  distribution_engine?: {
    engine_status?: string;
    active_layers?: string[];
  };
  aso?: {
    last_pulled?: string;
    current?: { keywords?: string; keyword_chars?: number; subtitle?: string; version?: string };
    proposal?: { keywords?: string; keyword_chars?: number; status?: string; rationale?: string };
    cpp?: { name?: string; status?: string };
    ppo?: { test?: string; status?: string };
  };
}

// Products that have been shipped/submitted belong in Fleet
const FLEET_STATUSES = new Set(["shipped", "submitted", "waiting_for_review"]);

function isFleetEligible(state: ProjectState): boolean {
  if (FLEET_STATUSES.has(state.status)) return true;
  // Rejected apps that were previously submitted (shipping/packaging/deploy phase completed)
  if (state.status === "rejected") {
    const { shipping, packaging, deploy } = state.phases;
    return shipping?.status === "complete" || packaging?.status === "complete" || deploy?.status === "complete";
  }
  return false;
}

function inferPlatform(state: ProjectState): "iOS" | "Web" | "Both" {
  const track = state.track ?? "mobile";
  if (track === "saas") return "Web";
  return "iOS";
}

function displayName(state: ProjectState, onePagerText?: string): string {
  if (state.name) return state.name;
  if (onePagerText) {
    const heading = onePagerText.split(/\r?\n/).find((l) => l.startsWith("# "));
    if (heading) {
      const clean = heading.replace(/^#\s+App One-Pager:\s*/i, "").trim();
      if (clean) return clean;
    }
  }
  // slug → Title Case
  return state.slug
    .replace(/-\d{4}$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

async function scanDir(dir: string, track: string) {
  const results: {
    state: ProjectState;
    kpis: KPIFile | null;
    name: string;
    platform: "iOS" | "Web" | "Both";
    qgScore: number | null;
    e2eStatus: string | null;
  }[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const stateFile = join(dir, entry, "state.json");
    try {
      const info = await stat(join(dir, entry));
      if (!info.isDirectory()) continue;

      const raw = await readFile(stateFile, "utf-8");
      const state: ProjectState = JSON.parse(raw);
      if (!state.track) state.track = track;

      if (!isFleetEligible(state)) continue;

      // Read KPI data
      let kpis: KPIFile | null = null;
      try {
        const kpiRaw = await readFile(join(dir, entry, "kpis.json"), "utf-8");
        kpis = JSON.parse(kpiRaw);
      } catch { /* no kpis */ }

      // Read one-pager for name
      let onePager: string | undefined;
      try {
        onePager = (await readFile(join(dir, entry, "one-pager.md"), "utf-8")).slice(0, 500);
      } catch { /* no one-pager */ }

      // QG score
      let qgScore: number | null = null;
      try {
        const qgText = await readFile(join(dir, entry, "quality-gate-report.md"), "utf-8");
        const m = qgText.match(/Score(?:\s+Achieved)?[:\s]*\*{0,2}\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
        if (m) qgScore = parseFloat(m[1]);
        if (qgScore === null) {
          const m10 = qgText.match(/(\d+(?:\.\d+)?)\s*\/\s*10(?:\)|\s|$)/i);
          if (m10) qgScore = parseFloat(m10[1]) * 10;
        }
      } catch { /* no QG report */ }

      // E2E status
      let e2eStatus: string | null = null;
      try {
        const e2eRaw = await readFile(join(dir, entry, "e2e-results.json"), "utf-8");
        const e2e = JSON.parse(e2eRaw);
        e2eStatus = e2e.status ?? null;
      } catch { /* no e2e */ }

      results.push({
        state,
        kpis,
        name: displayName(state, onePager),
        platform: inferPlatform(state),
        qgScore,
        e2eStatus,
      });
    } catch { /* skip */ }
  }

  return results;
}

export async function GET() {
  try {
    const [mobileProducts, saasProducts, posthogResult, revenuecatResult] = await Promise.all([
      scanDir(FACTORY_DIR, "mobile"),
      scanDir(SAAS_FACTORY_DIR, "saas"),
      fetchPostHogFleetMetrics(),
      fetchRevenueCatFleetMetrics(),
    ]);

    const all = [...mobileProducts, ...saasProducts];

    const products = all.map((p) => {
      const k = p.kpis;
      const registry = getFleetRegistryEntry(p.state.slug, p.name);
      const posthogRaw = posthogResult.byApp[registry.posthogAppName] ?? null;
      const posthog = summarizePostHog(posthogRaw, registry, p.state.status);
      const revenuecatRaw = metricsForRevenueCatRegistryEntry(revenuecatResult, registry);
      const revenuecat = summarizeRevenueCat(revenuecatRaw, registry, p.state.status);
      const revenue = revenuecat
        ? {
            status: "ok",
            mrr: revenuecat.mrr,
            active_subs: revenuecat.activeSubscriptions,
            active_trials: revenuecat.activeTrials,
            revenue_28d: revenuecat.revenue28d,
            active_users_28d: revenuecat.activeUsers28d,
            new_customers_28d: revenuecat.newCustomers28d,
            churn_rate: null,
            trial_starts: null,
            trial_to_paid_rate: null,
            source: "revenuecat-api",
            last_updated: revenuecat.updatedAt,
          }
        : k?.revenue ?? null;
      const dataQuality = buildDataQuality({
        status: p.state.status,
        appStore: k?.app_store ?? null,
        revenue,
        posthogResult,
        posthog,
        revenuecatResult,
        revenuecat,
        registry,
      });
      const temperature = buildTemperature({
        status: p.state.status,
        appStore: k?.app_store ?? null,
        revenue,
        posthogResult,
        posthog,
        revenuecatResult,
        revenuecat,
        registry,
      });
      const recommendation = buildRecommendation({
        status: p.state.status,
        appStore: k?.app_store ?? null,
        revenue,
        posthogResult,
        posthog,
        revenuecatResult,
        revenuecat,
        registry,
      });
      const productionPostHog = posthog?.includedInFleet ? posthog : null;

      return {
        slug: p.state.slug,
        name: p.name,
        track: p.state.track ?? "mobile",
        platform: p.platform,
        status: p.state.status,
        productType: p.state.product_type ?? null,
        shipDate: k?.shipped_at ?? null,
        updatedAt: p.state.updated_at,
        failureReason: p.state.failure_reason ?? null,

        // App Store
        appStoreStatus: k?.app_store?.status ?? null,
        downloads30d: k?.app_store?.downloads_30d ?? 0,

        // Revenue
        mrr: revenue?.mrr ?? null,
        activeSubs: revenue?.active_subs ?? null,
        activeTrials: revenue?.active_trials ?? null,
        revenue28d: revenue?.revenue_28d ?? null,
        revenueActiveUsers28d: revenue?.active_users_28d ?? null,
        revenueNewCustomers28d: revenue?.new_customers_28d ?? null,
        churnRate: revenue?.churn_rate ?? null,
        revenuecat,

        // Retention
        dau: productionPostHog?.dau ?? k?.retention?.dau ?? null,
        wau: productionPostHog?.wau ?? k?.retention?.wau ?? null,
        mau: productionPostHog?.mau ?? k?.retention?.mau ?? null,
        d1Retention: productionPostHog?.d1Retention ?? k?.retention?.d1 ?? null,
        d7Retention: productionPostHog?.d7Retention ?? k?.retention?.d7 ?? null,
        users30d: productionPostHog?.users30d ?? null,
        installs30d: productionPostHog?.installs30d ?? null,
        activationRate: productionPostHog?.activationRate ?? null,
        coreActionUsers: productionPostHog?.coreActionUsers ?? null,
        paywallUsers: productionPostHog?.paywallUsers ?? null,
        monetizedUsers: productionPostHog?.monetizedUsers ?? null,
        posthog,
        telemetryScope: posthog?.telemetryScope ?? (registry.telemetryScope === "test" ? "test" : "production"),

        // Distribution
        redditComments: k?.reddit?.total_comments ?? 0,
        redditKarma: k?.reddit?.latest_karma ?? 0,
        waitlistCount: k?.waitlist?.signup_count ?? 0,
        landingUrl: k?.waitlist?.landing_page_url ?? null,
        seoPosts: k?.seo?.blog_posts ?? 0,
        seoPages: k?.seo?.total_indexed_pages ?? 0,
        distributionStatus: k?.distribution_engine?.engine_status ?? null,
        activeLayers: k?.distribution_engine?.active_layers ?? [],

        // ASO loop (PULL channel) — current listing + any pending keyword/CPP push
        aso: k?.aso
          ? {
              keywordChars: k.aso.current?.keyword_chars ?? null,
              lastPulled: k.aso.last_pulled ?? null,
              // Live push (CPP / promo / PPO screenshots) — no build needed
              livePending: k.aso.cpp?.status === "pending_approval",
              // Metadata change locked on a live version — rides the next build
              queuedForBuild:
                k.aso.proposal?.status === "queued_for_build"
                  ? (k.aso.proposal as { target_build?: string }).target_build ?? "next"
                  : null,
              proposalKeywords: k.aso.proposal?.keywords ?? null,
              cppName: k.aso.cpp?.status === "pending_approval" ? k.aso.cpp?.name ?? null : null,
            }
          : null,

        // Signals
        activeSignals: k?.signals?.length ?? 0,
        signals: k?.signals ?? [],

        // Health
        qgScore: p.qgScore,
        e2eStatus: p.e2eStatus,

        // Update in review
        updateInReview: p.state.update_in_review ?? false,
        updateVersion: p.state.update_version ?? null,

        // Operator readout
        dataQuality,
        temperature,
        recommendation,
      };
    });

    // Sort: shipped first, then submitted, then rejected
    const statusOrder: Record<string, number> = {
      shipped: 0,
      submitted: 1,
      waiting_for_review: 2,
      rejected: 3,
    };
    products.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

    // Aggregate stats
    const productionPostHogApps = products.flatMap((p) => (p.posthog?.includedInFleet ? [p.posthog] : []));
    const productionPostHogNames = new Set(productionPostHogApps.map((p) => p.appName));
    const productionRevenueCatApps = products.flatMap((p) => (p.revenuecat?.includedInFleet ? [p.revenuecat] : []));
    const testTelemetryExcluded = Object.values(posthogResult.byApp)
      .filter((p) => !productionPostHogNames.has(p.appName))
      .reduce((sum, p) => sum + p.users30d, 0);

    const stats = {
      totalProducts: products.length,
      live: products.filter((p) => p.status === "shipped" || p.appStoreStatus === "live").length,
      inReview: products.filter((p) => p.status === "submitted" || p.status === "waiting_for_review").length,
      rejected: products.filter((p) => p.status === "rejected").length,
      totalMRR: productionRevenueCatApps.reduce((sum, p) => sum + p.mrr, 0),
      totalRevenue28d: productionRevenueCatApps.reduce((sum, p) => sum + p.revenue28d, 0),
      totalActiveSubs: productionRevenueCatApps.reduce((sum, p) => sum + p.activeSubscriptions, 0),
      totalDownloads: products.reduce((sum, p) => sum + p.downloads30d, 0),
      totalPostHogUsers: productionPostHogApps.reduce((sum, p) => sum + p.users30d, 0),
      totalPostHogInstalls: productionPostHogApps.reduce((sum, p) => sum + p.installs30d, 0),
      appsWithPostHog: productionPostHogApps.length,
      appsWithRevenueCat: productionRevenueCatApps.length,
      openRecommendations: products.filter((p) => p.recommendation.priority === "high" || p.recommendation.priority === "medium").length,
      posthogStatus: posthogResult.status,
      posthogUpdatedAt: posthogResult.updatedAt,
      revenuecatStatus: revenuecatResult.status,
      revenuecatUpdatedAt: revenuecatResult.updatedAt,
      testTelemetryExcluded,
      totalRedditKarma: products.reduce((sum, p) => sum + p.redditKarma, 0),
    };

    return NextResponse.json({ products, stats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
