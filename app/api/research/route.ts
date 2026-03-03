import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { RESEARCH } from "@/app/lib/paths";

export async function GET() {
  try {
    let files: string[];
    try {
      files = await readdir(RESEARCH);
    } catch {
      return NextResponse.json({ latest: null, count: 0, files: [] });
    }

    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();

    // Count files from this week
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let weekCount = 0;
    const fileList: { name: string; date: string }[] = [];

    for (const f of mdFiles) {
      const fstat = await stat(join(RESEARCH, f));
      const dateStr = f.replace(".md", "");
      fileList.push({ name: f, date: dateStr });
      if (fstat.mtimeMs > weekAgo) weekCount++;
    }

    let latestContent: string | null = null;
    let latestName: string | null = null;
    if (mdFiles.length > 0) {
      latestName = mdFiles[0];
      latestContent = await readFile(join(RESEARCH, mdFiles[0]), "utf-8");
    }

    return NextResponse.json({
      latest: latestContent
        ? { name: latestName, content: latestContent }
        : null,
      weekCount,
      files: fileList.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read research files", detail: String(err) },
      { status: 500 }
    );
  }
}
