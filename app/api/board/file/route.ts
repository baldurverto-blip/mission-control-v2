import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { resolveBoardFile } from "@/app/lib/board";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "";
  const name = searchParams.get("name") ?? "";
  const resolved = resolveBoardFile(type, name);

  if (!resolved) {
    return NextResponse.json({ error: "Invalid board file request" }, { status: 400 });
  }

  try {
    const content = await readFile(resolved.path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "content-type": resolved.contentType,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read board file", detail: String(error) },
      { status: 404 },
    );
  }
}
