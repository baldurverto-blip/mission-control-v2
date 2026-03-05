"use client";

import { useState } from "react";
import { agent, goalLabel } from "@/app/lib/agents";

interface GoalData {
  id: string;
  name: string;
  pulseCount: number;
  agents: { id: string; count: number }[];
  lastPulse: string | null;
}

interface MissionBandsProps {
  goals: GoalData[];
  selectedGoal: string | null;
  onSelectGoal: (id: string | null) => void;
}

export function MissionBands({ goals, selectedGoal, onSelectGoal }: MissionBandsProps) {
  const [showDetail, setShowDetail] = useState(false);

  if (goals.length === 0) return null;

  const total = goals.reduce((s, g) => s + g.pulseCount, 0);
  const topGoals = goals.slice(0, 8);

  return (
    <div className="px-5 py-2.5 bg-paper border border-warm rounded-xl fade-up flex-shrink-0">
      {/* Compact view: single stacked bar + legend */}
      <div className="flex items-center gap-3">
        <span className="label-caps text-mid/50 flex-shrink-0 text-[0.5rem]">Missions</span>

        {/* Stacked spark-bar */}
        <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-warm/40 flex cursor-pointer" onClick={() => setShowDetail(!showDetail)}>
          {topGoals.map((goal) => {
            const width = (goal.pulseCount / total) * 100;
            const isSelected = selectedGoal === goal.id;
            const primaryAgent = goal.agents[0];
            return (
              <div
                key={goal.id}
                className="h-full transition-all relative group"
                style={{
                  width: `${width}%`,
                  backgroundColor: primaryAgent ? agent(primaryAgent.id).color : "var(--mid)",
                  opacity: isSelected ? 1 : selectedGoal ? 0.3 : 0.7,
                }}
                title={`${goalLabel(goal.id)}: ${goal.pulseCount}`}
              />
            );
          })}
        </div>

        {/* Compact legend — top 5 inline */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {topGoals.slice(0, 5).map((goal) => {
            const primaryAgent = goal.agents[0];
            const isSelected = selectedGoal === goal.id;
            return (
              <button
                key={goal.id}
                onClick={() => onSelectGoal(isSelected ? null : goal.id)}
                className={`flex items-center gap-1 cursor-pointer transition-opacity ${
                  isSelected ? "opacity-100" : selectedGoal ? "opacity-30" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: primaryAgent ? agent(primaryAgent.id).color : "var(--mid)" }}
                />
                <span className="text-[0.5rem] text-mid whitespace-nowrap">{goalLabel(goal.id)}</span>
                <span className="text-[0.45rem] text-mid/30 tabular-nums">{goal.pulseCount}</span>
              </button>
            );
          })}
          {goals.length > 5 && (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="text-[0.5rem] text-mid/40 hover:text-mid cursor-pointer"
            >
              +{goals.length - 5}
            </button>
          )}
        </div>
      </div>

      {/* Expandable detail — only shown on click */}
      {showDetail && (
        <div className="mt-2 pt-2 border-t border-warm/40 grid grid-cols-3 gap-x-4 gap-y-1">
          {goals.map((goal) => {
            const isSelected = selectedGoal === goal.id;
            return (
              <button
                key={goal.id}
                onClick={() => onSelectGoal(isSelected ? null : goal.id)}
                className={`flex items-center gap-2 py-0.5 rounded text-left cursor-pointer transition-opacity ${
                  isSelected ? "opacity-100" : "opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex gap-px flex-shrink-0">
                  {goal.agents.slice(0, 3).map((a) => (
                    <span key={a.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent(a.id).color }} />
                  ))}
                </div>
                <span className="text-[0.55rem] text-mid truncate">{goalLabel(goal.id)}</span>
                <span className="text-[0.5rem] text-mid/30 tabular-nums ml-auto">{goal.pulseCount}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
