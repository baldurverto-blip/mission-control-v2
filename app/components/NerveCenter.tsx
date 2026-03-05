"use client";

import { useMemo } from "react";
import { ALL_AGENT_IDS, agent, isAttention, relTime, type PulseEvent, type PulseStats } from "@/app/lib/agents";

// ─── Health Ring (64px, 3 concentric arcs) ──────────────────────────

function HealthRing({ agentActivity, pulseRate, hasAttention }: {
  agentActivity: number;
  pulseRate: number;
  hasAttention: boolean;
}) {
  const size = 64;
  const cx = size / 2;
  const rings = [
    { r: 27, stroke: hasAttention ? "#BC6143" : "#76875A", value: agentActivity, width: 4.5 },
    { r: 20, stroke: "#9899C1", value: pulseRate, width: 4.5 },
    { r: 13, stroke: hasAttention ? "#BC6143" : "#C9A227", value: hasAttention ? 0.3 : 1, width: 4.5 },
  ];

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {rings.map(({ r, stroke, value, width }, i) => {
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - Math.min(value, 1));
        return (
          <g key={i}>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--warm)" strokeWidth={width} opacity={0.5} />
            <circle
              cx={cx} cy={cx} r={r} fill="none" stroke={stroke} strokeWidth={width}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cx})`}
              className="ring-arc"
              style={{ "--ring-circumference": circumference } as React.CSSProperties}
            />
          </g>
        );
      })}
      <circle cx={cx} cy={cx} r={3} fill={hasAttention ? "#BC6143" : "#76875A"} className="breathe" />
    </svg>
  );
}

// ─── Agent Halo (compact SVG ring) ──────────────────────────────────

function AgentHalo({ agentId, pulses, isActive, isSelected, onClick }: {
  agentId: string;
  pulses: PulseEvent[];
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const a = agent(agentId);

  const activityLevel = useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const recent = pulses.filter(p => p.agent === agentId && new Date(p.timestamp).getTime() > twoHoursAgo);
    return Math.min(recent.length / 5, 1);
  }, [pulses, agentId]);

  const hasError = useMemo(() => {
    return pulses.some(p => p.agent === agentId && isAttention(p));
  }, [pulses, agentId]);

  const sparkline = useMemo(() => {
    const buckets = new Array(24).fill(0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const start = todayStart.getTime();
    for (const p of pulses) {
      if (p.agent !== agentId) continue;
      const t = new Date(p.timestamp).getTime();
      if (t < start) continue;
      const hour = new Date(p.timestamp).getHours();
      buckets[hour]++;
    }
    return buckets;
  }, [pulses, agentId]);

  const maxBucket = Math.max(...sparkline, 1);
  const size = 40;
  const cx = size / 2;
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const arcOffset = circumference * (1 - activityLevel);
  const ringColor = hasError ? "#BC6143" : isActive ? a.color : `${a.color}60`;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 group cursor-pointer"
      title={`${a.name} — ${hasError ? "error" : isActive ? "active" : "idle"}`}
    >
      <div className="relative">
        <svg width={size} height={size}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--warm)" strokeWidth={3} opacity={0.5} />
          <circle
            cx={cx} cy={cx} r={r} fill="none"
            stroke={ringColor} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={arcOffset}
            transform={`rotate(-90 ${cx} ${cx})`}
            className={`halo-ring ${hasError ? "attention-pulse" : ""}`}
            style={{ "--ring-circumference": circumference } as React.CSSProperties}
          />
          <circle cx={cx} cy={cx} r={10} fill={isSelected ? a.color : a.soft} className="transition-all" />
          <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
            fill={isSelected ? "var(--paper)" : a.color} fontSize="8"
            fontFamily="var(--font-dm-mono)" fontWeight="500"
          >{a.label}</text>
        </svg>
        {isActive && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] breathe"
            style={{ backgroundColor: hasError ? "#BC6143" : "#76875A", borderColor: "var(--paper)" }} />
        )}
        {isSelected && (
          <span className="absolute inset-0 rounded-full" style={{ outline: `2px solid ${a.color}`, outlineOffset: "1px" }} />
        )}
      </div>
      {/* Sparkline — hidden by default, show on hover */}
      <div className="flex items-end gap-px h-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {sparkline.map((count, i) => (
          <div key={i} className="w-[1.5px] rounded-sm"
            style={{
              height: count > 0 ? `${Math.max((count / maxBucket) * 100, 20)}%` : "1px",
              backgroundColor: count > 0 ? a.color : "var(--warm)",
              opacity: count > 0 ? 0.6 + (count / maxBucket) * 0.4 : 0.25,
            }}
          />
        ))}
      </div>
      <span className="text-[0.45rem] text-mid/50 group-hover:text-charcoal transition-colors leading-none">{a.name}</span>
    </button>
  );
}

// ─── Nerve Center ───────────────────────────────────────────────────

interface NerveCenterProps {
  pulses: PulseEvent[];
  stats: PulseStats;
  cronHealth?: { healthy: number; total: number };
  selectedAgent: string | null;
  onSelectAgent: (id: string | null) => void;
}

export function NerveCenter({ pulses, stats, cronHealth, selectedAgent, onSelectAgent }: NerveCenterProps) {
  const agentActivity = stats.activeAgents.length / ALL_AGENT_IDS.length;
  const pulseRate = Math.min(stats.totalToday / 30, 1);

  const todayPulses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return pulses.filter(p => p.timestamp.startsWith(today));
  }, [pulses]);

  return (
    <div className="flex items-center gap-4 px-5 py-3 bg-paper border border-warm rounded-xl fade-up flex-shrink-0">
      {/* Health Ring */}
      <HealthRing agentActivity={agentActivity} pulseRate={pulseRate} hasAttention={stats.hasAttention} />

      {/* Agent Halos — tight inline row */}
      <div className="flex items-center gap-3 flex-1 min-w-0 justify-center">
        {ALL_AGENT_IDS.map((id) => (
          <AgentHalo
            key={id}
            agentId={id}
            pulses={todayPulses}
            isActive={stats.activeAgents.includes(id)}
            isSelected={selectedAgent === id}
            onClick={() => onSelectAgent(selectedAgent === id ? null : id)}
          />
        ))}
      </div>

      {/* Vitals — compact right column */}
      <div className="flex-shrink-0 text-right space-y-0.5">
        <div>
          <span className="text-xl text-charcoal font-heading tabular-nums">{stats.totalToday}</span>
          <span className="text-[0.5rem] text-mid/50 ml-1">pulses</span>
        </div>
        <div className="text-[0.6rem] text-mid tabular-nums">
          {stats.activeAgents.length}/{ALL_AGENT_IDS.length} <span className="text-mid/40">active</span>
        </div>
        <div className="text-[0.55rem] tabular-nums" style={{ color: stats.hasAttention ? "var(--terracotta)" : "var(--olive)" }}>
          {stats.hasAttention ? "attention needed" : "all clear"}
        </div>
        <div className="text-[0.5rem] text-mid/35 tabular-nums" suppressHydrationWarning>
          {stats.lastPulse ? `last ${relTime(stats.lastPulse)}` : "—"}
          {cronHealth && ` · ${cronHealth.healthy}/${cronHealth.total} crons`}
        </div>
      </div>
    </div>
  );
}
