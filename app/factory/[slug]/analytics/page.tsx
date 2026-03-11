"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/app/components/Card";
import { ProgressBar } from "@/app/components/ProgressBar";
import { Badge } from "@/app/components/Badge";

// ─── Types ───────────────────────────────────────────────────────────

interface WaitlistEntry {
  email: string;
  source: string;
  created_at: string;
}

interface KPISnapshot {
  week: string;
  date: string;
  traffic: { impressions: number; page_views: number; downloads: number };
  users: { dau: number; wau: number; mau: number; d1_retention: number | null; d7_retention: number | null; d30_retention: number | null };
  revenue: { trial_starts: number; trial_to_paid: number | null; mrr: number; arpu: number };
  churn: { active_subs: number; cancellations: number; churn_rate: number | null; refund_rate: number | null };
}

interface AnalyticsData {
  slug: string;
  status: string;
  waitlist: {
    count: number;
    target: number;
    recentSignups: WaitlistEntry[];
    sourceCounts: Record<string, number>;
  };
  kpis: {
    snapshots: KPISnapshot[];
    latest: KPISnapshot | null;
    shipDate: string | null;
    signals: string[];
  };
  revenueCat: {
    mrr: number;
    activeSubscriptions: number;
    trialsStarted: number;
    trialConversion: number | null;
    churnRate: number | null;
  };
  appStore: {
    impressions: number;
    pageViews: number;
    downloads: number;
    conversionRate: number | null;
  };
  landingTraffic: {
    visitors: number;
    pageViews: number;
    bounceRate: number;
    topPages: { key: string; total: number }[];
    source: "vercel-analytics" | "factory-kpi";
  };
  seo: {
    blogPosts: number;
    faqEntries: number;
    programmaticPages: number;
    totalIndexedPages: number;
    latestPost: { slug: string; primary_keyword: string; published_at: string } | null;
    initializedAt: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}@${domain}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function fmtCurrency(val: number): string {
  if (val === 0) return "$0";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return "--";
  return `${val.toFixed(1)}%`;
}

function fmtNum(val: number): string {
  if (val === 0) return "--";
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toString();
}

// ─── Page Component ──────────────────────────────────────────────────

export default function ProductAnalyticsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/product-analytics?slug=${slug}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const productName = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // ─── Loading Skeleton ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="h-4 w-24 bg-warm rounded animate-pulse mb-3" />
          <div className="h-8 w-64 bg-warm rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="h-3 w-20 bg-warm rounded animate-pulse mb-3" />
              <div className="h-8 w-16 bg-warm rounded animate-pulse" />
            </Card>
          ))}
        </div>
        <Card className="mb-6">
          <div className="h-3 w-32 bg-warm rounded animate-pulse mb-4" />
          <div className="h-16 bg-warm rounded animate-pulse" />
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card><div className="h-32 bg-warm rounded animate-pulse" /></Card>
          <Card><div className="h-32 bg-warm rounded animate-pulse" /></Card>
        </div>
        <Card>
          <div className="h-3 w-32 bg-warm rounded animate-pulse mb-4" />
          <div className="h-24 bg-warm rounded animate-pulse" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link href="/factory" className="label-caps text-mid/80 hover:text-charcoal transition-colors">
          &larr; Factory
        </Link>
        <h1 className="text-3xl mt-3 mb-6">{productName} Analytics</h1>
        <Card>
          <p className="text-sm text-terracotta">
            {error || "Failed to load analytics data"}
          </p>
        </Card>
      </div>
    );
  }

  // ─── Derived Metrics ─────────────────────────────────────────────

  const { waitlist, revenueCat, appStore, kpis, seo, landingTraffic } = data;
  const latest = kpis.latest;

  // Funnel numbers — prefer Vercel Analytics (live landing page traffic)
  const funnelLanding = landingTraffic?.visitors || landingTraffic?.pageViews || latest?.traffic?.page_views || 0;
  const funnelWaitlist = waitlist.count;
  const funnelDownloads = appStore.downloads;
  const funnelTrials = revenueCat.trialsStarted;
  const funnelPaid = revenueCat.activeSubscriptions;

  const funnelStages = [
    { label: "Landing", value: funnelLanding, color: "#6B8F71" },   // forest green
    { label: "Waitlist", value: funnelWaitlist, color: "#D4915E" },  // amber/copper
    { label: "Download", value: funnelDownloads, color: "#C0534F" }, // brick red
    { label: "Trial", value: funnelTrials, color: "#7B6FA6" },      // deep lilac
    { label: "Paid", value: funnelPaid, color: "#2D7D5F" },         // emerald
  ];

  // Compute conversion rates between stages
  const funnelRates: (number | null)[] = [];
  for (let i = 1; i < funnelStages.length; i++) {
    const prev = funnelStages[i - 1].value;
    const curr = funnelStages[i].value;
    if (prev > 0 && curr > 0) {
      funnelRates.push(Math.round((curr / prev) * 10000) / 100);
    } else {
      funnelRates.push(null);
    }
  }

  // Max funnel value for bar scaling
  const maxFunnel = Math.max(...funnelStages.map((s) => s.value), 1);

  // Traffic source entries from waitlist
  const sourceEntries = Object.entries(waitlist.sourceCounts).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <div className="mb-8">
        <Link
          href="/factory"
          className="label-caps text-mid/80 hover:text-charcoal transition-colors inline-flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Factory
        </Link>
        <div className="flex items-center gap-3 mt-3">
          <h1 className="text-3xl capitalize">{productName}</h1>
          <Badge color={data.status === "shipped" ? "var(--olive)" : "var(--lilac)"}>
            {data.status.replace(/-/g, " ")}
          </Badge>
        </div>
        <p className="label-caps text-mid/70 mt-1">Product Analytics</p>
      </div>

      {/* ═══ KPI CARDS ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Landing Visitors */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-2">Landing Visitors</p>
          <p
            className="text-2xl tabular-nums"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--terracotta)" }}
          >
            {funnelLanding > 0 ? fmtNum(funnelLanding) : "--"}
          </p>
          {landingTraffic?.pageViews > 0 ? (
            <p className="text-[0.8rem] text-mid/70 mt-1 tabular-nums">
              {fmtNum(landingTraffic.pageViews)} views · {landingTraffic.bounceRate > 0 ? `${Math.round(landingTraffic.bounceRate)}% bounce` : ""}
            </p>
          ) : latest?.traffic?.impressions ? (
            <p className="text-[0.8rem] text-mid/70 mt-1 tabular-nums">
              {fmtNum(latest.traffic.impressions)} impressions
            </p>
          ) : null}
          <p className="text-[0.65rem] text-mid/50 mt-1">
            {landingTraffic?.source === "vercel-analytics" ? "7d · Vercel Analytics" : "factory KPI"}
          </p>
        </Card>

        {/* Downloads */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-2">Downloads</p>
          <p
            className="text-2xl tabular-nums"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--terracotta)" }}
          >
            {funnelDownloads > 0 ? fmtNum(funnelDownloads) : "--"}
          </p>
          {appStore.conversionRate !== null ? (
            <p className="text-[0.8rem] text-mid/70 mt-1 tabular-nums">
              {appStore.conversionRate}% conversion
            </p>
          ) : null}
        </Card>

        {/* MRR */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-2">MRR</p>
          <p
            className="text-2xl tabular-nums"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--terracotta)" }}
          >
            {revenueCat.mrr > 0 ? fmtCurrency(revenueCat.mrr) : "--"}
          </p>
          {revenueCat.activeSubscriptions > 0 ? (
            <p className="text-[0.8rem] text-mid/70 mt-1 tabular-nums">
              {revenueCat.activeSubscriptions} active sub{revenueCat.activeSubscriptions !== 1 ? "s" : ""}
            </p>
          ) : null}
        </Card>

        {/* Waitlist */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-2">Waitlist</p>
          <div className="flex items-baseline gap-1.5">
            <p
              className="text-2xl tabular-nums"
              style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--terracotta)" }}
            >
              {waitlist.count}
            </p>
            <span className="text-[0.8rem] text-mid/60 tabular-nums">
              / {waitlist.target}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar done={waitlist.count} total={waitlist.target} color="var(--terracotta)" />
          </div>
        </Card>
      </div>

      {/* ═══ FUNNEL ═══════════════════════════════════════════════════ */}
      <Card className="mb-6">
        <p className="label-caps text-[0.75rem] mb-5">Conversion Funnel</p>
        <div className="flex items-end gap-1">
          {funnelStages.map((stage, i) => {
            const barHeight = maxFunnel > 0 ? Math.max((stage.value / maxFunnel) * 100, 4) : 4;
            const hasValue = stage.value > 0;

            return (
              <div key={stage.label} className="flex-1 flex flex-col items-center">
                {/* Arrow + conversion rate */}
                {i > 0 && (
                  <div className="w-full flex items-center justify-center mb-2">
                    <div className="flex flex-col items-center">
                      {funnelRates[i - 1] !== null ? (
                        <span className="text-[0.75rem] tabular-nums text-olive font-medium">
                          {funnelRates[i - 1]}%
                        </span>
                      ) : (
                        <span className="text-[0.75rem] text-mid/55">--</span>
                      )}
                    </div>
                  </div>
                )}
                {i === 0 && <div className="mb-2 h-[0.85rem]" />}

                {/* Value */}
                <p className="text-xs tabular-nums mb-1.5" style={{ color: hasValue ? "var(--charcoal)" : "var(--mid)" }}>
                  {hasValue ? fmtNum(stage.value) : "--"}
                </p>

                {/* Bar */}
                <div
                  className="w-full rounded-t transition-all duration-700 ease-out"
                  style={{
                    height: `${barHeight}px`,
                    minHeight: "4px",
                    maxHeight: "80px",
                    backgroundColor: stage.color,
                    opacity: hasValue ? 1 : 0.15,
                  }}
                />

                {/* Label */}
                <p className="label-caps text-[0.7rem] mt-2 text-center">{stage.label}</p>
              </div>
            );
          })}
        </div>

        {/* Connector arrows between bars */}
        <div className="flex items-center mt-1 px-4">
          {funnelStages.slice(0, -1).map((_, i) => (
            <div key={i} className="flex-1 flex justify-center">
              <svg width="16" height="8" viewBox="0 0 16 8" fill="none" className="text-mid/20">
                <path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      </Card>

      {/* ═══ TWO-COLUMN GRID ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Revenue Card */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-4">Revenue</p>
          <div className="space-y-3">
            <MetricRow label="MRR" value={fmtCurrency(revenueCat.mrr)} />
            <MetricRow label="Active Subscriptions" value={revenueCat.activeSubscriptions.toString()} />
            <MetricRow label="Trials Started" value={revenueCat.trialsStarted.toString()} />
            <MetricRow
              label="Trial to Paid"
              value={fmtPct(revenueCat.trialConversion)}
              color={revenueCat.trialConversion !== null && revenueCat.trialConversion > 50 ? "var(--olive)" : undefined}
            />
            <MetricRow
              label="Churn Rate"
              value={fmtPct(revenueCat.churnRate)}
              color={revenueCat.churnRate !== null && revenueCat.churnRate > 5 ? "var(--terracotta)" : undefined}
            />
          </div>
          <p className="text-[0.7rem] text-mid/55 mt-4 pt-3 border-t border-warm/50">
            Source: RevenueCat (placeholder until API wired)
          </p>
        </Card>

        {/* Top Pages (from Vercel Analytics) */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-4">Top Pages</p>
          {landingTraffic?.topPages?.length > 0 ? (
            <div className="space-y-2.5">
              {landingTraffic.topPages.map((page) => {
                const maxViews = landingTraffic.topPages[0]?.total || 1;
                const pct = Math.round((page.total / maxViews) * 100);
                return (
                  <div key={page.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-charcoal truncate max-w-[70%]">{page.key}</span>
                      <span className="text-[0.8rem] text-mid tabular-nums">{page.total}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-warm overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${pct}%`, backgroundColor: "var(--olive)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-mid/60">No page view data yet</p>
            </div>
          )}
          <p className="text-[0.7rem] text-mid/55 mt-4 pt-3 border-t border-warm/50">
            7d · Vercel Web Analytics
          </p>
        </Card>

        {/* Traffic Sources Card */}
        <Card>
          <p className="label-caps text-[0.75rem] mb-4">Traffic Sources</p>
          {sourceEntries.length > 0 ? (
            <div className="space-y-2.5">
              {sourceEntries.map(([source, count]) => {
                const pct = waitlist.count > 0 ? Math.round((count / waitlist.count) * 100) : 0;
                return (
                  <div key={source}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-charcoal capitalize">{source}</span>
                      <span className="text-[0.8rem] text-mid tabular-nums">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-warm overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: "var(--lilac)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-mid/60">No source data yet</p>
            </div>
          )}
          <p className="text-[0.7rem] text-mid/55 mt-4 pt-3 border-t border-warm/50">
            Based on recent waitlist signups
          </p>
        </Card>
      </div>

      {/* ═══ SEO CONTENT ══════════════════════════════════════════════ */}
      {seo?.initializedAt && (
        <Card className="mb-6">
          <p className="label-caps text-[0.75rem] mb-4">SEO Content</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[0.8rem] text-mid/80 mb-1">Blog Posts</p>
              <p
                className="text-xl tabular-nums"
                style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--olive)" }}
              >
                {seo.blogPosts}
              </p>
            </div>
            <div>
              <p className="text-[0.8rem] text-mid/80 mb-1">FAQ Entries</p>
              <p
                className="text-xl tabular-nums"
                style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--olive)" }}
              >
                {seo.faqEntries}
              </p>
            </div>
            <div>
              <p className="text-[0.8rem] text-mid/80 mb-1">Programmatic</p>
              <p
                className="text-xl tabular-nums"
                style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--olive)" }}
              >
                {seo.programmaticPages}
              </p>
            </div>
            <div>
              <p className="text-[0.8rem] text-mid/80 mb-1">Total Indexed</p>
              <p
                className="text-xl tabular-nums"
                style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 300, color: "var(--olive)" }}
              >
                {seo.totalIndexedPages || seo.blogPosts + seo.faqEntries + seo.programmaticPages + 1}
              </p>
            </div>
          </div>
          {seo.latestPost && (
            <div className="pt-3 border-t border-warm/50">
              <p className="text-[0.8rem] text-mid/70 mb-1">Latest Post</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-charcoal">{seo.latestPost.primary_keyword}</span>
                <span className="text-[0.75rem] text-mid/60 tabular-nums">{timeAgo(seo.latestPost.published_at)}</span>
              </div>
            </div>
          )}
          <p className="text-[0.7rem] text-mid/55 mt-3 pt-3 border-t border-warm/50">
            Source: seo-learnings.json — generated twice weekly by Vibe
          </p>
        </Card>
      )}

      {/* ═══ RECENT SIGNUPS ═══════════════════════════════════════════ */}
      <Card>
        <p className="label-caps text-[0.75rem] mb-4">Recent Signups</p>
        {waitlist.recentSignups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm">
                  <th className="text-left label-caps text-[0.7rem] pb-2 pr-4">Email</th>
                  <th className="text-left label-caps text-[0.7rem] pb-2 pr-4">Source</th>
                  <th className="text-right label-caps text-[0.7rem] pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.recentSignups.map((signup, i) => (
                  <tr key={i} className="border-b border-warm/40 last:border-0">
                    <td className="py-2.5 pr-4 text-charcoal tabular-nums">
                      {maskEmail(signup.email)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge color="var(--lilac)">{signup.source || "direct"}</Badge>
                    </td>
                    <td className="py-2.5 text-right text-mid/80 tabular-nums">
                      {timeAgo(signup.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-mid/60">No signups yet</p>
          </div>
        )}
      </Card>

      {/* ═══ KPI SIGNALS ══════════════════════════════════════════════ */}
      {kpis.signals.length > 0 && (
        <Card className="mt-6">
          <p className="label-caps text-[0.75rem] mb-3">Active Signals</p>
          <div className="flex flex-wrap gap-2">
            {kpis.signals.map((signal, i) => (
              <Badge key={i} color="var(--amber)">{signal}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Footer */}
      <p className="text-[0.7rem] text-mid/50 text-center mt-8 mb-4">
        Auto-refreshes every 60s
      </p>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-mid">{label}</span>
      <span
        className="text-sm tabular-nums font-medium"
        style={{ color: color ?? "var(--charcoal)" }}
      >
        {value}
      </span>
    </div>
  );
}
