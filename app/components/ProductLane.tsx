"use client";

import { Badge } from "./Badge";
import { StatusDot } from "./StatusDot";
import { agent as agentToken } from "@/app/lib/agents";

const PHASES = ["discovery", "validation", "build", "distribution", "support"];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  "b2c-mobile": { label: "B2C", color: "var(--olive)" },
  "b2b-saas": { label: "B2B", color: "var(--lilac)" },
  "advisory": { label: "ADV", color: "var(--amber)" },
};

interface PhaseCheck {
  name: string;
  done: boolean;
}

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
  factoryStatus?: string;
  isFactoryProject?: boolean;
  productType?: string;
  focusAreas?: string[];
  description?: string;
  pipelineStage?: string;
  client?: string;
}

export function ProductLane({ project }: { project: ProjectLane }) {
  const currentIdx = PHASES.indexOf(project.lifecyclePhase);
  const primaryAgent = project.activeAgents[0];
  const primaryColor = primaryAgent ? agentToken(primaryAgent).color : "var(--olive)";
  const typeBadge = TYPE_BADGES[project.productType ?? ""] ?? null;

  // Determine secondary label: advisory stage, factory tag, or nothing
  const secondaryLabel = project.pipelineStage && project.productType === "advisory"
    ? project.pipelineStage
    : project.isFactoryProject
      ? "factory"
      : project.factoryStatus && project.factoryStatus !== project.status
        ? project.factoryStatus.replace(/-/g, " ")
        : null;

  const secondaryColor = project.productType === "advisory"
    ? "var(--amber)"
    : "var(--amber)";

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-warm/30 transition-colors group">
      {/* Product name + badges — fixed width, no wrap */}
      <div className="w-44 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {typeBadge && (
            <span
              className="flex-shrink-0 text-[0.8rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${typeBadge.color}18`,
                color: typeBadge.color,
                border: `1px solid ${typeBadge.color}30`,
              }}
            >
              {typeBadge.label}
            </span>
          )}
          <p className="text-sm font-medium text-charcoal truncate leading-tight">{project.name}</p>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Badge color={project.isStalled ? "var(--terracotta)" : "var(--olive)"}>{project.status}</Badge>
          {secondaryLabel && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.7rem] font-medium tracking-wide"
              style={{
                backgroundColor: `${secondaryColor}14`,
                color: `${secondaryColor}`,
                opacity: 0.75,
              }}
            >
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>

      {/* Phase columns */}
      <div className="flex-1 grid grid-cols-5 gap-1">
        {PHASES.map((phase, i) => {
          const isCurrent = i === currentIdx;
          const isCompleted = i < currentIdx;

          return (
            <div
              key={phase}
              className="relative h-8 rounded flex items-center justify-center overflow-hidden transition-all"
              style={{
                backgroundColor: isCurrent
                  ? `${primaryColor}28`
                  : isCompleted
                    ? "rgba(118, 135, 90, 0.12)"
                    : "var(--warm)",
                borderLeft: isCurrent ? `2px solid ${primaryColor}80` : undefined,
                boxShadow: isCurrent ? `inset 0 0 0 1px ${primaryColor}18` : undefined,
              }}
            >
              {isCurrent && project.activeAgents.length > 0 && (
                <div className="relative z-10 flex gap-0.5">
                  {project.activeAgents.slice(0, 3).map((a) => (
                    <span
                      key={a}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[0.8rem] text-white font-semibold"
                      style={{ backgroundColor: agentToken(a).color }}
                      title={agentToken(a).name}
                    >
                      {agentToken(a).label}
                    </span>
                  ))}
                </div>
              )}
              {isCompleted && (
                <span className="text-[0.75rem] text-olive/60 select-none">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: stall / pulse info */}
      <div className="w-24 flex-shrink-0 text-right">
        {project.isStalled ? (
          <div className="flex items-center justify-end gap-1">
            <StatusDot status="error" />
            <span className="text-[0.8rem] text-terracotta">{project.staleDays}d stalled</span>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            {project.staleDays >= 0 && (
              <span className="text-[0.75rem] text-mid/70">
                {project.staleDays === 0 ? "active" : `${project.staleDays}d ago`}
              </span>
            )}
            {project.pulseCount7d > 0 && (
              <span className="text-[0.7rem] text-mid/60 tabular-nums">{project.pulseCount7d}p/7d</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
