"use client";

import { agent, clockTime, type PulseEvent } from "@/app/lib/agents";

interface AttentionBarProps {
  pulses: PulseEvent[];
}

export function AttentionBar({ pulses }: AttentionBarProps) {
  if (pulses.length === 0) return null;

  return (
    <div
      className="px-6 py-3 bg-paper border border-warm rounded-xl fade-up"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full attention-pulse" style={{ backgroundColor: "var(--terracotta)" }} />
        <span className="text-[0.6rem] font-medium tracking-wider uppercase" style={{ color: "var(--terracotta)" }}>
          Needs attention
        </span>
      </div>
      <div className="space-y-1.5">
        {pulses.slice(0, 3).map((p, i) => {
          const a = agent(p.agent);
          return (
            <div key={i} className="flex items-center gap-2.5 text-[0.7rem]">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
              <span className="font-medium" style={{ color: a.color }}>{a.name}</span>
              <span className="text-charcoal flex-1 truncate">{p.outcome}</span>
              <span className="text-mid/35 tabular-nums flex-shrink-0" suppressHydrationWarning>{clockTime(p.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
