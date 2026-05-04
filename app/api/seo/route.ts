import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

/**
 * GET /api/seo
 *
 * Returns the SEO Engine's rolled-up dashboard plus per-property latest
 * snapshots. Source of truth: `~/verto-workspace/ops/seo/`.
 *
 * Shape:
 *   {
 *     updated_at: string,
 *     properties: Array<{
 *       slug: string,
 *       site_url: string,
 *       kind: "experiment" | "factory-app" | "external",
 *       latest: { recorded_at, totals: { clicks, impressions, ctr, position } } | null
 *     }>
 *   }
 *
 * Used by the Fleet page to surface "search performance" alongside ASC/RC KPIs.
 */

const SEO_DIR = join(homedir(), "verto-workspace", "ops", "seo");

interface CatalogHost {
  host: string;
  slug: string;
  kind: "experiment" | "factory-app" | "external";
  registered_at: string;
  factory_path?: string;
}

interface Catalog {
  [siteUrl: string]: {
    slug: string;
    site_url: string;
    kind: "experiment" | "factory-app" | "external";
    registered_at: string;
    experiment_path?: string;
    factory_path?: string;
    hosts?: CatalogHost[];
  };
}

interface Snapshot {
  recorded_at: string;
  totals?: { clicks?: number; impressions?: number; ctr?: number; position?: number };
}

async function readLatestSnapshot(slug: string): Promise<Snapshot | null> {
  try {
    const file = join(SEO_DIR, slug, "snapshots.jsonl");
    const text = await readFile(file, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    if (!lines.length) return null;
    return JSON.parse(lines[lines.length - 1]) as Snapshot;
  } catch {
    return null;
  }
}

export async function GET() {
  let catalog: Catalog = {};
  try {
    const raw = await readFile(join(SEO_DIR, "catalog.json"), "utf8");
    catalog = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { updated_at: null, properties: [], error: "catalog not found — run gsc-cli register first" },
      { status: 200 }
    );
  }

  // Flatten: each catalog entry yields one row for the property, plus one row per
  // virtual host child (host-filtered queries against a Domain property).
  const flat: Array<{
    slug: string;
    site_url: string;
    kind: "experiment" | "factory-app" | "external";
    registered_at: string;
    host_filter: string | null;
    parent_site: string | null;
  }> = [];
  for (const entry of Object.values(catalog)) {
    flat.push({
      slug: entry.slug,
      site_url: entry.site_url,
      kind: entry.kind,
      registered_at: entry.registered_at,
      host_filter: null,
      parent_site: null,
    });
    for (const host of entry.hosts ?? []) {
      flat.push({
        slug: host.slug,
        site_url: entry.site_url,
        kind: host.kind,
        registered_at: host.registered_at,
        host_filter: host.host,
        parent_site: entry.site_url,
      });
    }
  }

  const properties = await Promise.all(
    flat.map(async (entry) => {
      const latest = await readLatestSnapshot(entry.slug);
      return { ...entry, latest };
    })
  );

  // Sort: experiments first (most relevant), then factory-apps, then external
  const order = { experiment: 0, "factory-app": 1, external: 2 } as const;
  properties.sort((a, b) => {
    const oa = order[a.kind] ?? 9;
    const ob = order[b.kind] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.slug.localeCompare(b.slug);
  });

  return NextResponse.json({
    updated_at: new Date().toISOString(),
    properties,
  });
}
