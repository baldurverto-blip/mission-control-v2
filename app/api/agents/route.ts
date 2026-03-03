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

    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const agents = await Promise.all(
      mdFiles.map(async (f) => {
        const content = await readFile(join(AGENTS_DIR, f), "utf-8");
        return { name: f, content };
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
