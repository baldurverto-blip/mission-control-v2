import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { BRAIN_MEMORY_MD, LEARNING_DIR, PROPOSALS_DIR, CLAUDE_MEMORY_DIR } from "@/app/lib/paths";

interface SearchResult {
  file: string;
  path: string;
  source: "brain" | "mimir" | "learning" | "proposal";
  date?: string;
  preview: string;
  matchCount: number;
}

function buildPreview(content: string, query: string, maxLen = 200): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, maxLen).trim() + "…";
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + query.length + 100);
  const snippet = (start > 0 ? "…" : "") + content.slice(start, end).trim() + (end < content.length ? "…" : "");
  return snippet.slice(0, maxLen + 20);
}

function countMatches(content: string, query: string): number {
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (content.match(re) ?? []).length;
}

async function searchDir(
  dir: string,
  query: string,
  source: SearchResult["source"],
  ext = ".md"
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith("."));
    for (const f of files) {
      try {
        const content = await readFile(join(dir, f), "utf-8");
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
          results.push({
            file: f,
            path: join(dir, f),
            source,
            date: dateMatch?.[1],
            preview: buildPreview(content, query),
            matchCount: countMatches(content, query),
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* dir not found */ }
  return results;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q ?? "" });
  }

  try {
    const [brainResult, learnings, proposals, mimirResults] = await Promise.all([
      // brain/MEMORY.md
      (async (): Promise<SearchResult[]> => {
        try {
          const content = await readFile(BRAIN_MEMORY_MD, "utf-8");
          if (!content.toLowerCase().includes(q.toLowerCase())) return [];
          return [{
            file: "MEMORY.md",
            path: BRAIN_MEMORY_MD,
            source: "brain",
            preview: buildPreview(content, q),
            matchCount: countMatches(content, q),
          }];
        } catch { return []; }
      })(),
      searchDir(LEARNING_DIR, q, "learning"),
      searchDir(PROPOSALS_DIR, q, "proposal"),
      searchDir(CLAUDE_MEMORY_DIR, q, "mimir"),
    ]);

    const results = [...brainResult, ...learnings, ...proposals, ...mimirResults]
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 30);

    return NextResponse.json({ results, query: q });
  } catch (err) {
    return NextResponse.json({ error: "Search failed", detail: String(err) }, { status: 500 });
  }
}
