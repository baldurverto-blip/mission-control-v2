import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

const PROJECTS_DIR = join(process.env.HOME ?? "/Users/baldurclaw", "projects");

const ICON_CANDIDATES = [
  "icon.png",
  "safebite-logo.png",
  "adaptive-icon.png",
  "logo.png",
  "favicon.png",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const assetsDir = join(PROJECTS_DIR, slug, "assets");

  for (const name of ICON_CANDIDATES) {
    const path = join(assetsDir, name);
    try {
      await stat(path);
      const data = await readFile(path);
      return new NextResponse(data, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, immutable",
        },
      });
    } catch {
      /* try next candidate */
    }
  }

  // Return transparent 1x1 PNG as fallback
  return new NextResponse(null, { status: 404 });
}
