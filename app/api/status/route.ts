import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { AGENTMAIL_ALLOWLIST_TXT, AGENTMAIL_DIGEST_DIR, AGENTMAIL_STATE_JSON, INBOX_MD, NOW_MD, TASKS_JSON } from "@/app/lib/paths";

type TaskStatus = "backlog" | "assigned" | "in_progress" | "review" | "done";

interface Task {
  status?: TaskStatus;
}

interface AgentMailInboxState {
  checked_at?: string;
  seen_message_ids?: string[];
  known_inboxes?: string[];
}

function parseDigestMetric(content: string, label: string) {
  const match = content.match(new RegExp(`^${label}:\\s*(\\d+)`, "m"));
  return match ? Number(match[1]) : null;
}

function parseDigestTimestamp(content: string) {
  const match = content.match(/^Checked at:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

async function readAgentMailStatus() {
  const [rawState, allowlistContent, digestEntries] = await Promise.all([
    readFile(AGENTMAIL_STATE_JSON, "utf-8").catch(() => "{}"),
    readFile(AGENTMAIL_ALLOWLIST_TXT, "utf-8").catch(() => ""),
    readdir(AGENTMAIL_DIGEST_DIR).catch(() => [] as string[]),
  ]);

  let parsed: Record<string, AgentMailInboxState> = {};
  try {
    parsed = JSON.parse(rawState);
  } catch {
    parsed = {};
  }

  const inboxStates = Object.entries(parsed).map(([inboxId, state]) => ({
    inboxId,
    checkedAt: state?.checked_at ?? null,
    seenCount: Array.isArray(state?.seen_message_ids) ? state.seen_message_ids.length : 0,
  }));
  const checkedAts = inboxStates.map((item) => item.checkedAt).filter(Boolean) as string[];
  const latestCheckedAt = checkedAts.sort().at(-1) ?? null;
  const latestDigest = digestEntries
    .filter((name) => name.endsWith(".md"))
    .sort()
    .at(-1) ?? null;
  const latestDigestPath = latestDigest ? `ops/agentmail/${latestDigest}` : null;
  const latestDigestHref = latestDigest ? "/api/agentmail/digest/latest" : null;
  const latestDigestContent = latestDigest
    ? await readFile(`${AGENTMAIL_DIGEST_DIR}/${latestDigest}`, "utf-8").catch(() => "")
    : "";
  const allowlistCount = allowlistContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .length;

  return {
    monitoredInboxes: inboxStates.length,
    latestCheckedAt,
    latestDigest,
    latestDigestPath,
    latestDigestHref,
    latestDigestCheckedAt: latestDigestContent ? parseDigestTimestamp(latestDigestContent) : null,
    latestNewMessages: latestDigestContent ? (parseDigestMetric(latestDigestContent, "New messages") ?? 0) : 0,
    latestTrustedMessages: latestDigestContent ? (parseDigestMetric(latestDigestContent, "Trusted senders") ?? 0) : 0,
    latestUntrustedMessages: latestDigestContent ? (parseDigestMetric(latestDigestContent, "Untrusted senders") ?? 0) : 0,
    allowlistCount,
    inboxes: inboxStates,
  };
}

export async function GET() {
  try {
    const [nowContent, rawTasks, inboxContent, agentmail] = await Promise.all([
      readFile(NOW_MD, "utf-8").catch(() => ""),
      readFile(TASKS_JSON, "utf-8").catch(() => "[]"),
      readFile(INBOX_MD, "utf-8").catch(() => ""),
      readAgentMailStatus(),
    ]);

    let nowModifiedAt: string | null = null;
    try {
      const s = await stat(NOW_MD);
      nowModifiedAt = s.mtime.toISOString();
    } catch { /* ignore */ }

    let tasks: Task[] = [];
    try {
      const parsed = JSON.parse(rawTasks);
      tasks = Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
    } catch {
      tasks = [];
    }

    const counts = {
      backlog: 0,
      assigned: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    } as Record<TaskStatus, number>;

    for (const task of tasks) {
      const status = task.status;
      if (status && status in counts) counts[status] += 1;
    }

    let open = counts.backlog + counts.assigned + counts.in_progress + counts.review;
    let source = "ops/tasks.json";

    if (tasks.length === 0 && inboxContent) {
      open = (inboxContent.match(/^\s*-\s*\[ \]/gm) ?? []).length;
      source = "brain/INBOX.md (fallback)";
    }

    return NextResponse.json({
      now: nowContent,
      nowModifiedAt,
      taskboard: {
        total: tasks.length,
        open,
        done: counts.done,
        counts,
        source,
      },
      founderTruth: {
        status: "brain/NOW.md",
        queue: source,
      },
      agentmail,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read status files", detail: String(err) },
      { status: 500 }
    );
  }
}
