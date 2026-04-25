/**
 * Shared cached wrapper for slow openclaw subprocess calls.
 * openclaw cron list takes ~8-9s per call — this caches the result for 30s
 * so all routes hitting the same data don't each pay the subprocess cost.
 */

import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function makeCache<T>() {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  return async (fn: () => Promise<T>, ttlMs: number): Promise<T> => {
    if (entry && Date.now() < entry.expiresAt) return entry.value;
    // Deduplicate concurrent requests — only one subprocess at a time
    if (inflight) return inflight;
    inflight = fn().then((value) => {
      entry = { value, expiresAt: Date.now() + ttlMs };
      inflight = null;
      return value;
    }).catch((err) => {
      inflight = null;
      throw err;
    });
    return inflight;
  };
}

// ─── openclaw cron list ───────────────────────────────────────────────────────

const OPENCLAW_BIN = "/opt/homebrew/bin/openclaw";
const CRON_TTL_MS = 30_000; // 30 seconds

export interface CronJob {
  id: string;
  name: string;
  agentId: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; everyMs?: number; tz?: string };
  state: {
    lastRunStatus?: string;
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastDurationMs?: number;
    consecutiveErrors?: number;
  };
}

interface CronListResult {
  jobs: CronJob[];
  raw: string;
}

const cronCache = makeCache<CronListResult>();

export async function getCronList(): Promise<CronListResult> {
  return cronCache(async () => {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["cron", "list", "--json"], {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const data = JSON.parse(stdout);
    const jobs: CronJob[] = (data.jobs ?? []).map((j: Record<string, unknown>) => ({
      id: j.id,
      name: j.name,
      agentId: j.agentId,
      enabled: j.enabled,
      schedule: j.schedule,
      state: j.state ?? {},
    }));
    return { jobs, raw: stdout };
  }, CRON_TTL_MS);
}

// ─── ccusage (Claude Code token usage) ───────────────────────────────────────

const USAGE_TTL_MS = 5 * 60_000; // 5 minutes — usage data changes slowly

interface CcusageResult {
  status: "ok" | "error";
  date?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  total_cost?: number;
  models?: string[];
  error?: string;
}

const ccusageCache = makeCache<CcusageResult>();

export async function getClaudeCodeUsage(): Promise<CcusageResult> {
  return ccusageCache(async () => {
    try {
      const { stdout } = await execFileAsync("npx", ["-y", "ccusage", "daily", "--json"], {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      });
      const trimmed = stdout.trim();
      if (!trimmed.startsWith("{")) return { status: "error", error: "Unexpected output" };
      const data = JSON.parse(trimmed);
      const today = new Date().toISOString().split("T")[0];
      const todayData = data.daily?.find((d: { date: string }) => d.date === today);
      const latestData = data.daily?.[data.daily.length - 1];
      const src = todayData ?? latestData;
      return {
        status: "ok",
        date: src?.date ?? today,
        input_tokens: src?.inputTokens ?? 0,
        output_tokens: src?.outputTokens ?? 0,
        cache_creation_tokens: src?.cacheCreationTokens ?? 0,
        cache_read_tokens: src?.cacheReadTokens ?? 0,
        total_tokens: src?.totalTokens ?? 0,
        total_cost: src?.totalCost ?? 0,
        models: src?.modelsUsed ?? [],
      };
    } catch (e: unknown) {
      return { status: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }, USAGE_TTL_MS);
}
