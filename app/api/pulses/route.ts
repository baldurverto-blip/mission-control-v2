import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

export interface PulseEvent {
  type: "pulse";
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  session_id: string;
  timestamp: string;
}

interface AgentSummary {
  agent: string;
  pulseCount: number;
  lastPulse: string;
  goals: Record<string, number>;
  hasError: boolean;
}

interface GoalSummary {
  goal: string;
  pulseCount: number;
  agents: Record<string, number>;
  lastPulse: string;
}

async function readPulsesForDate(date: string): Promise<PulseEvent[]> {
  const filePath = join(PULSES_DIR, `${date}.jsonl`);
  try {
    const content = await readFile(filePath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as PulseEvent);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const mode = url.searchParams.get("mode") ?? "stream"; // stream | summary

    // Read today + yesterday for recency
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const [todayPulses, yesterdayPulses] = await Promise.all([
      readPulsesForDate(today),
      readPulsesForDate(yesterday),
    ]);

    const allPulses = [...yesterdayPulses, ...todayPulses].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (mode === "summary") {
      // Aggregate by agent and goal (today only)
      const agentMap: Record<string, AgentSummary> = {};
      const goalMap: Record<string, GoalSummary> = {};

      for (const pulse of todayPulses) {
        // Agent summary
        if (!agentMap[pulse.agent]) {
          agentMap[pulse.agent] = {
            agent: pulse.agent,
            pulseCount: 0,
            lastPulse: pulse.timestamp,
            goals: {},
            hasError: false,
          };
        }
        const agentEntry = agentMap[pulse.agent];
        agentEntry.pulseCount++;
        if (pulse.timestamp > agentEntry.lastPulse) agentEntry.lastPulse = pulse.timestamp;
        agentEntry.goals[pulse.goal] = (agentEntry.goals[pulse.goal] ?? 0) + 1;
        if (
          pulse.outcome.toLowerCase().includes("error") ||
          pulse.outcome.toLowerCase().includes("failed") ||
          pulse.outcome.toLowerCase().includes("degraded")
        ) {
          agentEntry.hasError = true;
        }

        // Goal summary
        if (!goalMap[pulse.goal]) {
          goalMap[pulse.goal] = {
            goal: pulse.goal,
            pulseCount: 0,
            agents: {},
            lastPulse: pulse.timestamp,
          };
        }
        const goalEntry = goalMap[pulse.goal];
        goalEntry.pulseCount++;
        if (pulse.timestamp > goalEntry.lastPulse) goalEntry.lastPulse = pulse.timestamp;
        goalEntry.agents[pulse.agent] = (goalEntry.agents[pulse.agent] ?? 0) + 1;
      }

      // Sort goals by pulse count descending
      const goals = Object.values(goalMap).sort((a, b) => b.pulseCount - a.pulseCount);
      const agents = Object.values(agentMap).sort((a, b) => b.pulseCount - a.pulseCount);

      // Determine active agents (pulsed in last 2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const activeAgents = agents.filter((a) => a.lastPulse >= twoHoursAgo);

      return NextResponse.json({
        agents,
        goals,
        totalPulsesToday: todayPulses.length,
        activeAgentCount: activeAgents.length,
        lastPulse: allPulses[0]?.timestamp ?? null,
      });
    }

    // Stream mode: return latest N pulses
    const pulses = allPulses.slice(0, limit);

    // Quick stats for the header
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const recentAgents = new Set(
      todayPulses.filter((p) => p.timestamp >= twoHoursAgo).map((p) => p.agent)
    );
    const hasAttention = todayPulses.some(
      (p) =>
        p.outcome.toLowerCase().includes("error") ||
        p.outcome.toLowerCase().includes("failed") ||
        p.outcome.toLowerCase().includes("degraded") ||
        p.outcome.toLowerCase().includes("removed") ||
        p.outcome.toLowerCase().includes("alert")
    );

    return NextResponse.json({
      pulses,
      stats: {
        totalToday: todayPulses.length,
        activeAgents: Array.from(recentAgents),
        hasAttention,
        lastPulse: allPulses[0]?.timestamp ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read pulses", detail: String(err) },
      { status: 500 }
    );
  }
}
