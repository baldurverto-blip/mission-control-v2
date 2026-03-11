"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { ProgressBar } from "../../components/ProgressBar";
import { EmptyState } from "../../components/EmptyState";

// ── Types ────────────────────────────────────────────────────────

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; tz?: string };
  state: { nextRunAtMs?: number; lastRunAtMs?: number; lastRunStatus?: string };
}

interface PoolAccount {
  slug: string;
  username: string | null;
  env_prefix: string;
  flagged_subs: string[];
  max_comments_per_day: number;
  notes: string;
  has_credentials: boolean;
  configured: boolean;
}

interface RedditAccount {
  username: string;
  karma: number;
  comment_count: number;
  shadowbanned: boolean;
  phase: number;
  phase_name: string;
  karma_to_phase2: number;
  karma_to_phase3: number;
}

interface RedditStats {
  total_posted: number;
  today_posted: number;
  week_posted: number;
  by_subreddit: Record<string, number>;
  by_day: Record<string, number>;
  flagged_subs: string[];
}

interface RedditStatusResponse {
  success: boolean;
  slug?: string;
  account: RedditAccount;
  stats: RedditStats;
  offline?: boolean;
}

interface OutreachEntry {
  date: string;
  thread_id: string;
  subreddit: string;
  thread_title: string;
  thread_url: string;
  comment_text: string;
  comment_url?: string;
  post_method?: string;
  status?: string;
  phase: number;
  karma_at_post: number;
  dry_run: boolean;
  flagged_sub?: boolean;
  slug?: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);
  const mins = Math.round(absDiff / 60_000);
  const hours = Math.round(absDiff / 3_600_000);

  if (absDiff < 60_000) return diff > 0 ? "now" : "just now";
  if (mins < 60) return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  if (hours < 24) return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(absDiff / 86_400_000);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

function slugLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

// ── Component ────────────────────────────────────────────────────

export default function EngagementPage() {
  const [tab, setTab] = useState("activity");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [accounts, setAccounts] = useState<PoolAccount[]>([]);
  const [status, setStatus] = useState<RedditStatusResponse | null>(null);
  const [outreach, setOutreach] = useState<OutreachEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [running, setRunning] = useState(false);
  const [cronJob, setCronJob] = useState<CronJob | null>(null);

  // Load accounts pool on mount
  useEffect(() => {
    fetch("/api/growth/reddit/accounts")
      .then((r) => r.json())
      .then((d) => { if (d.success) setAccounts(d.accounts || []); })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    const slugParam = selectedSlug ? `?slug=${selectedSlug}` : "";
    try {
      const [statusRes, outreachRes, cronRes] = await Promise.all([
        fetch(`/api/growth/reddit/status${slugParam}`).then((r) => r.json()).catch(() => ({ offline: true })),
        fetch(`/api/growth/reddit/outreach${slugParam}`).then((r) => r.json()).catch(() => ({ offline: true })),
        fetch("/api/cron").then((r) => r.json()).catch(() => null),
      ]);

      if (cronRes?.jobs) {
        const job = cronRes.jobs.find((j: CronJob) => j.name === "reddit-engage");
        if (job) setCronJob(job);
      }

      if (statusRes.offline && outreachRes.offline) {
        setIsOffline(true);
      } else {
        setIsOffline(false);
        if (statusRes.success) setStatus(statusRes);
        if (outreachRes.success) setOutreach(outreachRes.entries || []);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, [selectedSlug]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const triggerRun = async (dryRun: boolean) => {
    if (!selectedSlug) return;
    setRunning(true);
    try {
      const res = await fetch("/api/growth/reddit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selectedSlug, max_comments: 3, dry_run: dryRun }),
      });
      await res.json();
      await fetchData();
    } finally {
      setRunning(false);
    }
  };

  const acct = status?.account;
  const stats = status?.stats;
  const selectedAccount = accounts.find((a) => a.slug === selectedSlug);
  const configuredAccounts = accounts.filter((a) => a.configured);
  const unconfiguredAccounts = accounts.filter((a) => !a.configured);

  if (isOffline) return <EmptyState offline />;

  const karmaTarget = (acct?.karma ?? 0) < 200 ? 200 : (acct?.karma ?? 0) < 400 ? 400 : 600;
  const phaseLabel = (acct?.karma ?? 0) < 200 ? "Phase 2" : (acct?.karma ?? 0) < 400 ? "Phase 3" : "Phase 3+";

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Engagement</h1>
        <p className="text-mid text-sm mb-6">Reddit outreach &middot; autonomous karma building</p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto space-y-4">
        {/* Account Selector */}
        <div className="card p-4">
          <p className="text-[0.8rem] text-mid/70 label-caps mb-3">Reddit Account Pool</p>
          <div className="flex items-center gap-2 flex-wrap">
            {configuredAccounts.map((a) => (
              <button
                key={a.slug}
                onClick={() => setSelectedSlug(a.slug === selectedSlug ? "" : a.slug)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer"
                style={{
                  borderColor: selectedSlug === a.slug ? "var(--olive)" : "var(--warm)",
                  backgroundColor: selectedSlug === a.slug ? "var(--olive-soft, rgba(107,142,35,0.08))" : "var(--bg)",
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: a.has_credentials ? "var(--olive)" : "var(--terracotta)" }}
                />
                <div className="text-left">
                  <span className="text-charcoal font-medium">{slugLabel(a.slug)}</span>
                  <span className="text-mid/70 ml-1.5">u/{a.username}</span>
                </div>
                {a.flagged_subs.length > 0 && (
                  <span className="text-[0.75rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--terracotta-soft, #f5e6d0)", color: "var(--terracotta)" }}>
                    {a.flagged_subs.length} flagged
                  </span>
                )}
              </button>
            ))}
            {unconfiguredAccounts.map((a) => (
              <div
                key={a.slug}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs"
                style={{ borderColor: "var(--warm)", opacity: 0.6 }}
              >
                <div className="w-2 h-2 rounded-full shrink-0 bg-warm" />
                <span className="text-mid">{slugLabel(a.slug)}</span>
                <span className="text-mid/60">no account</span>
              </div>
            ))}
          </div>
          {selectedAccount && selectedAccount.notes && (
            <p className="text-[0.8rem] text-mid/60 mt-2 ml-1">{selectedAccount.notes}</p>
          )}
        </div>

        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : !selectedSlug ? (
          /* Overview: show all accounts summary when none selected */
          <>
            {/* Schedule */}
            {cronJob && <CronCard cronJob={cronJob} />}

            {/* Aggregate metrics if we have status */}
            {acct && (
              <MetricsBar
                metrics={[
                  { label: "Accounts", value: String(configuredAccounts.length) },
                  { label: "Today", value: String(stats?.today_posted ?? 0) },
                  { label: "This Week", value: String(stats?.week_posted ?? 0) },
                  { label: "Total", value: String(stats?.total_posted ?? 0) },
                ]}
              />
            )}

            <div className="rounded-xl px-4 py-6 text-center" style={{ backgroundColor: "var(--warm)" }}>
              <p className="text-sm text-mid mb-1">Select an account above to view details and run engagement</p>
              <p className="text-[0.8rem] text-mid/70">Each account maps to a product for targeted outreach</p>
            </div>

            {/* Tabs still work for aggregate view */}
            <TabBar
              tabs={[
                { id: "activity", label: "Activity Log", count: outreach.length },
                { id: "subs", label: "Subreddits" },
                { id: "daily", label: "Daily Chart" },
              ]}
              active={tab}
              onChange={setTab}
            />
            {tab === "activity" && <ActivityTab entries={outreach} />}
            {tab === "subs" && <SubredditTab stats={stats} />}
            {tab === "daily" && <DailyTab stats={stats} />}
          </>
        ) : (
          /* Per-account detail view */
          <>
            {/* Warnings */}
            {acct?.shadowbanned && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--terracotta-soft, #f5e6d0)", color: "var(--terracotta)" }}>
                Account is shadowbanned — comments are invisible to other users. Consider creating a new account.
              </div>
            )}
            {stats?.flagged_subs && stats.flagged_subs.length > 0 && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "#f5e6d0", color: "#b8860b" }}>
                Flagged subreddits (AutoMod-filtered): {stats.flagged_subs.map((s) => `r/${s}`).join(", ")} — comments auto-routed to draft mode.
              </div>
            )}

            {/* Metrics */}
            <MetricsBar
              metrics={[
                { label: "Account", value: acct ? `u/${acct.username}` : "-" },
                { label: "Karma", value: String(acct?.karma ?? "-"), color: "var(--olive)" },
                { label: "Phase", value: acct?.phase_name ?? "-" },
                { label: "To " + phaseLabel, value: acct ? String(acct.karma < 200 ? acct.karma_to_phase2 : acct.karma < 400 ? acct.karma_to_phase3 : "0") : "-", color: "var(--terracotta)" },
                { label: "Today", value: String(stats?.today_posted ?? "-") },
                { label: "This Week", value: String(stats?.week_posted ?? "-") },
                { label: "Total", value: String(stats?.total_posted ?? "-") },
              ]}
            />

            {/* Karma Progress */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-mid">Karma Progress</span>
                <span className="text-xs text-mid/60 tabular-nums">{acct?.karma ?? 0} / {karmaTarget}</span>
              </div>
              <ProgressBar done={acct?.karma ?? 0} total={karmaTarget} color="var(--olive)" />
            </div>

            {/* Schedule */}
            {cronJob && <CronCard cronJob={cronJob} />}

            {/* Run controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => triggerRun(false)}
                disabled={running}
                className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper transition-all"
                style={{ backgroundColor: "var(--olive)" }}
              >
                {running ? "Running..." : `Run ${slugLabel(selectedSlug)}`}
              </button>
              <button
                onClick={() => triggerRun(true)}
                disabled={running}
                className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 transition-all"
                style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
              >
                Dry Run
              </button>
              {running && (
                <span className="text-[0.8rem] text-mid/70">Takes 30-90 min (anti-detection delays between comments)</span>
              )}
            </div>

            {/* Tabs */}
            <TabBar
              tabs={[
                { id: "activity", label: "Activity Log", count: outreach.length },
                { id: "subs", label: "Subreddits" },
                { id: "daily", label: "Daily Chart" },
              ]}
              active={tab}
              onChange={setTab}
            />
            {tab === "activity" && <ActivityTab entries={outreach} />}
            {tab === "subs" && <SubredditTab stats={stats} />}
            {tab === "daily" && <DailyTab stats={stats} />}
          </>
        )}
      </main>
    </div>
  );
}

// ── Cron Schedule Card ──────────────────────────────────────────

function CronCard({ cronJob }: { cronJob: CronJob }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cronJob.enabled ? "var(--olive)" : "var(--mid)" }} />
          <div>
            <p className="text-xs text-charcoal">
              Daily at {cronJob.schedule.expr ?? "?"} {cronJob.schedule.tz ? `(${cronJob.schedule.tz.split("/")[1]?.replace("_", " ")})` : ""}
            </p>
            <p className="text-[0.8rem] text-mid/70">
              Agent: {cronJob.agentId} &middot; All configured accounts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {cronJob.state.nextRunAtMs && (
            <div className="text-right">
              <p className="text-mid/70 text-[0.8rem] label-caps">Next run</p>
              <p className="text-charcoal tabular-nums">{formatRelativeTime(cronJob.state.nextRunAtMs)}</p>
            </div>
          )}
          {cronJob.state.lastRunAtMs && (
            <div className="text-right">
              <p className="text-mid/70 text-[0.8rem] label-caps">Last run</p>
              <p className="text-charcoal tabular-nums">
                {formatRelativeTime(cronJob.state.lastRunAtMs)}
                {cronJob.state.lastRunStatus && (
                  <span className="ml-1.5" style={{ color: cronJob.state.lastRunStatus === "ok" ? "var(--olive)" : "var(--terracotta)" }}>
                    {cronJob.state.lastRunStatus === "ok" ? "ok" : cronJob.state.lastRunStatus}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Activity Log Tab ─────────────────────────────────────────────

function ActivityTab({ entries }: { entries: OutreachEntry[] }) {
  if (!entries.length) {
    return <EmptyState title="No outreach activity" message="Click 'Run Engagement' to start building karma" />;
  }

  return (
    <div className="space-y-2">
      {entries.slice(0, 50).map((e, idx) => {
        const date = e.date ? new Date(e.date).toLocaleDateString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "?";
        const statusLabel = e.dry_run ? "dry-run" : (e.status || "posted");
        const statusColor = e.dry_run ? "var(--mid)" : statusLabel === "drafted_for_browser" ? "#b8860b" : "var(--olive)";
        const method = e.post_method === "draft" ? "draft" : "praw";

        return (
          <div key={`${e.thread_id}-${idx}`} className="card fade-up" style={{ animationDelay: `${idx * 0.02}s` }}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge color="var(--lilac)">r/{e.subreddit}</Badge>
                    <Badge color={statusColor}>{statusLabel}</Badge>
                    <Badge color="var(--mid)">{method}</Badge>
                    {e.flagged_sub && <Badge color="var(--terracotta)">flagged</Badge>}
                  </div>
                  <p className="text-sm text-charcoal leading-snug mb-1">{e.thread_title || "Unknown thread"}</p>
                  <p className="text-xs text-mid/70">{date} &middot; Phase {e.phase} &middot; Karma {e.karma_at_post}</p>
                </div>
              </div>

              {e.comment_text && (
                <div className="mt-3 pt-3 border-t border-warm/50">
                  <p className="text-xs text-mid/70 leading-relaxed italic">
                    &ldquo;{e.comment_text.substring(0, 250)}{e.comment_text.length > 250 ? "..." : ""}&rdquo;
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3">
                {e.thread_url && (
                  <a href={e.thread_url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--lilac)" }}>
                    Thread &rarr;
                  </a>
                )}
                {e.comment_url && (
                  <a href={e.comment_url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--olive)" }}>
                    Comment &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Subreddit Breakdown Tab ──────────────────────────────────────

function SubredditTab({ stats }: { stats?: RedditStats }) {
  const bySub = stats?.by_subreddit ?? {};
  const flagged = new Set(stats?.flagged_subs ?? []);
  const entries = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
  const maxVal = entries.length ? entries[0][1] : 1;

  if (!entries.length) {
    return <EmptyState title="No subreddit data" message="Data will appear after engagement runs" />;
  }

  return (
    <div className="card p-5 space-y-3">
      <p className="text-xs text-mid mb-2 label-caps">Comments by Subreddit</p>
      {entries.map(([sub, count]) => {
        const pct = Math.round((count / maxVal) * 100);
        const isFlagged = flagged.has(sub);
        return (
          <div key={sub}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-charcoal">
                r/{sub}
                {isFlagged && <span className="text-[0.8rem] ml-1.5" style={{ color: "var(--terracotta)" }}>flagged</span>}
              </span>
              <span className="text-xs tabular-nums text-mid/60">{count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-warm overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: isFlagged ? "var(--terracotta)" : "var(--olive)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Daily Chart Tab ──────────────────────────────────────────────

function DailyTab({ stats }: { stats?: RedditStats }) {
  const byDay = stats?.by_day ?? {};
  const entries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
  const maxVal = entries.length ? Math.max(...entries.map((e) => e[1])) : 1;

  if (!entries.length) {
    return <EmptyState title="No daily data" message="Data will appear after engagement runs" />;
  }

  return (
    <div className="card p-5">
      <p className="text-xs text-mid mb-4 label-caps">Daily Activity (Last 14 Days)</p>
      <div className="flex items-end gap-1" style={{ height: 140 }}>
        {entries.map(([day, count]) => {
          const h = Math.max(4, Math.round((count / maxVal) * 100));
          const label = day.substring(5);
          return (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[0.75rem] tabular-nums text-mid/70">{count}</span>
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{ height: h, backgroundColor: "var(--olive)" }}
              />
              <span className="text-[0.7rem] text-mid/60 -rotate-45 whitespace-nowrap origin-top-left">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
