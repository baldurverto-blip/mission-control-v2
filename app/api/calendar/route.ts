import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { WORKSPACE } from "../../lib/paths";

const CONTENT_DIR = join(WORKSPACE, "company", "content");
const SCHEDULE_PATH = join(CONTENT_DIR, "schedule.json");

interface ContentItem {
  filename: string;
  channel: string;
  status: "draft" | "queued" | "published";
  date: string;
  title: string;
}

function scanDir(dir: string, channel: string, status: ContentItem["status"]): ContentItem[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => !f.startsWith("."))
      .map((f) => {
        const content = (() => {
          try { return readFileSync(join(dir, f), "utf-8"); } catch { return ""; }
        })();
        const titleMatch = content.match(/^#\s+(.+)/m);
        const title = titleMatch?.[1] ?? f.replace(/\.(md|json|txt)$/, "");
        const stat = (() => {
          try {
            const { mtimeMs } = require("fs").statSync(join(dir, f));
            return new Date(mtimeMs).toISOString().slice(0, 10);
          } catch { return new Date().toISOString().slice(0, 10); }
        })();
        return { filename: f, channel, status, date: stat, title };
      });
  } catch {
    return [];
  }
}

export async function GET() {
  // Read schedule
  let schedule = { lanes: {}, channels: {} };
  if (existsSync(SCHEDULE_PATH)) {
    try {
      schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf-8"));
    } catch {}
  }

  // Scan content directories
  const channels = ["x", "reddit", "tiktok", "linkedin"];
  const items: ContentItem[] = [];

  for (const ch of channels) {
    items.push(...scanDir(join(CONTENT_DIR, "drafts", ch), ch, "draft"));
    items.push(...scanDir(join(CONTENT_DIR, "queue", ch), ch, "queued"));
  }
  // Published is flat (not per-channel)
  items.push(...scanDir(join(CONTENT_DIR, "published"), "all", "published"));

  // Stats
  const stats = {
    drafts: items.filter((i) => i.status === "draft").length,
    queued: items.filter((i) => i.status === "queued").length,
    published: items.filter((i) => i.status === "published").length,
  };

  return NextResponse.json({ schedule, items, stats });
}
