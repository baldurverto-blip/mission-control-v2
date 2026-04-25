"use client";

import { useMemo } from "react";
import {
  AGENTS,
  ALL_AGENT_IDS,
  agent,
  isAttention,
  relTime,
  type PulseData,
} from "@/app/lib/agents";

// ─── Types ───────────────────────────────────────────────────────────

interface KPIs {
  roadmap: { done: number; total: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  failures: { recent: number; daysSince: number | null };
}

interface AgentMailStatus {
  latestNewMessages: number;
}

interface CommandBarProps {
  pulseData: PulseData | null;
  kpis: KPIs | null;
  systemHealth: string;
  healthColor: string;
  roadmapPct: number;
  agentmail?: AgentMailStatus | null;
}

// ─── Agent Constellation ─────────────────────────────────────────────

const SPECIALIST_IDS = ALL_AGENT_IDS.filter((id) => id !== "baldur");

// Orbital positions for 7 specialists around Baldur (center at 90,44)
// Semi-arc above: evenly spaced
const ORBITAL_POSITIONS: Record<string, { x: number; y: number }> = {
  scout:   { x: 16,  y: 22 },
  prism:   { x: 36,  y: 10 },
  builder: { x: 60,  y: 3 },
  saga:    { x: 90,  y: 0 },
  bastion: { x: 120, y: 3 },
  vibe:    { x: 144, y: 10 },
  frigg:   { x: 164, y: 22 },
};

const BALDUR_POS = { x: 90, y: 44 };

function AgentConstellation({
  pulseData,
}: {
  pulseData: PulseData | null;
}) {
  const activeAgents = pulseData?.stats.activeAgents ?? [];
  const hasAttention = pulseData?.stats.hasAttention ?? false;
  const baldurActive = activeAgents.includes("baldur");

  const agentStates = useMemo(() => {
    const pulses = pulseData?.pulses ?? [];
    const fourHoursAgo = Date.now() - 4 * 3_600_000;

    return ALL_AGENT_IDS.map((id) => {
      const agentPulses = pulses.filter((p) => p.agent === id);
      const recentPulses = agentPulses.filter(
        (p) => new Date(p.timestamp).getTime() > fourHoursAgo
      );
      const hasRecentError = recentPulses.some(isAttention);
      const isActive = activeAgents.includes(id);
      const lastPulse = agentPulses.length > 0
        ? agentPulses.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b
          )
        : null;

      return {
        id,
        isActive,
        hasError: hasRecentError,
        lastPulse: lastPulse ? relTime(lastPulse.timestamp) : null,
      };
    });
  }, [pulseData, activeAgents]);

  const baldurState = agentStates.find((a) => a.id === "baldur")!;

  return (
    <a
      href="/org"
      className="group flex items-center justify-center cursor-pointer"
      title="View Organisation"
    >
      <svg
        width="180"
        height="56"
        viewBox="0 0 180 56"
        className="overflow-visible"
      >
        {/* Connection lines from specialists to Baldur */}
        {SPECIALIST_IDS.map((id) => {
          const pos = ORBITAL_POSITIONS[id];
          const a = agent(id);
          const state = agentStates.find((s) => s.id === id)!;
          return (
            <line
              key={`line-${id}`}
              x1={pos.x}
              y1={pos.y + 7}
              x2={BALDUR_POS.x}
              y2={BALDUR_POS.y - 4}
              stroke={state.isActive ? a.color : "var(--dark-border)"}
              strokeWidth={state.isActive ? 1.2 : 0.6}
              opacity={state.isActive ? 0.5 : 0.2}
              className={state.isActive ? "connection-line" : ""}
            />
          );
        })}

        {/* Baldur orchestrator ring */}
        <circle
          cx={BALDUR_POS.x}
          cy={BALDUR_POS.y}
          r={18}
          fill="none"
          stroke={AGENTS.baldur.color}
          strokeWidth={1.5}
          opacity={0.3}
          className="orchestrator-ring"
        />

        {/* Baldur — large center node */}
        <circle
          cx={BALDUR_POS.x}
          cy={BALDUR_POS.y}
          r={12}
          fill={baldurActive ? AGENTS.baldur.color : `${AGENTS.baldur.color}40`}
          className="transition-all duration-500"
        />
        <text
          x={BALDUR_POS.x}
          y={BALDUR_POS.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={baldurActive ? "#fff" : AGENTS.baldur.color}
          fontSize="9"
          fontWeight="600"
          fontFamily="var(--font-dm-mono)"
        >
          B
        </text>
        {/* Orchestrator crown indicator */}
        <text
          x={BALDUR_POS.x}
          y={BALDUR_POS.y - 16}
          textAnchor="middle"
          dominantBaseline="central"
          fill={AGENTS.baldur.color}
          fontSize="7"
          fontFamily="var(--font-dm-mono)"
          opacity={0.7}
        >
          CEO
        </text>

        {/* Specialist nodes */}
        {SPECIALIST_IDS.map((id) => {
          const pos = ORBITAL_POSITIONS[id];
          const a = agent(id);
          const state = agentStates.find((s) => s.id === id)!;
          const fillColor = state.hasError
            ? "#BC6143"
            : state.isActive
              ? a.color
              : `${a.color}35`;

          return (
            <g key={id}>
              {/* Glow ring for active agents */}
              {state.isActive && (
                <circle
                  cx={pos.x}
                  cy={pos.y + 7}
                  r={10}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={1}
                  opacity={0.25}
                  className="agent-glow"
                  style={{ "--glow-color": `${a.color}40` } as React.CSSProperties}
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y + 7}
                r={7}
                fill={fillColor}
                className="transition-all duration-500"
              />
              <text
                x={pos.x}
                y={pos.y + 7}
                textAnchor="middle"
                dominantBaseline="central"
                fill={state.isActive ? "#fff" : a.color}
                fontSize="6.5"
                fontWeight="500"
                fontFamily="var(--font-dm-mono)"
              >
                {a.label}
              </text>
              {/* Status dot */}
              {state.isActive && (
                <circle
                  cx={pos.x + 6}
                  cy={pos.y + 1}
                  r={2}
                  fill={state.hasError ? "#BC6143" : "#22C55E"}
                  className="pulse-dot"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover label */}
      <span className="text-[0.6rem] text-dark-muted/0 group-hover:text-dark-muted/70 transition-all ml-1 whitespace-nowrap">
        org &rarr;
      </span>
    </a>
  );
}

// ─── System Vitals ───────────────────────────────────────────────────

function SystemVitals({
  pulseData,
  kpis,
  roadmapPct,
  systemHealth,
  agentmail,
}: {
  pulseData: PulseData | null;
  kpis: KPIs | null;
  roadmapPct: number;
  systemHealth: string;
  agentmail?: AgentMailStatus | null;
}) {
  const totalToday = pulseData?.stats.totalToday ?? 0;
  const activeCount = pulseData?.stats.activeAgents.length ?? 0;
  const cronOk = kpis ? kpis.cron.healthy === kpis.cron.total : true;

  return (
    <div className="flex items-center gap-4">
      {/* Vital pills */}
      <div className="flex items-center gap-2">
        <VitalPill
          value={`${activeCount}/${ALL_AGENT_IDS.length}`}
          label="active"
          color={activeCount > 0 ? "#22C55E" : "var(--dark-dim)"}
        />
        <VitalPill
          value={`${totalToday}`}
          label="pulses"
          color="var(--dark-muted)"
        />
        <VitalPill
          value={kpis ? `${kpis.cron.healthy}/${kpis.cron.total}` : "—"}
          label="crons"
          color={cronOk ? "var(--dark-muted)" : "#C9A227"}
        />
        <VitalPill
          value={`${agentmail?.latestNewMessages ?? 0}`}
          label="new mail"
          color={(agentmail?.latestNewMessages ?? 0) > 0 ? "#C9A227" : "var(--dark-muted)"}
        />
      </div>

      {/* Roadmap gauge */}
      <div className="flex items-center gap-2">
        <div className="w-12 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--dark-border)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${roadmapPct}%`, backgroundColor: "#22C55E" }}
          />
        </div>
        <span className="text-[0.68rem] tabular-nums" style={{ color: "var(--dark-muted)" }}>
          {roadmapPct}%
        </span>
      </div>

      {/* Health dot */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${systemHealth === "healthy" ? "pulse-dot-subtle" : systemHealth === "alert" ? "attention-pulse" : ""}`}
          style={{
            backgroundColor:
              systemHealth === "healthy" ? "#22C55E"
              : systemHealth === "alert" ? "#BC6143"
              : "var(--dark-dim)",
          }}
        />
        <span className="text-[0.62rem] uppercase tracking-widest" style={{
          color: systemHealth === "healthy" ? "#22C55E"
            : systemHealth === "alert" ? "#BC6143"
            : "var(--dark-dim)",
        }}>
          {systemHealth}
        </span>
      </div>
    </div>
  );
}

function VitalPill({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: "var(--dark-surface)" }}>
      <span className="text-[0.78rem] font-medium tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--dark-dim)" }}>{label}</span>
    </div>
  );
}

// ─── Command Bar ─────────────────────────────────────────────────────

export function CommandBar({
  pulseData,
  kpis,
  systemHealth,
  healthColor,
  roadmapPct,
  agentmail,
}: CommandBarProps) {
  return (
    <div
      className="w-full fade-up"
      style={{ backgroundColor: "var(--dark-bg)" }}
    >
      <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
        {/* Left — Branding + greeting */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span
              className="text-[0.65rem] font-medium tracking-[0.3em] uppercase"
              style={{ color: "var(--dark-muted)" }}
            >
              VertoOS
            </span>
            <span style={{ color: "var(--dark-border)" }}>|</span>
            <span
              className="text-[0.65rem] tracking-wider"
              style={{ color: "var(--dark-dim)" }}
              suppressHydrationWarning
            >
              {new Date().toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Europe/Copenhagen",
              })}
              {" · "}
              {new Date().toLocaleTimeString("da-DK", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Copenhagen",
              })}{" "}
              CET
            </span>
          </div>
        </div>

        {/* Center — Agent Constellation (links to /org) */}
        <AgentConstellation pulseData={pulseData} />

        {/* Right — System Vitals */}
        <SystemVitals
          pulseData={pulseData}
          kpis={kpis}
          roadmapPct={roadmapPct}
          systemHealth={systemHealth}
          agentmail={agentmail}
        />
      </div>
    </div>
  );
}
