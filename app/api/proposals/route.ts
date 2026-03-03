import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { PROPOSALS_DIR } from "@/app/lib/paths";

const STATUS_FILE = join(PROPOSALS_DIR, ".status.json");

type ProposalStatus = "pending" | "approved" | "rejected" | "deferred";

interface StatusMap {
  [filename: string]: { status: ProposalStatus; decidedAt?: string };
}

async function readStatuses(): Promise<StatusMap> {
  try {
    const raw = await readFile(STATUS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStatuses(statuses: StatusMap): Promise<void> {
  await writeFile(STATUS_FILE, JSON.stringify(statuses, null, 2), "utf-8");
}

function extractMeta(content: string): { title: string; date: string; statusLine: string; scope: string; priority: string } {
  const title = content.match(/^#\s+(.+)/m)?.[1]?.replace(/^(Proposal|Task):\s*/i, "").trim() ?? "Untitled";
  const date = content.match(/(?:Date|Filed|Approved by.*?)\(?(\d{4}-\d{2}-\d{2})\)?/i)?.[1] ?? "";
  const statusLine = content.match(/>\s*Status:\s*(.+)/i)?.[1]?.trim() ?? "";
  const scope = content.match(/>\s*Scope:\s*(.+)/i)?.[1]?.trim() ?? "";
  const priority = content.match(/>\s*Priority:\s*(.+)/i)?.[1]?.trim() ?? "";
  return { title, date, statusLine, scope, priority };
}

function classifyProposal(filename: string, statusLine: string): "proposal" | "info" {
  if (/handover|verification|prompt/i.test(filename)) return "info";
  if (/handover|verification/i.test(statusLine)) return "info";
  return "proposal";
}

export async function GET() {
  try {
    const files = (await readdir(PROPOSALS_DIR)).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    );
    const statuses = await readStatuses();

    const proposals = await Promise.all(
      files.map(async (name) => {
        const content = await readFile(join(PROPOSALS_DIR, name), "utf-8");
        const meta = extractMeta(content);
        const kind = classifyProposal(name, meta.statusLine);
        const stored = statuses[name];

        let status: ProposalStatus = "pending";
        if (stored?.status) {
          status = stored.status;
        } else if (/approved|ready to implement/i.test(meta.statusLine)) {
          status = "approved";
        }

        return {
          filename: name,
          title: meta.title,
          date: meta.date,
          statusLine: meta.statusLine,
          scope: meta.scope,
          priority: meta.priority,
          kind,
          status,
          decidedAt: stored?.decidedAt,
          content,
        };
      })
    );

    proposals.sort((a, b) => {
      const order: Record<ProposalStatus, number> = { pending: 0, deferred: 1, approved: 2, rejected: 3 };
      return order[a.status] - order[b.status];
    });

    const pending = proposals.filter((p) => p.status === "pending" && p.kind === "proposal").length;

    return NextResponse.json({ proposals, pending });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read proposals", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { filename, status } = await req.json();
    if (!filename || !status) {
      return NextResponse.json({ error: "Missing filename or status" }, { status: 400 });
    }
    if (!["approved", "rejected", "deferred", "pending"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const statuses = await readStatuses();
    statuses[filename] = {
      status,
      decidedAt: new Date().toISOString().slice(0, 10),
    };
    await writeStatuses(statuses);

    return NextResponse.json({ ok: true, filename, status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update status", detail: String(err) },
      { status: 500 }
    );
  }
}
