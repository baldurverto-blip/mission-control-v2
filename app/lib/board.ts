import { basename, dirname, join } from "path";
import { readFile, readdir, stat } from "fs/promises";
import {
  BOARD_GOALS_MD,
  BOARD_MEETING_ACTIONS_DIR,
  BOARD_MEETING_SUMMARIES_DIR,
  BOARD_MEETING_TRANSCRIPTS_DIR,
  BOARD_MEETINGS_DIR,
  COMPANY_OVERVIEW_MD,
  FACTORY_DIR,
  INBOX_MD,
  MISSION_MD,
  NOW_MD,
  TASKS_JSON,
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
  isLatestAlias?: boolean;
}

export interface BoardHistoryFile extends BoardFileRef {
  type: "meeting" | "transcript" | "summary" | "action";
}

export interface BoardSummary {
  name: string;
  verdict: string | null;
  excerpt: string;
  path: string;
  executiveBrief: string[];
  keyDecisions: string[];
  nextMoves: string[];
  agendaFocus: string[];
  escalations: string[];
}

export interface BoardArchiveEntry {
  date: string;
  summary: BoardSummary | null;
  transcript: BoardHistoryFile | null;
  transcriptPreview: string[];
  actionsFile: BoardFileRef | null;
  actions: BoardAction[];
}

export interface BoardData {
  latestBoardDate: string | null;
  latestTranscript: BoardHistoryFile | null;
  latestSummary: BoardSummary | null;
  latestActionsFile: BoardFileRef | null;
  latestActions: BoardAction[];
  latestAliasFiles: { summary: BoardFileRef | null; transcript: BoardFileRef | null; action: BoardFileRef | null };
  latestTranscriptPreview: string[];
  archive: BoardArchiveEntry[];
  goalsExcerpt: string[];
  goalsPath: string;
  truthNotes: string[];
  phaseHeadline: string | null;
  meetingFormat: string[];
  latestEscalations: string[];
  latestAgendaFocus: string[];
}

type BoardActionsPayload = BoardAction[] | { actions?: BoardAction[] };

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
  return line
    .replace(/^[-*]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
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
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) bullets.push(cleanLine(line));
    if (bullets.length >= limit) break;
  }
  return bullets;
}

function extractSection(md: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = md.match(new RegExp(`## ${escaped}\\s+([\\s\\S]*?)(?:\\n## |\\n# |$)`));
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(cleanLine)
    .filter(Boolean);
}

function extractVerdict(md: string): string | null {
  const lines = extractSection(md, "Verdict");
  return lines[0] ?? null;
}

function extractSummaryExcerpt(md: string): string {
  const lines = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return cleanLine(lines.slice(0, 4).join(" ").slice(0, 280));
}

function extractExecutiveBrief(md: string): string[] {
  const execBrief = takeBulletSection(md, "## Executive Brief", 4);
  if (execBrief.length > 0) return execBrief;
  const openingBrief = takeBulletSection(md, "## Opening brief", 4);
  if (openingBrief.length > 0) return openingBrief;
  const whatMoved = takeBulletSection(md, "## What moved", 3);
  const blockers = takeBulletSection(md, "## Key blockers", 2);
  return [...whatMoved, ...blockers].slice(0, 4);
}

function extractTranscriptPreview(md: string): string[] {
  const lines = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(\*\*)?[A-Za-z][A-Za-z\s]+:/.test(line) || /^\[[A-Za-z].*\]$/.test(line));
  return lines.slice(0, 8).map((line) => line.replace(/^\*\*/, "").replace(/\*\*$/, ""));
}

async function readMarkdownFile(path: string) {
  const [content, fileStat] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
  return {
    content,
    modifiedAt: fileStat.mtime.toISOString(),
    inferredDate: extractDate(`${basename(path)}\n${content}`),
  };
}

async function readJsonFile(path: string) {
  const [raw, fileStat] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
  return {
    raw,
    modifiedAt: fileStat.mtime.toISOString(),
    inferredDate: extractDate(basename(path)),
  };
}

function normalizeBoardActionsPayload(parsed: BoardActionsPayload): BoardAction[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.actions)) return parsed.actions;
  return [];
}

async function readLatestAlias(dir: string, name: string, type: BoardHistoryFile["type"]): Promise<BoardFileRef | null> {
  const path = join(dir, name);
  try {
    const fileStat = await stat(path);
    return {
      name,
      path,
      modifiedAt: fileStat.mtime.toISOString(),
      inferredDate: extractDate(name),
      isLatestAlias: true,
    };
  } catch {
    return null;
  }
}

async function readSummaryByName(name: string): Promise<BoardSummary | null> {
  const path = join(BOARD_MEETING_SUMMARIES_DIR, name);
  try {
    const { content } = await readMarkdownFile(path);
    return {
      name,
      path,
      verdict: extractVerdict(content),
      excerpt: extractSummaryExcerpt(content),
      executiveBrief: extractExecutiveBrief(content),
      keyDecisions: takeBulletSection(content, "## Key decisions", 4),
      nextMoves: takeBulletSection(content, "## Next moves", 4).length > 0
        ? takeBulletSection(content, "## Next moves", 4)
        : takeBulletSection(content, "## If no, then tomorrow", 4),
      agendaFocus: takeBulletSection(content, "## Agenda focus", 4),
      escalations: takeBulletSection(content, "## Escalations for Mads", 4),
    };
  } catch {
    return null;
  }
}

async function readLatestSummary(): Promise<BoardSummary | null> {
  const entries = (await readdir(BOARD_MEETING_SUMMARIES_DIR).catch(() => []))
    .filter((name) => name.endsWith(".md") && name !== "latest.md");

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
      executiveBrief: extractExecutiveBrief(content),
      keyDecisions: takeBulletSection(content, "## Key decisions", 4),
      nextMoves: takeBulletSection(content, "## Next moves", 4).length > 0
        ? takeBulletSection(content, "## Next moves", 4)
        : takeBulletSection(content, "## If no, then tomorrow", 4),
      agendaFocus: takeBulletSection(content, "## Agenda focus", 4),
      escalations: takeBulletSection(content, "## Escalations for Mads", 4),
    };
  }));

  const latest = rankByDateThenMtime(summaries)[0] ?? null;
  if (!latest) return null;
  return {
    name: latest.name,
    path: latest.path,
    verdict: latest.verdict,
    excerpt: latest.excerpt,
    executiveBrief: latest.executiveBrief,
    keyDecisions: latest.keyDecisions,
    nextMoves: latest.nextMoves,
    agendaFocus: latest.agendaFocus,
    escalations: latest.escalations,
  };
}

async function readLatestActionsFile(): Promise<{ file: BoardFileRef | null; actions: BoardAction[] }> {
  const entries = (await readdir(BOARD_MEETING_ACTIONS_DIR).catch(() => []))
    .filter((name) => name.endsWith(".json") && name !== "latest.json");

  const files = await Promise.all(entries.map(async (name) => {
    const path = join(BOARD_MEETING_ACTIONS_DIR, name);
    const { raw, modifiedAt } = await readJsonFile(path);
    const parsed = JSON.parse(raw) as BoardActionsPayload;
    const actions = normalizeBoardActionsPayload(parsed);

    return {
      name,
      modifiedAt,
      inferredDate: extractDate(name),
      actions,
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

async function readHistoryDirectory(dir: string, type: BoardHistoryFile["type"]): Promise<BoardHistoryFile[]> {
  const entries = (await readdir(dir).catch(() => []))
    .filter((name) => name.endsWith(".md") && name !== "latest.md");

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

function parseInboxActions(raw: string): BoardAction[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^- \[ \]/.test(line))
    .slice(0, 8)
    .map((line) => {
      const priorityMatch = line.match(/\[(P0|P1|P2|HIGH|MEDIUM|LOW)\]/i);
      const sourceBits = line.replace(/^- \[ \]\s*/, "").split(" — ");
      const title = sourceBits[0].replace(/\[[^\]]+\]\s*/g, "").trim();
      const priority = (priorityMatch?.[1] ?? "P2").toUpperCase();
      return {
        title,
        owner: "mads",
        priority,
        why: sourceBits[1] ? `Source: ${sourceBits[1]}` : "Open inbox item",
      } satisfies BoardAction;
    });
}

async function readBoardActionsFallback(): Promise<BoardAction[]> {
  try {
    const raw = await readFile(INBOX_MD, "utf-8");
    return parseInboxActions(raw);
  } catch {
    return [];
  }
}

async function readTaskboardTruthNote(): Promise<string | null> {
  try {
    const raw = await readFile(TASKS_JSON, "utf-8");
    const parsed = JSON.parse(raw);
    const tasks = Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
    const open = tasks.filter((task: { status?: string }) => task.status && task.status !== "done").length;
    const review = tasks.filter((task: { status?: string }) => task.status === "review").length;
    const p0p1 = tasks.filter((task: { status?: string; priority?: string }) => task.status !== "done" && ["p0", "p1"].includes(task.priority ?? "")).length;
    return `Taskboard truth: ${open} open tasks, ${review} in review, ${p0p1} open P0/P1 items.`;
  } catch {
    try {
      const raw = await readFile(INBOX_MD, "utf-8");
      const inboxActions = parseInboxActions(raw);
      return `Taskboard truth fallback: ops/tasks.json is absent, showing ${inboxActions.length} open inbox items from brain/INBOX.md.`;
    } catch {
      return null;
    }
  }
}

async function readFactoryTruthNote(): Promise<string | null> {
  try {
    const slugs = await readdir(FACTORY_DIR);
    const statePaths = slugs.map((slug) => join(FACTORY_DIR, slug, "state.json"));
    const states = await Promise.all(statePaths.map(async (path) => {
      try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw) as { status?: string; asc_status?: string };
      } catch {
        return null;
      }
    }));

    const live = states.filter((state) => state?.status === "live").length;
    const inReview = states.filter((state) => state?.status === "in_review" || state?.asc_status === "in_review").length;
    const blocked = states.filter((state) => state?.status && ["needs-review", "blocked", "halted", "rejected"].includes(state.status)).length;
    return `Factory truth: ${live} live, ${inReview} in review, ${blocked} blocked-or-needs-review projects from ops/factory/*/state.json.`;
  } catch {
    return null;
  }
}

async function readPhaseHeadline(): Promise<string | null> {
  try {
    const raw = await readFile(NOW_MD, "utf-8");
    const status = raw.split("\n").find((line) => line.startsWith("## Status:"))?.replace("## Status:", "").trim();
    const phase = raw.split("\n").find((line) => line.startsWith("Phase:"))?.replace("Phase:", "").trim();
    return [status, phase].filter(Boolean).join(" · ") || null;
  } catch {
    return null;
  }
}

async function readArchive(): Promise<BoardArchiveEntry[]> {
  const [summaryNames, transcriptNames, actionNames] = await Promise.all([
    readdir(BOARD_MEETING_SUMMARIES_DIR).catch(() => []),
    readdir(BOARD_MEETING_TRANSCRIPTS_DIR).catch(() => []),
    readdir(BOARD_MEETING_ACTIONS_DIR).catch(() => []),
  ]);

  const summaryMap = new Map(summaryNames.filter((name) => name.endsWith(".md") && name !== "latest.md").map((name) => [extractDate(name) ?? name, name]));
  const transcriptMap = new Map(transcriptNames.filter((name) => name.endsWith(".md") && name !== "latest.md").map((name) => [extractDate(name) ?? name, name]));
  const actionMap = new Map(actionNames.filter((name) => name.endsWith(".json") && name !== "latest.json").map((name) => [extractDate(name) ?? name, name]));

  const dates = Array.from(new Set([...summaryMap.keys(), ...transcriptMap.keys(), ...actionMap.keys()]))
    .filter((date) => /^20\d{2}-\d{2}-\d{2}$/.test(date))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 12);

  return Promise.all(dates.map(async (date) => {
    const summaryName = summaryMap.get(date);
    const transcriptName = transcriptMap.get(date);
    const actionName = actionMap.get(date);

    const summary = summaryName ? await readSummaryByName(summaryName) : null;

    let transcript: BoardHistoryFile | null = null;
    let transcriptPreview: string[] = [];
    if (transcriptName) {
      const path = join(BOARD_MEETING_TRANSCRIPTS_DIR, transcriptName);
      const { content, modifiedAt, inferredDate } = await readMarkdownFile(path);
      transcript = { name: transcriptName, path, modifiedAt, inferredDate, type: "transcript" };
      transcriptPreview = extractTranscriptPreview(content);
    }

    let actionsFile: BoardFileRef | null = null;
    let actions: BoardAction[] = [];
    if (actionName) {
      const path = join(BOARD_MEETING_ACTIONS_DIR, actionName);
      const { raw, modifiedAt, inferredDate } = await readJsonFile(path);
      const parsed = JSON.parse(raw) as BoardActionsPayload;
      actions = normalizeBoardActionsPayload(parsed);
      actionsFile = { name: actionName, path, modifiedAt, inferredDate };
    }

    return { date, summary, transcript, transcriptPreview, actionsFile, actions };
  }));
}

export async function getBoardData(): Promise<BoardData> {
  const [goalsRaw, companyOverviewRaw, missionRaw, latestSummary, latestActionsResult, inboxFallbackActions, recentConversations, taskboardTruth, factoryTruth, phaseHeadline, archive, latestSummaryAlias, latestTranscriptAlias, latestActionAlias] = await Promise.all([
    readFile(BOARD_GOALS_MD, "utf-8").catch(() => ""),
    readFile(COMPANY_OVERVIEW_MD, "utf-8").catch(() => ""),
    readFile(MISSION_MD, "utf-8").catch(() => ""),
    readLatestSummary(),
    readLatestActionsFile(),
    readBoardActionsFallback(),
    readRecentConversations(),
    readTaskboardTruthNote(),
    readFactoryTruthNote(),
    readPhaseHeadline(),
    readArchive(),
    readLatestAlias(BOARD_MEETING_SUMMARIES_DIR, "latest.md", "summary"),
    readLatestAlias(BOARD_MEETING_TRANSCRIPTS_DIR, "latest.md", "transcript"),
    readLatestAlias(BOARD_MEETING_ACTIONS_DIR, "latest.json", "action"),
  ]);

  const founderConstraints = takeBulletSection(goalsRaw, "## Founder Constraints", 4);
  const progressSignals = takeBulletSection(goalsRaw, "## What Counts as Progress Toward 10k+ MRR", 3);
  const overviewMission = takeBulletSection(companyOverviewRaw, "## Mission", 4);
  const overviewPrinciples = takeBulletSection(companyOverviewRaw, "## Operating Principles", 4);
  const missionBullets = missionRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s/.test(line))
    .map(cleanLine)
    .slice(0, 4);
  const latestTranscript = archive[0]?.transcript
    ?? recentConversations.find((item) => item.type === "transcript")
    ?? recentConversations.find((item) => item.type === "meeting")
    ?? null;
  const latestBoardDate = archive[0]?.date
    ?? (latestSummary?.name ? extractDate(latestSummary.name) : latestTranscript?.inferredDate ?? null);

  return {
    latestBoardDate,
    latestTranscript,
    latestSummary: latestSummary ?? {
      name: "live-operating-state",
      path: NOW_MD,
      verdict: "No board pack on disk, showing live operating state",
      excerpt: "Mission Control could not find board meeting summaries or transcripts in the workspace. The board now falls back to live operating signals until a real board pack is written.",
      executiveBrief: [
        phaseHeadline ? `Current phase: ${phaseHeadline}` : "Current phase unavailable.",
        "No board meeting summary exists under ops/board-meetings or company/board.",
        "Live next actions are being pulled from brain/INBOX.md until ops/tasks.json exists.",
      ],
      keyDecisions: [],
      nextMoves: [
        "Write the next board summary/transcript/actions pack to the canonical board folders if formal board review is needed.",
        "Use the inbox-backed actions below as the working queue in the meantime.",
      ],
      agendaFocus: [],
      escalations: [],
    },
    latestActionsFile: latestActionsResult.file,
    latestActions: (latestActionsResult.actions.length > 0 ? latestActionsResult.actions : inboxFallbackActions).slice(0, 8),
    latestAliasFiles: {
      summary: latestSummaryAlias,
      transcript: latestTranscriptAlias,
      action: latestActionAlias,
    },
    latestTranscriptPreview: archive[0]?.transcriptPreview ?? [],
    archive,
    goalsExcerpt: [...founderConstraints, ...progressSignals, ...overviewMission, ...overviewPrinciples, ...missionBullets].slice(0, 6),
    goalsPath: BOARD_GOALS_MD,
    phaseHeadline,
    meetingFormat: [
      "Baldur opens with operating context, agenda focus, and specific sprint contracts.",
      "Contributors deliberate sequentially in short turns, building on prior input instead of parallel reporting.",
      "Mimir evaluates after the room contributes and explicitly critiques gaps, weak assumptions, and optimism.",
      "Baldur synthesises named actions and founder escalations. Mads is the final decision layer.",
    ],
    latestEscalations: latestSummary?.escalations ?? [],
    latestAgendaFocus: latestSummary?.agendaFocus ?? [],
    truthNotes: [
      phaseHeadline ? `Current phase: ${phaseHeadline}.` : null,
      "Board should deliberate from canonical state, not stale blocker prose.",
      "Canonical inputs: brain/NOW.md, ops/tasks.json when present, brain/INBOX.md as task fallback, docs/internal/company-overview.md, and ops/factory/*/state.json.",
      "Board outputs should be usable artifacts: opening brief, conversational transcript, real actions payload, and founder escalations.",
      "Board actions route into ops/tasks.json via tools/board-actions-sync.sh when safe and bounded.",
      taskboardTruth,
      factoryTruth,
    ].filter((note): note is string => Boolean(note)),
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
