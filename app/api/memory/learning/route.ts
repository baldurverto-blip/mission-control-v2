import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { LEARNING_DIR } from "@/app/lib/paths";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  if (name) {
    // Single file
    try {
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
      const content = await readFile(join(LEARNING_DIR, safe), "utf-8");
      return NextResponse.json({ name: safe, content });
    } catch (err) {
      return NextResponse.json({ error: "Not found", detail: String(err) }, { status: 404 });
    }
  }

  // List all
  try {
    const files = (await readdir(LEARNING_DIR)).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    );
    const items = await Promise.all(
      files.map(async (f) => {
        const content = await readFile(join(LEARNING_DIR, f), "utf-8");
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
        const titleMatch = content.match(/^#\s+(.+)/m);
        return {
          name: f,
          date: dateMatch?.[1] ?? "",
          title: titleMatch?.[1]?.trim() ?? f.replace(/\.md$/, ""),
          preview: content.slice(0, 200).replace(/---[\s\S]*?---/, "").trim(),
          content,
        };
      })
    );
    items.sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: "Failed to list learnings", detail: String(err) }, { status: 500 });
  }
}
