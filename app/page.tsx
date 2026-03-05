"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { type PulseData } from "@/app/lib/agents";
import { MissionMapView } from "./components/MissionMapView";
import { OperationsView } from "./components/OperationsView";
import { TabBar } from "./components/TabBar";
import { type FactorySummaryData } from "./components/FactorySummary";

// ─── Types ───────────────────────────────────────────────────────────

interface KPIs {
  roadmap: { done: number; total: number };
  week: { number: number; day: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  research: { count: number; scoutScore: number };
  failures: { recent: number; daysSince: number | null };
  skills: { count: number };
  workflows?: { active: number; approvalPending: number; completedToday: number; totalRuns: number };
}

interface InboxItem { text: string; done: boolean; }
interface BriefFile { name: string; content: string; }

interface GoalData {
  id: string;
  name: string;
  pulseCount: number;
  agents: { id: string; count: number }[];
  lastPulse: string | null;
}

interface WorkflowDef { name: string; file: string; steps: string[]; }
interface WorkflowActive { workflow: string; runId: string; trigger: string; startedAt: string; currentStep: string | null; approvalPending: boolean; }
interface WorkflowCompleted { workflow: string; runId: string; startedAt: string; finishedAt: string; finalStatus: string; }
interface WorkflowData {
  state: { active: WorkflowActive[]; completed: WorkflowCompleted[]; blocked: unknown[] };
  stats: { totalRuns: number; completedToday: number; approvalsPending: number };
  definitions: WorkflowDef[];
}

interface PhaseCheck { name: string; done: boolean; }
interface ProjectLane {
  slug: string;
  name: string;
  status: string;
  lifecyclePhase: string;
  pulseCount7d: number;
  activeAgents: string[];
  staleDays: number;
  isStalled: boolean;
  phases: PhaseCheck[];
}

interface ExpeditionData {
  slug: string;
  name: string;
  team: string[];
  scope: string;
  guardrails: { time_box: string; authority: string; model_budget: string };
  status: string;
  started: string | null;
  completedAt: string | null;
  pulseCount: number;
  lastPulse: string | null;
  timeRemaining: number | null;
  isOverdue: boolean;
  successCriteria: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Dashboard ───────────────────────────────────────────────────────

export default function Dashboard() {
  // View state
  const [view, setView] = useState<"map" | "ops">("map");

  // Data state
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [nowRaw, setNowRaw] = useState("");
  const [phases, setPhases] = useState<{ name: string; total: number; done: number }[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [briefs, setBriefs] = useState<{ morning: BriefFile | null; evening: BriefFile | null }>({ morning: null, evening: null });
  const [workflows, setWorkflows] = useState<WorkflowData | null>(null);
  const [projects, setProjects] = useState<ProjectLane[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionData[]>([]);
  const [factoryData, setFactoryData] = useState<FactorySummaryData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  // Cockpit interaction state
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [contextTab, setContextTab] = useState("inbox");

  const fetchAll = useCallback(async () => {
    const [kpiRes, statusRes, inboxRes, pulseRes, goalsRes, briefsRes, workflowRes, projectsRes, expeditionsRes, factoryRes] =
      await Promise.all([
        fetch("/api/kpis").then(r => r.json()).catch(() => null),
        fetch("/api/status").then(r => r.json()).catch(() => null),
        fetch("/api/inbox").then(r => r.json()).catch(() => null),
        fetch("/api/pulses").then(r => r.json()).catch(() => null),
        fetch("/api/goals").then(r => r.json()).catch(() => null),
        fetch("/api/briefs").then(r => r.json()).catch(() => null),
        fetch("/api/workflows").then(r => r.json()).catch(() => null),
        fetch("/api/projects").then(r => r.json()).catch(() => null),
        fetch("/api/expeditions").then(r => r.json()).catch(() => null),
        fetch("/api/factory").then(r => r.json()).catch(() => null),
      ]);

    if (kpiRes && !kpiRes.error) setKpis(kpiRes);
    if (statusRes && !statusRes.error) {
      setNowRaw(statusRes.now ?? "");
      setPhases(statusRes.roadmap?.phases ?? []);
    }
    if (inboxRes && !inboxRes.error) setInbox(inboxRes.items ?? []);
    if (pulseRes && !pulseRes.error) setPulseData(pulseRes);
    if (goalsRes && !goalsRes.error) setGoals(goalsRes.goals ?? []);
    if (briefsRes && !briefsRes.error) setBriefs({ morning: briefsRes.morning ?? null, evening: briefsRes.evening ?? null });
    if (workflowRes && !workflowRes.error) setWorkflows(workflowRes);
    if (projectsRes && !projectsRes.error) setProjects(projectsRes.projects ?? []);
    if (expeditionsRes && !expeditionsRes.error) setExpeditions(expeditionsRes.expeditions ?? []);
    if (factoryRes && !factoryRes.error) setFactoryData(factoryRes);
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

  // Derived
  const roadmapPct = kpis ? Math.round((kpis.roadmap.done / Math.max(kpis.roadmap.total, 1)) * 100) : 0;
  const systemHealth = kpis
    ? kpis.cron.healthy === kpis.cron.total && kpis.failures.recent === 0
      ? "healthy" : kpis.failures.recent > 0 ? "alert" : "degraded"
    : "loading";
  const healthColor = systemHealth === "healthy" ? "var(--olive)" : systemHealth === "alert" ? "var(--terracotta)" : "var(--mid)";

  const viewTabs = [
    { id: "map", label: "Mission Map" },
    { id: "ops", label: "Operations" },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <header className="px-6 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between max-w-[1440px] mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl text-charcoal tracking-tight">{getGreeting()}, Mads</h1>
            <span className="inline-block w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: healthColor }} />
          </div>
          <div className="flex items-center gap-4">
            <TabBar tabs={viewTabs} active={view} onChange={(id) => setView(id as "map" | "ops")} />
            {kpis && (
              <div className="flex items-center gap-2">
                <span className="label-caps text-mid/50">Roadmap</span>
                <div className="w-24 h-1.5 rounded-full bg-warm overflow-hidden">
                  <div className="h-full rounded-full bg-olive transition-all" style={{ width: `${roadmapPct}%` }} />
                </div>
                <span className="text-[0.6rem] text-mid tabular-nums">{roadmapPct}%</span>
              </div>
            )}
            <p className="text-xs text-mid/50" suppressHydrationWarning>
              {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Copenhagen" })}
            </p>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ══════════════════════════════════════════════ */}
      <main className="flex-1 overflow-hidden px-6 pb-4">
        <div className="max-w-[1440px] mx-auto h-full flex flex-col gap-3">
          {view === "map" ? (
            <MissionMapView
              projects={projects}
              expeditions={expeditions}
              inbox={inbox}
              workflows={workflows?.state.active ?? []}
              factoryData={factoryData}
            />
          ) : (
            <OperationsView
              kpis={kpis}
              pulseData={pulseData}
              goals={goals}
              inbox={inbox}
              briefs={briefs}
              workflows={workflows}
              nowRaw={nowRaw}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
              selectedGoal={selectedGoal}
              setSelectedGoal={setSelectedGoal}
              contextTab={contextTab}
              setContextTab={setContextTab}
              newItem={newItem}
              setNewItem={setNewItem}
              adding={adding}
              handleAddItem={handleAddItem}
            />
          )}
        </div>
      </main>
    </div>
  );
}
