import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { isProductionTelemetry, type FleetRegistryEntry } from "./fleet-registry";

export interface RevenueCatApp {
  id: string;
  name: string;
  type: string;
  bundleId: string | null;
  appStoreConnectConfigured: boolean | null;
  subscriptionKeyConfigured: boolean | null;
}

export interface RevenueCatProjectMetrics {
  source: "revenuecat-api";
  projectId: string;
  projectName: string;
  apps: RevenueCatApp[];
  mrr: number;
  revenue28d: number;
  activeSubscriptions: number;
  activeTrials: number;
  newCustomers28d: number;
  activeUsers28d: number;
  currency: string;
  updatedAt: string;
}

export interface FleetRevenueCatSummary extends RevenueCatProjectMetrics {
  telemetryScope: "production" | "test";
  telemetryNote: string | null;
  includedInFleet: boolean;
}

export interface RevenueCatFleetResult {
  status: "ok" | "missing_env" | "error";
  updatedAt: string;
  error?: string;
  errors: string[];
  projects: RevenueCatProjectMetrics[];
}

interface RevenueCatListResponse<T> {
  items?: T[];
  message?: string;
}

interface RevenueCatProject {
  id?: string;
  name?: string;
}

interface RevenueCatAppResponse {
  id?: string;
  name?: string;
  type?: string;
  app_store?: {
    bundle_id?: string;
    app_store_connect_api_key_configured?: boolean;
    subscription_key_configured?: boolean;
  };
}

interface RevenueCatOverviewResponse {
  metrics?: {
    id?: string;
    unit?: string;
    value?: number;
  }[];
  message?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: RevenueCatFleetResult } | null = null;
let envCache: Record<string, string> | null = null;

function readEnvFiles(): Record<string, string> {
  if (envCache) return envCache;

  const candidates = Array.from(new Set([
    join(process.cwd(), ".env.local"),
    join(homedir(), "projects/mission-control-v2/.env.local"),
    join(homedir(), ".openclaw/.env.bws"),
    join(homedir(), ".openclaw/.env"),
  ]));

  const values: Record<string, string> = {};
  for (const filePath of candidates) {
    try {
      const content = readFileSync(filePath, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
        const separator = normalized.indexOf("=");
        if (separator <= 0) continue;

        const key = normalized.slice(0, separator).trim();
        let value = normalized.slice(separator + 1).trim();
        const quote = value[0];
        if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
          value = value.slice(1, -1);
        }
        values[key] = value;
      }
    } catch {
      // Optional local secret files. The LaunchAgent environment is still the
      // primary runtime path; these keep local standalone Mission Control honest.
    }
  }

  envCache = values;
  return values;
}

function revenueCatApiKeys(): string[] {
  const env = { ...readEnvFiles(), ...process.env };
  const keys = Object.entries(env)
    .filter(([key, value]) => {
      if (!value || typeof value !== "string") return false;
      if (!value.startsWith("sk_") && !value.startsWith("atk_")) return false;
      return key.includes("REVENUECAT") || key.includes("RC_V2");
    })
    .map(([, value]) => value);
  return Array.from(new Set(keys));
}

function metricValue(metrics: RevenueCatOverviewResponse["metrics"], id: string): number {
  const value = metrics?.find((metric) => metric.id === id)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricCurrency(metrics: RevenueCatOverviewResponse["metrics"]): string {
  const unit = metrics?.find((metric) => metric.id === "mrr" || metric.id === "revenue")?.unit;
  return typeof unit === "string" && unit.trim() ? unit : "$";
}

async function revenueCatGet<T>(apiKey: string, path: string): Promise<T> {
  const response = await fetch(`https://api.revenuecat.com/v2${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    throw new Error(json.message ?? `RevenueCat request failed: ${response.status}`);
  }
  return json;
}

async function fetchProjectMetrics(apiKey: string, project: RevenueCatProject, updatedAt: string): Promise<RevenueCatProjectMetrics | null> {
  if (!project.id || !project.name) return null;

  const [appsResponse, overview] = await Promise.all([
    revenueCatGet<RevenueCatListResponse<RevenueCatAppResponse>>(apiKey, `/projects/${project.id}/apps`),
    revenueCatGet<RevenueCatOverviewResponse>(apiKey, `/projects/${project.id}/metrics/overview`),
  ]);

  const apps = (appsResponse.items ?? []).map((app) => ({
    id: app.id ?? "",
    name: app.name ?? "Untitled RevenueCat app",
    type: app.type ?? "unknown",
    bundleId: app.app_store?.bundle_id ?? null,
    appStoreConnectConfigured: app.app_store?.app_store_connect_api_key_configured ?? null,
    subscriptionKeyConfigured: app.app_store?.subscription_key_configured ?? null,
  }));

  return {
    source: "revenuecat-api",
    projectId: project.id,
    projectName: project.name,
    apps,
    mrr: metricValue(overview.metrics, "mrr"),
    revenue28d: metricValue(overview.metrics, "revenue"),
    activeSubscriptions: metricValue(overview.metrics, "active_subscriptions"),
    activeTrials: metricValue(overview.metrics, "active_trials"),
    newCustomers28d: metricValue(overview.metrics, "new_customers"),
    activeUsers28d: metricValue(overview.metrics, "active_users"),
    currency: metricCurrency(overview.metrics),
    updatedAt,
  };
}

export async function fetchRevenueCatFleetMetrics(force = false): Promise<RevenueCatFleetResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const updatedAt = new Date().toISOString();
  const apiKeys = revenueCatApiKeys();
  if (apiKeys.length === 0) {
    const value: RevenueCatFleetResult = {
      status: "missing_env",
      updatedAt,
      error: "No RevenueCat v2 secret keys found",
      errors: ["No RevenueCat v2 secret keys found"],
      projects: [],
    };
    cached = { at: Date.now(), value };
    return value;
  }

  const projectsById = new Map<string, RevenueCatProjectMetrics>();
  const errors: string[] = [];

  for (const apiKey of apiKeys) {
    try {
      const projectList = await revenueCatGet<RevenueCatListResponse<RevenueCatProject>>(apiKey, "/projects");
      for (const project of projectList.items ?? []) {
        if (!project.id || projectsById.has(project.id)) continue;
        try {
          const metrics = await fetchProjectMetrics(apiKey, project, updatedAt);
          if (metrics) projectsById.set(metrics.projectId, metrics);
        } catch (err) {
          errors.push(`${project.name ?? project.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("legacy api key")) {
        errors.push(message);
      }
    }
  }

  const projects = Array.from(projectsById.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  const value: RevenueCatFleetResult = {
    status: projects.length > 0 ? "ok" : "error",
    updatedAt,
    error: projects.length > 0 ? undefined : errors[0] ?? "RevenueCat returned no projects",
    errors,
    projects,
  };
  cached = { at: Date.now(), value };
  return value;
}

export function metricsForRevenueCatRegistryEntry(
  result: RevenueCatFleetResult,
  entry: FleetRegistryEntry,
): RevenueCatProjectMetrics | null {
  const projectNames = new Set(entry.revenueCatProjectNames.map((name) => name.toLowerCase()));
  const bundleIds = new Set(entry.revenueCatBundleIds.map((id) => id.toLowerCase()));

  return result.projects.find((project) => {
    if (projectNames.has(project.projectName.toLowerCase())) return true;
    return project.apps.some((app) => app.bundleId && bundleIds.has(app.bundleId.toLowerCase()));
  }) ?? null;
}

export function summarizeRevenueCat(
  metrics: RevenueCatProjectMetrics | null,
  registry: FleetRegistryEntry,
  status: string,
): FleetRevenueCatSummary | null {
  if (!metrics) return null;
  const includedInFleet = isProductionTelemetry(registry, status);
  return {
    ...metrics,
    telemetryScope: includedInFleet ? "production" : "test",
    telemetryNote: includedInFleet
      ? null
      : registry.telemetryNote ?? "RevenueCat data is excluded from production fleet metrics until this product is shipped.",
    includedInFleet,
  };
}
