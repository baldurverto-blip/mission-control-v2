"use client";

import { ProductLane } from "./ProductLane";
import { ExpeditionCard } from "./ExpeditionCard";
import { DecisionBox } from "./DecisionBox";
import { FactorySummary, type FactorySummaryData } from "./FactorySummary";
import { SignalsPanel } from "./SignalsPanel";
import { StatusDot } from "./StatusDot";

const PHASE_LABELS = ["Discovery", "Validation", "Build", "Distribution", "Support"];

interface PhaseCheck { name: string; done: boolean; }

interface ProjectLaneData {
  slug: string;
  name: string;
  status: string;
  lifecyclePhase: string;
  pulseCount7d: number;
  activeAgents: string[];
  staleDays: number;
  isStalled: boolean;
  phases: PhaseCheck[];
  factoryStatus?: string;
  isFactoryProject?: boolean;
  productType?: string;
  focusAreas?: string[];
  description?: string;
  pipelineStage?: string;
  client?: string;
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

interface FocusAreaConfig {
  label: string;
  mission: string;
  kpis: string[];
}

interface InboxItem { text: string; done: boolean; }
interface WorkflowActive { workflow: string; runId: string; approvalPending: boolean; currentStep: string | null; }

interface EngineStats {
  agents: number;
  crons: number;
  pulsesToday: number;
  health: "healthy" | "degraded" | "alert";
}

const FOCUS_AREA_STYLES: Record<string, { border: string; accent: string; icon: string }> = {
  products: { border: "var(--olive)", accent: "var(--olive)", icon: "P" },
  advisory: { border: "var(--amber)", accent: "var(--amber)", icon: "A" },
  engine: { border: "var(--lilac)", accent: "var(--lilac)", icon: "E" },
};

function FocusAreaBand({
  area,
  config,
  projects,
  engineStats,
}: {
  area: string;
  config?: FocusAreaConfig;
  projects: ProjectLaneData[];
  engineStats?: EngineStats;
}) {
  const style = FOCUS_AREA_STYLES[area] ?? FOCUS_AREA_STYLES.products;
  const label = config?.label ?? area.charAt(0).toUpperCase() + area.slice(1);
  const mission = config?.mission ?? "";

  // Engine band has a special compact display
  if (area === "engine") {
    const health = engineStats?.health ?? "healthy";
    const healthColor = health === "healthy" ? "var(--olive)" : health === "degraded" ? "var(--amber)" : "var(--terracotta)";
    return (
      <div
        className="bg-paper border rounded-xl p-4 flex-shrink-0"
        style={{ borderColor: `${style.border}40` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-[0.5rem] font-medium text-white"
              style={{ backgroundColor: style.accent }}
            >
              {style.icon}
            </span>
            <p className="label-caps text-mid/60">{label}</p>
            <span className="text-[0.55rem] text-mid/40 italic ml-1">{mission}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <StatusDot status={health === "healthy" ? "ok" : health === "degraded" ? "warning" : "error"} />
              <span className="text-[0.6rem] font-medium" style={{ color: healthColor }}>
                {health}
              </span>
            </div>
            <span className="text-[0.55rem] text-mid tabular-nums">
              {engineStats?.agents ?? 6} agents
            </span>
            <span className="text-[0.55rem] text-mid tabular-nums">
              {engineStats?.crons ?? 22} crons
            </span>
            <span className="text-[0.55rem] text-mid tabular-nums">
              {engineStats?.pulsesToday ?? 0} pulses today
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Products + Advisory bands show product lanes
  const count = projects.length;
  const countLabel = area === "advisory"
    ? `${count} engagement${count !== 1 ? "s" : ""}`
    : `${count} active`;

  return (
    <div
      className="bg-paper border rounded-xl p-4 flex-shrink-0"
      style={{ borderColor: `${style.border}40` }}
    >
      {/* Band header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-5 h-5 rounded flex items-center justify-center text-[0.5rem] font-medium text-white"
          style={{ backgroundColor: style.accent }}
        >
          {style.icon}
        </span>
        <p className="label-caps text-mid/60">{label}</p>
        <span className="text-[0.55rem] text-mid/40 italic ml-1">{mission}</span>
        {count > 0 && (
          <span className="ml-auto text-[0.6rem] text-mid tabular-nums">{countLabel}</span>
        )}
      </div>

      {/* Phase column headers */}
      {count > 0 && (
        <div className="flex items-center gap-3 mb-1">
          <div className="w-36 flex-shrink-0" />
          <div className="flex-1 grid grid-cols-5 gap-1">
            {PHASE_LABELS.map((label) => (
              <p key={label} className="text-center text-[0.55rem] text-mid/40 uppercase tracking-widest">
                {label}
              </p>
            ))}
          </div>
          <div className="w-20 flex-shrink-0" />
        </div>
      )}

      {/* Product lanes */}
      {count > 0 ? (
        projects.map((p) => <ProductLane key={p.slug} project={p} />)
      ) : (
        <p className="text-sm text-mid/50 text-center py-2">
          {area === "advisory" ? "No active engagements" : "No products"}
        </p>
      )}
    </div>
  );
}

export function MissionMapView({
  projects,
  expeditions,
  inbox,
  workflows,
  factoryData,
  focusAreas,
  byFocusArea,
  engineStats,
}: {
  projects: ProjectLaneData[];
  expeditions: ExpeditionData[];
  inbox: InboxItem[];
  workflows: WorkflowActive[];
  factoryData?: FactorySummaryData | null;
  focusAreas?: Record<string, FocusAreaConfig>;
  byFocusArea?: Record<string, ProjectLaneData[]>;
  engineStats?: EngineStats;
}) {
  const activeExpeditions = expeditions.filter((e) => e.status === "active" || e.status === "draft");

  // Use focus-area-grouped projects if available, otherwise fall back to flat list
  const productProjects = byFocusArea?.products ?? projects.filter((p) => !p.focusAreas || p.focusAreas.includes("products"));
  const advisoryProjects = byFocusArea?.advisory ?? projects.filter((p) => p.focusAreas?.includes("advisory") && !p.focusAreas?.includes("products"));
  // Deduplicate: if a project is in both products + advisory, show it in products only (it appears in advisory via the type badge)
  const advisoryOnly = advisoryProjects.filter(
    (p) => !productProjects.some((pp) => pp.slug === p.slug)
  );

  return (
    <div className="h-full flex flex-col gap-3 fade-up">
      {/* ─── Focus Area Bands ────────────────────── */}
      <FocusAreaBand
        area="products"
        config={focusAreas?.products}
        projects={productProjects}
      />

      <FocusAreaBand
        area="advisory"
        config={focusAreas?.advisory}
        projects={advisoryOnly}
      />

      <FocusAreaBand
        area="engine"
        config={focusAreas?.engine}
        projects={[]}
        engineStats={engineStats}
      />

      {/* ─── Bottom: Expeditions + Factory + Signals + Decisions ───── */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* Expeditions */}
        <div className="col-span-3 min-h-0 overflow-y-auto custom-scroll">
          <div className="bg-paper border border-warm rounded-xl p-4 h-full">
            <p className="label-caps text-mid/60 mb-3">
              Expeditions
              {activeExpeditions.length > 0 && (
                <span className="ml-2 text-[0.6rem] text-olive tabular-nums">{activeExpeditions.length} active</span>
              )}
            </p>
            {expeditions.length > 0 ? (
              <div className="space-y-2">
                {expeditions.map((e) => (
                  <ExpeditionCard key={e.slug} expedition={e} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-mid/50 text-center py-4">No expeditions running</p>
            )}
          </div>
        </div>

        {/* App Factory */}
        <div className="col-span-3 min-h-0">
          <FactorySummary data={factoryData ?? null} />
        </div>

        {/* Keyword Signals */}
        <div className="col-span-3 min-h-0">
          <SignalsPanel />
        </div>

        {/* Decision Box */}
        <div className="col-span-3 min-h-0">
          <DecisionBox
            inbox={inbox}
            workflows={workflows}
            projects={projects}
            expeditions={expeditions}
          />
        </div>
      </div>
    </div>
  );
}
