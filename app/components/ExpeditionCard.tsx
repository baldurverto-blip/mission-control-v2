"use client";

import { Card } from "./Card";
import { Badge } from "./Badge";
import { StatusDot } from "./StatusDot";
import { agent as agentToken } from "@/app/lib/agents";

interface Expedition {
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

function formatTimeRemaining(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 0) {
    const hours = Math.ceil(Math.abs(ms) / 3600000);
    return `OVERDUE by ${hours}h`;
  }
  const hours = Math.floor(ms / 3600000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  return `${hours}h left`;
}

export function ExpeditionCard({ expedition }: { expedition: Expedition }) {
  const statusColor = expedition.status === "active"
    ? "var(--olive)"
    : expedition.status === "completed"
      ? "var(--mid)"
      : "var(--terracotta)";

  return (
    <Card
      className={`p-3 ${expedition.isOverdue ? "border-terracotta/50" : ""}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusDot status={expedition.isOverdue ? "error" : expedition.status === "active" ? "ok" : "idle"} />
          <p className="text-sm font-medium text-charcoal">{expedition.name}</p>
        </div>
        <Badge color={statusColor}>{expedition.status}</Badge>
      </div>

      {/* Team dots */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {expedition.team.map((a) => (
            <span
              key={a}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] text-white font-medium"
              style={{ backgroundColor: agentToken(a).color }}
              title={agentToken(a).name}
            >
              {agentToken(a).label}
            </span>
          ))}
        </div>
        {expedition.timeRemaining !== null && (
          <span
            className={`text-[0.6rem] font-medium tabular-nums ${expedition.isOverdue ? "text-terracotta countdown-tick" : "text-mid"}`}
          >
            {formatTimeRemaining(expedition.timeRemaining)}
          </span>
        )}
      </div>

      {/* Scope */}
      <p className="text-xs text-mid leading-relaxed line-clamp-2 mb-2">{expedition.scope.slice(0, 120)}</p>

      {/* Footer */}
      <div className="flex items-center justify-between text-[0.55rem] text-mid/50">
        <span>{expedition.guardrails.time_box} time box</span>
        <span>{expedition.pulseCount} pulses</span>
      </div>
    </Card>
  );
}
