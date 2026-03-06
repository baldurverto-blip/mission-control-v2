"use client";

import { ProductLane } from "./ProductLane";
import { ExpeditionCard } from "./ExpeditionCard";
import { DecisionBox } from "./DecisionBox";
import { FactorySummary, type FactorySummaryData } from "./FactorySummary";
import { SignalsPanel } from "./SignalsPanel";

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

interface InboxItem { text: string; done: boolean; }
interface WorkflowActive { workflow: string; runId: string; approvalPending: boolean; currentStep: string | null; }

export function MissionMapView({
  projects,
  expeditions,
  inbox,
  workflows,
  factoryData,
}: {
  projects: ProjectLaneData[];
  expeditions: ExpeditionData[];
  inbox: InboxItem[];
  workflows: WorkflowActive[];
  factoryData?: FactorySummaryData | null;
}) {
  const activeExpeditions = expeditions.filter((e) => e.status === "active" || e.status === "draft");

  return (
    <div className="h-full flex flex-col gap-3 fade-up">
      {/* ─── Product Lifecycle Lanes ────────────────────── */}
      <div className="bg-paper border border-warm rounded-xl p-4 flex-shrink-0">
        <p className="label-caps text-mid/60 mb-3">Product Lanes</p>
        {/* Phase column headers */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-28 flex-shrink-0" />
          <div className="flex-1 grid grid-cols-5 gap-1">
            {PHASE_LABELS.map((label) => (
              <p key={label} className="text-center text-[0.55rem] text-mid/40 uppercase tracking-widest">
                {label}
              </p>
            ))}
          </div>
          <div className="w-20 flex-shrink-0" />
        </div>
        {/* Lanes */}
        {projects.length > 0 ? (
          projects.map((p) => <ProductLane key={p.slug} project={p} />)
        ) : (
          <p className="text-sm text-mid/50 text-center py-4">No products found</p>
        )}
      </div>

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
