import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { CONTENT_DIR, SCHEDULE_JSON } from "../../lib/paths";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

interface ContentItem {
  filename: string;
  channel: string;
  status: "draft" | "queued" | "approved" | "published";
  date: string;
  title: string;
  source: "supabase" | "filesystem";
}

// ── YAML frontmatter parser (simple) ─────────────────────────────
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && val) fm[key] = val;
    }
  }
  return fm;
}

// ── Filesystem scanner ───────────────────────────────────────────
function scanDir(dir: string, channel: string, status: ContentItem["status"]): ContentItem[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => !f.startsWith(".") && f !== "synced")
      .filter((f) => {
        // Skip directories (like synced/)
        try { return !statSync(join(dir, f)).isDirectory(); } catch { return true; }
      })
      .map((f) => {
        const content = (() => {
          try { return readFileSync(join(dir, f), "utf-8"); } catch { return ""; }
        })();
        const fm = parseFrontmatter(content);
        const titleMatch = content.match(/^#\s+(.+)/m);
        const title = fm.hook || fm.title || titleMatch?.[1] || f.replace(/\.(md|json|txt)$/, "");

        // Use frontmatter created_at, fallback to file mtime
        let date: string;
        if (fm.created_at) {
          date = fm.created_at.slice(0, 10);
        } else {
          try {
            date = new Date(statSync(join(dir, f)).mtimeMs).toISOString().slice(0, 10);
          } catch {
            date = new Date().toISOString().slice(0, 10);
          }
        }

        return { filename: f, channel, status, date, title, source: "filesystem" as const };
      });
  } catch {
    return [];
  }
}

// ── Supabase items via Growth-Ops proxy ──────────────────────────
async function fetchSupabaseItems(): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  const statusMap: Record<string, ContentItem["status"]> = {
    queued: "queued",
    approved: "approved",
    posted: "published",
    rejected: "draft", // show rejected as draft for visibility
  };

  for (const status of ["queued", "approved", "posted", "rejected"]) {
    try {
      const res = await fetch(`${GROWTHOPS_URL}/api/queue?status=${status}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const queue = data.queue || data.items || [];
      for (const item of queue) {
        // Pick best date: posted_at > approved_at > created_at
        const rawDate = item.posted_at || item.approved_at || item.created_at;
        const date = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

        // Map platform to channel name
        const channel = item.platform === "twitter" ? "x" : (item.platform || "x");

        items.push({
          filename: item.id || item.title || "untitled",
          channel,
          status: statusMap[status] || "draft",
          date,
          title: item.title || item.body?.slice(0, 60) || "Untitled",
          source: "supabase",
        });
      }
    } catch {
      // Non-critical — continue with other statuses
    }
  }
  return items;
}

// ── Main handler ─────────────────────────────────────────────────
export async function GET() {
  // Read schedule
  let schedule = { lanes: {}, channels: {} };
  if (existsSync(SCHEDULE_JSON)) {
    try {
      schedule = JSON.parse(readFileSync(SCHEDULE_JSON, "utf-8"));
    } catch {}
  }

  // Fetch from both sources in parallel
  const channels = ["x", "reddit", "tiktok", "linkedin"];

  const [supabaseItems, ...fsResults] = await Promise.all([
    fetchSupabaseItems(),
    ...channels.flatMap((ch) => [
      Promise.resolve(scanDir(join(CONTENT_DIR, "drafts", ch), ch, "draft")),
      Promise.resolve(scanDir(join(CONTENT_DIR, "queue", ch), ch, "queued")),
    ]),
  ]);

  const fsItems: ContentItem[] = fsResults.flat();

  // Deduplicate: Supabase items take priority. Match by normalized title.
  const supabaseTitles = new Set(
    supabaseItems.map((i) => i.title.toLowerCase().trim().slice(0, 50))
  );
  const dedupedFs = fsItems.filter(
    (i) => !supabaseTitles.has(i.title.toLowerCase().trim().slice(0, 50))
  );

  const items = [...supabaseItems, ...dedupedFs];

  // Stats
  const stats = {
    drafts: items.filter((i) => i.status === "draft").length,
    queued: items.filter((i) => i.status === "queued" || i.status === "approved").length,
    published: items.filter((i) => i.status === "published").length,
  };

  return NextResponse.json({ schedule, items, stats });
}
