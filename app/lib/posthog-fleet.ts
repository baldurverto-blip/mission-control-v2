import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { allCoreEvents, type FleetRegistryEntry } from "./fleet-registry";

export interface PostHogTopEvent {
  event: string;
  events: number;
  users: number;
}

export interface PostHogTopScreen {
  screen: string;
  events: number;
  users: number;
}

export interface PostHogAppMetrics {
  appName: string;
  source: "posthog";
  users30d: number;
  installs30d: number;
  openUsers30d: number;
  dau: number;
  wau: number;
  mau: number;
  onboardedUsers: number;
  paywallUsers: number;
  monetizedUsers: number;
  coreActionUsers: number;
  coreActions: number;
  activationRate: number | null;
  onboardingRate: number | null;
  paywallRate: number | null;
  monetizationRate: number | null;
  d1Eligible: number;
  d1Returned: number;
  d1Retention: number | null;
  d7Eligible: number;
  d7Returned: number;
  d7Retention: number | null;
  lastEventAt: string | null;
  topEvents: PostHogTopEvent[];
  topScreens: PostHogTopScreen[];
}

export interface PostHogFleetResult {
  status: "ok" | "missing_env" | "error";
  updatedAt: string;
  error?: string;
  byApp: Record<string, PostHogAppMetrics>;
  totalEvents: number;
}

interface HogQLResponse {
  results?: unknown[][];
  columns?: string[];
  detail?: string;
  error?: string;
}

interface EventRow {
  app: string;
  distinctId: string;
  event: string;
  day: number;
  timestamp: string;
  screen: string | null;
}

interface UserAggregate {
  installDay: number | null;
  activeDays: Set<number>;
  events: Map<string, number>;
  screens: Map<string, number>;
  onboarded: boolean;
  paywall: boolean;
  monetized: boolean;
  coreAction: boolean;
  coreActionCount: number;
  opened: boolean;
  lastEventAt: string | null;
}

const APP_LIFECYCLE_EVENTS = new Set([
  "$screen",
  "Application Installed",
  "Application Opened",
  "Application Backgrounded",
  "Application Became Active",
  "Application Updated",
  "$identify",
  "$set",
]);

const ONBOARDING_EVENTS = new Set(["onboarding_completed", "onboarding_complete"]);
const PAYWALL_EVENTS = new Set(["paywall_shown", "paywall_viewed", "onboarding_paywall_viewed"]);
const MONETIZATION_EVENTS = new Set(["trial_started", "purchase_completed", "paywall_converted", "subscription_started"]);

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: PostHogFleetResult } | null = null;
let localEnvCache: Record<string, string> | null = null;

function readLocalPostHogEnv(): Record<string, string> {
  if (localEnvCache) return localEnvCache;

  const candidates = Array.from(new Set([
    join(process.cwd(), ".env.local"),
    join(homedir(), "projects/mission-control-v2/.env.local"),
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
        if (!key.startsWith("POSTHOG_")) continue;

        let value = normalized.slice(separator + 1).trim();
        const quote = value[0];
        if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
          value = value.slice(1, -1);
        }
        values[key] = value;
      }
    } catch {
      // The standalone LaunchAgent does not always inherit .env.local. Missing
      // files are fine; process.env remains the primary source.
    }
  }

  localEnvCache = values;
  return values;
}

function postHogEnv(key: string): string | undefined {
  return process.env[key] || readLocalPostHogEnv()[key];
}

function normalizePostHogHost(host: string | undefined): string {
  const raw = (host || "https://eu.posthog.com").replace(/\/$/, "");
  return raw
    .replace("https://eu.i.posthog.com", "https://eu.posthog.com")
    .replace("https://us.i.posthog.com", "https://us.posthog.com");
}

function dayNumberFromDate(value: Date): number {
  return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / 86_400_000);
}

function dayNumberFromString(value: string): number | null {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor(time / 86_400_000);
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topFromUsers(
  users: Map<string, UserAggregate>,
  getMap: (user: UserAggregate) => Map<string, number>,
  limit: number,
  excludeLifecycle = false,
): PostHogTopEvent[] {
  const aggregate = new Map<string, { events: number; users: number }>();
  for (const user of users.values()) {
    for (const [key, count] of getMap(user)) {
      if (excludeLifecycle && APP_LIFECYCLE_EVENTS.has(key)) continue;
      const item = aggregate.get(key) ?? { events: 0, users: 0 };
      item.events += count;
      item.users += 1;
      aggregate.set(key, item);
    }
  }
  return Array.from(aggregate.entries())
    .map(([event, counts]) => ({ event, ...counts }))
    .sort((a, b) => b.events - a.events)
    .slice(0, limit);
}

function topScreens(users: Map<string, UserAggregate>, limit: number): PostHogTopScreen[] {
  const aggregate = new Map<string, { events: number; users: number }>();
  for (const user of users.values()) {
    for (const [screen, count] of user.screens) {
      const item = aggregate.get(screen) ?? { events: 0, users: 0 };
      item.events += count;
      item.users += 1;
      aggregate.set(screen, item);
    }
  }
  return Array.from(aggregate.entries())
    .map(([screen, counts]) => ({ screen, ...counts }))
    .sort((a, b) => b.events - a.events)
    .slice(0, limit);
}

function buildMetrics(rows: EventRow[], coreEvents: Set<string>): Record<string, PostHogAppMetrics> {
  const today = dayNumberFromDate(new Date());
  const apps = new Map<string, Map<string, UserAggregate>>();

  for (const row of rows) {
    let users = apps.get(row.app);
    if (!users) {
      users = new Map();
      apps.set(row.app, users);
    }

    let user = users.get(row.distinctId);
    if (!user) {
      user = {
        installDay: null,
        activeDays: new Set(),
        events: new Map(),
        screens: new Map(),
        onboarded: false,
        paywall: false,
        monetized: false,
        coreAction: false,
        coreActionCount: 0,
        opened: false,
        lastEventAt: null,
      };
      users.set(row.distinctId, user);
    }

    user.activeDays.add(row.day);
    increment(user.events, row.event);
    if (row.screen) increment(user.screens, row.screen);

    if (row.event === "Application Installed") {
      user.installDay = user.installDay === null ? row.day : Math.min(user.installDay, row.day);
    }
    if (row.event === "Application Opened") user.opened = true;
    if (ONBOARDING_EVENTS.has(row.event)) user.onboarded = true;
    if (PAYWALL_EVENTS.has(row.event)) user.paywall = true;
    if (MONETIZATION_EVENTS.has(row.event)) user.monetized = true;
    if (coreEvents.has(row.event)) {
      user.coreAction = true;
      user.coreActionCount += 1;
    }
    if (!user.lastEventAt || row.timestamp > user.lastEventAt) user.lastEventAt = row.timestamp;
  }

  const output: Record<string, PostHogAppMetrics> = {};
  for (const [appName, users] of apps.entries()) {
    const userList = Array.from(users.values());
    const installed = userList.filter((user) => user.installDay !== null);
    const d1Eligible = installed.filter((user) => user.installDay !== null && user.installDay <= today - 1);
    const d1Returned = d1Eligible.filter((user) => user.installDay !== null && user.activeDays.has(user.installDay + 1)).length;
    const d7Eligible = installed.filter((user) => user.installDay !== null && user.installDay <= today - 7);
    const d7Returned = d7Eligible.filter((user) => {
      if (user.installDay === null) return false;
      for (const day of user.activeDays) {
        if (day >= user.installDay + 1 && day <= user.installDay + 7) return true;
      }
      return false;
    }).length;

    const installs30d = installed.length;
    const activationDenominator = installs30d > 0 ? installs30d : userList.length;
    const coreActionUsers = userList.filter((user) => user.coreAction).length;
    const paywallUsers = userList.filter((user) => user.paywall).length;
    const monetizedUsers = userList.filter((user) => user.monetized).length;

    output[appName] = {
      appName,
      source: "posthog",
      users30d: userList.length,
      installs30d,
      openUsers30d: userList.filter((user) => user.opened).length,
      dau: userList.filter((user) => user.activeDays.has(today)).length,
      wau: userList.filter((user) => Array.from(user.activeDays).some((day) => day >= today - 6)).length,
      mau: userList.length,
      onboardedUsers: userList.filter((user) => user.onboarded).length,
      paywallUsers,
      monetizedUsers,
      coreActionUsers,
      coreActions: userList.reduce((sum, user) => sum + user.coreActionCount, 0),
      activationRate: pct(coreActionUsers, activationDenominator),
      onboardingRate: pct(userList.filter((user) => user.onboarded).length, activationDenominator),
      paywallRate: pct(paywallUsers, activationDenominator),
      monetizationRate: pct(monetizedUsers, paywallUsers),
      d1Eligible: d1Eligible.length,
      d1Returned,
      d1Retention: pct(d1Returned, d1Eligible.length),
      d7Eligible: d7Eligible.length,
      d7Returned,
      d7Retention: pct(d7Returned, d7Eligible.length),
      lastEventAt: userList.reduce<string | null>((latest, user) => {
        if (!user.lastEventAt) return latest;
        if (!latest || user.lastEventAt > latest) return user.lastEventAt;
        return latest;
      }, null),
      topEvents: topFromUsers(users, (user) => user.events, 8, true),
      topScreens: topScreens(users, 8),
    };
  }

  return output;
}

function parseRows(results: unknown[][] | undefined): EventRow[] {
  if (!results) return [];

  return results.flatMap((row) => {
    const [appRaw, distinctRaw, eventRaw, dayRaw, timestampRaw, screenRaw] = row;
    if (typeof appRaw !== "string" || !appRaw.trim()) return [];
    if (typeof distinctRaw !== "string" && typeof distinctRaw !== "number") return [];
    if (typeof eventRaw !== "string" || !eventRaw.trim()) return [];
    if (typeof dayRaw !== "string") return [];
    if (typeof timestampRaw !== "string") return [];

    const day = dayNumberFromString(dayRaw);
    if (day === null) return [];

    return [{
      app: appRaw,
      distinctId: String(distinctRaw),
      event: eventRaw,
      day,
      timestamp: timestampRaw,
      screen: typeof screenRaw === "string" && screenRaw.trim() ? screenRaw : null,
    }];
  });
}

export function metricsForRegistryEntry(
  result: PostHogFleetResult,
  entry: FleetRegistryEntry,
): PostHogAppMetrics | null {
  return result.byApp[entry.posthogAppName] ?? null;
}

export async function fetchPostHogFleetMetrics(force = false): Promise<PostHogFleetResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const apiKey = postHogEnv("POSTHOG_PERSONAL_API_KEY");
  const projectId = postHogEnv("POSTHOG_PROJECT_ID");
  const host = normalizePostHogHost(postHogEnv("POSTHOG_HOST"));
  const updatedAt = new Date().toISOString();

  if (!apiKey || !projectId) {
    const value: PostHogFleetResult = {
      status: "missing_env",
      updatedAt,
      error: "POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID is missing",
      byApp: {},
      totalEvents: 0,
    };
    cached = { at: Date.now(), value };
    return value;
  }

  const sql = `
    SELECT
      properties.$app_name AS app,
      distinct_id,
      event,
      toDate(timestamp) AS day,
      toString(timestamp) AS event_time,
      properties.$screen_name AS screen
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
      AND properties.$app_name IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT 50000
  `;

  try {
    const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: sql },
        name: "mission-control fleet aggregate",
      }),
      cache: "no-store",
    });

    const json = await response.json() as HogQLResponse;
    if (!response.ok) {
      throw new Error(json.detail ?? json.error ?? `PostHog query failed: ${response.status}`);
    }

    const rows = parseRows(json.results);
    const value: PostHogFleetResult = {
      status: "ok",
      updatedAt,
      byApp: buildMetrics(rows, new Set(allCoreEvents())),
      totalEvents: rows.length,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch (err) {
    const value: PostHogFleetResult = {
      status: "error",
      updatedAt,
      error: err instanceof Error ? err.message : String(err),
      byApp: {},
      totalEvents: 0,
    };
    cached = { at: Date.now(), value };
    return value;
  }
}
