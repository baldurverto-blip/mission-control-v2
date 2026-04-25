import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { ORG_JSON, MISSION_MD } from "@/app/lib/paths";
import { execSync } from "child_process";

interface Goal {
  id: string;
  description: string;
  exitCriteria: string;
}

interface OrgAgent {
  id: string;
  name: string;
  title: string;
  tier: "board" | "orchestrator" | "specialist";
  type: "human" | "ai-openclaw" | "ai-claude" | "ai-gemini-cli" | "ai-cowork";
  role: string;
  capabilities: string;
  goals: Goal[];
  model: string;
  adapter: string;
  invoke: string | null;
  reportsTo: string | null;
  escalatesTo: string | null;
  color: string;
  cronCount: number;
  crons: string[];
  status: string;
  costCapMonthly: number;
}

interface CronJob {
  name: string;
  agentId: string;
  schedule: string;
  lastStatus: string;
}

interface ValueStream {
  name: string;
  steps: string[];
  agents: string[];
}

interface Mission {
  statement: string;
  tagline: string;
  values: string[];
}

function extractMission(markdown: string): Mission {
  // Extract Mission Statement section
  const missionMatch = markdown.match(/## Mission Statement\s*\n\n([\s\S]*?)(?=\n## )/);
  const paragraphs = (missionMatch?.[1] ?? "")
    .trim()
    .split(/\n\n/)
    .map((p) => p.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim())
    .filter(Boolean);

  // Extract How We Work values
  const howWeWorkMatch = markdown.match(/## How We Work\s*\n\n([\s\S]*?)(?=\n## |$)/);
  const values: string[] = [];
  if (howWeWorkMatch) {
    const valueMatches = howWeWorkMatch[1].matchAll(/\*\*(.*?)\*\*/g);
    for (const m of valueMatches) {
      values.push(m[1]);
    }
  }

  return {
    statement: paragraphs[0] ?? "Verto Studios is a product studio that builds for what's next.",
    tagline: paragraphs[1] ?? "",
    values: values.slice(0, 4),
  };
}

export async function GET() {
  try {
    // Read ORG.json — the source of truth for agent topology
    let orgData: { agents: OrgAgent[]; } = { agents: [] };
    try {
      const orgRaw = await readFile(ORG_JSON, "utf-8");
      orgData = JSON.parse(orgRaw);
    } catch {
      // fallback: continue with empty agents
    }

    // Read mission.md — source of truth for mission statement
    let mission: Mission = {
      statement: "Verto Studios is a product studio that builds for what's next.",
      tagline: "We help people and businesses navigate the shift that's already underway.",
      values: ["Ship real things", "Compound the learning", "Grounded and honest", "Human-first"],
    };
    try {
      const missionRaw = await readFile(MISSION_MD, "utf-8");
      mission = extractMission(missionRaw);
    } catch { /* use defaults */ }

    // Get cron jobs from openclaw
    let crons: CronJob[] = [];
    try {
      const raw = execSync("openclaw cron list --json 2>/dev/null", {
        encoding: "utf-8",
        timeout: 10000,
      });
      const parsed = JSON.parse(raw);
      const jobs = Array.isArray(parsed) ? parsed : parsed.jobs ?? [];
      crons = jobs.map((j: Record<string, unknown>) => ({
        name: String(j.name ?? ""),
        agentId: String(j.agentId ?? "main"),
        schedule: String(
          (j.schedule as Record<string, unknown>)?.expr ?? j.every ?? ""
        ),
        lastStatus: String(
          (j.state as Record<string, unknown>)?.lastStatus ?? "idle"
        ),
      }));
    } catch { /* openclaw unavailable */ }

    // Merge cron counts into agents
    const agents: OrgAgent[] = (orgData.agents ?? []).map((a) => {
      const agentCrons = crons.filter((c) => c.agentId === a.id);
      return {
        ...a,
        cronCount: agentCrons.length,
        crons: agentCrons.map((c) => c.name),
        goals: a.goals ?? [],
      };
    });

    // Value streams (defined here, sourced from ORG.json in future)
    const valueStreams: ValueStream[] = [
      {
        name: "Research → Idea Queue",
        steps: ["Scout mines signals", "Score ≥60", "Refiner enriches", "Qualifier approves", "Queue promoted"],
        agents: ["scout", "main"],
      },
      {
        name: "Idea → Shipped App",
        steps: ["Factory tick", "One-pager", "Prism pressure-test", "Build (Builder+Mimir)", "QG Opus", "Bastion scan", "Ship"],
        agents: ["main", "prism", "builder", "bastion", "mimir"],
      },
      {
        name: "Ship → Distribution",
        steps: ["ASO keywords", "Landing page", "Blog posts (Mimir)", "Social posting", "Reddit engage"],
        agents: ["vibe", "mimir", "scout"],
      },
      {
        name: "Security Posture",
        steps: ["Bastion scan", "Risk register", "Fix (Builder)", "Verify", "Score update"],
        agents: ["bastion", "builder"],
      },
      {
        name: "Product Strategy Loop",
        steps: ["Scout evidence", "Prism synthesis", "Baldur recommendation", "Mads decision", "Builder execution"],
        agents: ["scout", "prism", "main", "builder"],
      },
      {
        name: "Governance Loop",
        steps: ["Frigg audit", "Value stream map", "Improvement register", "Proposals", "Implement"],
        agents: ["frigg", "main"],
      },
      {
        name: "Revenue Lane",
        steps: ["Scout prospect research", "Saga pipeline", "Mimir proposal draft", "Saga personalise", "Mads sends", "Deal conversion"],
        agents: ["scout", "saga", "mimir"],
      },
    ];

    // Cadence breakdown
    const cadences = {
      daily: crons.filter(
        (c) => c.schedule.includes("* * *") && !["* * 5", "* * 0", "* * 1", "*/5", "*/10", "*/30"].some((p) => c.schedule.includes(p))
      ).length,
      weekly: crons.filter(
        (c) => ["* * 5", "* * 0", "* * 1", "* * 2", "* * 3", "* * 4"].some((p) => c.schedule.includes(p))
      ).length,
      periodic: crons.filter(
        (c) => ["*/5", "*/10", "*/30"].some((p) => c.schedule.includes(p))
      ).length,
      total: crons.length,
    };

    const healthyCrons = crons.filter((c) => c.lastStatus === "ok" || c.lastStatus === "idle").length;

    return NextResponse.json({ mission, agents, crons, valueStreams, cadences, healthyCrons });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to build org data", detail: String(err) },
      { status: 500 }
    );
  }
}
