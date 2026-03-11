"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { StatusDot } from "@/app/components/StatusDot";
import { Card } from "@/app/components/Card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goal { id: string; description: string; exitCriteria: string; }

interface Agent {
  id: string; name: string; title: string; role: string;
  capabilities: string; goals: Goal[];
  tier: "board" | "orchestrator" | "specialist";
  type: "human" | "ai-openclaw" | "ai-claude";
  model: string; adapter: string; invoke: string | null;
  reportsTo: string | null; escalatesTo: string | null;
  color: string; cronCount: number; crons: string[];
  status: string; costCapMonthly: number;
}

interface CronJob { name: string; agentId: string; schedule: string; lastStatus: string; }
interface ValueStream { name: string; steps: string[]; agents: string[]; }
interface Mission { statement: string; tagline: string; values: string[]; }

interface OrgData {
  mission: Mission; agents: Agent[]; crons: CronJob[];
  valueStreams: ValueStream[];
  cadences: { daily: number; weekly: number; periodic: number; total: number };
  healthyCrons: number;
}

interface PulseEvent {
  agent: string; action: string; goal: string; outcome: string;
  duration_ms: number; timestamp: string;
}

// ─── Geometry — manual hexagonal layout, guaranteed no overlaps ───────────────
// Board at center (440, 390). Baldur top. 5 specialists in hex positions.

const W = 880, H = 760;

// Exact pixel centers for each orbital node (verified: no card overlaps)
const NP: Record<string, { x: number; y: number }> = {
  main:    { x: 440, y: 162 },   // top center
  scout:   { x: 720, y: 242 },   // upper right
  builder: { x: 720, y: 490 },   // lower right
  bastion: { x: 440, y: 638 },   // bottom center
  vibe:    { x: 160, y: 490 },   // lower left
  frigg:   { x: 160, y: 242 },   // upper left
};

// Board nucleus
const BCX = 440, BCY = 390;
const BW = 212, BH = 106;

// Node card size
const NW = 152, NH = 108;

// Governance hexagon outline
const HEX_PTS = Object.values(NP).map((p) => `${p.x},${p.y}`).join(" ");

// Connection paths
const CONNS = [
  // Board → Baldur (straight vertical, reports-to line)
  {
    d: `M${BCX},${BCY - BH / 2} L${NP.main.x},${NP.main.y + NH / 2}`,
    color: "#BC6143", dash: "none", width: 1.5, escalation: false, delay: 0,
  },
  // Baldur → Specialists (delegation arcs, flow outward)
  { d: `M${NP.main.x},${NP.main.y} C546,148 678,196 ${NP.scout.x},${NP.scout.y}`,   color: "#76875A", dash: "8 5", width: 1.1, escalation: false, delay: 0.1 },
  { d: `M${NP.main.x},${NP.main.y} C582,212 710,374 ${NP.builder.x},${NP.builder.y}`, color: "#9899C1", dash: "8 5", width: 1.1, escalation: false, delay: 0.2 },
  { d: `M${NP.main.x},${NP.main.y} C462,342 462,472 ${NP.bastion.x},${NP.bastion.y}`, color: "#C9A227", dash: "8 5", width: 1.1, escalation: false, delay: 0.3 },
  { d: `M${NP.main.x},${NP.main.y} C298,212 170,374 ${NP.vibe.x},${NP.vibe.y}`,    color: "#B07AA1", dash: "8 5", width: 1.1, escalation: false, delay: 0.4 },
  { d: `M${NP.main.x},${NP.main.y} C334,148 202,196 ${NP.frigg.x},${NP.frigg.y}`,  color: "#7A8B8A", dash: "8 5", width: 1.1, escalation: false, delay: 0.5 },
  // Mimir escalation paths (inward, blue, faint — Builder/Bastion/Vibe → board)
  { d: `M${NP.builder.x},${NP.builder.y} C660,440 598,408 ${BCX + BW / 2},${BCY}`, color: "#5B6FA8", dash: "3 9", width: 0.8, escalation: true, delay: 0.6 },
  { d: `M${NP.bastion.x},${NP.bastion.y} L${BCX},${BCY + BH / 2}`,                 color: "#5B6FA8", dash: "3 9", width: 0.8, escalation: true, delay: 0.7 },
  { d: `M${NP.vibe.x},${NP.vibe.y} C220,440 282,408 ${BCX - BW / 2},${BCY}`,       color: "#5B6FA8", dash: "3 9", width: 0.8, escalation: true, delay: 0.8 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(ts: string): string {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function agentPulseKey(id: string) {
  return id === "main" ? "baldur" : id;
}

function lastPulse(agentId: string, pulses: PulseEvent[]): PulseEvent | null {
  const key = agentPulseKey(agentId);
  return pulses.find((p) => p.agent === key || p.agent === agentId) ?? null;
}

function isActive(agentId: string, pulses: PulseEvent[]): boolean {
  const hit = lastPulse(agentId, pulses);
  if (!hit) return false;
  return Date.now() - new Date(hit.timestamp).getTime() < 30 * 60 * 1000;
}

function laneOf(a: Agent): "lane1" | "lane2" {
  if (a.type === "human" || a.type === "ai-claude" || a.tier === "orchestrator") return "lane2";
  return "lane1";
}

// ─── Border helpers — avoids React shorthand/longhand conflict ────────────────

function solidBorder(color: string, width = 1): Record<string, string | number> {
  return {
    borderTopWidth: width, borderTopStyle: "solid", borderTopColor: color,
    borderRightWidth: width, borderRightStyle: "solid", borderRightColor: color,
    borderBottomWidth: width, borderBottomStyle: "solid", borderBottomColor: color,
    borderLeftWidth: width, borderLeftStyle: "solid", borderLeftColor: color,
  };
}

function accentBorder(sideColor: string, otherColor: string, accentWidth = 3): Record<string, string | number> {
  return {
    borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: otherColor,
    borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: otherColor,
    borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: otherColor,
    borderLeftWidth: accentWidth, borderLeftStyle: "solid", borderLeftColor: sideColor,
  };
}

// ─── SVG constellation layer ──────────────────────────────────────────────────

function ConstellationSVG({ mounted, pulses, agents }: {
  mounted: boolean; pulses: PulseEvent[]; agents: Agent[];
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    >
      <defs>
        <radialGradient id="bg-glow" cx="50%" cy="52%" r="38%">
          <stop offset="0%" stopColor="#BC6143" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#BC6143" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#bg-glow)" />

      {/* Board ring */}
      <circle cx={BCX} cy={BCY} r={44} fill="none" stroke="#BC6143" strokeWidth="0.75" strokeDasharray="2 6" opacity="0.32" />
      <circle cx={BCX} cy={BCY} r={54} fill="none" stroke="#BC6143" strokeWidth="0.5" strokeDasharray="2 8" opacity="0.18"
        style={{ animation: "boardRing 4s ease-in-out infinite" }} />

      {/* Governance hexagon */}
      <polygon points={HEX_PTS} fill="none" stroke="#48453F" strokeWidth="0.5" strokeDasharray="4 12" opacity="0.1" />

      {/* Connections */}
      {CONNS.map((c, i) => (
        <path
          key={i}
          d={c.d}
          stroke={c.color}
          strokeWidth={c.width}
          strokeDasharray={c.dash === "none" ? undefined : c.dash}
          fill="none"
          opacity={mounted ? (c.escalation ? 0.2 : 0.5) : 0}
          style={{
            transition: `opacity 0.5s ease ${c.delay}s`,
            animation: mounted && c.dash !== "none"
              ? `dashFlow ${c.escalation ? 6 : 3}s linear ${c.delay}s infinite`
              : undefined,
          }}
        />
      ))}

      {/* Active halos */}
      {agents.map((a) => {
        const p = NP[a.id];
        if (!p || !isActive(a.id, pulses)) return null;
        return (
          <rect
            key={`halo-${a.id}`}
            x={p.x - NW / 2 - 7} y={p.y - NH / 2 - 7}
            width={NW + 14} height={NH + 14}
            rx={14} ry={14}
            fill="none" stroke={a.color} strokeWidth="1"
            opacity="0.3"
            style={{ animation: "haloAnim 2.5s ease-in-out infinite" }}
          />
        );
      })}
    </svg>
  );
}

// ─── Board nucleus ─────────────────────────────────────────────────────────────

function BoardNucleus({ mads, mimir, selectedId, onSelect }: {
  mads?: Agent; mimir?: Agent; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div style={{
      position: "absolute",
      left: BCX - BW / 2, top: BCY - BH / 2,
      width: BW, height: BH,
      zIndex: 3,
    }}>
      {/* Pulse rings */}
      <div style={{
        position: "absolute", inset: -10, borderRadius: 16,
        ...solidBorder("#BC614350", 1),
        animation: "boardPulse 4s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: -18, borderRadius: 20,
        ...solidBorder("#BC614328", 1),
        animation: "boardPulse 4s ease-in-out infinite 1.2s",
        pointerEvents: "none",
      }} />

      {/* Label */}
      <div style={{
        position: "absolute", top: -22, left: 0, right: 0,
        textAlign: "center",
        fontFamily: "var(--font-dm-mono)",
        fontSize: "0.55rem", letterSpacing: "0.2em",
        color: "var(--terracotta)", fontWeight: 500,
      }}>
        STEERING BOARD
      </div>

      {/* Members */}
      <div style={{ display: "flex", height: "100%", gap: 3, ...solidBorder("var(--warm)", 1), borderRadius: 10, overflow: "hidden" }}>
        {[mads, mimir].filter(Boolean).map((a) => {
          if (!a) return null;
          const isSel = selectedId === a.id;
          return (
            <button key={a.id} onClick={() => onSelect(a.id)} style={{
              flex: 1, background: isSel ? `${a.color}16` : "var(--paper)",
              ...solidBorder(isSel ? a.color : `${a.color}38`, 1.5),
              borderRadius: 8, padding: "9px 8px",
              cursor: "pointer", textAlign: "center", transition: "all 0.12s ease",
            }}>
              <div style={{
                width: 9, height: 9, borderRadius: "50%", backgroundColor: a.color,
                boxShadow: `0 0 8px ${a.color}`, margin: "0 auto 5px",
              }} />
              <div style={{
                fontFamily: "var(--font-cormorant)", fontSize: "1.25rem",
                fontWeight: 500, color: "var(--charcoal)", lineHeight: 1, marginBottom: 3,
              }}>
                {a.name}
              </div>
              <div style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.52rem",
                letterSpacing: "0.05em", color: "var(--mid)",
              }}>
                {a.type === "human" ? "Founder" : "Chief of Staff"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Orbital node ─────────────────────────────────────────────────────────────

function OrbitalNode({ agent, selected, active, lastSeen, onSelect }: {
  agent: Agent; selected: boolean; active: boolean;
  lastSeen: string | null; onSelect: () => void;
}) {
  const pos = NP[agent.id];
  if (!pos) return null;

  const tierLabel = agent.tier === "orchestrator" ? "ORCHESTRATOR" : "SPECIALIST";
  const modelShort = agent.model.includes("MiniMax") ? "MiniMax"
    : agent.model.includes("gpt-5") ? "GPT-5.3"
    : agent.model.includes("claude") ? "Claude"
    : agent.model.includes("Human") ? "Human"
    : (agent.model.split("/").pop()?.split(" ")[0] ?? "").slice(0, 7);
  const borderC = selected ? agent.color : `${agent.color}65`;
  const laneC = laneOf(agent) === "lane1" ? "#76875A" : "#5B6FA8";

  return (
    <button onClick={onSelect} style={{
      position: "absolute",
      left: pos.x - NW / 2, top: pos.y - NH / 2,
      width: NW, height: NH,
      background: selected ? `${agent.color}10` : "var(--paper)",
      borderTopWidth: 1.5, borderTopStyle: "solid", borderTopColor: borderC,
      borderRightWidth: 1.5, borderRightStyle: "solid", borderRightColor: borderC,
      borderLeftWidth: 1.5, borderLeftStyle: "solid", borderLeftColor: borderC,
      borderBottomWidth: 3, borderBottomStyle: "solid", borderBottomColor: agent.color,
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer", textAlign: "left", zIndex: 2,
      overflow: "hidden",
      boxShadow: active
        ? `0 0 20px ${agent.color}25, 0 2px 10px rgba(42,41,39,0.09)`
        : selected
          ? `0 2px 14px ${agent.color}20, 0 2px 8px rgba(42,41,39,0.07)`
          : "0 2px 8px rgba(42,41,39,0.07)",
      transition: "box-shadow 0.15s, background 0.12s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", backgroundColor: agent.color, flexShrink: 0,
          boxShadow: active ? `0 0 8px ${agent.color}` : `0 0 5px ${agent.color}80`,
        }} />
        <span style={{
          fontFamily: "var(--font-dm-mono)", fontSize: "0.52rem",
          letterSpacing: "0.1em", color: agent.color, fontWeight: 500,
        }}>
          {tierLabel}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <StatusDot status={agent.status} size="sm" />
        </div>
      </div>

      {/* Name */}
      <div style={{
        fontFamily: "var(--font-cormorant)", fontSize: "1.5rem",
        fontWeight: 600, color: "var(--charcoal)", lineHeight: 1, marginBottom: 2,
      }}>
        {agent.name}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "var(--font-dm-mono)", fontSize: "0.56rem",
        color: "var(--mid)", marginBottom: 6,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {agent.title}
      </div>

      {/* Badges */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
        <span style={{
          fontSize: "0.53rem", fontFamily: "var(--font-dm-mono)",
          padding: "2px 6px", borderRadius: 4,
          backgroundColor: "var(--warm)", color: "var(--mid)",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {modelShort}
        </span>
        {agent.cronCount > 0 && (
          <span style={{
            fontSize: "0.53rem", fontFamily: "var(--font-dm-mono)",
            padding: "2px 6px", borderRadius: 4,
            backgroundColor: `${agent.color}18`, color: agent.color,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {agent.cronCount}c
          </span>
        )}
        <span style={{
          fontSize: "0.5rem", fontFamily: "var(--font-dm-mono)",
          padding: "1px 5px", borderRadius: 3,
          backgroundColor: `${laneC}12`, color: laneC,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {laneOf(agent) === "lane1" ? "L1" : "L2"}
        </span>
        {lastSeen && (
          <span style={{
            fontSize: "0.5rem", fontFamily: "var(--font-dm-mono)",
            color: active ? agent.color : "var(--mid)",
            marginLeft: "auto", opacity: active ? 1 : 0.7,
            whiteSpace: "nowrap",
          }}>
            {relTime(lastSeen)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Constellation canvas ─────────────────────────────────────────────────────

function ConstellationCanvas({ agents, selectedId, onSelect, pulses }: {
  agents: Agent[]; selectedId: string | null;
  onSelect: (id: string | null) => void; pulses: PulseEvent[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

  const mads  = agents.find((a) => a.id === "mads");
  const mimir = agents.find((a) => a.id === "mimir");
  const orbital = agents.filter((a) => NP[a.id]);
  const pulsesThisHour = pulses.filter((p) => Date.now() - new Date(p.timestamp).getTime() < 3600000).length;

  return (
    <Card style={{
      padding: 0, overflow: "hidden", marginBottom: "1.5rem",
      background: "var(--paper)",
    }}>
      <style>{`
        @keyframes boardPulse {
          0%,100% { opacity:.22; transform:scale(1); }
          50%      { opacity:.50; transform:scale(1.015); }
        }
        @keyframes boardRing {
          0%,100% { opacity:.15; }
          50%      { opacity:.30; }
        }
        @keyframes haloAnim {
          0%,100% { opacity:.12; }
          50%      { opacity:.38; }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -26; }
        }
        @keyframes activeHalo {
          0%,100% { opacity:.2; }
          50%      { opacity:.6; }
        }
        .const-wrap { display: block; }
        @media (max-width: 700px) { .const-wrap { display:none; } }
      `}</style>

      <div
        className="const-wrap"
        onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onSelect(null); }}
        style={{ position: "relative", width: "100%", maxWidth: W, height: H, margin: "0 auto" }}
      >
        <ConstellationSVG mounted={mounted} pulses={pulses} agents={orbital} />
        <BoardNucleus mads={mads} mimir={mimir} selectedId={selectedId} onSelect={onSelect} />
        {orbital.map((a) => (
          <OrbitalNode
            key={a.id} agent={a}
            selected={selectedId === a.id}
            active={isActive(a.id, pulses)}
            lastSeen={lastPulse(a.id, pulses)?.timestamp ?? null}
            onSelect={() => onSelect(selectedId === a.id ? null : a.id)}
          />
        ))}

        {/* Legend */}
        <div style={{ position: "absolute", bottom: 16, right: 20, opacity: 0.55, display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { color: "#BC6143", label: "reports to board", dashed: false },
            { color: "#76875A", label: "delegation", dashed: true },
            { color: "#5B6FA8", label: "→ Mimir escalation", dashed: true },
          ].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={l.color} strokeWidth="1.5" strokeDasharray={l.dashed ? "4 3" : undefined} /></svg>
              <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", color: "var(--mid)" }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Live counter */}
        <div style={{ position: "absolute", bottom: 16, left: 18, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--olive)", animation: "activeHalo 2s infinite" }} />
          <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.55rem", color: "var(--mid)" }}>
            {pulsesThisHour} pulse{pulsesThisHour !== 1 ? "s" : ""} / hr
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─── Model routing strip ──────────────────────────────────────────────────────

function ModelRoutingStrip({ agents }: { agents: Agent[] }) {
  const lane1 = agents.filter((a) => laneOf(a) === "lane1");
  const lane2 = agents.filter((a) => laneOf(a) === "lane2" && a.type !== "human");

  const rules = [
    { task: "Quality gate review",               via: "Mimir",     model: "Opus 4.6",       color: "#5B6FA8" },
    { task: "Content authorship",                via: "Mimir",     model: "Opus 4.6",       color: "#5B6FA8" },
    { task: "Architecture decision",             via: "Mimir",     model: "Sonnet 4.6",     color: "#7A8FC8" },
    { task: "App Factory build phase",           via: "Mimir",     model: "Sonnet 4.6",     color: "#7A8FC8" },
    { task: "Orchestration & strategy",          via: "Baldur",    model: "GPT-5.3 Codex",  color: "#BC6143" },
    { task: "Research · builds · security · distribution · governance", via: "Specialists", model: "MiniMax-M2.5", color: "#76875A" },
  ];

  return (
    <Card className="fade-up" style={{ marginBottom: "1.5rem", animationDelay: "0.12s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.1rem" }}>
        <h2 className="label-caps" style={{ color: "var(--mid)", fontSize: "0.75rem", margin: 0 }}>
          Model Routing
        </h2>
        <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem", color: "var(--mid)", opacity: 0.6 }}>
          Lane 1 (cheap muscles) for routine · Lane 2 (expensive brain) for complexity
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "1.1rem" }}>
        {/* Lane 1 */}
        <div style={{
          padding: "0.85rem 1rem", borderRadius: 8,
          background: "#76875A0a",
          borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "#76875A80",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#76875A25",
          borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "#76875A25",
          borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#76875A25",
        }}>
          <div className="label-caps" style={{ color: "#76875A", fontSize: "0.65rem", marginBottom: "0.5rem" }}>
            Lane 1 — Cheap Muscles
          </div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {lane1.map((a) => (
              <span key={a.id} style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem",
                padding: "2px 7px", borderRadius: 4,
                backgroundColor: `${a.color}18`, color: a.color,
              }}>
                {a.name}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem", color: "var(--mid)", lineHeight: 1.65, margin: 0 }}>
            MiniMax-M2.5 · ~$10/agent/mo · Research, builds, security, content review, governance
          </p>
        </div>

        {/* Lane 2 */}
        <div style={{
          padding: "0.85rem 1rem", borderRadius: 8,
          background: "#5B6FA80a",
          borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "#5B6FA880",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#5B6FA825",
          borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "#5B6FA825",
          borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#5B6FA825",
        }}>
          <div className="label-caps" style={{ color: "#5B6FA8", fontSize: "0.65rem", marginBottom: "0.5rem" }}>
            Lane 2 — Expensive Brain
          </div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {lane2.map((a) => (
              <span key={a.id} style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem",
                padding: "2px 7px", borderRadius: 4,
                backgroundColor: `${a.color}18`, color: a.color,
              }}>
                {a.name}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem", color: "var(--mid)", lineHeight: 1.65, margin: 0 }}>
            Claude Max (free) + Codex OAuth · Orchestration, QG, architecture, content authorship
          </p>
        </div>
      </div>

      {/* Escalation table */}
      <div style={{ borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--warm)", paddingTop: "0.85rem" }}>
        <div className="label-caps" style={{ color: "var(--mid)", fontSize: "0.65rem", marginBottom: "0.55rem" }}>
          Escalation Rules
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.25rem 1rem", alignItems: "center" }}>
          {rules.map((r) => (
            <Fragment key={r.task}>
              <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.63rem", color: "var(--charcoal)" }}>
                {r.task}
              </span>
              <span style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem",
                padding: "2px 8px", borderRadius: 3,
                backgroundColor: `${r.color}14`, color: r.color,
                whiteSpace: "nowrap",
              }}>
                {r.via}
              </span>
              <span style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.58rem",
                color: "var(--mid)", whiteSpace: "nowrap",
              }}>
                {r.model}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ─── Agent detail panel ───────────────────────────────────────────────────────

function GoalChip({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderRadius: 6, overflow: "hidden",
      ...solidBorder("var(--warm)", 1),
    }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        width: "100%", background: "none", border: "none",
        padding: "8px 12px", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      }}>
        <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.65rem", color: "var(--charcoal)" }}>
          {goal.description}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{
          flexShrink: 0, opacity: 0.4,
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s",
        }}>
          <path d="M1 3l4 4 4-4" stroke="var(--charcoal)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--warm)" }}>
          <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", color: "var(--olive)", fontWeight: 600 }}>Exit: </span>
          <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", color: "var(--mid)", lineHeight: 1.55 }}>
            {goal.exitCriteria}
          </span>
        </div>
      )}
    </div>
  );
}

function AgentDetailPanel({ agent }: { agent: Agent }) {
  const lane = laneOf(agent);
  const laneColor = lane === "lane1" ? "#76875A" : "#5B6FA8";
  const laneLabel = lane === "lane1" ? "Lane 1 · MiniMax" : "Lane 2 · Expensive Brain";

  return (
    <Card style={{
      marginBottom: "1.5rem",
      ...accentBorder(agent.color, "var(--warm)"),
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Left */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", backgroundColor: agent.color,
              boxShadow: `0 0 10px ${agent.color}70`, flexShrink: 0,
            }} />
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "2rem", fontWeight: 400, color: "var(--charcoal)", margin: 0 }}>
              {agent.name}
            </h2>
            <span style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.62rem", color: "var(--mid)" }}>
              {agent.title}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-dm-mono)", padding: "2px 7px", borderRadius: 3, backgroundColor: `${laneColor}14`, color: laneColor }}>
              {laneLabel}
            </span>
            <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-dm-mono)", padding: "2px 7px", borderRadius: 3, backgroundColor: "var(--warm)", color: "var(--mid)" }}>
              {agent.model.split("/").pop()?.split(" ")[0]}
            </span>
            {agent.costCapMonthly === 0 && agent.type !== "human" && (
              <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-dm-mono)", padding: "2px 7px", borderRadius: 3, backgroundColor: "var(--warm)", color: "var(--olive)" }}>
                $0 cost
              </span>
            )}
            {agent.escalatesTo && (
              <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-dm-mono)", padding: "2px 7px", borderRadius: 3, backgroundColor: "var(--warm)", color: "var(--mid)" }}>
                escalates → {agent.escalatesTo === "mimir" ? "Mimir" : agent.escalatesTo === "mads" ? "Mads" : agent.escalatesTo}
              </span>
            )}
          </div>

          <div style={{
            padding: "0.85rem", background: "var(--warm)", borderRadius: 8,
            borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: `${agent.color}70`,
            borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
          }}>
            <div style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", color: agent.color, marginBottom: "0.35rem" }}>
              CALL ME WHEN...
            </div>
            <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.68rem", color: "var(--charcoal)", lineHeight: 1.65, margin: 0 }}>
              {agent.capabilities}
            </p>
          </div>

          {agent.invoke && (
            <div style={{
              marginTop: "0.6rem", padding: "5px 10px", background: "#2A292708", borderRadius: 5,
              ...solidBorder("var(--warm)", 1),
            }}>
              <code style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", color: "var(--mid)" }}>
                {agent.invoke}
              </code>
            </div>
          )}
        </div>

        {/* Right */}
        <div>
          <div className="label-caps" style={{ color: "var(--mid)", fontSize: "0.68rem", marginBottom: "0.65rem" }}>
            Goals & Exit Criteria
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {agent.goals.map((g) => <GoalChip key={g.id} goal={g} />)}
            {agent.goals.length === 0 && (
              <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.68rem", color: "var(--mid)", fontStyle: "italic" }}>
                No goals in ORG.json
              </p>
            )}
          </div>
          {agent.cronCount > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div className="label-caps" style={{ color: "var(--mid)", fontSize: "0.62rem", marginBottom: "0.4rem" }}>
                Scheduled jobs ({agent.cronCount})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                {agent.crons.map((c) => (
                  <span key={c} style={{
                    fontFamily: "var(--font-dm-mono)", fontSize: "0.58rem",
                    padding: "2px 7px", borderRadius: 3,
                    backgroundColor: `${agent.color}14`, color: agent.color,
                  }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Agent directory ──────────────────────────────────────────────────────────

function AgentDirectory({ agents, selectedId, onSelect, pulses }: {
  agents: Agent[]; selectedId: string | null;
  onSelect: (id: string | null) => void; pulses: PulseEvent[];
}) {
  return (
    <Card className="fade-up" style={{ marginBottom: "1.5rem", animationDelay: "0.22s" }}>
      <h2 className="label-caps" style={{ marginBottom: "1rem", color: "var(--mid)", fontSize: "0.75rem" }}>
        Agent Directory
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.7rem" }}>
        {agents.filter((a) => a.type !== "human").map((a) => {
          const isSel = selectedId === a.id;
          const active = isActive(a.id, pulses);
          const laneC = laneOf(a) === "lane1" ? "#76875A" : "#5B6FA8";
          return (
            <button
              key={a.id}
              onClick={() => onSelect(isSel ? null : a.id)}
              style={{
                textAlign: "left", padding: "0.9rem", borderRadius: 8,
                borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: a.color,
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: isSel ? `${a.color}60` : "var(--warm)",
                borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: isSel ? `${a.color}60` : "var(--warm)",
                borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: isSel ? `${a.color}60` : "var(--warm)",
                background: isSel ? `${a.color}0c` : "transparent",
                cursor: "pointer", transition: "all 0.12s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
                <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.5rem", fontWeight: 500, color: "var(--charcoal)", margin: 0 }}>
                  {a.name}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {active && <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: a.color, animation: "activeHalo 2s infinite" }} />}
                  <StatusDot status={a.status} size="sm" />
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.6rem", color: "var(--mid)", marginBottom: "0.45rem" }}>
                {a.title}
              </div>
              <p style={{
                fontFamily: "var(--font-dm-mono)", fontSize: "0.63rem", color: "var(--charcoal)",
                lineHeight: 1.55, margin: "0 0 0.55rem",
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {a.capabilities.split(".")[0]}.
              </p>
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.57rem", fontFamily: "var(--font-dm-mono)", padding: "2px 6px", borderRadius: 3, backgroundColor: `${laneC}12`, color: laneC }}>
                  {laneOf(a) === "lane1" ? "MiniMax" : "Claude/Codex"}
                </span>
                <span style={{ fontSize: "0.57rem", fontFamily: "var(--font-dm-mono)", padding: "2px 6px", borderRadius: 3, backgroundColor: "var(--warm)", color: "var(--mid)" }}>
                  {a.goals.length} goals
                </span>
                {a.cronCount > 0 && (
                  <span style={{ fontSize: "0.57rem", fontFamily: "var(--font-dm-mono)", padding: "2px 6px", borderRadius: 3, backgroundColor: `${a.color}12`, color: a.color }}>
                    {a.cronCount} crons
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Value streams + cadences ─────────────────────────────────────────────────

function VSRow({ stream, agents }: { stream: ValueStream; agents: Agent[] }) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div className="label-caps" style={{ marginBottom: "0.4rem", color: "var(--mid)", fontSize: "0.68rem" }}>
        {stream.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
        {stream.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 4, fontSize: "0.65rem", fontFamily: "var(--font-dm-mono)", backgroundColor: "var(--warm)", color: "var(--charcoal)" }}>
              {step}
            </span>
            {i < stream.steps.length - 1 && (
              <svg width="20" height="12" viewBox="0 0 20 12">
                <path d="M1 6h14M11 2l4.5 4-4.5 4" stroke="var(--terracotta)" strokeWidth="1.5" strokeOpacity="0.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
        <div style={{ marginLeft: "0.5rem", display: "flex", gap: "0.25rem" }}>
          {stream.agents.map((aId) => {
            const a = agents.find((x) => x.id === aId);
            if (!a) return null;
            return <span key={aId} title={a.name} style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: a.color, display: "inline-block", boxShadow: `0 0 3px ${a.color}60` }} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrgPage() {
  const [data, setData] = useState<OrgData | null>(null);
  const [pulses, setPulses] = useState<PulseEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [or, pr] = await Promise.all([fetch("/api/org"), fetch("/api/pulses")]);
      if (or.ok) setData(await or.json());
      if (pr.ok) { const pd = await pr.json(); setPulses(pd.pulses ?? []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 45_000); return () => clearInterval(iv); }, [load]);

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center">
      <p style={{ color: "var(--mid)", fontFamily: "var(--font-dm-mono)", fontSize: "0.85rem" }}>Loading organisation...</p>
    </div>
  );

  const selectedAgent = selectedId ? data.agents.find((a) => a.id === selectedId) ?? null : null;
  const pulsesHr = pulses.filter((p) => Date.now() - new Date(p.timestamp).getTime() < 3600000).length;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-8 pb-3 max-w-[1440px] mx-auto">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontSize: "2.25rem", fontWeight: 300, color: "var(--charcoal)" }}>
            Organisation
          </h1>
          <span className="label-caps" style={{ color: "var(--mid)", fontSize: "0.72rem" }}>
            {data.agents.length} agents
          </span>
          <span className="label-caps" style={{ color: "var(--olive)", fontSize: "0.72rem" }}>
            {data.healthyCrons}/{data.cadences.total} crons healthy
          </span>
          {pulsesHr > 0 && (
            <span className="label-caps" style={{ color: "var(--terracotta)", fontSize: "0.72rem" }}>
              {pulsesHr} pulses/hr
            </span>
          )}
        </div>
        <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.76rem", color: "var(--mid)", marginTop: "0.2rem" }}>
          Living constellation · goal-based steering · click any node to inspect
        </p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {/* Mission */}
        <Card className="fade-up" style={{
          marginBottom: "1.5rem", padding: "1.25rem 1.75rem",
          ...accentBorder("var(--terracotta)", "var(--warm)"),
        }}>
          <div className="label-caps" style={{ color: "var(--terracotta)", fontSize: "0.68rem", marginBottom: "0.5rem" }}>Mission</div>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "1.5rem", fontWeight: 400, color: "var(--charcoal)", lineHeight: 1.45, margin: "0 0 0.5rem", maxWidth: 740 }}>
            {data.mission.statement}
          </p>
          {data.mission.tagline && (
            <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.7rem", color: "var(--mid)", lineHeight: 1.65, maxWidth: 660, margin: "0 0 0.85rem" }}>
              {data.mission.tagline}
            </p>
          )}
          {data.mission.values.length > 0 && (
            <div style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap" }}>
              {data.mission.values.map((v, i) => (
                <span key={v} style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.68rem", color: "var(--mid)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ color: "var(--terracotta)", fontWeight: 600 }}>{["+", ">", "*", "~"][i] ?? "·"}</span>
                  {v}
                </span>
              ))}
            </div>
          )}
        </Card>

        <ConstellationCanvas agents={data.agents} selectedId={selectedId} onSelect={setSelectedId} pulses={pulses} />
        {selectedAgent && <AgentDetailPanel agent={selectedAgent} />}
        <ModelRoutingStrip agents={data.agents} />
        <AgentDirectory agents={data.agents} selectedId={selectedId} onSelect={setSelectedId} pulses={pulses} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
          <Card className="fade-up" style={{ animationDelay: "0.28s" }}>
            <h2 className="label-caps" style={{ marginBottom: "0.9rem", color: "var(--mid)", fontSize: "0.75rem" }}>Value Streams</h2>
            {data.valueStreams.map((vs) => <VSRow key={vs.name} stream={vs} agents={data.agents} />)}
          </Card>
          <Card className="fade-up" style={{ animationDelay: "0.32s" }}>
            <h2 className="label-caps" style={{ marginBottom: "0.9rem", color: "var(--mid)", fontSize: "0.75rem" }}>Operational Cadences</h2>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1.1rem" }}>
              {[
                { label: "Daily",    count: data.cadences.daily,    color: "var(--terracotta)" },
                { label: "Weekly",   count: data.cadences.weekly,   color: "var(--olive)" },
                { label: "Periodic", count: data.cadences.periodic, color: "var(--lilac)" },
              ].map((c) => (
                <div key={c.label} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-cormorant)", fontSize: "2.1rem", fontWeight: 300, color: c.color }}>{c.count}</div>
                  <div className="label-caps" style={{ color: "var(--mid)", fontSize: "0.65rem" }}>{c.label}</div>
                </div>
              ))}
            </div>
            {data.agents.filter((a) => a.type !== "human" && a.cronCount > 0).map((a) => (
              <div key={a.id} style={{ marginBottom: "0.65rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: a.color, display: "inline-block" }} />
                  <span className="label-caps" style={{ color: "var(--charcoal)", fontSize: "0.65rem" }}>{a.name}</span>
                  <span className="label-caps" style={{ color: "var(--mid)", fontSize: "0.6rem" }}>({a.cronCount})</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", paddingLeft: "1.1rem" }}>
                  {a.crons.map((cn) => {
                    const job = data.crons.find((c) => c.name === cn);
                    return (
                      <span key={cn} style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "2px 7px", borderRadius: 3, fontSize: "0.6rem", fontFamily: "var(--font-dm-mono)", backgroundColor: "var(--warm)", color: "var(--charcoal)" }}>
                        <StatusDot status={job?.lastStatus ?? "idle"} size="sm" />
                        {cn}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </main>

      <footer className="px-8 pb-6 max-w-[1440px] mx-auto">
        <p style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.65rem", color: "var(--mid)" }}>
          Verto Studios · VertoOS Organisation · Steered by ORG.json · Pulses live · Refresh 45s
        </p>
      </footer>
    </div>
  );
}
