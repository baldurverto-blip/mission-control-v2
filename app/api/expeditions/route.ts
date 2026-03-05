import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { EXPEDITIONS_DIR, PULSES_DIR } from "@/app/lib/paths";

interface Guardrails {
  time_box: string;
  authority: string;
  model_budget: string;
}

interface Expedition {
  slug: string;
  name: string;
  team: string[];
  scope: string;
  guardrails: Guardrails;
  status: string;
  started: string | null;
  completedAt: string | null;
  pulseCount: number;
  lastPulse: string | null;
  timeRemaining: number | null; // ms, null if not active
  isOverdue: boolean;
  successCriteria: string[];
}

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentObj: Record<string, string> | null = null;
  let currentKey: string | null = null;
  let currentArr: string[] | null = null;
  let arrKey: string | null = null;

  for (const line of content.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;

    // Array item
    const arrMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (arrMatch && (arrKey || currentKey)) {
      if (currentKey && !arrKey) {
        // Transitioning from block key to array
        arrKey = currentKey;
        currentArr = [];
        currentObj = null;
        currentKey = null;
      }
      currentArr!.push(arrMatch[1]);
      continue;
    }

    // Nested key (indented)
    const nestedMatch = line.match(/^\s+(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
    if (nestedMatch && currentKey && currentObj) {
      currentObj[nestedMatch[1]] = nestedMatch[2];
      continue;
    }

    // Save pending nested object or array
    if (currentKey && currentObj) {
      result[currentKey] = currentObj;
      currentObj = null;
      currentKey = null;
    }
    if (arrKey && currentArr) {
      result[arrKey] = currentArr;
      currentArr = null;
      arrKey = null;
    }

    // Top-level array value inline: key: [val1, val2]
    const inlineArrMatch = line.match(/^(\w[\w_]*)\s*:\s*\[(.+)\]\s*$/);
    if (inlineArrMatch) {
      result[inlineArrMatch[1]] = inlineArrMatch[2].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    // Top-level key: value
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
    if (kvMatch) {
      const val = kvMatch[2];
      if (val === "null" || val === "~") {
        result[kvMatch[1]] = null;
      } else {
        result[kvMatch[1]] = val;
      }
      continue;
    }

    // Top-level key with nested block (no value)
    const blockMatch = line.match(/^(\w[\w_]*)\s*:\s*$/);
    if (blockMatch) {
      // Check next lines to determine if array or object
      currentKey = blockMatch[1];
      currentObj = {};
      continue;
    }

    // Array start for top-level key (already set currentKey)
    const arrStartMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (arrStartMatch && currentKey) {
      // Actually this is an array, not an object
      currentArr = [arrStartMatch[1]];
      arrKey = currentKey;
      currentObj = null;
      currentKey = null;
      continue;
    }
  }

  // Flush remaining
  if (currentKey && currentObj) result[currentKey] = currentObj;
  if (arrKey && currentArr) result[arrKey] = currentArr;

  return result;
}

function parseTimeBox(tb: string): number {
  const match = tb.match(/^(\d+)\s*(h|d|m)/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case "h": return val * 3600000;
    case "d": return val * 86400000;
    case "m": return val * 60000;
    default: return 0;
  }
}

async function readTodayPulses(): Promise<{ goal: string; timestamp: string }[]> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const content = await readFile(join(PULSES_DIR, `${today}.jsonl`), "utf-8");
    return content.trim().split("\n").filter(Boolean).map((l) => {
      const p = JSON.parse(l);
      return { goal: p.goal, timestamp: p.timestamp };
    });
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    let expDirs: string[] = [];
    try {
      const entries = await readdir(EXPEDITIONS_DIR, { withFileTypes: true });
      expDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      // No expeditions dir
    }

    const pulses = await readTodayPulses();
    const expeditions: Expedition[] = [];
    let activeCount = 0;
    let completedCount = 0;
    let overdueCount = 0;

    for (const slug of expDirs) {
      let content: string;
      try {
        content = await readFile(join(EXPEDITIONS_DIR, slug, "expedition.yml"), "utf-8");
      } catch {
        continue;
      }

      const parsed = parseSimpleYaml(content);
      const guardrails = (parsed.guardrails ?? {}) as Partial<Guardrails>;
      const status = String(parsed.status ?? "draft");
      const started = parsed.started ? String(parsed.started) : null;
      const completedAt = parsed.completed_at ? String(parsed.completed_at) : null;

      // Get expedition pulses (goal: "expedition:<slug>")
      const expPulses = pulses.filter((p) => p.goal === `expedition:${slug}`);
      const lastPulse = expPulses.length > 0
        ? expPulses.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)).timestamp
        : null;

      // Time remaining
      const timeBoxMs = parseTimeBox(guardrails.time_box ?? "0h");
      let timeRemaining: number | null = null;
      let isOverdue = false;
      if (status === "active" && started && timeBoxMs > 0) {
        const elapsed = Date.now() - new Date(started).getTime();
        timeRemaining = timeBoxMs - elapsed;
        isOverdue = timeRemaining < 0;
      }

      if (status === "active") activeCount++;
      if (status === "completed") completedCount++;
      if (isOverdue) overdueCount++;

      expeditions.push({
        slug,
        name: String(parsed.name ?? slug),
        team: Array.isArray(parsed.team) ? parsed.team.map(String) : [],
        scope: String(parsed.scope ?? ""),
        guardrails: {
          time_box: guardrails.time_box ?? "",
          authority: guardrails.authority ?? "",
          model_budget: guardrails.model_budget ?? "",
        },
        status,
        started,
        completedAt,
        pulseCount: expPulses.length,
        lastPulse,
        timeRemaining,
        isOverdue,
        successCriteria: Array.isArray(parsed.success_criteria) ? parsed.success_criteria.map(String) : [],
      });
    }

    return NextResponse.json({
      expeditions,
      stats: { active: activeCount, completed: completedCount, overdue: overdueCount },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read expeditions", detail: String(err) },
      { status: 500 },
    );
  }
}
