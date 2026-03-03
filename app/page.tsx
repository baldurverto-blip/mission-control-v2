"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────

interface KPIs {
  roadmap: { done: number; total: number };
  week: { number: number; day: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  research: { count: number; scoutScore: number };
  failures: { recent: number; daysSince: number | null };
  skills: { count: number };
}

interface InboxItem {
  text: string;
  done: boolean;
}

interface PhaseProgress {
  name: string;
  total: number;
  done: number;
}

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  enabled: boolean;
  state: {
    lastRunStatus?: string;
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastDurationMs?: number;
    consecutiveErrors?: number;
  };
}

interface AgentFile {
  name: string;
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function relTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function parseMdSections(md: string): { status: string; wins: string[]; focus: string[]; blockers: string[] } {
  const clean = md.replace(/^---[\s\S]*?---\n*/m, "");
  const status = clean.match(/## Status:?\s*(.+)/)?.[1]?.trim() ?? "";
  const wins: string[] = [];
  const focus: string[] = [];
  const blockers: string[] = [];

  let current: string[] | null = null;
  for (const line of clean.split("\n")) {
    if (/today.s wins/i.test(line)) { current = wins; continue; }
    if (/week.*focus/i.test(line)) { current = focus; continue; }
    if (/active blockers|needs attention/i.test(line)) { current = blockers; continue; }
    if (/tonight|scheduled|current roadmap/i.test(line)) { current = null; continue; }
    if (/^##/.test(line)) { current = null; continue; }
    if (current && /^-\s/.test(line.trim())) {
      current.push(line.trim().replace(/^-\s*/, "").replace(/^\*\*/, "").replace(/\*\*:?\s*/, ": ").replace(/\*\*/g, ""));
    }
  }

  return { status, wins, focus, blockers };
}

function extractAgentMeta(content: string): { model: string; role: string } {
  const model = content.match(/Model:\s*(.+)/)?.[1]?.trim() ?? "—";
  const role = content.match(/Role:\s*(.+)/)?.[1]?.trim() ?? "—";
  return { model, role };
}

// ─── Micro Components ────────────────────────────────────────────────

function StatusDot({ status, size = "sm" }: { status?: string; size?: "sm" | "md" }) {
  const color =
    status === "ok" ? "var(--olive)"
    : status === "error" ? "var(--terracotta)"
    : "var(--mid)";
  const px = size === "md" ? "w-2.5 h-2.5" : "w-1.5 h-1.5";
  return (
    <span
      className={`inline-block ${px} rounded-full flex-shrink-0 ${status === "ok" ? "pulse-dot" : ""}`}
      style={{ backgroundColor: color }}
    />
  );
}

function ProgressBar({ done, total, color = "var(--olive)" }: { done: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-warm overflow-hidden relative">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
        style={{ width: `${pct}%`, backgroundColor: color }}
      >
        {pct > 0 && pct < 100 && (
          <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: "shine 2s ease-in-out infinite" }} />
        )}
      </div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.625rem] font-medium tracking-wide"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {children}
    </span>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [nowRaw, setNowRaw] = useState<string>("");
  const [phases, setPhases] = useState<PhaseProgress[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [research, setResearch] = useState<{ latest: { name: string; content: string } | null; weekCount: number }>({ latest: null, weekCount: 0 });
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [growthops, setGrowthops] = useState<{ status: string; uptime: number; version: string; discoveryCount: number; queueCount: number } | null>(null);

  const fetchAll = useCallback(async () => {
    const [kpiRes, statusRes, inboxRes, cronRes, researchRes, agentsRes, growthopsRes] =
      await Promise.all([
        fetch("/api/kpis").then((r) => r.json()).catch(() => null),
        fetch("/api/status").then((r) => r.json()).catch(() => null),
        fetch("/api/inbox").then((r) => r.json()).catch(() => null),
        fetch("/api/cron").then((r) => r.json()).catch(() => null),
        fetch("/api/research").then((r) => r.json()).catch(() => null),
        fetch("/api/agents").then((r) => r.json()).catch(() => ({ agents: [] })),
        fetch("/api/growthops").then((r) => r.json()).catch(() => null),
      ]);

    if (kpiRes && !kpiRes.error) setKpis(kpiRes);
    if (statusRes && !statusRes.error) {
      setNowRaw(statusRes.now ?? "");
      setPhases(statusRes.roadmap?.phases ?? []);
    }
    if (inboxRes && !inboxRes.error) setInbox(inboxRes.items ?? []);
    if (cronRes && !cronRes.error) setCronJobs(cronRes.jobs ?? []);
    if (researchRes && !researchRes.error) setResearch(researchRes);
    if (agentsRes && !agentsRes.error) setAgents(agentsRes.agents ?? []);
    if (growthopsRes) setGrowthops(growthopsRes);
    setLastUpdated(Date.now());
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!newItem.trim() || adding) return;
    setAdding(true);
    try {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newItem.trim() }),
      });
      setNewItem("");
      await fetchAll();
    } finally {
      setAdding(false);
    }
  }

  const now = parseMdSections(nowRaw);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const openInbox = inbox.filter((i) => !i.done);
  const doneInbox = inbox.filter((i) => i.done);

  // Derive overall health
  const systemHealth = kpis
    ? kpis.cron.healthy === kpis.cron.total && kpis.failures.recent === 0
      ? "healthy"
      : kpis.failures.recent > 0
        ? "alert"
        : "degraded"
    : "loading";

  const healthColor = systemHealth === "healthy" ? "var(--olive)" : systemHealth === "alert" ? "var(--terracotta)" : "var(--mid)";
  const healthLabel = systemHealth === "healthy" ? "All systems nominal" : systemHealth === "alert" ? "Attention needed" : systemHealth === "degraded" ? "Partially degraded" : "Loading...";

  return (
    <div className="min-h-screen">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="px-8 pt-8 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl text-charcoal tracking-tight">{getGreeting()}, Mads</h1>
            </div>
            <p className="text-mid text-sm flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full pulse-dot"
                style={{ backgroundColor: healthColor }}
              />
              {healthLabel}
              {kpis && (
                <span className="text-mid/60 ml-1">
                  · {kpis.roadmap.done}/{kpis.roadmap.total} checkpoints
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="label-caps text-lilac mb-1">Mission Control</p>
            <p className="text-sm text-mid" suppressHydrationWarning>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" })}
            </p>
            <div className="flex gap-3 mt-1">
              <Link
                href="/proposals"
                className="text-xs inline-block transition-opacity hover:opacity-80"
                style={{ color: "var(--terracotta)" }}
              >
                Proposals &rarr;
              </Link>
              <Link
                href="/calendar"
                className="text-xs inline-block transition-opacity hover:opacity-80"
                style={{ color: "var(--lilac)" }}
              >
                Content Calendar &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* ─── KPI Strip ───────────────────────────────────────── */}
        {kpis && (
          <div className={`grid grid-cols-4 lg:grid-cols-8 gap-2 ${loaded ? "fade-up" : "opacity-0"}`}>
            <KpiChip label="Roadmap" value={`${kpis.roadmap.done}/${kpis.roadmap.total}`} sub={`${Math.round((kpis.roadmap.done / Math.max(kpis.roadmap.total, 1)) * 100)}%`} color="var(--olive)" />
            <KpiChip label="Week" value={`W${kpis.week.number}`} sub={dayNames[new Date().getDay()]} color="var(--charcoal)" />
            <KpiChip label="Crons" value={`${kpis.cron.healthy}/${kpis.cron.total}`} sub={kpis.cron.healthy === kpis.cron.total ? "all ok" : "issues"} color={kpis.cron.healthy === kpis.cron.total ? "var(--olive)" : "var(--terracotta)"} />
            <KpiChip label="Inbox" value={String(kpis.inbox.open)} sub={kpis.inbox.open === 0 ? "clear" : kpis.inbox.open > 5 ? "backlog" : "open"} color={kpis.inbox.open > 5 ? "var(--terracotta)" : "var(--mid)"} />
            <KpiChip label="Research" value={String(kpis.research.count)} sub="reports" color="var(--lilac)" />
            <KpiChip label="Scout" value={String(kpis.research.scoutScore)} sub="signals" color="var(--lilac)" />
            <KpiChip label="Uptime" value={kpis.failures.daysSince !== null ? `${kpis.failures.daysSince}d` : "—"} sub="clean" color={kpis.failures.recent > 0 ? "var(--terracotta)" : "var(--olive)"} />
            <KpiChip label="Skills" value={String(kpis.skills.count)} sub="patterns" color="var(--lilac)" />
          </div>
        )}
      </header>

      {/* ─── Main Grid ──────────────────────────────────────── */}
      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ─── NOW ──────────────────────────────────────── */}
          <div className={`card lg:col-span-8 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.05s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-charcoal">Current Focus</h2>
              {now.status && <Badge color="var(--terracotta)">{now.status}</Badge>}
            </div>

            {now.focus.length > 0 && (
              <div className="mb-4">
                <p className="label-caps mb-2" style={{ color: "var(--terracotta)" }}>This week</p>
                <div className="space-y-1.5">
                  {now.focus.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-terracotta flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {now.wins.length > 0 && (
              <div className="mb-4">
                <p className="label-caps mb-2" style={{ color: "var(--olive)" }}>Wins today</p>
                <div className="space-y-1.5">
                  {now.wins.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-mid">
                      <span className="mt-0.5 flex-shrink-0 text-olive">&#10003;</span>
                      <span>{item.replace(/^✅\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {now.blockers.length > 0 && (
              <div>
                <p className="label-caps mb-2" style={{ color: "var(--terracotta)" }}>Blockers</p>
                <div className="space-y-1.5">
                  {now.blockers.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-mid">
                      <span className="mt-0.5 flex-shrink-0 text-terracotta">!</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!nowRaw && <p className="text-mid text-sm">Loading...</p>}
          </div>

          {/* ─── INBOX ────────────────────────────────────── */}
          <div className={`card lg:col-span-4 flex flex-col ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-charcoal">Inbox</h2>
              {openInbox.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-medium text-paper" style={{ backgroundColor: openInbox.length > 5 ? "var(--terracotta)" : "var(--mid)" }}>
                  {openInbox.length}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-1 mb-4 max-h-56 overflow-y-auto custom-scroll">
              {openInbox.length === 0 && doneInbox.length === 0 && (
                <p className="text-mid text-sm py-4 text-center">Inbox zero</p>
              )}
              {openInbox.map((item, i) => (
                <div key={`open-${i}`} className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-warm/50 transition-colors text-sm group">
                  <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded border border-mid/40 group-hover:border-terracotta transition-colors" />
                  <span className="leading-snug">{item.text}</span>
                </div>
              ))}
              {doneInbox.length > 0 && (
                <div className="pt-2 mt-2 border-t border-warm">
                  {doneInbox.map((item, i) => (
                    <div key={`done-${i}`} className="flex items-start gap-2.5 py-1 px-2 text-sm text-mid/50">
                      <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded bg-olive/30 border border-olive/30 flex items-center justify-center text-[8px] text-olive">&#10003;</span>
                      <span className="leading-snug line-through">{item.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleAddItem} className="flex gap-2 mt-auto">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add to inbox..."
                className="flex-1 bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-mid/50 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
              />
              <button
                type="submit"
                disabled={adding || !newItem.trim()}
                className="px-4 py-2 bg-charcoal text-paper rounded-lg text-sm tracking-wide hover:bg-charcoal/90 disabled:opacity-30 transition-all"
              >
                {adding ? "..." : "Add"}
              </button>
            </form>
          </div>

          {/* ─── ROADMAP ──────────────────────────────────── */}
          <div className={`card lg:col-span-8 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl text-charcoal">Roadmap</h2>
              {kpis && (
                <span className="text-sm text-mid">
                  {Math.round((kpis.roadmap.done / Math.max(kpis.roadmap.total, 1)) * 100)}% complete
                </span>
              )}
            </div>
            <div className="space-y-4">
              {phases.map((phase) => {
                const pct = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0;
                const isDone = phase.done === phase.total && phase.total > 0;
                return (
                  <div key={phase.name} className={isDone ? "opacity-50" : ""}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="truncate mr-3 flex items-center gap-2">
                        {isDone && <span className="text-olive text-xs">&#10003;</span>}
                        {phase.name}
                      </span>
                      <span className="text-mid flex-shrink-0 tabular-nums text-xs">
                        {phase.done}/{phase.total}
                        <span className="text-mid/40 ml-1">({pct}%)</span>
                      </span>
                    </div>
                    <ProgressBar
                      done={phase.done}
                      total={phase.total}
                      color={isDone ? "var(--olive)" : pct > 0 ? "var(--olive)" : "var(--mid)"}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── CRON HEALTH ──────────────────────────────── */}
          <div className={`card lg:col-span-4 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-charcoal">Cron Jobs</h2>
              {kpis && (
                <Badge color={kpis.cron.healthy === kpis.cron.total ? "var(--olive)" : "var(--terracotta)"}>
                  {kpis.cron.healthy}/{kpis.cron.total}
                </Badge>
              )}
            </div>
            <div className="space-y-0.5">
              {cronJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-warm/50 transition-colors text-sm">
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={job.state.lastRunStatus} size="md" />
                    <span>{job.name}</span>
                    {job.agentId !== "main" && (
                      <span className="text-[0.6rem] text-lilac bg-lilac/10 px-1.5 py-0.5 rounded">{job.agentId}</span>
                    )}
                  </div>
                  <span className="text-mid/60 text-xs tabular-nums">
                    {relTime(job.state.lastRunAtMs)}
                  </span>
                </div>
              ))}
              {cronJobs.length === 0 && <p className="text-mid text-sm py-4 text-center">Loading...</p>}
            </div>
          </div>

          {/* ─── RESEARCH ─────────────────────────────────── */}
          <div className={`card lg:col-span-8 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.25s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-charcoal">Latest Research</h2>
              {research.latest && (
                <span className="text-xs text-mid">{research.latest.name}</span>
              )}
            </div>
            {research.latest ? (
              <div className="max-h-72 overflow-y-auto custom-scroll">
                <pre className="text-sm whitespace-pre-wrap font-[family-name:var(--font-dm-mono)] leading-relaxed text-mid">
                  {research.latest.content
                    .replace(/^---[\s\S]*?---\n*/m, "")
                    .replace(/^#+\s*/gm, "")
                    .trim()
                    .slice(0, 2000)}
                </pre>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-mid/60 text-sm">No research files yet</p>
                <p className="text-mid/40 text-xs mt-1">Scout runs nightly at 02:00 CET</p>
              </div>
            )}
          </div>

          {/* ─── AGENTS ───────────────────────────────────── */}
          <div className={`card lg:col-span-4 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.3s" }}>
            <h2 className="text-xl text-charcoal mb-4">Agents</h2>
            {agents.length > 0 ? (
              <div className="space-y-3">
                {agents
                  .filter((a) => !a.name.includes("brief"))
                  .map((agent) => {
                    const meta = extractAgentMeta(agent.content);
                    const name = agent.name.replace(".md", "");
                    const gradient =
                      name === "main" ? "from-[#5B8C8A] to-[#7BB5B3]"
                      : name === "scout" ? "from-[#76875A] to-[#A3B87A]"
                      : "from-[#9899C1] to-[#B8B9D8]";
                    return (
                      <div key={agent.name} className="flex items-start gap-3 p-3 rounded-lg bg-warm/40">
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-paper text-sm font-medium flex-shrink-0`}>
                          {name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{name === "main" ? "Baldur" : name}</p>
                          <p className="text-xs text-mid truncate">{meta.role}</p>
                          <p className="text-[0.625rem] text-mid/50 mt-0.5 truncate">{meta.model}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-mid text-sm py-4 text-center">Loading...</p>
            )}
          </div>
          {/* ─── GROWTHOPS ─────────────────────────────────── */}
          <div className={`card lg:col-span-4 ${loaded ? "fade-up" : "opacity-0"}`} style={{ animationDelay: "0.35s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-charcoal">GrowthOps</h2>
              {growthops && (
                <span
                  className={`inline-block w-2 h-2 rounded-full ${growthops.status === "online" ? "pulse-dot" : ""}`}
                  style={{ backgroundColor: growthops.status === "online" ? "var(--olive)" : "var(--terracotta)" }}
                />
              )}
            </div>
            {growthops ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-mid">Status</span>
                  <Badge color={growthops.status === "online" ? "var(--olive)" : "var(--terracotta)"}>
                    {growthops.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-mid">Version</span>
                  <span className="text-xs tabular-nums text-mid/60">{growthops.version}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-mid">Discovery signals</span>
                  <span className="text-xs tabular-nums text-mid/60">{growthops.discoveryCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-mid">Content queue</span>
                  <span className="text-xs tabular-nums text-mid/60">{growthops.queueCount}</span>
                </div>
                <div className="pt-3 mt-2 border-t border-warm flex gap-2">
                  <a
                    href="http://localhost:3002"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-2 rounded-lg text-xs tracking-wide transition-colors hover:bg-warm/80"
                    style={{ backgroundColor: "var(--warm)", color: "var(--charcoal)" }}
                  >
                    Dashboard &rarr;
                  </a>
                  <Link
                    href="/calendar"
                    className="flex-1 text-center py-2 rounded-lg text-xs tracking-wide transition-colors hover:opacity-80"
                    style={{ backgroundColor: "var(--lilac)" + "20", color: "var(--lilac)" }}
                  >
                    Calendar &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-mid/60 text-sm">Connecting...</p>
                <p className="text-mid/40 text-xs mt-1">GrowthOps on :3002</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="px-8 pb-6 max-w-[1440px] mx-auto flex items-center justify-between" suppressHydrationWarning>
        <p className="label-caps text-mid/40">
          Verto Studios · VertoOS
        </p>
        <p className="label-caps text-mid/40">
          {new Date(lastUpdated).toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen" })}
          {" · "}refreshes every 60s
        </p>
      </footer>
    </div>
  );
}

// ─── KPI Chip ────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center transition-all hover:bg-paper hover:border-warm">
      <p className="text-lg font-medium leading-none mb-0.5 tabular-nums" style={{ color, fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.5rem" }}>
        {value}
      </p>
      <p className="label-caps text-[0.5rem] leading-none">
        <span className="text-mid/60">{label}</span>
        {sub && <span className="text-mid/35 ml-0.5">· {sub}</span>}
      </p>
    </div>
  );
}
