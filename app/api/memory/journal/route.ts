import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { BRIEFS_DIR, LEARNING_DIR, PROPOSALS_DIR } from "@/app/lib/paths";

const DECISIONS_MD = join(
  process.env.HOME ?? "/Users/baldurclaw",
  "verto-workspace", "docs", "internal", "decisions.md"
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  kind: "brief" | "decision" | "proposal" | "learning";
  time?: string;        // HH:MM or empty
  title: string;
  body?: string;        // markdown content
  meta?: string;        // subtitle / extra info
  tag?: string;         // morning | evening | etc.
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBriefTime(content: string, type: string): string {
  // Try to parse generated time from frontmatter-style line
  const m = content.match(/Generated:\s*(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}))/);
  if (m) return m[2];
  return type === "morning" ? "08:00" : "18:00";
}

function briefWordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function parseDecisionsForDate(content: string, date: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(date)) continue;
    // Format: "YYYY-MM-DD — Decision text" or "YYYY-MM-DD | Decision text"
    const body = trimmed.replace(/^\d{4}-\d{2}-\d{2}\s*[—|\-]+\s*/, "").trim();
    if (body.length > 4) {
      const title = body.length > 80 ? body.slice(0, 80).replace(/\s\S+$/, "") + "…" : body;
      entries.push({ kind: "decision", title, body, meta: "decisions.md" });
    }
  }
  return entries;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Missing or invalid date" }, { status: 400 });
  }

  const entries: JournalEntry[] = [];

  // 1. Morning brief
  try {
    const content = await readFile(join(BRIEFS_DIR, `${date}-morning.md`), "utf-8");
    entries.push({
      kind: "brief",
      time: extractBriefTime(content, "morning"),
      title: "Morning Brief",
      body: content,
      meta: `${briefWordCount(content)} words`,
      tag: "morning",
    });
  } catch { /* no morning brief */ }

  // 2. Evening brief — try dated file first, fall back to latest-evening.md if generated today
  try {
    let eveningContent: string;
    try {
      eveningContent = await readFile(join(BRIEFS_DIR, `${date}-evening.md`), "utf-8");
    } catch {
      // Fall back to latest-evening.md only if it was generated on the requested date
      const latest = await readFile(join(BRIEFS_DIR, "latest-evening.md"), "utf-8");
      const generatedMatch = latest.match(/Generated:\s*(\d{4}-\d{2}-\d{2})/);
      if (generatedMatch?.[1] === date) {
        eveningContent = latest;
      } else {
        throw new Error("no evening brief for this date");
      }
    }
    entries.push({
      kind: "brief",
      time: extractBriefTime(eveningContent, "evening"),
      title: "Evening Brief",
      body: eveningContent,
      meta: `${briefWordCount(eveningContent)} words`,
      tag: "evening",
    });
  } catch { /* no evening brief */ }

  // 3. Decisions made on this date
  try {
    const content = await readFile(DECISIONS_MD, "utf-8");
    const decisions = parseDecisionsForDate(content, date);
    entries.push(...decisions);
  } catch { /* no decisions file */ }

  // 4. Proposals created on this date (filename starts with date)
  try {
    const files = (await readdir(PROPOSALS_DIR)).filter(
      (f) => f.startsWith(date) && f.endsWith(".md") && !f.startsWith(".")
    );
    for (const f of files) {
      try {
        const content = await readFile(join(PROPOSALS_DIR, f), "utf-8");
        const titleMatch = content.match(/^#\s+(.+)/m);
        const title = titleMatch?.[1]?.replace(/^Proposal:\s*/i, "").trim() ?? f.replace(/\.md$/, "");
        entries.push({ kind: "proposal", title, body: content, meta: f });
      } catch { /* skip */ }
    }
  } catch { /* no proposals dir */ }

  // 5. Learnings captured on this date
  try {
    const files = (await readdir(LEARNING_DIR)).filter(
      (f) => f.startsWith(date) && f.endsWith(".md") && !f.startsWith(".")
    );
    for (const f of files) {
      try {
        const content = await readFile(join(LEARNING_DIR, f), "utf-8");
        const titleMatch = content.match(/^#\s+(.+)/m);
        const title = titleMatch?.[1]?.trim() ?? f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-?/, "").replace(/-/g, " ");
        entries.push({ kind: "learning", title, body: content, meta: f });
      } catch { /* skip */ }
    }
  } catch { /* no learning dir */ }

  const hasContent = entries.length > 0;
  const briefCount = entries.filter((e) => e.kind === "brief").length;
  const decisionCount = entries.filter((e) => e.kind === "decision").length;

  return NextResponse.json({ date, entries, hasContent, briefCount, decisionCount });
}
