import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
}

interface GoalData {
  id: string;
  name: string;
  pulseCount: number;
  agents: { id: string; count: number }[];
  lastPulse: string | null;
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

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const pulses = await readPulsesForDate(today);

    const goalMap: Record<string, { count: number; agents: Record<string, number>; lastPulse: string }> = {};

    for (const p of pulses) {
      if (!goalMap[p.goal]) {
        goalMap[p.goal] = { count: 0, agents: {}, lastPulse: p.timestamp };
      }
      const entry = goalMap[p.goal];
      entry.count++;
      entry.agents[p.agent] = (entry.agents[p.agent] ?? 0) + 1;
      if (p.timestamp > entry.lastPulse) entry.lastPulse = p.timestamp;
    }

    const goals: GoalData[] = Object.entries(goalMap)
      .map(([id, data]) => ({
        id,
        name: id.replace(/-/g, " "),
        pulseCount: data.count,
        agents: Object.entries(data.agents)
          .map(([agentId, count]) => ({ id: agentId, count }))
          .sort((a, b) => b.count - a.count),
        lastPulse: data.lastPulse,
      }))
      .sort((a, b) => b.pulseCount - a.pulseCount);

    return NextResponse.json({ goals });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read goals", detail: String(err) },
      { status: 500 }
    );
  }
}
