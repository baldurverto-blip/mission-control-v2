import { readFile } from "fs/promises";
import { join } from "path";

const FACTORY = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace/ops/factory");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const htmlPath = join(FACTORY, slug, "design-preview.html");
  try {
    const html = await readFile(htmlPath, "utf-8");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:48px;background:#f5f2ec"><h2>Design preview not yet generated for <strong>${slug}</strong></h2><p>Run the design phase first: <code>factory-loop.sh ${slug} design</code></p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
