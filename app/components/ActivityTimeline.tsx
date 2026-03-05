"use client";

import { useState, useMemo } from "react";
import { agent, isAttention, clockTime, formatDuration, goalLabel, type PulseEvent } from "@/app/lib/agents";

interface ActivityTimelineProps {
  pulses: PulseEvent[];
  selectedAgent: string | null;
  selectedGoal: string | null;
}

export function ActivityTimeline({ pulses, selectedAgent, selectedGoal }: ActivityTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedPulse, setExpandedPulse] = useState<number | null>(null);

  const filteredPulses = useMemo(() => {
    let list = pulses;
    if (selectedAgent) list = list.filter(p => p.agent === selectedAgent);
    if (selectedGoal) list = list.filter(p => p.goal === selectedGoal);
    return list.slice(0, expanded ? 50 : 15);
  }, [pulses, selectedAgent, selectedGoal, expanded]);

  const totalCount = useMemo(() => {
    let list = pulses;
    if (selectedAgent) list = list.filter(p => p.agent === selectedAgent);
    if (selectedGoal) list = list.filter(p => p.goal === selectedGoal);
    return list.length;
  }, [pulses, selectedAgent, selectedGoal]);

  return (
    <div className="bg-paper border border-warm rounded-xl overflow-hidden fade-up flex flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-warm/40 flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm text-charcoal font-heading">Activity</h3>
        <div className="flex items-center gap-2">
          {(selectedAgent || selectedGoal) && (
            <span className="text-[0.55rem] text-mid/50">
              filtered{selectedAgent ? ` · ${agent(selectedAgent).name}` : ""}{selectedGoal ? ` · ${goalLabel(selectedGoal)}` : ""}
            </span>
          )}
          <span className="text-[0.5rem] text-mid/25 tabular-nums" suppressHydrationWarning>
            refreshes every 60s
          </span>
        </div>
      </div>

      {/* Timeline rows — fills all remaining space */}
      <div className="flex-1 overflow-y-auto custom-scroll">
        {filteredPulses.map((pulse, i) => {
          const a = agent(pulse.agent);
          const attention = isAttention(pulse);
          const isExp = expandedPulse === i;
          const dur = formatDuration(pulse.duration_ms);

          // Time gap detection
          const prev = filteredPulses[i - 1];
          const gap = prev
            ? new Date(prev.timestamp).getTime() - new Date(pulse.timestamp).getTime()
            : 0;
          const showGap = gap > 3600000;

          return (
            <div key={`${pulse.timestamp}-${i}`}>
              {showGap && (
                <div className="flex items-center gap-3 px-5 py-1.5">
                  <div className="flex-1 border-t border-dashed border-warm/60" />
                  <span className="text-[0.5rem] text-mid/25 tabular-nums whitespace-nowrap">
                    {Math.round(gap / 3600000)}h quiet
                  </span>
                  <div className="flex-1 border-t border-dashed border-warm/60" />
                </div>
              )}

              <button
                onClick={() => setExpandedPulse(isExp ? null : i)}
                className={`w-full text-left flex items-center gap-3 px-5 py-2 transition-colors cursor-pointer ${
                  attention ? "bg-[var(--terracotta-soft)]" : "hover:bg-warm/30"
                }`}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[0.45rem] font-medium flex-shrink-0"
                  style={{ backgroundColor: a.soft, color: a.color }}
                >
                  {a.label}
                </span>

                <span className="text-[0.65rem] font-medium w-14 flex-shrink-0 truncate" style={{ color: a.color }}>
                  {a.name}
                </span>

                <span className={`text-[0.7rem] flex-1 min-w-0 truncate ${
                  attention ? "text-terracotta font-medium" : "text-charcoal"
                }`}>
                  {pulse.outcome}
                </span>

                <span className="text-[0.5rem] text-mid/40 bg-warm/60 rounded px-1.5 py-0.5 flex-shrink-0 hidden sm:inline">
                  {goalLabel(pulse.goal)}
                </span>

                {dur && (
                  <span className="text-[0.55rem] text-mid/30 tabular-nums flex-shrink-0 w-8 text-right">
                    {dur}
                  </span>
                )}

                <span className="text-[0.6rem] text-mid/35 tabular-nums flex-shrink-0 w-10 text-right" suppressHydrationWarning>
                  {clockTime(pulse.timestamp)}
                </span>

                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${attention ? "attention-pulse" : ""}`}
                  style={{ backgroundColor: attention ? "var(--terracotta)" : "var(--olive)" }}
                />
              </button>

              {isExp && (
                <div className="px-5 pb-3 pl-[3.25rem] bg-warm/20">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.65rem]">
                    <div>
                      <span className="text-mid/40">Action</span>
                      <p className="text-charcoal">{pulse.action}</p>
                    </div>
                    <div>
                      <span className="text-mid/40">Goal</span>
                      <p className="text-charcoal">{goalLabel(pulse.goal)}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-mid/40">Outcome</span>
                      <p className="text-charcoal">{pulse.outcome}</p>
                    </div>
                    {pulse.duration_ms > 0 && (
                      <div>
                        <span className="text-mid/40">Duration</span>
                        <p className="text-charcoal tabular-nums">{dur}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-mid/40">Time</span>
                      <p className="text-charcoal tabular-nums" suppressHydrationWarning>{clockTime(pulse.timestamp)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredPulses.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-mid/50 text-sm">
              {selectedAgent || selectedGoal ? "No matching pulses" : "No pulses yet"}
            </p>
            <p className="text-mid/30 text-xs mt-1">Agents emit pulses as they work</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {totalCount > 15 && (
        <div className="px-5 py-2 border-t border-warm/40 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[0.6rem] text-mid/50 hover:text-charcoal transition-colors cursor-pointer"
          >
            {expanded ? "Show less" : `Show all ${totalCount} pulses`}
          </button>
        </div>
      )}
    </div>
  );
}
