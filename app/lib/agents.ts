// ─── Agent Identity System ──────────────────────────────────────────
// Stable color tokens for each agent. Colors chosen for perceptual
// uniformity (LCH-balanced). Used across NerveCenter, Timeline, Bands.

export interface AgentToken {
  color: string;
  soft: string;
  gradient: string;
  label: string;
  name: string;
}

export const AGENTS: Record<string, AgentToken> = {
  baldur:  { color: "#BC6143", soft: "#bc614315", gradient: "from-[#BC6143] to-[#D4845E]", label: "B",  name: "Baldur" },
  scout:   { color: "#76875A", soft: "#76875a15", gradient: "from-[#76875A] to-[#9AAF72]", label: "Sc", name: "Scout" },
  builder: { color: "#9899C1", soft: "#9899c115", gradient: "from-[#9899C1] to-[#B4B5D6]", label: "Bu", name: "Builder" },
  bastion: { color: "#48453F", soft: "#48453f12", gradient: "from-[#48453F] to-[#6B675F]", label: "Ba", name: "Bastion" },
  vibe:    { color: "#C9A227", soft: "#C9A22715", gradient: "from-[#C9A227] to-[#DDB94A]", label: "V",  name: "Vibe" },
  frigg:   { color: "#7A8B8A", soft: "#7A8B8A15", gradient: "from-[#7A8B8A] to-[#9AABA9]", label: "F",  name: "Frigg" },
};

export const ALL_AGENT_IDS = ["baldur", "scout", "builder", "bastion", "vibe", "frigg"] as const;

export function agent(id: string): AgentToken {
  return AGENTS[id] ?? { color: "#48453F", soft: "#48453f12", gradient: "from-[#48453F] to-[#6B675F]", label: "?", name: id };
}

// ─── Shared Types ───────────────────────────────────────────────────

export interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
  session_id?: string;
}

export interface PulseStats {
  totalToday: number;
  activeAgents: string[];
  hasAttention: boolean;
  lastPulse: string | null;
}

export interface PulseData {
  pulses: PulseEvent[];
  stats: PulseStats;
}

// ─── Shared Helpers ─────────────────────────────────────────────────

export function isAttention(p: PulseEvent): boolean {
  const l = p.outcome.toLowerCase();
  return l.includes("error") || l.includes("failed") || l.includes("degraded") ||
    l.includes("removed") || l.includes("alert") || l.includes("awaiting");
}

export function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function clockTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("da-DK", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "";
  if (ms > 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function goalLabel(g: string): string {
  return g.replace(/-/g, " ");
}
