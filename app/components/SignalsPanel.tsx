"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "./Card";
import { Badge } from "./Badge";

interface TrendDay {
  date: string;
  intent: number;
  cpc: number;
  volume: number;
  trend: string;
}

interface TrendKeyword {
  keyword: string;
  product: string;
  niche: string;
  days: TrendDay[];
  latestIntent: number;
  latestCpc: number;
  latestVolume: number;
  latestTrend: string;
  dayCount: number;
  intentDelta: number;
  isWatched: boolean;
}

interface DaySummary {
  date: string;
  credits: number;
  keywordCount: number;
}

interface CreditEntry {
  date: string;
  credits: number;
}

interface TrendsData {
  days: DaySummary[];
  trends: TrendKeyword[];
  watchlist: string[];
  creditHistory: CreditEntry[];
}

const PRODUCT_COLORS: Record<string, string> = {
  safebite: "var(--olive)",
  sync: "var(--lilac)",
  _pain: "var(--amber)",
  _general: "var(--mid)",
};

function TrendArrow({ delta, trend }: { delta: number; trend: string }) {
  if (trend === "rising" || delta > 5) {
    return <span className="text-[0.65rem]" style={{ color: "var(--olive)" }}>&#9650;</span>;
  }
  if (trend === "declining" || delta < -5) {
    return <span className="text-[0.65rem]" style={{ color: "var(--terracotta)" }}>&#9660;</span>;
  }
  return <span className="text-[0.65rem] text-mid/40">&mdash;</span>;
}

function MiniSparkline({ days }: { days: TrendDay[] }) {
  if (days.length < 2) return null;
  const values = days.map((d) => d.intent);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 40;
  const h = 14;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block ml-1 align-middle">
      <polyline
        points={points}
        fill="none"
        stroke="var(--olive)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CreditSparkline({ history }: { history: CreditEntry[] }) {
  if (history.length < 1) return null;
  const values = history.map((h) => h.credits);
  const max = Math.max(...values, 1);
  const w = 60;
  const h = 16;

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      {values.map((v, i) => {
        const barW = Math.max((w / values.length) - 1, 2);
        const barH = (v / max) * h;
        const x = i * (w / values.length);
        return (
          <rect
            key={i}
            x={x}
            y={h - barH}
            width={barW}
            height={barH}
            fill={v > 2000 ? "var(--terracotta)" : v > 500 ? "var(--amber)" : "var(--olive)"}
            rx="1"
            opacity="0.7"
          />
        );
      })}
    </svg>
  );
}

export function SignalsPanel() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [filter, setFilter] = useState<"all" | "watched" | "persistent" | "rising">("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/keywords/trends");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function toggleWatch(keyword: string, isWatched: boolean) {
    await fetch("/api/keywords/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, action: isWatched ? "unwatch" : "watch" }),
    });
    fetchData();
  }

  if (!data) {
    return (
      <Card className="p-4 h-full">
        <p className="label-caps text-mid/60 mb-3">Signals</p>
        <p className="text-xs text-mid/40 text-center py-4">Loading...</p>
      </Card>
    );
  }

  const { trends, creditHistory, days } = data;

  let filtered = trends;
  if (filter === "watched") filtered = trends.filter((t) => t.isWatched);
  else if (filter === "persistent") filtered = trends.filter((t) => t.dayCount >= 2);
  else if (filter === "rising") filtered = trends.filter((t) => t.latestTrend === "rising" || t.intentDelta > 5);

  const totalCreditsRecent = creditHistory.reduce((sum, c) => sum + c.credits, 0);
  const latestDay = days[0];

  return (
    <Card className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="label-caps text-mid/60">Keyword Signals</p>
        <div className="flex items-center gap-2">
          <CreditSparkline history={creditHistory} />
          <span className="text-[0.55rem] text-mid/40 tabular-nums">
            {totalCreditsRecent.toLocaleString()} cr
          </span>
        </div>
      </div>

      {/* Day summary */}
      {latestDay && (
        <div className="flex items-center gap-3 mb-2 text-[0.6rem] text-mid/50">
          <span>Latest: {latestDay.date}</span>
          <span>{latestDay.keywordCount} keywords</span>
          <span>{trends.filter((t) => t.dayCount >= 2).length} persistent</span>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-1 mb-2 flex-shrink-0">
        {(["all", "watched", "persistent", "rising"] as const).map((f) => {
          const count = f === "all" ? trends.length
            : f === "watched" ? trends.filter((t) => t.isWatched).length
            : f === "persistent" ? trends.filter((t) => t.dayCount >= 2).length
            : trends.filter((t) => t.latestTrend === "rising" || t.intentDelta > 5).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-2 py-0.5 rounded-full text-[0.55rem] tracking-wide transition-colors"
              style={{
                backgroundColor: filter === f ? "var(--charcoal)" : "var(--warm)",
                color: filter === f ? "var(--paper)" : "var(--mid)",
              }}
            >
              {f} {count > 0 && <span className="tabular-nums">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Keyword list */}
      <div className="flex-1 overflow-y-auto custom-scroll min-h-0 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-mid/40 text-center py-4">
            {filter === "watched" ? "No watched signals. Click the eye icon to watch." : "No signals match this filter."}
          </p>
        ) : (
          filtered.slice(0, 30).map((kw) => (
            <div
              key={kw.keyword}
              className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-warm/50 transition-colors group"
            >
              {/* Watch toggle */}
              <button
                onClick={() => toggleWatch(kw.keyword, kw.isWatched)}
                className="text-[0.65rem] opacity-30 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title={kw.isWatched ? "Unwatch" : "Watch"}
              >
                {kw.isWatched ? "\u25C9" : "\u25CB"}
              </button>

              {/* Keyword + product badge */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-charcoal truncate">{kw.keyword}</span>
                  {kw.dayCount >= 2 && (
                    <MiniSparkline days={kw.days} />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge color={PRODUCT_COLORS[kw.product] || "var(--mid)"}>{kw.product === "_pain" ? "pain" : kw.product}</Badge>
                  {kw.dayCount >= 2 && (
                    <span className="text-[0.5rem] text-mid/40">{kw.dayCount}d</span>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-2 flex-shrink-0 text-[0.6rem] tabular-nums text-mid">
                <TrendArrow delta={kw.intentDelta} trend={kw.latestTrend} />
                <span title="Intent score">{kw.latestIntent}</span>
                <span title="CPC" className="text-mid/50">${kw.latestCpc.toFixed(2)}</span>
                <span title="Volume" className="text-mid/40">{kw.latestVolume.toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
