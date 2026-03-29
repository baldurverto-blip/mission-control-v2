import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { FACTORY_DIR } from "@/app/lib/paths";

interface AppKPI {
  slug: string;
  status: string;
  track: string;
  shippedAt: string | null;
  downloads30d: number;
  mrr: number | null;
  activeSubs: number | null;
  waitlistSignups: number;
  redditKarma: number;
  redditComments: number;
  seoPages: number;
  appStoreStatus: string | null;
}

export async function GET() {
  try {
    const entries = await readdir(FACTORY_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const apps: AppKPI[] = [];
    let totalMRR = 0;
    let totalDownloads = 0;
    let totalWaitlist = 0;
    let totalRedditKarma = 0;
    let totalRedditComments = 0;
    let totalSeoPages = 0;
    let totalActiveSubs = 0;

    const counts = { live: 0, inPipeline: 0, parked: 0, rejected: 0, awaitingReview: 0 };

    for (const slug of dirs) {
      const dir = join(FACTORY_DIR, slug);
      let stateData: Record<string, unknown> = {};
      let kpiData: Record<string, unknown> = {};

      try {
        const raw = await readFile(join(dir, "state.json"), "utf-8");
        stateData = JSON.parse(raw);
      } catch { continue; } // Skip dirs without state.json

      try {
        const raw = await readFile(join(dir, "kpis.json"), "utf-8");
        kpiData = JSON.parse(raw);
      } catch { /* no kpis yet */ }

      const status = (stateData.status as string) ?? "unknown";
      const track = (stateData.track as string) ?? "mobile";

      // Categorise
      if (status === "shipped") {
        const asc = (kpiData.app_store as Record<string, unknown>) ?? {};
        const ascStatus = (asc.status as string) ?? null;
        if (ascStatus === "live" || ascStatus === "ready_for_sale") {
          counts.live++;
        } else {
          counts.awaitingReview++;
        }
      } else if (status === "parked") {
        counts.parked++;
      } else if (status === "rejected") {
        counts.rejected++;
      } else {
        counts.inPipeline++;
      }

      // Aggregate KPIs
      const asc = (kpiData.app_store as Record<string, unknown>) ?? {};
      const rev = (kpiData.revenue as Record<string, unknown>) ?? {};
      const wl = (kpiData.waitlist as Record<string, unknown>) ?? {};
      const reddit = (kpiData.reddit as Record<string, unknown>) ?? {};
      const seo = (kpiData.seo as Record<string, unknown>) ?? {};

      const downloads = (asc.downloads_30d as number) ?? 0;
      const mrr = (rev.mrr as number) ?? null;
      const activeSubs = (rev.active_subs as number) ?? null;
      const waitlistSignups = (wl.signup_count as number) ?? 0;
      const redditKarma = (reddit.latest_karma as number) ?? 0;
      const redditComments = (reddit.total_comments as number) ?? 0;
      const seoPages = (seo.total_indexed_pages as number) ?? 0;

      totalDownloads += downloads;
      if (mrr !== null) totalMRR += mrr;
      if (activeSubs !== null) totalActiveSubs += activeSubs;
      totalWaitlist += waitlistSignups;
      totalRedditKarma += redditKarma;
      totalRedditComments += redditComments;
      totalSeoPages += seoPages;

      apps.push({
        slug,
        status,
        track,
        shippedAt: (kpiData.shipped_at as string) ?? (kpiData.ship_date as string) ?? null,
        downloads30d: downloads,
        mrr,
        activeSubs,
        waitlistSignups,
        redditKarma,
        redditComments,
        seoPages,
        appStoreStatus: (asc.status as string) ?? null,
      });
    }

    return NextResponse.json({
      counts,
      totals: {
        mrr: totalMRR,
        downloads30d: totalDownloads,
        activeSubs: totalActiveSubs,
        waitlistSignups: totalWaitlist,
        redditKarma: totalRedditKarma,
        redditComments: totalRedditComments,
        seoPages: totalSeoPages,
      },
      apps: apps.filter((a) => a.status === "shipped").sort(
        (a, b) => (b.downloads30d + b.redditKarma) - (a.downloads30d + a.redditKarma)
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
