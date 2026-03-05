import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { AGENTS_DIR } from "@/app/lib/paths";

export async function GET() {
  try {
    let files: string[];
    try {
      files = await readdir(AGENTS_DIR);
    } catch {
      return NextResponse.json({ agents: [] });
    }

    // Only soul files (not briefs), exclude deprecated sentinel (renamed to bastion)
    const agentFiles = files.filter(
      (f) => f.endsWith(".md") && !f.endsWith("-brief.md") && f !== "sentinel.md"
    );
    const agents = await Promise.all(
      agentFiles.map(async (f) => {
        const content = await readFile(join(AGENTS_DIR, f), "utf-8");
        const id = f.replace(".md", "");
        const roleMatch = content.match(/^>?\s*Role:\s*(.+)/m);
        const modelMatch = content.match(/^>?\s*Model:\s*(.+)/m);
        return {
          id,
          name: f,
          role: roleMatch?.[1]?.trim() ?? "",
          model: modelMatch?.[1]?.trim() ?? "",
          content,
        };
      })
    );

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read agent files", detail: String(err) },
      { status: 500 }
    );
  }
}
