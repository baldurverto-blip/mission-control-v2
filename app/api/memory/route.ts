import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { LEARNING_DIR, PROPOSALS_DIR, BRAIN_MEMORY_MD, BRAIN_CONTEXT_MD, BRAIN_PRINCIPLES_MD, BRIEFS_DIR } from "@/app/lib/paths";
import { statSync } from "fs";

export async function GET() {
  try {
    // Dates come from briefs directory — not cron logs
    const dateSet = new Set<string>();
    try {
      const files = await readdir(BRIEFS_DIR);
      for (const f of files) {
        const m = f.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) dateSet.add(m[1]);
      }
    } catch { /* no briefs dir */ }

    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    // Learnings
    let learnings: { name: string; date: string; title: string }[] = [];
    try {
      const lFiles = (await readdir(LEARNING_DIR)).filter((f) => f.endsWith(".md") && !f.startsWith("."));
      learnings = lFiles
        .map((f) => ({
          name: f,
          date: f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "",
          title: f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-?/, "").replace(/-/g, " ") || f.replace(/\.md$/, ""),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch { /* no learnings */ }

    // Proposal count
    let proposalCount = 0;
    try {
      proposalCount = (await readdir(PROPOSALS_DIR)).filter((f) => f.endsWith(".md") && !f.startsWith(".")).length;
    } catch { /* no proposals */ }

    // Brain memory stats — sum across all brain docs
    let memoryWordCount = 0;
    let memoryUpdated = "";
    try {
      const [mem, ctx, pri] = await Promise.allSettled([
        readFile(BRAIN_MEMORY_MD, "utf-8"),
        readFile(BRAIN_CONTEXT_MD, "utf-8"),
        readFile(BRAIN_PRINCIPLES_MD, "utf-8"),
      ]);
      for (const r of [mem, ctx, pri]) {
        if (r.status === "fulfilled") {
          memoryWordCount += r.value.split(/\s+/).filter(Boolean).length;
        }
      }
      memoryUpdated = statSync(BRAIN_MEMORY_MD).mtime.toISOString().slice(0, 10);
    } catch { /* no memory */ }

    return NextResponse.json({ dates, learnings, proposalCount, memory: { wordCount: memoryWordCount, updatedAt: memoryUpdated } });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load memory index", detail: String(err) }, { status: 500 });
  }
}
