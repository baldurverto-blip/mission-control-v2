import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { PULSES_DIR } from "@/app/lib/paths";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const FACTORY = join(HOME, "verto-workspace/ops/factory");
const GROWTH_OPS = "http://localhost:3002";

// ── Helpers ──────────────────────────────────────────────────────

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

async function fetchGrowth(path: string, timeoutMs = 4000): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${GROWTH_OPS}${path}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────

interface LayerState {
  status: string;
  last_run: string | null;
  runs: number;
  last_result: string | null;
  tiktok_posts_drafted?: number;
  reddit_comments_posted?: number;
  x_posts_drafted?: number;
  blocking_items?: string[];
}

interface DistributionState {
  slug: string;
  engine_status: string;
  layers: Record<string, LayerState>;
  updated_at: string;
}

interface SEOLearnings {
  blog_posts: { slug: string; primary_keyword: string; published_at: string }[];
  faq_entries: number;
  programmatic_pages: number;
  total_indexed_pages: number;
}

interface KPIState {
  slug: string;
  last_ingested: string | null;
  signals: string[];
  reddit?: { total_comments: number; posted_comments: number; latest_karma: number; subreddits: Record<string, number> };
  waitlist?: { signup_count: number; landing_page_url: string };
  distribution?: { engine_status: string; active_layers: number };
}

interface ProjectState {
  slug: string;
  status: string;
  phases: Record<string, { status?: string; score?: number; attempt?: number }>;
  created_at: string;
  updated_at: string;
}

interface PulseEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  duration_ms: number;
  timestamp: string;
  model?: string;
}

// ── Main Handler ─────────────────────────────────────────────────

export async function GET() {
  try {
    // ── 1. Read all factory project states + enrichments ─────────
    const projectDirs = await readdir(FACTORY).catch(() => []);
    const projects: (ProjectState & {
      distribution?: DistributionState;
      kpis?: KPIState;
      seo?: SEOLearnings;
    })[] = [];

    for (const dir of projectDirs) {
      const dirPath = join(FACTORY, dir);
      try {
        const info = await stat(dirPath);
        if (!info.isDirectory()) continue;
        const stateRaw = await readFile(join(dirPath, "state.json"), "utf-8");
        const state: ProjectState = JSON.parse(stateRaw);

        const distribution = await readJson<DistributionState | null>(join(dirPath, "distribution-state.json"), null);
        const kpis = await readJson<KPIState | null>(join(dirPath, "kpis.json"), null);
        const seo = await readJson<SEOLearnings | null>(join(dirPath, "seo-learnings.json"), null);

        projects.push({ ...state, distribution: distribution ?? undefined, kpis: kpis ?? undefined, seo: seo ?? undefined });
      } catch { /* skip non-project dirs */ }
    }

    // ── 2. Read idea queue ──────────────────────────────────────
    const ideaQueue = await readJson<{
      queue: { slug: string; title: string; status: string; score: number; tagline?: string; source?: string }[];
      shipped: unknown[];
      rejected: unknown[];
      parked?: unknown[];
    }>(join(FACTORY, "idea-queue.json"), { queue: [], shipped: [], rejected: [] });

    // ── 3. Read recent pulses (last 3 days) ─────────────────────
    const allPulses: PulseEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      try {
        const raw = await readFile(join(PULSES_DIR, `${date}.jsonl`), "utf-8");
        const parsed = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        allPulses.push(...parsed);
      } catch { /* no pulses */ }
    }
    const recentPulses = allPulses
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);

    // ── 4. Fetch growth-ops backend stats (with fallback) ───────
    const [healthData, statsData, queueData, radarData, engData] = await Promise.all([
      fetchGrowth("/api/health"),
      fetchGrowth("/api/stats"),
      fetchGrowth("/api/queue/stats"),
      fetchGrowth("/api/radar/stats"),
      fetchGrowth("/api/engagement/stats"),
    ]);

    const growthOpsOnline = !!(healthData && (healthData as Record<string, unknown>).status === "ok");
    const stats = statsData as { discoveries?: number; contentGenerated?: number; postsPublished?: number } | null;
    const queueStats = queueData as { queued?: number; approved?: number; rejected?: number; posted?: number } | null;
    const radarStats = radarData as { active_signals?: number; hot?: number; warm?: number; emerging?: number; new_this_week?: number } | null;
    const engStats = engData as { stats?: { total_engagements?: number; pending_comments?: number } } | null;

    // ── 5. Build pipeline stages ────────────────────────────────

    // Discovery
    const discovery = {
      totalSignals: stats?.discoveries ?? 0,
      newThisWeek: radarStats?.new_this_week ?? 0,
      hot: radarStats?.hot ?? 0,
      warm: radarStats?.warm ?? 0,
      emerging: radarStats?.emerging ?? 0,
      activeSignals: radarStats?.active_signals ?? 0,
      status: growthOpsOnline ? (radarStats?.active_signals ? "active" as const : "idle" as const) : "offline" as const,
    };

    // Ideation
    const proposed = ideaQueue.queue.filter((i) => i.status === "proposed").length;
    const refined = ideaQueue.queue.filter((i) => i.status === "refined").length;
    const qualified = ideaQueue.queue.filter((i) => i.status === "qualified").length;
    const ideation = {
      proposed,
      refined,
      qualified,
      total: ideaQueue.queue.length,
      shipped: ideaQueue.shipped.length,
      rejected: ideaQueue.rejected.length,
      parked: (ideaQueue.parked as unknown[] ?? []).length,
      status: ideaQueue.queue.length > 0 ? "active" as const : "idle" as const,
    };

    // Content
    const content = {
      queued: queueStats?.queued ?? 0,
      approved: queueStats?.approved ?? 0,
      posted: queueStats?.posted ?? 0,
      rejected: queueStats?.rejected ?? 0,
      totalEngagements: engStats?.stats?.total_engagements ?? 0,
      pendingComments: engStats?.stats?.pending_comments ?? 0,
      status: growthOpsOnline ? "active" as const : "offline" as const,
    };

    // Distribution (per-app)
    const distributionApps = projects
      .filter((p) => p.distribution)
      .map((p) => {
        const d = p.distribution!;
        const layers = Object.entries(d.layers).map(([name, layer]) => ({
          name,
          status: layer.status,
          lastRun: layer.last_run,
          runs: layer.runs,
          result: layer.last_result,
          blocking: layer.blocking_items ?? [],
        }));

        const activeLayers = layers.filter((l) => l.status === "complete" || l.status === "active").length;
        const failedLayers = layers.filter((l) => l.status === "failed").length;

        return {
          slug: p.slug,
          engineStatus: d.engine_status,
          layers,
          activeLayers,
          failedLayers,
          reddit: {
            karma: p.kpis?.reddit?.latest_karma ?? 0,
            comments: p.kpis?.reddit?.posted_comments ?? 0,
            subreddits: Object.keys(p.kpis?.reddit?.subreddits ?? {}),
          },
          seo: {
            blogs: p.seo?.blog_posts?.length ?? 0,
            faqEntries: p.seo?.faq_entries ?? 0,
            programmaticPages: p.seo?.programmatic_pages ?? 0,
            indexedPages: p.seo?.total_indexed_pages ?? 0,
          },
          tiktok: {
            drafted: (d.layers.social as LayerState)?.tiktok_posts_drafted ?? 0,
          },
          waitlist: {
            signups: p.kpis?.waitlist?.signup_count ?? 0,
            url: p.kpis?.waitlist?.landing_page_url ?? null,
          },
          updatedAt: d.updated_at,
        };
      });

    const distribution = {
      apps: distributionApps,
      totalActiveLayers: distributionApps.reduce((sum, a) => sum + a.activeLayers, 0),
      totalFailedLayers: distributionApps.reduce((sum, a) => sum + a.failedLayers, 0),
      status: distributionApps.length > 0 ? "active" as const : "idle" as const,
    };

    // Feedback
    const allSignals: { slug: string; signals: string[] }[] = [];
    let totalBlogs = 0;
    let lastIngest: string | null = null;
    for (const p of projects) {
      if (p.kpis?.signals?.length) {
        allSignals.push({ slug: p.slug, signals: p.kpis.signals });
      }
      if (p.kpis?.last_ingested) {
        if (!lastIngest || p.kpis.last_ingested > lastIngest) {
          lastIngest = p.kpis.last_ingested;
        }
      }
      totalBlogs += p.seo?.blog_posts?.length ?? 0;
    }
    const feedback = {
      lastIngest,
      activeSignals: allSignals,
      totalBlogPosts: totalBlogs,
      totalFaqEntries: projects.reduce((s, p) => s + (p.seo?.faq_entries ?? 0), 0),
      totalIndexedPages: projects.reduce((s, p) => s + (p.seo?.total_indexed_pages ?? 0), 0),
      status: lastIngest ? "active" as const : "idle" as const,
    };

    // ── 6. Build factory summary ────────────────────────────────
    const PHASE_ORDER = ["research", "validation", "build", "quality_gate", "monetization", "packaging", "shipping", "marketing", "promo"];
    const TERMINAL_STATUSES = ["shipped", "submitted", "rejected", "paused"];
    const factoryProjects = projects.map((p) => {
      const completedPhases = PHASE_ORDER.filter((ph) => p.phases[ph]?.status === "complete").length;
      const isTerminal = TERMINAL_STATUSES.includes(p.status);
      const phaseIdx = isTerminal
        ? -1
        : PHASE_ORDER.findIndex((ph) => p.phases[ph]?.status !== "complete");
      return {
        slug: p.slug,
        status: p.status,
        phase: phaseIdx,
        completedPhases,
        totalPhases: PHASE_ORDER.length,
        qualityScore: p.phases.quality_gate?.score ?? null,
        qualityAttempt: p.phases.quality_gate?.attempt ?? 0,
      };
    });

    const building = projects.filter((p) =>
      ["research", "validation", "build", "quality-gate", "monetization", "packaging"].includes(p.status)
    ).length;
    const shipping = projects.filter((p) => p.status === "shipping" || p.status === "awaiting-approval").length;
    const shipped = projects.filter((p) => p.status === "shipped" || p.status === "submitted").length;
    const attention = projects.filter((p) =>
      p.status === "needs-review" || p.status === "awaiting-approval" || (p.phases.quality_gate?.attempt ?? 0) >= 2
    ).length;

    // ── 7. Build attention items ────────────────────────────────
    const attentionItems: { type: string; slug?: string; message: string; severity: "error" | "warning" | "info" }[] = [];

    // Factory attention
    for (const p of projects) {
      if (p.status === "awaiting-approval") {
        attentionItems.push({ type: "approval", slug: p.slug, message: `${p.slug} awaiting your approval`, severity: "warning" });
      }
      if (p.status === "needs-review") {
        attentionItems.push({ type: "review", slug: p.slug, message: `${p.slug} needs manual review`, severity: "error" });
      }
      if ((p.phases.quality_gate?.attempt ?? 0) >= 2) {
        attentionItems.push({ type: "qg-retry", slug: p.slug, message: `${p.slug} quality gate attempt ${p.phases.quality_gate?.attempt}`, severity: "warning" });
      }
    }

    // Distribution attention
    for (const app of distributionApps) {
      for (const layer of app.layers) {
        if (layer.status === "failed") {
          attentionItems.push({ type: "dist-fail", slug: app.slug, message: `${app.slug}: ${layer.name} layer failed`, severity: "error" });
        }
        for (const block of layer.blocking) {
          attentionItems.push({ type: "blocking", slug: app.slug, message: block, severity: "info" });
        }
      }
    }

    // Content attention
    if ((queueStats?.queued ?? 0) >= 5) {
      attentionItems.push({ type: "queue-backlog", message: `${queueStats!.queued} items waiting in content queue`, severity: "warning" });
    }

    // KPI signals
    for (const s of allSignals) {
      for (const sig of s.signals) {
        attentionItems.push({ type: "kpi-signal", slug: s.slug, message: `${s.slug}: ${sig}`, severity: "warning" });
      }
    }

    // Backend offline
    if (!growthOpsOnline) {
      attentionItems.push({ type: "backend-offline", message: "Growth-Ops backend (:3002) is offline", severity: "error" });
    }

    // ── 8. Compute temperature ──────────────────────────────────
    const velocity = stats ? Math.min((stats.postsPublished ?? 0) / Math.max(stats.contentGenerated ?? 1, 1) * 100, 100) : 0;
    const freshness = radarStats ? Math.min((radarStats.new_this_week ?? 0) / Math.max(radarStats.active_signals ?? 1, 1) * 100, 100) : 0;
    const throughput = queueStats ? Math.max(0, 100 - (queueStats.queued ?? 0) * 15) : 50;
    const engagement = (engStats?.stats?.total_engagements ?? 0) > 0 ? 80 : 0;
    const distHealth = distributionApps.length > 0 ? (distribution.totalActiveLayers / Math.max(distributionApps.length * 6, 1)) * 100 : 0;
    const temperature = Math.round(velocity * 0.25 + freshness * 0.2 + throughput * 0.15 + engagement * 0.15 + distHealth * 0.15 + (ideation.qualified > 0 ? 10 : 0));

    // ── 9. Return ───────────────────────────────────────────────
    return NextResponse.json({
      pipeline: { discovery, ideation, content, distribution, feedback },
      factory: { building, shipping, shipped, attention, projects: factoryProjects },
      attention: attentionItems,
      activity: recentPulses.map((p) => ({
        agent: p.agent,
        action: p.action,
        goal: p.goal,
        outcome: p.outcome,
        timestamp: p.timestamp,
        duration_ms: p.duration_ms,
        model: p.model ?? "unknown",
      })),
      temperature,
      growthOpsOnline,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
