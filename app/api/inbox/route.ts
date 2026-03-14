import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { INBOX_MD } from "@/app/lib/paths";

interface InboxItem {
  text: string;
  done: boolean;
  raw: string;
}

function parseInbox(md: string): { items: InboxItem[]; parkingLot: string[] } {
  const lines = md.split("\n");
  const items: InboxItem[] = [];
  const parkingLot: string[] = [];
  let inParkingLot = false;

  for (const line of lines) {
    if (/^##\s+Parking Lot/i.test(line)) {
      inParkingLot = true;
      continue;
    }
    if (/^##\s+Archive/i.test(line)) break;

    if (inParkingLot) {
      const m = line.match(/^-\s+(.+)/);
      if (m) parkingLot.push(m[1].trim());
    } else {
      const m = line.match(/^-\s*\[([ x])\]\s+(.+)/i);
      if (m) {
        items.push({
          text: m[2].trim(),
          done: m[1].toLowerCase() === "x",
          raw: line,
        });
      }
    }
  }

  return { items, parkingLot };
}

export async function GET() {
  try {
    const content = await readFile(INBOX_MD, "utf-8");
    const { items, parkingLot } = parseInbox(content);
    const openCount = items.filter((i) => !i.done).length;

    return NextResponse.json({ items, parkingLot, openCount });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read INBOX.md", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { raw } = await req.json();
    if (!raw || typeof raw !== "string") {
      return NextResponse.json({ error: "Missing 'raw' field" }, { status: 400 });
    }
    const content = await readFile(INBOX_MD, "utf-8");
    const lines = content.split("\n");
    const updated = lines.map((line) =>
      line === raw && line.startsWith("- [ ]")
        ? line.replace("- [ ]", "- [x]")
        : line
    );
    await writeFile(INBOX_MD, updated.join("\n"), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update inbox", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    const sanitized = text.replace(/[\r\n]/g, " ").trim();
    const date = new Date().toISOString().slice(0, 10);
    const newLine = `- [ ] ${sanitized} — dashboard (${date})`;

    const content = await readFile(INBOX_MD, "utf-8");
    const lines = content.split("\n");

    // Insert before Parking Lot or at the end of the items section
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Parking Lot/i.test(lines[i]) || /^##\s+Archive/i.test(lines[i])) {
        insertIdx = i;
        break;
      }
    }

    if (insertIdx === -1) {
      lines.push(newLine);
    } else {
      lines.splice(insertIdx, 0, newLine, "");
    }

    await writeFile(INBOX_MD, lines.join("\n"), "utf-8");

    return NextResponse.json({ ok: true, item: newLine });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to write to INBOX.md", detail: String(err) },
      { status: 500 }
    );
  }
}
