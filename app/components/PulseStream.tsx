"use client";

import { useState, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────

interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
}

interface PulseStats {
  totalToday: number;
  activeAgents: string[];
  hasAttention: boolean;
  lastPulse: string | null;
}

interface PulseStreamProps {
  pulses: PulseEvent[];
  stats: PulseStats;
  loaded: boolean;
}

// ─── Design Tokens ───────────────────────────────────────────────────
// Agent identity system — each agent has a stable color, gradient, and label.
// Colors chosen for perceptual uniformity (Linear-inspired LCH consideration).

const AGENTS: Record<string, { color: string; soft: string; gradient: string; label: string; name: string }> = {
  baldur:  { color: "#BC6143", soft: "#bc614315", gradient: "from-[#BC6143] to-[#D4845E]", label: "B",  name: "Baldur" },
  scout:   { color: "#76875A", soft: "#76875a15", gradient: "from-[#76875A] to-[#9AAF72]", label: "Sc", name: "Scout" },
  builder: { color: "#9899C1", soft: "#9899c115", gradient: "from-[#9899C1] to-[#B4B5D6]", label: "Bu", name: "Builder" },
  bastion: { color: "#48453F", soft: "#48453f12", gradient: "from-[#48453F] to-[#6B675F]", label: "Ba", name: "Bastion" },
  vibe:    { color: "#C9A227", soft: "#C9A22715", gradient: "from-[#C9A227] to-[#DDB94A]", label: "V",  name: "Vibe" },
  frigg:   { color: "#7A8B8A", soft: "#7A8B8A15", gradient: "from-[#7A8B8A] to-[#9AABA9]", label: "F",  name: "Frigg" },
  prism:   { color: "#4C8BF5", soft: "#4C8BF515", gradient: "from-[#4C8BF5] to-[#7AA8FF]", label: "P",  name: "Prism" },
};

function agent(id: string) {
  return AGENTS[id] ?? { color: "#48453F", soft: "#48453f12", gradient: "from-[#48453F] to-[#6B675F]", label: "?", name: id };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clockTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("da-DK", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });
}

function isAttention(p: PulseEvent): boolean {
  const l = p.outcome.toLowerCase();
  return l.includes("error") || l.includes("failed") || l.includes("degraded") ||
    l.includes("removed") || l.includes("alert") || l.includes("awaiting");
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "";
  if (ms > 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function goalLabel(g: string): string {
  return g.replace(/-/g, " ");
}

// ─── Health Ring (Apple Activity Rings inspired) ─────────────────────
// Three concentric arcs: agent activity, cron health, system status

function HealthRing({ agentActivity, pulseRate, hasAttention }: {
  agentActivity: number; // 0-1 (active agents / total agents)
  pulseRate: number;     // 0-1 (normalized pulse volume)
  hasAttention: boolean;
}) {
  const size = 56;
  const cx = size / 2;
  const rings = [
    { r: 23, stroke: hasAttention ? "#BC6143" : "#76875A", value: agentActivity, width: 4 },  // outer: agent activity
    { r: 17, stroke: "#9899C1", value: pulseRate, width: 4 },                                  // middle: pulse rate
    { r: 11, stroke: hasAttention ? "#BC6143" : "#C9A227", value: hasAttention ? 0.3 : 1, width: 4 }, // inner: system
  ];

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {rings.map(({ r, stroke, value, width }, i) => {
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - Math.min(value, 1));
        return (
          <g key={i}>
            {/* Track */}
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--warm)" strokeWidth={width} opacity={0.5} />
            {/* Arc */}
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
      {/* Center dot — breathing indicator */}
      <circle cx={cx} cy={cx} r={2.5} fill={hasAttention ? "#BC6143" : "#76875A"} className="breathe" />
    </svg>
  );
}

// ─── Agent Sparkline (24h activity density) ──────────────────────────
// Tiny horizontal bar showing when an agent was active today

function AgentSparkline({ pulses, agentId }: { pulses: PulseEvent[]; agentId: string }) {
  // Build 24-hour buckets
  const buckets = new Array(24).fill(0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (const p of pulses) {
    if (p.agent !== agentId) continue;
    const t = new Date(p.timestamp).getTime();
    if (t < todayStart) continue;
    const hour = new Date(p.timestamp).getUTCHours(); // use UTC for consistency with pulse timestamps
    buckets[hour]++;
  }

  const max = Math.max(...buckets, 1);
  const a = agent(agentId);

  return (
    <div className="flex items-end gap-px h-3" title={`${a.name} — 24h activity`}>
      {buckets.map((count, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm transition-all"
          style={{
            height: count > 0 ? `${Math.max((count / max) * 100, 20)}%` : "2px",
            backgroundColor: count > 0 ? a.color : "var(--warm)",
            opacity: count > 0 ? 0.7 + (count / max) * 0.3 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

// ─── Goal Bar (Mission Bands preview) ────────────────────────────────
// Horizontal stacked bar showing effort distribution by goal

function GoalBars({ pulses }: { pulses: PulseEvent[] }) {
  const goalCounts: Record<string, { count: number; agents: Set<string> }> = {};
  for (const p of pulses) {
    if (!goalCounts[p.goal]) goalCounts[p.goal] = { count: 0, agents: new Set() };
    goalCounts[p.goal].count++;
    goalCounts[p.goal].agents.add(p.agent);
  }
  const sorted = Object.entries(goalCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  const total = sorted.reduce((s, [, v]) => s + v.count, 0);
  if (total === 0) return null;

  // Assign colors based on first agent in each goal
  const goalColors: Record<string, string> = {};
  for (const [goal, { agents }] of sorted) {
    const firstAgent = [...agents][0];
    goalColors[goal] = agent(firstAgent).color;
  }

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-warm/50">
        {sorted.map(([goal, { count }]) => (
          <div
            key={goal}
            className="h-full transition-all"
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: goalColors[goal],
              opacity: 0.7,
            }}
            title={`${goalLabel(goal)}: ${count} pulses`}
          />
        ))}
      </div>
      {/* Labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map(([goal, { count }]) => (
          <div key={goal} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: goalColors[goal], opacity: 0.7 }} />
            <span className="text-[0.8rem] text-mid">{goalLabel(goal)}</span>
            <span className="text-[0.75rem] text-mid/75 tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function PulseStream({ pulses, stats, loaded }: PulseStreamProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expandedPulse, setExpandedPulse] = useState<number | null>(null);

  // Derived data
  const todayPulses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return pulses.filter(p => p.timestamp.startsWith(today));
  }, [pulses]);

  const filteredPulses = useMemo(() => {
    const list = selectedAgent ? pulses.filter(p => p.agent === selectedAgent) : pulses;
    return list.slice(0, expanded ? 50 : 8);
  }, [pulses, selectedAgent, expanded]);

  const attentionPulses = useMemo(() => todayPulses.filter(isAttention), [todayPulses]);

  const allAgentIds = ["baldur", "scout", "builder", "bastion", "vibe", "frigg", "prism"];
  const agentActivity = stats.activeAgents.length / allAgentIds.length;
  const pulseRate = Math.min(stats.totalToday / 30, 1); // normalize: 30 pulses/day = full ring

  return (
    <div
      className={`card lg:col-span-12 ${loaded ? "fade-up" : "opacity-0"}`}
      style={{ animationDelay: "0.03s", padding: 0, overflow: "hidden" }}
    >
      {/* ═══════════════════════════════════════════════════════════════
          LAYER 1 — STATUS BAR (always visible, glanceable)
          Inspired by: Apple Activity Rings + SpaceX mission bar + Figma presence
         ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-5 px-5 py-4 border-b border-warm/60">
        {/* Health Ring */}
        <HealthRing
          agentActivity={agentActivity}
          pulseRate={pulseRate}
          hasAttention={stats.hasAttention}
        />

        {/* Metrics */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-xl text-charcoal leading-none">Pulse</h2>
            <span className="text-[0.8rem] text-mid/70 tabular-nums" suppressHydrationWarning>
              {stats.lastPulse ? `last ${relTime(stats.lastPulse)} ago` : "no pulses"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[0.8rem]">
            <span className="text-mid tabular-nums">{stats.totalToday} <span className="text-mid/75">today</span></span>
            <span className="text-mid tabular-nums">{stats.activeAgents.length}/{allAgentIds.length} <span className="text-mid/75">agents active</span></span>
            {attentionPulses.length > 0 && (
              <span className="text-terracotta tabular-nums">{attentionPulses.length} <span className="text-terracotta/80">need attention</span></span>
            )}
          </div>
        </div>

        {/* Agent Presence — Figma-style avatars with sparklines */}
        <div className="flex items-center gap-2">
          {allAgentIds.map((id) => {
            const a = agent(id);
            const isActive = stats.activeAgents.includes(id);
            const isSelected = selectedAgent === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedAgent(isSelected ? null : id)}
                className="flex flex-col items-center gap-1 group"
                title={`${a.name}${isActive ? " (active)" : " (idle)"}`}
              >
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[0.75rem] font-medium transition-all"
                    style={{
                      backgroundColor: isSelected ? a.color : a.soft,
                      color: isSelected ? "var(--paper)" : a.color,
                      opacity: isActive || isSelected ? 1 : 0.35,
                      outlineColor: isSelected ? a.color : "transparent",
                      outlineWidth: isSelected ? "2px" : "0",
                      outlineStyle: "solid",
                      outlineOffset: "2px",
                    }}
                  >
                    {a.label}
                  </div>
                  {isActive && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 breathe"
                      style={{ backgroundColor: "#76875A", borderColor: "var(--paper)" }}
                    />
                  )}
                </div>
                <AgentSparkline pulses={todayPulses} agentId={id} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          LAYER 2 — ATTENTION + GOALS (orient: where is effort going?)
          Inspired by: SpaceX red-link nav + OODA orient + Datadog RED
         ═══════════════════════════════════════════════════════════════ */}

      {/* Attention Bar — pinned, prominent, never missed */}
      {attentionPulses.length > 0 && !selectedAgent && (
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--terracotta)", borderLeftWidth: 3, backgroundColor: "var(--terracotta-soft)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full attention-pulse" style={{ backgroundColor: "var(--terracotta)" }} />
            <span className="text-[0.8rem] font-medium tracking-wider uppercase" style={{ color: "var(--terracotta)" }}>
              Needs attention
            </span>
          </div>
          <div className="space-y-1.5">
            {attentionPulses.slice(0, 3).map((p, i) => {
              const a = agent(p.agent);
              return (
                <div key={i} className="flex items-center gap-2.5 text-[0.85rem]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="font-medium" style={{ color: a.color }}>{a.name}</span>
                  <span className="text-charcoal flex-1 truncate">{p.outcome}</span>
                  <span className="text-mid/75 tabular-nums flex-shrink-0">{clockTime(p.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Goal Distribution — where effort is going today */}
      {!selectedAgent && todayPulses.length > 3 && (
        <div className="px-5 py-3 border-b border-warm/40">
          <p className="text-[0.75rem] font-medium tracking-wider uppercase text-mid/70 mb-2">Effort distribution</p>
          <GoalBars pulses={todayPulses} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          LAYER 3 — ACTIVITY TIMELINE (observe: what happened?)
          Inspired by: Linear density + Datadog row-per-service + Notion inline expand
         ═══════════════════════════════════════════════════════════════ */}
      <div className={`${expanded ? "max-h-[520px]" : "max-h-[320px]"} overflow-y-auto custom-scroll`}>
        {filteredPulses.map((pulse, i) => {
          const a = agent(pulse.agent);
          const attention = isAttention(pulse);
          const isExpanded = expandedPulse === i;
          const dur = formatDuration(pulse.duration_ms);

          // Time gap detection
          const prev = filteredPulses[i - 1];
          const gap = prev
            ? new Date(prev.timestamp).getTime() - new Date(pulse.timestamp).getTime()
            : 0;
          const showGap = gap > 3600000; // 1+ hour gap

          return (
            <div key={`${pulse.timestamp}-${i}`}>
              {/* Time gap separator */}
              {showGap && (
                <div className="flex items-center gap-3 px-5 py-1.5">
                  <div className="flex-1 border-t border-dashed border-warm/60" />
                  <span className="text-[0.85rem] text-mid/70 tabular-nums whitespace-nowrap">
                    {Math.round(gap / 3600000)}h quiet
                  </span>
                  <div className="flex-1 border-t border-dashed border-warm/60" />
                </div>
              )}

              {/* Pulse row — compact, scannable, expandable */}
              <button
                onClick={() => setExpandedPulse(isExpanded ? null : i)}
                className={`w-full text-left flex items-center gap-3 px-5 py-2 transition-colors ${
                  attention ? "bg-[var(--terracotta-soft)]" : "hover:bg-warm/30"
                }`}
              >
                {/* Agent dot */}
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[0.8rem] font-medium flex-shrink-0"
                  style={{ backgroundColor: a.soft, color: a.color }}
                >
                  {a.label}
                </span>

                {/* Agent name */}
                <span className="text-[0.8rem] font-medium w-14 flex-shrink-0 truncate" style={{ color: a.color }}>
                  {a.name}
                </span>

                {/* Outcome — the most important text */}
                <span className={`text-[0.85rem] flex-1 min-w-0 truncate ${
                  attention ? "text-terracotta font-medium" : "text-charcoal"
                }`}>
                  {pulse.outcome}
                </span>

                {/* Goal tag */}
                <span className="text-[0.85rem] text-mid/75 bg-warm/60 rounded px-1.5 py-0.5 flex-shrink-0 hidden sm:inline">
                  {goalLabel(pulse.goal)}
                </span>

                {/* Duration */}
                {dur && (
                  <span className="text-[0.75rem] text-mid/55 tabular-nums flex-shrink-0 w-8 text-right">
                    {dur}
                  </span>
                )}

                {/* Time */}
                <span className="text-[0.8rem] text-mid/75 tabular-nums flex-shrink-0 w-10 text-right" suppressHydrationWarning>
                  {clockTime(pulse.timestamp)}
                </span>

                {/* Status dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${attention ? "attention-pulse" : ""}`}
                  style={{ backgroundColor: attention ? "var(--terracotta)" : "var(--olive)" }}
                />
              </button>

              {/* Expanded detail — Notion toggle-block inspired */}
              {isExpanded && (
                <div className="px-5 pb-3 pl-[3.25rem] bg-warm/20">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.8rem]">
                    <div>
                      <span className="text-mid/75">Action</span>
                      <p className="text-charcoal">{pulse.action}</p>
                    </div>
                    <div>
                      <span className="text-mid/75">Goal</span>
                      <p className="text-charcoal">{goalLabel(pulse.goal)}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-mid/75">Outcome</span>
                      <p className="text-charcoal">{pulse.outcome}</p>
                    </div>
                    {pulse.duration_ms > 0 && (
                      <div>
                        <span className="text-mid/75">Duration</span>
                        <p className="text-charcoal tabular-nums">{dur}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-mid/75">Time</span>
                      <p className="text-charcoal tabular-nums">{clockTime(pulse.timestamp)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredPulses.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-mid/70 text-sm">
              {selectedAgent ? `No pulses from ${agent(selectedAgent).name}` : "No pulses yet"}
            </p>
            <p className="text-mid/55 text-xs mt-1">Agents emit pulses as they work</p>
          </div>
        )}
      </div>

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      {pulses.length > 8 && (
        <div className="px-5 py-2.5 border-t border-warm/40 flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[0.8rem] text-mid/70 hover:text-charcoal transition-colors"
          >
            {expanded ? "Collapse" : `Show all ${(selectedAgent ? pulses.filter(p => p.agent === selectedAgent) : pulses).length} pulses`}
          </button>
          <div className="flex items-center gap-2">
            {selectedAgent && (
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-[0.8rem] px-2 py-0.5 rounded bg-warm/60 text-mid/75 hover:text-charcoal transition-colors"
              >
                Clear filter
              </button>
            )}
            <span className="text-[0.85rem] text-mid/70 tabular-nums" suppressHydrationWarning>
              refreshes every 60s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
