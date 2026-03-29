"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { relTime } from "../../lib/agents";

// ── Types ──────────────────────────────────────────────────────────────

interface PhaseState {
  status: string;
  score?: number;
  completed_at?: string;
  attempt?: number;
}

interface FleetDetail {
  overview: {
    slug: string;
    name: string;
    track: string;
    status: string;
    productType: string;
    createdAt: string;
    updatedAt: string;
    failureReason: string | null;
    phases: Record<string, PhaseState>;
  };
  analytics: {
    shipDate: string | null;
    lastIngested: string | null;
    appStore: {
      status?: string;
      downloads_30d?: number;
      impressions_30d?: number | null;
      last_updated?: string;
    } | null;
    revenue: {
      status?: string;
      mrr?: number | null;
      active_subs?: number | null;
      churn_rate?: number | null;
      trial_starts?: number | null;
      trial_to_paid_rate?: number | null;
    } | null;
    retention: {
      status?: string;
      dau?: number | null;
      wau?: number | null;
      mau?: number | null;
      d1?: number | null;
      d7?: number | null;
      d30?: number | null;
    } | null;
    waitlist: {
      signup_count?: number;
      landing_page_url?: string;
    } | null;
    signals: { type: string; severity: string; message: string }[];
    signalsLastEvaluated: string | null;
  } | null;
  distribution: {
    reddit: {
      total_comments?: number;
      posted_comments?: number;
      dry_run_comments?: number;
      subreddits?: Record<string, number>;
      latest_karma?: number;
      last_updated?: string;
    } | null;
    seo: {
      blogPosts: number;
      faqEntries: number;
      programmaticPages: number;
      totalIndexedPages: number;
    } | null;
    engine: Record<string, unknown> | null;
    landingUrl: string | null;
  };
  health: {
    qualityGate: { score: number | null; verdict: string | null };
    codeReview: { verdict: string | null; criticalIssues: number; highIssues: number };
    e2e: { status: string; tests: number; passed: number; failed?: number } | null;
    screenshotCount: number;
  };
  marketing: {
    reddit: Record<string, unknown> | null;
    seo: Record<string, unknown> | null;
    waitlist: Record<string, unknown> | null;
    hasAppStoreListing: boolean;
  };
}

// ── Brand accents ──────────────────────────────────────────────────────

const APP_ACCENT: Record<string, string> = {
  safebite: "#0D9488",
  "app-request-do-you-use-to-track-your-cro": "#FF6B35",
  "the-worst-part-about-a-gluten-allergy-is": "#2A6E50",
  sync: "#13ec6d",
  "verto-studios-landing": "#BC6143",
};

// ── Tabs ───────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "analytics", label: "Analytics" },
  { key: "distribution", label: "Distribution" },
  { key: "health", label: "Health" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  shipped: "var(--olive)",
  submitted: "var(--lilac)",
  waiting_for_review: "var(--amber)",
  rejected: "var(--terracotta)",
};

function fmt(v: number | null | undefined, prefix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${prefix}${v}`;
}

function dateStr(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("da-DK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Europe/Copenhagen",
  });
}

function verdictColor(v: string | null): string {
  if (v === "PASS") return "var(--olive)";
  if (v === "FAIL") return "var(--terracotta)";
  return "var(--mid)";
}

// ── App Icon ───────────────────────────────────────────────────────────

function AppIcon({ slug, name, size, accent }: { slug: string; name: string; size: number; accent: string }) {
  const [ok, setOk] = useState(true);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: `0 4px 20px ${accent}25, 0 2px 6px rgba(0,0,0,0.08)`,
      }}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/fleet/icon/${slug}`}
          alt={name}
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "cover", display: "block" }}
          onError={() => setOk(false)}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            background: `linear-gradient(135deg, ${accent}25, ${accent}50)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: size * 0.4,
            fontWeight: 600,
            color: accent,
          }}
        >
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize: 10,
        color: "var(--mid)",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        margin: "0 0 14px",
        opacity: 0.8,
      }}
    >
      {children}
    </p>
  );
}

function MetricBox({ label, value, color, pending }: { label: string; value: string; color?: string; pending?: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 4px", background: "var(--bg)", borderRadius: 10 }}>
      <div
        style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: 22,
          fontWeight: 400,
          color: color ?? "var(--charcoal)",
          lineHeight: 1.2,
          opacity: pending ? 0.35 : 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 8,
          fontFamily: "var(--font-dm-mono), monospace",
          color: "var(--mid)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: 3,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
      <span style={{ fontSize: 11, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", minWidth: 100, opacity: 0.8 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontFamily: "var(--font-dm-mono), monospace", color: "var(--charcoal)" }}>
        {children}
      </span>
    </div>
  );
}

function PendingNote({ text }: { text: string }) {
  return (
    <p style={{ marginTop: 10, fontSize: 11, color: "var(--mid)", fontFamily: "var(--font-dm-mono), monospace", opacity: 0.6, fontStyle: "italic" }}>
      {text}
    </p>
  );
}

// ── Tab Content ────────────────────────────────────────────────────────

function OverviewTab({ data, accent }: { data: FleetDetail; accent: string }) {
  const { overview } = data;
  const phases = Object.entries(overview.phases);
  const completedCount = phases.filter(([, p]) => p.status === "complete").length;
  const statusColor = STATUS_DOT[overview.status] ?? "var(--mid)";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Product info */}
      <Card>
        <SectionLabel>Product Details</SectionLabel>
        <InfoRow label="Status"><Badge color={statusColor}>{overview.status}</Badge></InfoRow>
        <InfoRow label="Track">{overview.track}</InfoRow>
        <InfoRow label="Type">{overview.productType ?? "—"}</InfoRow>
        <InfoRow label="Created">{dateStr(overview.createdAt)}</InfoRow>
        <InfoRow label="Shipped">{dateStr(data.analytics?.shipDate ?? null)}</InfoRow>
        <InfoRow label="Updated">{dateStr(overview.updatedAt)}</InfoRow>
        {overview.failureReason && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--terracotta-soft)", borderRadius: 8, fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--terracotta)" }}>
            {overview.failureReason}
          </div>
        )}
      </Card>

      {/* Phase timeline */}
      <Card>
        <SectionLabel>Pipeline ({completedCount}/{phases.length} complete)</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {phases.map(([name, phase]) => {
            const isComplete = phase.status === "complete";
            const isFailed = phase.status === "failed";
            const dotColor = isComplete ? accent : isFailed ? "var(--terracotta)" : "var(--warm)";
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: dotColor,
                    flexShrink: 0,
                    boxShadow: isComplete ? `0 0 6px ${accent}40` : "none",
                  }}
                />
                <span style={{ fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: isComplete ? "var(--charcoal)" : "var(--mid)", minWidth: 100, opacity: isComplete ? 1 : 0.6 }}>
                  {name.replace("_", " ")}
                </span>
                <span style={{ fontSize: 10, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", opacity: 0.5 }}>
                  {phase.completed_at ? relTime(phase.completed_at) : phase.status !== "complete" ? phase.status : ""}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Signals — full width */}
      {data.analytics && data.analytics.signals.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Card>
            <SectionLabel>Active Signals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.analytics.signals.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: s.severity === "high" ? "var(--terracotta-soft)" : "var(--amber-soft)", borderRadius: 8 }}>
                  <Badge color={s.severity === "high" ? "var(--terracotta)" : "var(--amber)"}>{s.severity}</Badge>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--charcoal)" }}>{s.message}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({ data, accent }: { data: FleetDetail; accent: string }) {
  const a = data.analytics;
  if (!a) return <Card><PendingNote text="No analytics data available yet." /></Card>;

  const revPending = a.revenue?.status === "pending";
  const retPending = a.retention?.status === "pending";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* App Store */}
      <Card>
        <SectionLabel>App Store</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <MetricBox label="Status" value={a.appStore?.status ?? "—"} color={a.appStore?.status === "live" ? accent : "var(--mid)"} />
          <MetricBox label="Downloads" value={fmt(a.appStore?.downloads_30d)} />
          <MetricBox label="Impressions" value={fmt(a.appStore?.impressions_30d)} />
          <MetricBox label="Last sync" value={a.appStore?.last_updated ? relTime(a.appStore.last_updated) : "—"} />
        </div>
      </Card>

      {/* Revenue */}
      <Card>
        <SectionLabel>Revenue</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <MetricBox label="MRR" value={fmt(a.revenue?.mrr, "$")} color={accent} pending={revPending} />
          <MetricBox label="Active Subs" value={fmt(a.revenue?.active_subs)} pending={revPending} />
          <MetricBox label="Trial Starts" value={fmt(a.revenue?.trial_starts)} pending={revPending} />
          <MetricBox label="Churn" value={a.revenue?.churn_rate != null ? `${a.revenue.churn_rate}%` : "—"} pending={revPending} />
        </div>
        {revPending && <PendingNote text="Revenue data pending — RevenueCat API not yet configured" />}
      </Card>

      {/* Retention */}
      <Card>
        <SectionLabel>Retention</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <MetricBox label="DAU" value={fmt(a.retention?.dau)} pending={retPending} />
          <MetricBox label="WAU" value={fmt(a.retention?.wau)} pending={retPending} />
          <MetricBox label="MAU" value={fmt(a.retention?.mau)} pending={retPending} />
          <MetricBox label="D1" value={a.retention?.d1 != null ? `${a.retention.d1}%` : "—"} color={accent} pending={retPending} />
          <MetricBox label="D7" value={a.retention?.d7 != null ? `${a.retention.d7}%` : "—"} pending={retPending} />
          <MetricBox label="D30" value={a.retention?.d30 != null ? `${a.retention.d30}%` : "—"} pending={retPending} />
        </div>
        {retPending && <PendingNote text="Retention data pending — analytics not yet configured" />}
      </Card>

      {/* Waitlist */}
      {a.waitlist && a.waitlist.signup_count !== undefined && (
        <Card>
          <SectionLabel>Waitlist</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <MetricBox label="Signups" value={fmt(a.waitlist.signup_count)} color={accent} />
            <div style={{ display: "flex", alignItems: "center", padding: "0 12px" }}>
              {a.waitlist.landing_page_url && (
                <span style={{ fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", wordBreak: "break-all" }}>
                  {a.waitlist.landing_page_url}
                </span>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function DistributionTab({ data, accent }: { data: FleetDetail; accent: string }) {
  const d = data.distribution;
  const hasContent = d.reddit || d.seo || d.engine || d.landingUrl;

  if (!hasContent) return <Card><PendingNote text="No distribution data available yet." /></Card>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Reddit */}
      {d.reddit && (
        <Card>
          <SectionLabel>Reddit Outreach</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
            <MetricBox label="Comments" value={fmt(d.reddit.total_comments)} />
            <MetricBox label="Karma" value={fmt(d.reddit.latest_karma)} color={accent} />
          </div>
          {d.reddit.subreddits && Object.keys(d.reddit.subreddits).length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {Object.entries(d.reddit.subreddits)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([sub, count]) => (
                  <span key={sub} style={{ fontSize: 10, fontFamily: "var(--font-dm-mono), monospace", background: "var(--bg)", padding: "2px 7px", borderRadius: 5, color: "var(--charcoal)" }}>
                    r/{sub} <span style={{ color: "var(--mid)", opacity: 0.6 }}>{count}</span>
                  </span>
                ))}
            </div>
          )}
        </Card>
      )}

      {/* SEO */}
      {d.seo && (
        <Card>
          <SectionLabel>SEO Content</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <MetricBox label="Blog Posts" value={String(d.seo.blogPosts)} color={d.seo.blogPosts > 0 ? accent : undefined} />
            <MetricBox label="FAQ" value={String(d.seo.faqEntries)} />
            <MetricBox label="Programmatic" value={String(d.seo.programmaticPages)} />
            <MetricBox label="Indexed" value={String(d.seo.totalIndexedPages)} />
          </div>
        </Card>
      )}

      {/* Distribution Engine */}
      {d.engine && (
        <Card>
          <SectionLabel>Distribution Engine</SectionLabel>
          <InfoRow label="Status">{String((d.engine as Record<string, unknown>).engine_status ?? "—")}</InfoRow>
          {Array.isArray((d.engine as Record<string, unknown>).active_layers) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {((d.engine as Record<string, unknown>).active_layers as string[]).map((layer) => (
                <Badge key={layer} color={accent}>{layer}</Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Landing */}
      {d.landingUrl && (
        <Card>
          <SectionLabel>Landing Page</SectionLabel>
          <p style={{ fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--charcoal)", wordBreak: "break-all" }}>
            {d.landingUrl}
          </p>
        </Card>
      )}

      {/* Support link — always show */}
      <div style={{ gridColumn: "1 / -1" }}>
        <Card>
          <SectionLabel>Support</SectionLabel>
          <p style={{ fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)" }}>
            View support tickets in{" "}
            <Link href="/vera" style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 3 }}>Vera</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

function HealthTab({ data, accent }: { data: FleetDetail; accent: string }) {
  const h = data.health;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Quality Gate */}
      <Card>
        <SectionLabel>Quality Gate</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "8px 0" }}>
          {/* Score ring */}
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--warm)" strokeWidth="4" />
              {h.qualityGate.score !== null && (
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={h.qualityGate.score >= 80 ? accent : "var(--amber)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(h.qualityGate.score / 100) * 176} 176`}
                  transform="rotate(-90 32 32)"
                  className="gauge-arc"
                />
              )}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 18, fontWeight: 500, color: "var(--charcoal)" }}>
                {h.qualityGate.score !== null ? Math.round(h.qualityGate.score) : "—"}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-dm-mono), monospace", color: verdictColor(h.qualityGate.verdict), fontWeight: 600 }}>
              {h.qualityGate.verdict ?? "Pending"}
            </div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", marginTop: 2, opacity: 0.7 }}>
              Quality Gate
            </div>
          </div>
        </div>
      </Card>

      {/* Code Review */}
      <Card>
        <SectionLabel>Code Review</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: h.codeReview.verdict === "PASS" ? `${accent}15` : h.codeReview.verdict === "FAIL" ? "var(--terracotta-soft)" : "var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {h.codeReview.verdict === "PASS" ? "✓" : h.codeReview.verdict === "FAIL" ? "✗" : "?"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-dm-mono), monospace", color: verdictColor(h.codeReview.verdict), fontWeight: 600 }}>
              {h.codeReview.verdict ?? "Pending"}
            </div>
            {(h.codeReview.criticalIssues > 0 || h.codeReview.highIssues > 0) && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", marginTop: 2 }}>
                {h.codeReview.criticalIssues > 0 && <span style={{ color: "var(--terracotta)" }}>{h.codeReview.criticalIssues} critical</span>}
                {h.codeReview.criticalIssues > 0 && h.codeReview.highIssues > 0 && " · "}
                {h.codeReview.highIssues > 0 && <span style={{ color: "var(--amber)" }}>{h.codeReview.highIssues} high</span>}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* E2E Tests */}
      <Card>
        <SectionLabel>E2E Tests</SectionLabel>
        {h.e2e ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {Array.from({ length: h.e2e.tests }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 24,
                    borderRadius: 3,
                    backgroundColor: i < h.e2e!.passed ? accent : "var(--terracotta)",
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
            <div>
              <div style={{ fontSize: 14, fontFamily: "var(--font-dm-mono), monospace", color: h.e2e.status === "pass" ? accent : "var(--terracotta)", fontWeight: 600 }}>
                {h.e2e.passed}/{h.e2e.tests} passed
              </div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", marginTop: 2, opacity: 0.7 }}>
                {h.e2e.status.toUpperCase()}
              </div>
            </div>
          </div>
        ) : (
          <PendingNote text="No E2E test results available" />
        )}
      </Card>

      {/* Screenshots */}
      <Card>
        <SectionLabel>Assets</SectionLabel>
        <div style={{ display: "flex", gap: 16, padding: "8px 0" }}>
          <InfoRow label="Screenshots">{h.screenshotCount > 0 ? `${h.screenshotCount} captured` : "—"}</InfoRow>
        </div>
        <div style={{ marginTop: 8 }}>
          <InfoRow label="ASO Listing">
            {data.marketing.hasAppStoreListing ? (
              <span style={{ color: accent }}>Ready</span>
            ) : (
              <span style={{ color: "var(--mid)", opacity: 0.5 }}>Not created</span>
            )}
          </InfoRow>
        </div>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function FleetDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<FleetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const accent = APP_ACCENT[slug] ?? "#9899C1";

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/fleet/${slug}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
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
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="breathe" style={{ textAlign: "center", padding: 64, fontFamily: "var(--font-dm-mono), monospace", fontSize: 13, color: "var(--mid)" }}>
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "64px 0" }}>
        <p style={{ color: "var(--terracotta)", fontSize: 13, fontFamily: "var(--font-dm-mono), monospace" }}>{error ?? "Product not found"}</p>
        <Link href="/fleet" style={{ fontSize: 12, color: accent, fontFamily: "var(--font-dm-mono), monospace", marginTop: 12, display: "inline-block" }}>
          Back to Fleet
        </Link>
      </div>
    );
  }

  const statusColor = STATUS_DOT[data.overview.status] ?? "var(--mid)";

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <Link href="/fleet" style={{ fontSize: 11, fontFamily: "var(--font-dm-mono), monospace", color: "var(--mid)", textDecoration: "none", opacity: 0.7 }}>
        Fleet
      </Link>

      {/* Hero */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginTop: 12,
          marginBottom: 28,
          padding: "20px 24px",
          background: `linear-gradient(135deg, var(--paper), ${accent}06)`,
          borderRadius: 16,
          border: "1px solid var(--warm)",
        }}
      >
        <AppIcon slug={slug} name={data.overview.name} size={64} accent={accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 32, fontWeight: 400, color: "var(--charcoal)", margin: 0 }}>
              {data.overview.name}
            </h1>
            <span
              className={data.overview.status === "shipped" ? "pulse-dot" : ""}
              style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: statusColor, display: "inline-block" }}
            />
            <Badge color={statusColor}>{data.overview.status}</Badge>
          </div>
          <p style={{ fontFamily: "var(--font-dm-mono), monospace", fontSize: 12, color: "var(--mid)", margin: 0, opacity: 0.8 }}>
            {data.overview.track} &middot; {data.overview.productType ?? "—"} &middot; updated {relTime(data.overview.updatedAt)}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `2px solid var(--warm)`,
          marginBottom: 24,
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 20px",
                border: "none",
                borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
                marginBottom: -2,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "var(--font-dm-mono), monospace",
                fontWeight: active ? 600 : 400,
                background: "transparent",
                color: active ? "var(--charcoal)" : "var(--mid)",
                transition: "all 150ms ease",
                letterSpacing: "0.04em",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-up" key={activeTab}>
        {activeTab === "overview" && <OverviewTab data={data} accent={accent} />}
        {activeTab === "analytics" && <AnalyticsTab data={data} accent={accent} />}
        {activeTab === "distribution" && <DistributionTab data={data} accent={accent} />}
        {activeTab === "health" && <HealthTab data={data} accent={accent} />}
      </div>
    </div>
  );
}
