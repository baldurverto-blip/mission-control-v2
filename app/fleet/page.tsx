"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "../components/Badge";
import { relTime } from "../lib/agents";

// ── Types ──────────────────────────────────────────────────────────────

interface FleetProduct {
  slug: string;
  name: string;
  track: string;
  platform: "iOS" | "Web" | "Both";
  status: string;
  shipDate: string | null;
  updatedAt: string;
  failureReason: string | null;
  appStoreStatus: string | null;
  downloads30d: number;
  mrr: number | null;
  activeSubs: number | null;
  churnRate: number | null;
  dau: number | null;
  d1Retention: number | null;
  redditComments: number;
  redditKarma: number;
  waitlistCount: number;
  landingUrl: string | null;
  seoPosts: number;
  seoPages: number;
  distributionStatus: string | null;
  activeLayers: string[];
  activeSignals: number;
  signals: { type: string; severity: string; message: string }[];
  qgScore: number | null;
  e2eStatus: string | null;
  updateInReview: boolean;
  updateVersion: string | null;
}

interface FleetStats {
  totalProducts: number;
  live: number;
  inReview: number;
  rejected: number;
  totalMRR: number;
  totalDownloads: number;
  totalRedditKarma: number;
}

// ── Brand colors per product ───────────────────────────────────────────

const APP_ACCENT: Record<string, string> = {
  safebite: "#0D9488",
  "app-request-do-you-use-to-track-your-cro": "#FF6B35",
  "the-worst-part-about-a-gluten-allergy-is": "#2A6E50",
  sync: "#13ec6d",
  "verto-studios-landing": "#BC6143",
};

function accentFor(slug: string): string {
  return APP_ACCENT[slug] ?? "#9899C1";
}

// ── Helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  shipped: "Live",
  submitted: "In Review",
  waiting_for_review: "In Review",
  rejected: "Rejected",
};

const STATUS_DOT: Record<string, string> = {
  shipped: "var(--olive)",
  submitted: "var(--lilac)",
  waiting_for_review: "var(--amber)",
  rejected: "var(--terracotta)",
};

function fmt(value: number | null, prefix = ""): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return `${prefix}0`;
  if (value >= 1000) return `${prefix}${(value / 1000).toFixed(1)}k`;
  return `${prefix}${value}`;
}

function shipAge(shipDate: string | null): string {
  if (!shipDate) return "";
  const days = Math.floor((Date.now() - new Date(shipDate).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ── App Icon ───────────────────────────────────────────────────────────

function AppIcon({
  slug,
  name,
  size = 48,
  accent,
}: {
  slug: string;
  name: string;
  size?: number;
  accent: string;
}) {
  const [hasIcon, setHasIcon] = useState(true);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        boxShadow: `0 2px 12px ${accent}30, 0 1px 3px rgba(0,0,0,0.08)`,
      }}
    >
      {hasIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/fleet/icon/${slug}`}
          alt={name}
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            display: "block",
          }}
          onError={() => setHasIcon(false)}
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
            fontSize: size * 0.45,
            fontWeight: 600,
            color: accent,
          }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}

// ── Distribution Layer Dots ────────────────────────────────────────────

const LAYER_ICONS: Record<string, { label: string; icon: string }> = {
  aso: { label: "ASO", icon: "A" },
  seo: { label: "SEO", icon: "S" },
  social: { label: "Social", icon: "R" },
  launch: { label: "Launch", icon: "L" },
  portfolio: { label: "Portfolio", icon: "P" },
  amplifier: { label: "Amplifier", icon: "+" },
};

function DistLayers({
  reddit,
  seo,
  waitlist,
}: {
  reddit: number;
  seo: number;
  waitlist: number;
}) {
  const layers = [
    reddit > 0 ? { label: `Reddit ${reddit}`, active: true } : null,
    seo > 0 ? { label: `SEO ${seo}`, active: true } : null,
    waitlist > 0 ? { label: `WL ${waitlist}`, active: true } : null,
  ].filter(Boolean) as { label: string; active: boolean }[];

  if (layers.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {layers.map((l) => (
        <span
          key={l.label}
          style={{
            fontSize: 10,
            fontFamily: "var(--font-dm-mono), monospace",
            color: "var(--mid)",
            background: "var(--bg)",
            padding: "2px 7px",
            borderRadius: 5,
            letterSpacing: "0.04em",
          }}
        >
          {l.label}
        </span>
      ))}
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────

function ProductCard({
  product,
  index,
}: {
  product: FleetProduct;
  index: number;
}) {
  const accent = accentFor(product.slug);
  const statusColor = STATUS_DOT[product.status] ?? "var(--mid)";
  const statusLabel = STATUS_LABELS[product.status] ?? product.status;
  const age = shipAge(product.shipDate);

  return (
    <Link
      href={`/fleet/${product.slug}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        className="fade-up"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--warm)",
          borderRadius: 14,
          padding: 0,
          overflow: "hidden",
          cursor: "pointer",
          transition: "box-shadow 0.35s ease, transform 0.35s ease, border-color 0.35s ease",
          animationDelay: `${index * 80}ms`,
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 8px 32px ${accent}18, 0 2px 8px rgba(0,0,0,0.06)`;
          e.currentTarget.style.transform = "translateY(-3px)";
          e.currentTarget.style.borderColor = `${accent}40`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.borderColor = "var(--warm)";
        }}
      >
        {/* Accent top bar */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${accent}, ${accent}60)`,
          }}
        />

        <div style={{ padding: "16px 20px 18px" }}>
          {/* Header: Icon + Name + Status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <AppIcon slug={product.slug} name={product.name} size={48} accent={accent} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span
                  style={{
                    fontFamily: "var(--font-cormorant), Georgia, serif",
                    fontSize: 20,
                    fontWeight: 500,
                    color: "var(--charcoal)",
                    lineHeight: 1.1,
                  }}
                >
                  {product.name}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Live dot */}
                <span
                  className={product.status === "shipped" ? "pulse-dot" : ""}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: statusColor,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-dm-mono), monospace",
                    color: statusColor,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                  }}
                >
                  {statusLabel}
                </span>
                {product.updateInReview && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "var(--font-dm-mono), monospace",
                      color: "var(--amber-text)",
                      background: "var(--amber-soft)",
                      border: "1px solid var(--amber-border)",
                      borderRadius: 4,
                      padding: "1px 5px",
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {product.updateVersion ? `v${product.updateVersion} in review` : "Update in Review"}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-dm-mono), monospace",
                    color: "var(--mid)",
                    opacity: 0.7,
                  }}
                >
                  {product.platform}
                </span>
                {age && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-dm-mono), monospace",
                      color: "var(--mid)",
                      opacity: 0.5,
                    }}
                  >
                    {age}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 4,
              padding: "12px 8px",
              background: "var(--bg)",
              borderRadius: 10,
              marginBottom: 14,
            }}
          >
            <MetricCell label="Downloads" value={fmt(product.downloads30d)} accent={accent} />
            <MetricCell label="MRR" value={fmt(product.mrr, "$")} accent={accent} />
            <MetricCell label="DAU" value={fmt(product.dau)} accent={accent} />
            <MetricCell
              label="D1 Ret."
              value={product.d1Retention !== null ? `${product.d1Retention}%` : "—"}
              accent={accent}
            />
          </div>

          {/* Distribution + Signals footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <DistLayers
                reddit={product.redditKarma}
                seo={product.seoPosts}
                waitlist={product.waitlistCount}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {product.activeSignals > 0 && (
                <span
                  className="attention-pulse"
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-dm-mono), monospace",
                    fontWeight: 500,
                    color: "var(--terracotta)",
                    background: "var(--terracotta-soft)",
                    padding: "2px 8px",
                    borderRadius: 5,
                  }}
                >
                  {product.activeSignals} signal{product.activeSignals > 1 ? "s" : ""}
                </span>
              )}
              {product.qgScore !== null && (
                <Badge color={product.qgScore >= 80 ? "var(--olive)" : "var(--amber)"}>
                  QG {Math.round(product.qgScore)}
                </Badge>
              )}
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-dm-mono), monospace",
                  color: "var(--mid)",
                  opacity: 0.6,
                }}
              >
                {relTime(product.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MetricCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  const isActive = value !== "—" && value !== "$0" && value !== "0";
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: 18,
          fontWeight: 500,
          color: isActive ? accent : "var(--mid)",
          lineHeight: 1.2,
          opacity: isActive ? 1 : 0.4,
          transition: "color 0.3s ease",
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
          marginTop: 2,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Fleet Dashboard ────────────────────────────────────────────────────

export default function FleetPage() {
  const [products, setProducts] = useState<FleetProduct[]>([]);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setProducts(json.products);
      setStats(json.stats);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6 }}>
          <h1
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: 36,
              fontWeight: 400,
              color: "var(--charcoal)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Fleet
          </h1>
          {!loading && stats && (
            <span
              style={{
                fontFamily: "var(--font-dm-mono), monospace",
                fontSize: 12,
                color: "var(--mid)",
                opacity: 0.7,
              }}
            >
              {stats.totalProducts} product{stats.totalProducts !== 1 ? "s" : ""} deployed
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: "var(--font-dm-mono), monospace",
            fontSize: 12,
            color: "var(--mid)",
            margin: 0,
            opacity: 0.8,
          }}
        >
          Live product operations &middot; analytics &middot; support routing
        </p>
      </div>

      {/* Fleet-wide stats */}
      {stats && (
        <div
          className="fade-up"
          style={{
            display: "flex",
            gap: 1,
            background: "var(--warm)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 32,
          }}
        >
          <HeroStat label="Live" value={String(stats.live)} color="var(--olive)" />
          <HeroStat label="In Review" value={String(stats.inReview)} color="var(--lilac)" />
          <HeroStat label="MRR" value={fmt(stats.totalMRR, "$")} color="var(--charcoal)" />
          <HeroStat label="Downloads" value={fmt(stats.totalDownloads)} color="var(--charcoal)" />
          <HeroStat label="Reddit" value={fmt(stats.totalRedditKarma)} color="var(--amber)" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "16px 20px",
            background: "var(--terracotta-soft)",
            borderRadius: 10,
            color: "var(--terracotta)",
            fontSize: 13,
            fontFamily: "var(--font-dm-mono), monospace",
            marginBottom: 24,
          }}
        >
          Failed to load fleet data: {error}
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div
          className="breathe"
          style={{
            textAlign: "center",
            padding: 64,
            fontFamily: "var(--font-dm-mono), monospace",
            fontSize: 13,
            color: "var(--mid)",
          }}
        >
          Loading fleet...
        </div>
      )}

      {/* Empty state */}
      {!loading && products.length === 0 && !error && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 32px",
            background: "var(--paper)",
            borderRadius: 14,
            border: "1px solid var(--warm)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: 20,
              color: "var(--mid)",
              margin: 0,
            }}
          >
            No products in the fleet yet
          </p>
          <p
            style={{
              fontFamily: "var(--font-dm-mono), monospace",
              fontSize: 12,
              color: "var(--mid)",
              opacity: 0.6,
              marginTop: 8,
            }}
          >
            Ship something from the Factory to see it here.
          </p>
        </div>
      )}

      {/* Product grid */}
      {!loading && products.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 18,
          }}
        >
          {products.map((p, i) => (
            <ProductCard key={p.slug} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--paper)",
        padding: "14px 16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: 26,
          fontWeight: 400,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-dm-mono), monospace",
          color: "var(--mid)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginTop: 5,
          opacity: 0.8,
        }}
      >
        {label}
      </div>
    </div>
  );
}
