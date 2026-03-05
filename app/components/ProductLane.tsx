"use client";

import { Badge } from "./Badge";
import { StatusDot } from "./StatusDot";
import { agent as agentToken } from "@/app/lib/agents";

const PHASES = ["discovery", "validation", "build", "distribution", "support"];

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
}

export function ProductLane({ project }: { project: ProjectLane }) {
  const currentIdx = PHASES.indexOf(project.lifecyclePhase);
  const primaryAgent = project.activeAgents[0];
  const primaryColor = primaryAgent ? agentToken(primaryAgent).color : "var(--olive)";

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-warm/30 transition-colors group">
      {/* Product name */}
      <div className="w-28 flex-shrink-0">
        <p className="text-sm font-medium text-charcoal truncate">{project.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge color={project.isStalled ? "var(--terracotta)" : "var(--olive)"}>{project.status}</Badge>
          {project.pulseCount7d > 0 && (
            <span className="text-[0.55rem] text-mid tabular-nums">{project.pulseCount7d}p/7d</span>
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
              className="relative h-8 rounded-md flex items-center justify-center overflow-hidden transition-all"
              style={{
                backgroundColor: isCurrent
                  ? `${primaryColor}30`
                  : isCompleted
                    ? "var(--olive-soft, rgba(118, 135, 90, 0.15))"
                    : "var(--warm)",
                borderLeft: isCurrent ? `2px solid ${primaryColor}` : undefined,
              }}
            >
              {isCurrent && (
                <div className="lane-fill absolute inset-0 rounded-md" style={{ backgroundColor: `${primaryColor}15` }} />
              )}
              {isCurrent && project.activeAgents.length > 0 && (
                <div className="relative z-10 flex gap-1">
                  {project.activeAgents.slice(0, 3).map((a) => (
                    <span
                      key={a}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[0.45rem] text-white font-medium"
                      style={{ backgroundColor: agentToken(a).color }}
                      title={agentToken(a).name}
                    >
                      {agentToken(a).label}
                    </span>
                  ))}
                </div>
              )}
              {isCompleted && (
                <span className="text-[0.5rem] text-olive/50">&#10003;</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Stall indicator */}
      <div className="w-20 flex-shrink-0 text-right">
        {project.isStalled ? (
          <div className="flex items-center justify-end gap-1">
            <StatusDot status="error" />
            <span className="text-[0.6rem] text-terracotta">{project.staleDays}d stalled</span>
          </div>
        ) : project.staleDays >= 0 ? (
          <span className="text-[0.55rem] text-mid/50">{project.staleDays === 0 ? "active" : `${project.staleDays}d ago`}</span>
        ) : (
          <span className="text-[0.55rem] text-mid/30">no pulses</span>
        )}
      </div>
    </div>
  );
}
