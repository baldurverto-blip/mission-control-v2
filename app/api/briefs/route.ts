import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { BRIEFS_DIR } from "@/app/lib/paths";

function pickLatest(files: string[], suffix: "morning" | "evening") {
  return files
    .filter((f) => f.endsWith(`-${suffix}.md`))
    .sort()
    .reverse()[0] ?? null;
}

export async function GET() {
  try {
    let files: string[];
    try {
      files = await readdir(BRIEFS_DIR);
    } catch {
      return NextResponse.json({ morning: null, evening: null, files: [] });
    }

    const mdFiles = files.filter((f) => f.endsWith(".md") && !f.startsWith("latest-")).sort().reverse();

    const latestMorning = pickLatest(mdFiles, "morning");
    const latestEvening = pickLatest(mdFiles, "evening");

    const [morningContent, eveningContent] = await Promise.all([
      latestMorning ? readFile(join(BRIEFS_DIR, latestMorning), "utf-8") : Promise.resolve(null),
      latestEvening ? readFile(join(BRIEFS_DIR, latestEvening), "utf-8") : Promise.resolve(null),
    ]);

    return NextResponse.json({
      morning: latestMorning && morningContent ? { name: latestMorning, content: morningContent } : null,
      evening: latestEvening && eveningContent ? { name: latestEvening, content: eveningContent } : null,
      files: mdFiles.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read briefs", detail: String(err) },
      { status: 500 }
    );
  }
}
