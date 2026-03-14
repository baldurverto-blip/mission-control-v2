"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { type PulseData } from "@/app/lib/agents";
import { DashboardHome } from "./components/DashboardHome";
import { type FactorySummaryData } from "./components/FactorySummary";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  roadmap: { done: number; total: number };
  week: { number: number; day: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  research: { count: number; scoutScore: number };
  failures: { recent: number; daysSince: number | null };
  skills: { count: number };
}

interface InboxItem { text: string; done: boolean; raw: string; }
interface BriefFile { name: string; content: string; }

interface WorkflowActive {
  workflow: string; runId: string; trigger: string; startedAt: string;
  currentStep: string | null; approvalPending: boolean;
}
interface WorkflowCompleted {
  workflow: string; runId: string; startedAt: string; finishedAt: string; finalStatus: string;
}
interface WorkflowData {
  state: { active: WorkflowActive[]; completed: WorkflowCompleted[]; blocked: unknown[] };
  stats: { totalRuns: number; completedToday: number; approvalsPending: number };
  definitions: { name: string; file: string; steps: string[] }[];
}

interface ProjectLane {
  slug: string; name: string; status: string; lifecyclePhase: string;
  pulseCount7d: number; activeAgents: string[]; staleDays: number; isStalled: boolean;
  phases: { name: string; done: boolean }[];
}

interface ExpeditionData {
  slug: string; name: string; team: string[]; scope: string;
  guardrails: { time_box: string; authority: string; model_budget: string };
  status: string; started: string | null; completedAt: string | null;
  pulseCount: number; lastPulse: string | null; timeRemaining: number | null;
  isOverdue: boolean; successCriteria: string[];
}

interface ProposalData {
  filename: string; title: string; date: string; scope: string; priority: string;
  kind: "proposal" | "info"; status: "pending" | "approved" | "rejected" | "deferred";
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [nowRaw, setNowRaw] = useState("");
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [briefs, setBriefs] = useState<{ morning: BriefFile | null; evening: BriefFile | null }>({ morning: null, evening: null });
  const [workflows, setWorkflows] = useState<WorkflowData | null>(null);
  const [projects, setProjects] = useState<ProjectLane[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionData[]>([]);
  const [factoryData, setFactoryData] = useState<FactorySummaryData | null>(null);
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchAll = useCallback(async () => {
    const [
      kpiRes, statusRes, inboxRes, pulseRes, briefsRes,
      workflowRes, projectsRes, expeditionsRes, factoryRes, proposalsRes,
    ] = await Promise.all([
      fetch("/api/kpis").then((r) => r.json()).catch(() => null),
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/inbox").then((r) => r.json()).catch(() => null),
      fetch("/api/pulses").then((r) => r.json()).catch(() => null),
      fetch("/api/briefs").then((r) => r.json()).catch(() => null),
      fetch("/api/workflows").then((r) => r.json()).catch(() => null),
      fetch("/api/projects").then((r) => r.json()).catch(() => null),
      fetch("/api/expeditions").then((r) => r.json()).catch(() => null),
      fetch("/api/factory").then((r) => r.json()).catch(() => null),
      fetch("/api/proposals").then((r) => r.json()).catch(() => null),
    ]);

    if (kpiRes && !kpiRes.error) setKpis(kpiRes);
    if (statusRes && !statusRes.error) setNowRaw(statusRes.now ?? "");
    if (inboxRes && !inboxRes.error) setInbox(inboxRes.items ?? []);
    if (pulseRes && !pulseRes.error) setPulseData(pulseRes);
    if (briefsRes && !briefsRes.error) setBriefs({ morning: briefsRes.morning ?? null, evening: briefsRes.evening ?? null });
    if (workflowRes && !workflowRes.error) setWorkflows(workflowRes);
    if (projectsRes && !projectsRes.error) setProjects(projectsRes.projects ?? []);
    if (expeditionsRes && !expeditionsRes.error) setExpeditions(expeditionsRes.expeditions ?? []);
    if (factoryRes && !factoryRes.error) setFactoryData(factoryRes);
    if (proposalsRes && !proposalsRes.error) setProposals(proposalsRes.proposals ?? []);
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

  const roadmapPct = kpis
    ? Math.round((kpis.roadmap.done / Math.max(kpis.roadmap.total, 1)) * 100)
    : 0;

  const systemHealth = kpis
    ? kpis.cron.healthy === kpis.cron.total && kpis.failures.recent === 0 ? "healthy"
      : kpis.failures.recent > 0 ? "alert" : "degraded"
    : "loading";

  const healthColor =
    systemHealth === "healthy" ? "var(--olive)"
    : systemHealth === "alert" ? "var(--terracotta)"
    : "var(--mid)";

  return (
    <div className="min-h-screen bg-bg overflow-y-auto">
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <header className="px-6 pt-5 pb-4 border-b border-warm/50 sticky top-0 bg-bg/96 backdrop-blur-sm z-10">
        <div className="flex items-center justify-between max-w-[1440px] mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl text-charcoal tracking-tight" suppressHydrationWarning>
              {getGreeting()}, Mads
            </h1>
            <span
              className="inline-block w-2 h-2 rounded-full pulse-dot"
              style={{ backgroundColor: healthColor }}
            />
          </div>
          <p className="text-xs text-mid/45" suppressHydrationWarning>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Copenhagen",
            })}
            {" · "}
            {new Date().toLocaleTimeString("da-DK", {
              hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
            })} CET
          </p>
        </div>
      </header>

      {/* ═══ DASHBOARD ════════════════════════════════════════════════ */}
      <DashboardHome
        kpis={kpis}
        nowRaw={nowRaw}
        inbox={inbox}
        pulseData={pulseData}
        briefs={briefs}
        workflows={workflows}
        projects={projects}
        expeditions={expeditions}
        factoryData={factoryData}
        proposals={proposals}
        systemHealth={systemHealth}
        healthColor={healthColor}
        roadmapPct={roadmapPct}
        newItem={newItem}
        setNewItem={setNewItem}
        adding={adding}
        handleAddItem={handleAddItem}
        onRefetch={fetchAll}
      />
    </div>
  );
}
