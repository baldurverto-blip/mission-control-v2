import { readFile } from "fs/promises";
import { basename, join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { DOCS_INTERNAL } from "@/app/lib/paths";

const ALLOWED = new Set([
  "wiki-schema.md",
  "wiki-log.md",
  "wiki-lint-rules.md",
  "company-brain-raw-sources-boundary.md",
  "company-brain-company-and-brand.md",
  "company-brain-founder-goals-and-bets.md",
  "company-brain-runtime-map.md",
  "company-brain-product-portfolio.md",
  "company-brain-research-and-signals.md",
  "company-brain-skills-and-tools.md",
  "company-brain-ops-and-governance.md",
  "company-brain-learning-system.md",
  "company-brain-rollout-plan.md",
  "company-brain-maintenance-runbook.md",
  "company-brain-promotion-workflow.md",
]);

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const safeName = basename(name);

  if (safeName !== name || !ALLOWED.has(safeName)) {
    return NextResponse.json({ error: "invalid file" }, { status: 400 });
  }

  const path = join(DOCS_INTERNAL, safeName);
  const content = await readFile(path, "utf-8").catch(() => null);

  if (content == null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
