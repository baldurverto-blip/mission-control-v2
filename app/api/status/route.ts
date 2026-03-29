import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { NOW_MD, ROADMAP_MD } from "@/app/lib/paths";

interface PhaseProgress {
  name: string;
  total: number;
  done: number;
}

function parseRoadmapPhases(md: string): PhaseProgress[] {
  const phases: PhaseProgress[] = [];
  const lines = md.split("\n");
  let currentPhase: PhaseProgress | null = null;

  for (const line of lines) {
    const phaseMatch = line.match(/^###\s+(.+?)(?:\s*\[.\])?$/);
    if (phaseMatch) {
      if (currentPhase) phases.push(currentPhase);
      currentPhase = { name: phaseMatch[1].trim(), total: 0, done: 0 };
      continue;
    }
    if (currentPhase && /^\s*-\s*\[[ x]\]/.test(line)) {
      currentPhase.total++;
      if (/^\s*-\s*\[x\]/i.test(line)) currentPhase.done++;
    }
  }
  if (currentPhase) phases.push(currentPhase);
  return phases;
}

export async function GET() {
  try {
    const [nowContent, roadmapContent] = await Promise.all([
      readFile(NOW_MD, "utf-8").catch(() => ""),
      readFile(ROADMAP_MD, "utf-8").catch(() => ""),
    ]);

    let nowModifiedAt: string | null = null;
    try {
      const s = await stat(NOW_MD);
      nowModifiedAt = s.mtime.toISOString();
    } catch { /* ignore */ }

    const phases = parseRoadmapPhases(roadmapContent);
    const totalCheckpoints = phases.reduce((s, p) => s + p.total, 0);
    const doneCheckpoints = phases.reduce((s, p) => s + p.done, 0);

    return NextResponse.json({
      now: nowContent,
      nowModifiedAt,
      roadmap: {
        phases,
        totalCheckpoints,
        doneCheckpoints,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read status files", detail: String(err) },
      { status: 500 }
    );
  }
}
