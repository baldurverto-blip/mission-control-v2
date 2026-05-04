import { readFile } from "fs/promises";
import { join, resolve, extname } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm":  "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".md":   "text/plain; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; path: string[] }> }
) {
  const { slug, path } = await params;
  const FACTORY = await resolveFactoryDir(slug);
  const root = resolve(join(FACTORY, slug, "visual-spec"));
  const requested = resolve(join(root, ...(path ?? [])));

  // Path-traversal guard: requested must be inside root
  if (requested !== root && !requested.startsWith(root + "/")) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await readFile(requested);
    const ct = MIME[extname(requested).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": ct, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(`Not found: ${path?.join("/") ?? ""}`, { status: 404 });
  }
}
