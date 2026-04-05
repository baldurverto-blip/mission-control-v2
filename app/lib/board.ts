import { basename, dirname, join } from "path";
import { readFile, readdir, stat } from "fs/promises";
import {
  BOARD_GOALS_MD,
  BOARD_MEETING_ACTIONS_DIR,
  BOARD_MEETING_SUMMARIES_DIR,
  BOARD_MEETING_TRANSCRIPTS_DIR,
  BOARD_MEETINGS_DIR,
} from "@/app/lib/paths";

export interface BoardAction {
  title: string;
  owner: string;
  priority: string;
  due_window?: string;
  why?: string;
  approval_required?: boolean;
  taskboard_eligible?: boolean;
}

export interface BoardFileRef {
  name: string;
  path: string;
  modifiedAt: string;
  inferredDate: string | null;
}

export interface BoardHistoryFile extends BoardFileRef {
  type: "meeting" | "transcript";
}

export interface BoardSummary {
  name: string;
  verdict: string | null;
  excerpt: string;
  path: string;
}

export interface BoardData {
  latestBoardDate: string | null;
  latestTranscript: BoardHistoryFile | null;
  latestSummary: BoardSummary | null;
  latestActionsFile: BoardFileRef | null;
  latestActions: BoardAction[];
  recentConversations: BoardHistoryFile[];
  goalsExcerpt: string[];
  goalsPath: string;
}

function extractDate(input: string): string | null {
  const match = input.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

function rankByDateThenMtime<T extends { inferredDate: string | null; modifiedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dateA = a.inferredDate ?? "";
    const dateB = b.inferredDate ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });
}

function cleanLine(line: string): string {
  return line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
}

function takeBulletSection(md: string, heading: string, limit = 4): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];

  const bullets: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) break;
    if (/^[-*]\s/.test(line)) bullets.push(cleanLine(line));
    if (bullets.length >= limit) break;
  }
  return bullets;
}

function extractVerdict(md: string): string | null {
  const match = md.match(/## Verdict\s+([\s\S]*?)(?:\n## |\n# |$)/);
  if (!match) return null;
  return cleanLine(match[1].split("\n").find((line) => line.trim()) ?? "");
}

function extractSummaryExcerpt(md: string): string {
  const lines = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return cleanLine(lines.slice(0, 4).join(" ").slice(0, 280));
}

async function readMarkdownFile(path: string) {
  const [content, fileStat] = await Promise.all([
    readFile(path, "utf-8"),
    stat(path),
  ]);
  return {
    content,
    modifiedAt: fileStat.mtime.toISOString(),
    inferredDate: extractDate(`${basename(path)}\n${content}`),
  };
}

async function readLatestSummary(): Promise<BoardSummary | null> {
  const entries = (await readdir(BOARD_MEETING_SUMMARIES_DIR).catch(() => []))
    .filter((name) => name.endsWith(".md"));

  const summaries = await Promise.all(entries.map(async (name) => {
    const path = join(BOARD_MEETING_SUMMARIES_DIR, name);
    const { content, modifiedAt, inferredDate } = await readMarkdownFile(path);
    return {
      name,
      path,
      modifiedAt,
      inferredDate,
      verdict: extractVerdict(content),
      excerpt: extractSummaryExcerpt(content),
    };
  }));

  return rankByDateThenMtime(summaries)[0] ?? null;
}

async function readLatestActionsFile(): Promise<{ file: BoardFileRef | null; actions: BoardAction[] }> {
  const entries = (await readdir(BOARD_MEETING_ACTIONS_DIR).catch(() => []))
    .filter((name) => name.endsWith(".json"));

  const files = await Promise.all(entries.map(async (name) => {
    const path = join(BOARD_MEETING_ACTIONS_DIR, name);
    const raw = await readFile(path, "utf-8");
    const fileStat = await stat(path);
    return {
      name,
      modifiedAt: fileStat.mtime.toISOString(),
      inferredDate: extractDate(name),
      actions: JSON.parse(raw) as BoardAction[],
    };
  }));

  const latest = rankByDateThenMtime(files)[0];
  return {
    file: latest ? {
      name: latest.name,
      path: join(BOARD_MEETING_ACTIONS_DIR, latest.name),
      modifiedAt: latest.modifiedAt,
      inferredDate: latest.inferredDate,
    } : null,
    actions: latest?.actions ?? [],
  };
}

async function readHistoryDirectory(
  dir: string,
  type: BoardHistoryFile["type"],
): Promise<BoardHistoryFile[]> {
  const entries = (await readdir(dir).catch(() => []))
    .filter((name) => name.endsWith(".md"));

  return Promise.all(entries.map(async (name) => {
    const path = join(dir, name);
    const { modifiedAt, inferredDate } = await readMarkdownFile(path);
    return { name, path, modifiedAt, inferredDate, type };
  }));
}

async function readRecentConversations(): Promise<BoardHistoryFile[]> {
  const [transcripts, meetings] = await Promise.all([
    readHistoryDirectory(BOARD_MEETING_TRANSCRIPTS_DIR, "transcript"),
    readHistoryDirectory(BOARD_MEETINGS_DIR, "meeting"),
  ]);

  return rankByDateThenMtime([...transcripts, ...meetings]).slice(0, 8);
}

export async function getBoardData(): Promise<BoardData> {
  const [goalsRaw, latestSummary, latestActionsResult, recentConversations] = await Promise.all([
    readFile(BOARD_GOALS_MD, "utf-8").catch(() => ""),
    readLatestSummary(),
    readLatestActionsFile(),
    readRecentConversations(),
  ]);

  const founderConstraints = takeBulletSection(goalsRaw, "## Founder Constraints", 4);
  const progressSignals = takeBulletSection(goalsRaw, "## What Counts as Progress Toward 10k+ MRR", 3);
  const latestTranscript =
    recentConversations.find((item) => item.type === "transcript")
    ?? recentConversations.find((item) => item.type === "meeting")
    ?? null;
  const latestBoardDate =
    latestSummary?.name ? extractDate(latestSummary.name)
    : latestTranscript?.inferredDate ?? null;

  return {
    latestBoardDate,
    latestTranscript,
    latestSummary,
    latestActionsFile: latestActionsResult.file,
    latestActions: latestActionsResult.actions.slice(0, 5),
    recentConversations,
    goalsExcerpt: [...founderConstraints, ...progressSignals].slice(0, 6),
    goalsPath: BOARD_GOALS_MD,
  };
}

export function resolveBoardFile(type: string, name: string): { path: string; contentType: string } | null {
  const safeName = basename(name);
  if (safeName !== name) return null;

  const roots: Record<string, { dir: string; ext: string; contentType: string }> = {
    meeting: { dir: BOARD_MEETINGS_DIR, ext: ".md", contentType: "text/plain; charset=utf-8" },
    transcript: { dir: BOARD_MEETING_TRANSCRIPTS_DIR, ext: ".md", contentType: "text/plain; charset=utf-8" },
    summary: { dir: BOARD_MEETING_SUMMARIES_DIR, ext: ".md", contentType: "text/plain; charset=utf-8" },
    action: { dir: BOARD_MEETING_ACTIONS_DIR, ext: ".json", contentType: "application/json; charset=utf-8" },
    goals: { dir: dirname(BOARD_GOALS_MD), ext: ".md", contentType: "text/plain; charset=utf-8" },
  };

  const target = roots[type];
  if (!target) return null;
  if (type === "goals") {
    if (safeName !== basename(BOARD_GOALS_MD)) return null;
    return { path: BOARD_GOALS_MD, contentType: target.contentType };
  }
  if (!safeName.endsWith(target.ext)) return null;
  return { path: join(target.dir, safeName), contentType: target.contentType };
}
