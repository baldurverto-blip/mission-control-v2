import { readFileSync } from "fs";
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "crypto";

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
  apiSource: "v2" | "dashboard-session" | "v2+dashboard-session";
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
    last_updated_at?: string | null;
  }[];
  message?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: RevenueCatFleetResult } | null = null;
let envCache: Record<string, string> | null = null;
let dashboardTokenCache: { at: number; value: string | null } | null = null;

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
  const keys: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value || typeof value !== "string") continue;
    if (!value.startsWith("sk_") && !value.startsWith("atk_")) continue;
    if (!key.includes("REVENUECAT") && !key.includes("RC_V2")) continue;
    keys.push(value);
  }
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

function metricUpdatedAt(metrics: RevenueCatOverviewResponse["metrics"], fallback: string): string {
  const updatedAt = metrics?.find((metric) => typeof metric.last_updated_at === "string" && metric.last_updated_at)?.last_updated_at;
  return updatedAt ?? fallback;
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
    apiSource: "v2",
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

interface RevenueCatDashboardProject {
  id?: string;
  name?: string;
}

interface RevenueCatDashboardMeResponse {
  apps?: RevenueCatDashboardProject[];
  message?: string;
}

function dashboardAuthTokenFromEnv(): string | null {
  const env = { ...readEnvFiles(), ...process.env };
  return env.REVENUECAT_DASHBOARD_AUTH_TOKEN || env.RC_DASHBOARD_AUTH_TOKEN || null;
}

function chromeCookiePaths(): string[] {
  const chromeRoot = join(homedir(), "Library/Application Support/Google/Chrome");
  const paths = new Set<string>();

  try {
    for (const profile of readdirSync(chromeRoot)) {
      const profilePath = join(chromeRoot, profile);
      try {
        if (!statSync(profilePath).isDirectory()) continue;
      } catch {
        continue;
      }

      paths.add(join(profilePath, "Cookies"));
      paths.add(join(profilePath, "Default/Cookies"));
      paths.add(join(profilePath, "Network/Cookies"));
    }
  } catch {
    return [];
  }

  return Array.from(paths);
}

function decryptChromeCookie(encryptedHex: string, host: string, key: Buffer): string | null {
  if (!encryptedHex) return null;
  const encrypted = Buffer.from(encryptedHex, "hex");
  if (!encrypted.subarray(0, 3).toString().startsWith("v1")) {
    return encrypted.toString("utf8");
  }

  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  const padding = decrypted[decrypted.length - 1];
  if (padding > 0 && padding <= 16) decrypted = decrypted.subarray(0, -padding);

  const hostDigest = createHash("sha256").update(host).digest();
  if (decrypted.subarray(0, hostDigest.length).equals(hostDigest)) {
    decrypted = decrypted.subarray(hostDigest.length);
  }

  return decrypted.toString("utf8");
}

function dashboardAuthTokenFromChrome(): string | null {
  if (process.env.REVENUECAT_DASHBOARD_COOKIE_FALLBACK === "0") return null;
  if (dashboardTokenCache && Date.now() - dashboardTokenCache.at < CACHE_TTL_MS) return dashboardTokenCache.value;

  let token: string | null = null;
  try {
    const password = execFileSync("security", ["find-generic-password", "-w", "-s", "Chrome Safe Storage"], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const rows: { value: string; mtime: number }[] = [];

    for (const cookiePath of chromeCookiePaths()) {
      try {
        const mtime = statSync(cookiePath).mtimeMs;
        const output = execFileSync(
          "sqlite3",
          [
            "-readonly",
            cookiePath,
            "select host_key || char(9) || hex(encrypted_value) || char(9) || value from cookies where host_key like '%revenuecat.com%' and name = 'rc_auth_token';",
          ],
          { encoding: "utf8", timeout: 3000 },
        );

        for (const line of output.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const [host, encryptedHex, plainValue] = line.split("\t");
          const value = plainValue || decryptChromeCookie(encryptedHex, host, key);
          if (value) rows.push({ value, mtime });
        }
      } catch {
        // Chrome may lock one profile DB while another profile remains readable.
      }
    }

    token = rows.sort((a, b) => b.mtime - a.mtime || b.value.length - a.value.length)[0]?.value ?? null;
  } catch {
    token = null;
  }

  dashboardTokenCache = { at: Date.now(), value: token };
  return token;
}

function dashboardAuthToken(): string | null {
  return dashboardAuthTokenFromEnv() ?? dashboardAuthTokenFromChrome();
}

async function revenueCatDashboardGet<T>(authToken: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://api.revenuecat.com${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: `rc_auth_token=${authToken}`,
      "X-Requested-With": "XMLHttpRequest",
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    throw new Error(json.message ?? `RevenueCat dashboard request failed: ${response.status}`);
  }
  return json;
}

async function fetchDashboardProjectMetrics(authToken: string, project: RevenueCatDashboardProject, updatedAt: string): Promise<RevenueCatProjectMetrics | null> {
  if (!project.id || !project.name) return null;

  const overview = await revenueCatDashboardGet<RevenueCatOverviewResponse>(
    authToken,
    "/v1/developers/me/charts_v2/overview",
    { app_uuid: project.id },
  );

  return {
    source: "revenuecat-api",
    apiSource: "dashboard-session",
    projectId: project.id,
    projectName: project.name,
    apps: [{
      id: project.id,
      name: project.name,
      type: "dashboard-project",
      bundleId: null,
      appStoreConnectConfigured: null,
      subscriptionKeyConfigured: null,
    }],
    mrr: metricValue(overview.metrics, "mrr"),
    revenue28d: metricValue(overview.metrics, "revenue"),
    activeSubscriptions: metricValue(overview.metrics, "active_subscriptions"),
    activeTrials: metricValue(overview.metrics, "active_trials"),
    newCustomers28d: metricValue(overview.metrics, "new_customers"),
    activeUsers28d: metricValue(overview.metrics, "active_users"),
    currency: metricCurrency(overview.metrics),
    updatedAt: metricUpdatedAt(overview.metrics, updatedAt),
  };
}

async function fetchDashboardRevenueCatMetrics(updatedAt: string): Promise<{ projects: RevenueCatProjectMetrics[]; errors: string[] }> {
  const authToken = dashboardAuthToken();
  if (!authToken) return { projects: [], errors: ["RevenueCat dashboard session unavailable"] };

  try {
    const me = await revenueCatDashboardGet<RevenueCatDashboardMeResponse>(authToken, "/v1/developers/me");
    const results = await Promise.allSettled(
      (me.apps ?? []).map((project) => fetchDashboardProjectMetrics(authToken, project, updatedAt)),
    );
    const projects: RevenueCatProjectMetrics[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        projects.push(result.value);
      } else if (result.status === "rejected") {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    return { projects, errors };
  } catch (err) {
    return { projects: [], errors: [err instanceof Error ? err.message : String(err)] };
  }
}

function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}

function mergeRevenueCatProjects(projects: RevenueCatProjectMetrics[]): RevenueCatProjectMetrics[] {
  const byName = new Map<string, RevenueCatProjectMetrics>();
  for (const project of projects) {
    const key = normalizeProjectName(project.projectName);
    const current = byName.get(key);
    if (!current) {
      byName.set(key, project);
      continue;
    }

    const officialApps = current.apps.some((app) => app.bundleId) ? current.apps : project.apps;
    const dashboard = project.apiSource === "dashboard-session" ? project : current.apiSource === "dashboard-session" ? current : null;
    const official = current.apiSource === "v2" ? current : project.apiSource === "v2" ? project : null;
    byName.set(key, {
      ...(dashboard ?? project),
      projectId: official?.projectId ?? dashboard?.projectId ?? project.projectId,
      apps: officialApps,
      apiSource: official && dashboard ? "v2+dashboard-session" : (dashboard ?? official ?? project).apiSource,
    });
  }

  return Array.from(byName.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export async function fetchRevenueCatFleetMetrics(force = false): Promise<RevenueCatFleetResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const updatedAt = new Date().toISOString();
  const apiKeys = revenueCatApiKeys();
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

  const dashboardResult = await fetchDashboardRevenueCatMetrics(updatedAt);
  errors.push(...dashboardResult.errors.filter((error) => !error.toLowerCase().includes("session unavailable")));

  const projects = mergeRevenueCatProjects([
    ...Array.from(projectsById.values()),
    ...dashboardResult.projects,
  ]);

  const value: RevenueCatFleetResult = {
    status: projects.length > 0 ? "ok" : apiKeys.length > 0 ? "error" : "missing_env",
    updatedAt,
    error: projects.length > 0 ? undefined : errors[0] ?? "No RevenueCat v2 keys or dashboard session found",
    errors: projects.length > 0 ? errors : (errors.length > 0 ? errors : ["No RevenueCat v2 keys or dashboard session found"]),
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
