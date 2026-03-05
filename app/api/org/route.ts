import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { AGENTS_DIR, OPS } from "@/app/lib/paths";
import { execSync } from "child_process";

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  reportsTo: string;
  type: "human" | "orchestrator" | "specialist";
  color: string;
  crons: string[];
  status: string;
}

interface CronJob {
  name: string;
  agentId: string;
  schedule: string;
  lastStatus: string;
}

export async function GET() {
  try {
    // Parse agent soul files for roles
    const agentMeta: Record<string, { role: string; model: string }> = {};
    try {
      const files = await readdir(AGENTS_DIR);
      for (const f of files.filter((f) => f.endsWith(".md") && !f.includes("brief"))) {
        const content = await readFile(join(AGENTS_DIR, f), "utf-8");
        const roleMatch = content.match(/^>\s*Role:\s*(.+)/m);
        const modelMatch = content.match(/^>\s*Model:\s*(.+)/m);
        const id = f.replace(".md", "");
        agentMeta[id] = {
          role: roleMatch?.[1]?.trim() ?? "Unknown",
          model: modelMatch?.[1]?.trim() ?? "Unknown",
        };
      }
    } catch { /* no agent files */ }

    // Get cron jobs
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
    } catch { /* cron list failed */ }

    // Define agents with org structure
    const agents: Agent[] = [
      {
        id: "mads",
        name: "Mads",
        role: "Owner & Gatekeeper",
        model: "Human",
        reportsTo: "",
        type: "human",
        color: "var(--charcoal)",
        crons: [],
        status: "active",
      },
      {
        id: "main",
        name: "Baldur",
        role: agentMeta.main?.role ?? "Orchestrator — assigns, delegates, reports",
        model: agentMeta.main?.model ?? "GPT-5.3 Codex / MiniMax-M2.5",
        reportsTo: "mads",
        type: "orchestrator",
        color: "var(--terracotta)",
        crons: crons.filter((c) => c.agentId === "main").map((c) => c.name),
        status: "active",
      },
      {
        id: "scout",
        name: "Scout",
        role: agentMeta.scout?.role ?? "Discovery, research, signals",
        model: agentMeta.scout?.model ?? "MiniMax-M2.5",
        reportsTo: "main",
        type: "specialist",
        color: "var(--olive)",
        crons: crons.filter((c) => c.agentId === "scout").map((c) => c.name),
        status: "active",
      },
      {
        id: "builder",
        name: "Builder",
        role: agentMeta.builder?.role ?? "Implementation, feature dev",
        model: agentMeta.builder?.model ?? "MiniMax-M2.5",
        reportsTo: "main",
        type: "specialist",
        color: "var(--lilac)",
        crons: crons.filter((c) => c.agentId === "builder").map((c) => c.name),
        status: "active",
      },
      {
        id: "bastion",
        name: "Bastion",
        role: agentMeta.bastion?.role ?? "Security fortress — tactical + strategic CISO",
        model: agentMeta.bastion?.model ?? "MiniMax-M2.5",
        reportsTo: "main",
        type: "specialist",
        color: "var(--amber)",
        crons: crons.filter((c) => c.agentId === "bastion").map((c) => c.name),
        status: "active",
      },
      {
        id: "vibe",
        name: "Vibe",
        role: agentMeta.vibe?.role ?? "Distribution engine, voice guardian",
        model: agentMeta.vibe?.model ?? "MiniMax-M2.5",
        reportsTo: "main",
        type: "specialist",
        color: "#B07AA1",
        crons: crons.filter((c) => c.agentId === "vibe").map((c) => c.name),
        status: "active",
      },
      {
        id: "frigg",
        name: "Frigg",
        role: agentMeta.frigg?.role ?? "Governance — process alignment, continual improvement",
        model: agentMeta.frigg?.model ?? "MiniMax-M2.5",
        reportsTo: "main",
        type: "specialist",
        color: "#7BA7BC",
        crons: crons.filter((c) => c.agentId === "frigg").map((c) => c.name),
        status: "active",
      },
    ];

    // Value streams
    const valueStreams = [
      {
        name: "Research",
        steps: ["Scout (nightly)", "Signals", "Cross-validate", "Rank", "INBOX"],
        agents: ["scout", "main"],
      },
      {
        name: "Content",
        steps: ["Scout (scan)", "Drafter", "Humanise", "Approve", "Distribute", "Measure"],
        agents: ["scout", "main", "vibe"],
      },
      {
        name: "Security",
        steps: ["Bastion (scan)", "Findings", "Risk register", "Posture score", "Report"],
        agents: ["bastion"],
      },
      {
        name: "Governance",
        steps: ["Frigg (audit)", "Value check", "Improvement register", "Proposals", "Implement"],
        agents: ["frigg", "main"],
      },
      {
        name: "Build",
        steps: ["INBOX/PRD", "Assign", "Build", "Review", "Ship"],
        agents: ["main", "builder", "bastion"],
      },
    ];

    // Cadences summary
    const cadences = {
      daily: crons.filter((c) =>
        c.schedule.includes("* * *") && !c.schedule.includes("* * 5") && !c.schedule.includes("* * 0") && !c.schedule.includes("* * 1") && !c.schedule.includes("*/5")
      ).length,
      weekly: crons.filter((c) =>
        c.schedule.includes("* * 5") || c.schedule.includes("* * 0") || c.schedule.includes("* * 1")
      ).length,
      periodic: crons.filter((c) => c.schedule.includes("*/5")).length,
      total: crons.length,
    };

    return NextResponse.json({ agents, crons, valueStreams, cadences });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to build org data", detail: String(err) },
      { status: 500 },
    );
  }
}
