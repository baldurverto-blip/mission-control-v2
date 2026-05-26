import type { FleetRegistryEntry } from "./fleet-registry";
import type { PostHogAppMetrics, PostHogFleetResult } from "./posthog-fleet";
import type { FleetRevenueCatSummary, RevenueCatFleetResult } from "./revenuecat-fleet";

export type DataQualityLevel = "trusted" | "partial" | "stale" | "blind" | "test";
export type TemperatureTone = "hot" | "warm" | "cold" | "blind" | "test";
export type RecommendationPriority = "high" | "medium" | "low" | "info";

export interface FleetPostHogSummary extends PostHogAppMetrics {
  telemetryScope: "production" | "test";
  telemetryNote: string | null;
  includedInFleet: boolean;
}

export interface DataQuality {
  level: DataQualityLevel;
  label: string;
  issues: string[];
  sources: string[];
}

export interface FleetTemperature {
  tone: TemperatureTone;
  label: string;
  summary: string;
}

export interface FleetRecommendation {
  priority: RecommendationPriority;
  owner: "baldur" | "builder" | "vibe" | "scout";
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low";
}

export interface AppStoreKPI {
  last_updated?: string;
  downloads_30d?: number | null;
  impressions_30d?: number | null;
}

export interface RevenueKPI {
  status?: string;
  mrr?: number | null;
  active_subs?: number | null;
  active_trials?: number | null;
  revenue_28d?: number | null;
  active_users_28d?: number | null;
  new_customers_28d?: number | null;
  trial_starts?: number | null;
  trial_to_paid_rate?: number | null;
}

interface InsightInput {
  status: string;
  appStore?: AppStoreKPI | null;
  revenue?: RevenueKPI | null;
  posthogResult: PostHogFleetResult;
  posthog: FleetPostHogSummary | null;
  revenuecatResult: RevenueCatFleetResult;
  revenuecat: FleetRevenueCatSummary | null;
  registry: FleetRegistryEntry;
}

function ageDays(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function rateBelow(value: number | null | undefined, threshold: number): boolean {
  return typeof value === "number" && value < threshold;
}

function hasRevenue(revenue?: RevenueKPI | null): boolean {
  return (revenue?.mrr ?? 0) > 0 || (revenue?.active_subs ?? 0) > 0;
}

function hasRevenueSource(input: InsightInput): boolean {
  return !!input.revenuecat || input.revenue?.status === "ok" || hasRevenue(input.revenue);
}

export function summarizePostHog(
  metrics: PostHogAppMetrics | null,
  registry: FleetRegistryEntry,
  status: string,
): FleetPostHogSummary | null {
  if (!metrics) return null;
  const includedInFleet = registry.telemetryScope === "production" && status === "shipped";
  return {
    ...metrics,
    telemetryScope: includedInFleet ? "production" : "test",
    telemetryNote: includedInFleet
      ? null
      : registry.telemetryNote ?? "Telemetry is excluded from production fleet metrics until this product is shipped.",
    includedInFleet,
  };
}

export function buildDataQuality(input: InsightInput): DataQuality {
  const issues: string[] = [];
  const sources = ["factory-state", "kpis.json"];
  const appStoreAge = ageDays(input.appStore?.last_updated);
  const revenuePending = !hasRevenueSource(input);

  if (input.posthogResult.status === "ok") {
    sources.push("posthog");
  } else {
    issues.push(input.posthogResult.error ?? "PostHog unavailable");
  }

  if (input.revenuecatResult.status === "ok") {
    sources.push("revenuecat");
  } else {
    issues.push(input.revenuecatResult.error ?? "RevenueCat unavailable");
  }

  if (input.posthog?.telemetryScope === "test") {
    issues.push(input.posthog.telemetryNote ?? "Non-production telemetry excluded");
    return { level: "test", label: "test data", issues, sources };
  }

  if (!input.posthog && input.status === "shipped") {
    issues.push(`No PostHog events matched ${input.registry.posthogAppName}`);
  }

  if (appStoreAge !== null && appStoreAge > 7) {
    issues.push(`App Store data is ${appStoreAge}d old`);
  }

  if (revenuePending) {
    issues.push("RevenueCat project/app is not matched to this Fleet product");
  }

  if (!input.posthog && input.status === "shipped") {
    return { level: "blind", label: "blind", issues, sources };
  }
  if (appStoreAge !== null && appStoreAge > 14) {
    return { level: "stale", label: "stale", issues, sources };
  }
  if (issues.length > 0) {
    return { level: "partial", label: "partial", issues, sources };
  }
  return { level: "trusted", label: "trusted", issues, sources };
}

export function buildTemperature(input: InsightInput): FleetTemperature {
  const ph = input.posthog;
  if (ph?.telemetryScope === "test") {
    return {
      tone: "test",
      label: "Test data",
      summary: "Telemetry exists, but this product is not counted as production fleet performance.",
    };
  }

  if (!ph) {
    return {
      tone: "blind",
      label: "Blind",
      summary: "No production PostHog signal is available for this app.",
    };
  }

  if (ph.users30d >= 20 && rateBelow(ph.activationRate, 15)) {
    return {
      tone: "hot",
      label: "Hot leak",
      summary: "Users are arriving, but too few reach the core value action.",
    };
  }

  if (ph.paywallUsers >= 10 && ph.monetizedUsers === 0) {
    return {
      tone: "hot",
      label: "Paywall leak",
      summary: "Users reach monetization, but no conversion is visible yet.",
    };
  }

  if (ph.users30d >= 20) {
    return {
      tone: "warm",
      label: "Active",
      summary: "There is enough product usage to guide iteration.",
    };
  }

  return {
    tone: "cold",
    label: "Low sample",
    summary: "Signal is too small for strong product conclusions.",
  };
}

export function buildRecommendation(input: InsightInput): FleetRecommendation {
  const ph = input.posthog;
  const appStoreAge = ageDays(input.appStore?.last_updated);

  if (ph?.telemetryScope === "test") {
    return {
      priority: "info",
      owner: "baldur",
      title: "Keep out of production readout",
      detail: ph.telemetryNote ?? "Treat this telemetry as test data until the app ships.",
      confidence: "high",
    };
  }

  if (!ph && input.status === "shipped") {
    return {
      priority: "high",
      owner: "builder",
      title: "Verify PostHog production events",
      detail: `No events matched ${input.registry.posthogAppName}; confirm app name, production key, and first launch telemetry.`,
      confidence: "high",
    };
  }

  if (ph && ph.users30d >= 20 && rateBelow(ph.activationRate, 15)) {
    return {
      priority: "high",
      owner: "builder",
      title: "Audit first value path",
      detail: `${ph.users30d} users in 30d, but only ${ph.coreActionUsers} reached a core action (${ph.activationRate ?? 0}%). Review onboarding, empty states, and the first successful action.`,
      confidence: "high",
    };
  }

  if (ph && ph.paywallUsers >= 10 && ph.monetizedUsers === 0) {
    return {
      priority: "high",
      owner: "builder",
      title: "Fix paywall conversion path",
      detail: `${ph.paywallUsers} users saw paywall events, but PostHog shows no trial or purchase. Check timing, offer clarity, and RevenueCat event wiring.`,
      confidence: "medium",
    };
  }

  if (ph && ph.monetizedUsers > 0 && !hasRevenue(input.revenue)) {
    return {
      priority: "medium",
      owner: "baldur",
      title: "Map RevenueCat reporting",
      detail: `PostHog sees ${ph.monetizedUsers} monetization user(s), but Mission Control has no matched RevenueCat project/app for this product.`,
      confidence: "medium",
    };
  }

  if (!input.revenuecat && input.status === "shipped") {
    return {
      priority: "medium",
      owner: "baldur",
      title: "Add RevenueCat v2 key",
      detail: `No RevenueCat project/app matched ${input.registry.revenueCatProjectNames.join(" or ")}. Add the app's v2 secret key or project mapping so MRR, subscriptions, trials, and revenue are live.`,
      confidence: "high",
    };
  }

  if (appStoreAge !== null && appStoreAge > 14) {
    return {
      priority: "medium",
      owner: "baldur",
      title: "Refresh App Store ingest",
      detail: `ASC metrics are ${appStoreAge} days old. Add or verify the ASC app ID and rerun ingestion.`,
      confidence: "high",
    };
  }

  if (ph && ph.users30d < 10) {
    return {
      priority: "low",
      owner: "vibe",
      title: "Collect more demand signal",
      detail: `${ph.users30d} users in 30d is too small for product judgment. Prioritize distribution before product changes.`,
      confidence: "medium",
    };
  }

  return {
    priority: "info",
    owner: "baldur",
    title: "Keep monitoring",
    detail: "No urgent production signal. Let the next daily ingest update the picture before changing the app.",
    confidence: "low",
  };
}
