"use client";

export interface PortfolioKPIData {
  counts: { live: number; inPipeline: number; parked: number; rejected: number; awaitingReview: number };
  totals: {
    mrr: number;
    downloads30d: number;
    activeSubs: number;
    waitlistSignups: number;
    redditKarma: number;
    redditComments: number;
    seoPages: number;
  };
  apps: {
    slug: string;
    status: string;
    shippedAt: string | null;
    downloads30d: number;
    mrr: number | null;
    waitlistSignups: number;
    redditKarma: number;
    appStoreStatus: string | null;
  }[];
}

function KPIStat({
  label, value, sub, color, dim,
}: {
  label: string; value: string; sub?: string; color: string; dim?: boolean;
}) {
  return (
    <div
      className={`text-center px-2.5 py-2 rounded-lg transition-all ${dim ? "opacity-45" : ""}`}
      style={{ backgroundColor: dim ? "transparent" : `${color}0C`, border: dim ? "none" : `1px solid ${color}18` }}
    >
      <p
        className="text-xl font-light tabular-nums leading-none"
        style={{ fontFamily: "var(--font-cormorant)", color }}
      >
        {value}
      </p>
      <p className="label-caps text-[0.58rem] mt-1.5" style={{ color: dim ? undefined : `${color}AA` }}>{label}</p>
      {sub && <p className="text-[0.52rem] mt-0.5" style={{ color: dim ? "var(--mid)" : `${color}70` }}>{sub}</p>}
    </div>
  );
}

export function PortfolioKPIs({ data }: { data: PortfolioKPIData | null }) {
  if (!data) return null;

  const { counts, totals, apps } = data;
  const totalApps = counts.live + counts.inPipeline + counts.parked + counts.rejected + counts.awaitingReview;
  const hasMRR = totals.mrr > 0;

  return (
    <div className="rounded-xl p-4 h-full flex flex-col border" style={{ backgroundColor: "#FAFAF6", borderColor: "var(--warm)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <p className="label-caps text-charcoal/60">Portfolio</p>
          <span
            className="text-[0.62rem] tabular-nums px-1.5 py-0.5 rounded-md font-medium"
            style={{ backgroundColor: "var(--charcoal)", color: "var(--paper)" }}
          >
            {totalApps}
          </span>
        </div>
        <a
          href="/factory"
          className="text-[0.72rem] px-2 py-0.5 rounded transition-all hover:bg-charcoal hover:text-paper"
          style={{ color: "var(--mid)" }}
        >
          Factory &rarr;
        </a>
      </div>

      {/* Pipeline status row */}
      <div className="flex items-center gap-1.5 mb-3">
        {counts.live > 0 && (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.65rem] font-medium"
            style={{ backgroundColor: "var(--olive-strong)", color: "var(--olive)", border: "1px solid var(--olive-border)" }}
          >
            <span className="w-2 h-2 rounded-full pulse-dot-subtle" style={{ backgroundColor: "var(--olive)" }} />
            {counts.live} live
          </span>
        )}
        {counts.inPipeline > 0 && (
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.65rem] font-medium"
            style={{ backgroundColor: "var(--lilac-strong)", color: "var(--lilac)", border: "1px solid var(--lilac-border)" }}
          >
            {counts.inPipeline} building
          </span>
        )}
        {counts.awaitingReview > 0 && (
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.65rem] font-medium"
            style={{ backgroundColor: "var(--amber-strong)", color: "var(--amber)", border: "1px solid var(--amber-border)" }}
          >
            {counts.awaitingReview} review
          </span>
        )}
        {counts.parked > 0 && (
          <span
            className="px-2.5 py-1 rounded-md text-[0.65rem] font-medium"
            style={{ backgroundColor: "rgba(72,69,63,0.08)", color: "var(--mid)", border: "1px solid rgba(72,69,63,0.12)" }}
          >
            {counts.parked} parked
          </span>
        )}
      </div>

      {/* KPI grid */}
      <div className="flex items-start justify-around py-2 border-t border-warm/60">
        <KPIStat
          label="MRR"
          value={hasMRR ? `$${totals.mrr.toLocaleString()}` : "$0"}
          sub={hasMRR ? `${totals.activeSubs} subs` : "pending"}
          color={hasMRR ? "var(--olive)" : "var(--mid)"}
          dim={!hasMRR}
        />
        <KPIStat
          label="Downloads"
          value={totals.downloads30d.toLocaleString()}
          sub="30d"
          color={totals.downloads30d > 0 ? "var(--lilac)" : "var(--mid)"}
          dim={totals.downloads30d === 0}
        />
        <KPIStat
          label="Waitlist"
          value={totals.waitlistSignups.toLocaleString()}
          sub="signups"
          color={totals.waitlistSignups > 0 ? "var(--amber)" : "var(--mid)"}
          dim={totals.waitlistSignups === 0}
        />
        <KPIStat
          label="Reddit"
          value={totals.redditKarma.toLocaleString()}
          sub={`${totals.redditComments} comments`}
          color={totals.redditKarma > 0 ? "var(--terracotta)" : "var(--mid)"}
        />
        <KPIStat
          label="SEO"
          value={totals.seoPages.toLocaleString()}
          sub="indexed"
          color={totals.seoPages > 0 ? "var(--olive)" : "var(--mid)"}
        />
      </div>

      {/* Live apps quick list */}
      {apps.length > 0 && (
        <div className="flex-1 mt-2 border-t border-warm/60 pt-2 space-y-1.5 overflow-y-auto scrollbar-hide">
          {apps.slice(0, 4).map((app) => (
            <div key={app.slug} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    app.appStoreStatus === "live" ? "var(--olive)" :
                    app.appStoreStatus === "waiting_for_review" ? "var(--amber)" :
                    "var(--mid)",
                }}
              />
              <span className="text-[0.78rem] text-charcoal/75 flex-1 truncate">
                {app.slug.replace(/-\d{4}$/, "").replace(/-/g, " ")}
              </span>
              {app.waitlistSignups > 0 && (
                <span className="text-[0.65rem] text-mid/45 tabular-nums">
                  {app.waitlistSignups} wl
                </span>
              )}
              {app.redditKarma > 0 && (
                <span className="text-[0.65rem] text-mid/45 tabular-nums">
                  {app.redditKarma >= 1000 ? `${(app.redditKarma / 1000).toFixed(1)}k` : app.redditKarma} karma
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
