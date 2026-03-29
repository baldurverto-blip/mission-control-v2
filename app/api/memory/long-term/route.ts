import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import {
  BRAIN_MEMORY_MD,
  BRAIN_CONTEXT_MD,
  BRAIN_PRINCIPLES_MD,
  BRAIN_NOW_MD,
  CLAUDE_MEMORY_DIR,
} from "@/app/lib/paths";

interface MemoryFile {
  name: string;
  type: string;
  description: string;
  content: string;
  source: "brain" | "mimir";
}

function extractFrontmatter(content: string): { name?: string; type?: string; description?: string; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { body: content };
  const front = m[1];
  const body = m[2];
  const name = front.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const type = front.match(/^type:\s*(.+)$/m)?.[1]?.trim();
  const description = front.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, type, description, body };
}

async function readBrainFile(path: string): Promise<{ content: string; wordCount: number; updatedAt: string }> {
  const raw = await readFile(path, "utf-8");
  // Strip YAML frontmatter for display
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const { statSync } = await import("fs");
  const updatedAt = statSync(path).mtime.toISOString().slice(0, 10);
  return { content: body, wordCount, updatedAt };
}

export async function GET() {
  try {
    // 1. Brain files
    const [insights, strategy, principles, now] = await Promise.allSettled([
      readBrainFile(BRAIN_MEMORY_MD),
      readBrainFile(BRAIN_CONTEXT_MD),
      readBrainFile(BRAIN_PRINCIPLES_MD),
      readBrainFile(BRAIN_NOW_MD),
    ]);

    const brain = {
      insights: insights.status === "fulfilled" ? insights.value : null,
      strategy: strategy.status === "fulfilled" ? strategy.value : null,
      principles: principles.status === "fulfilled" ? principles.value : null,
      now: now.status === "fulfilled" ? now.value : null,
    };

    // 2. Claude Code (Mimir) memory files
    const mimirFiles: MemoryFile[] = [];
    try {
      const files = (await readdir(CLAUDE_MEMORY_DIR)).filter(
        (f) => f.endsWith(".md") && f !== "MEMORY.md" && !f.startsWith(".")
      );
      for (const f of files) {
        try {
          const raw = await readFile(join(CLAUDE_MEMORY_DIR, f), "utf-8");
          const { name, type, description, body } = extractFrontmatter(raw);
          mimirFiles.push({
            name: name ?? f.replace(/\.md$/, "").replace(/_/g, " "),
            type: type ?? "reference",
            description: description ?? "",
            content: body.trim(),
            source: "mimir",
          });
        } catch { /* skip */ }
      }
    } catch { /* no mimir memory dir */ }

    // Group mimir files by type
    const byType: Record<string, MemoryFile[]> = {};
    for (const f of mimirFiles) {
      const t = f.type;
      if (!byType[t]) byType[t] = [];
      byType[t].push(f);
    }

    return NextResponse.json({
      brain,
      mimir: {
        files: mimirFiles,
        byType,
        total: mimirFiles.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load long-term memory", detail: String(err) }, { status: 500 });
  }
}
