"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "./Badge";

// ── Types ────────────────────────────────────────────────────────

interface Vertical {
  key: string;
  label: string;
  tier: string;
  agent_fit: number;
  competitors: number;
  queries: number;
}

interface JTBDCluster {
  jtbd: string;
  posting_count: number;
  avg_salary: number;
  tool_mentions: string[];
  is_automatable: boolean;
  automation_score: number;
  verticals: string[];
}

interface ComplaintCluster {
  vertical: string;
  complaint_category: string;
  count: number;
  products_affected: string[];
  products_count: number;
  avg_score: number;
}

interface ToolEntry {
  tool: string;
  mentions: number;
}

interface B2BData {
  verticals: Vertical[];
  jtbd: {
    clusters: JTBDCluster[];
    total: number;
    automatable: number;
    totalPostings: number;
    avgSalary: number;
    meta: { date: string; summary: string } | null;
  };
  complaints: {
    clusters: ComplaintCluster[];
    total: number;
    topCategory: string | null;
    meta: { date: string; summary: string } | null;
  };
  verticalHeat: Record<string, { jtbds: number; complaints: number; postings: number }>;
  topTools: ToolEntry[];
  summary: {
    totalVerticals: number;
    tierA: number;
    totalJTBDs: number;
    automatableJTBDs: number;
    totalComplaints: number;
    totalPostings: number;
    avgSalary: number;
  };
}

// ── Constants ────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  A: "var(--olive)",
  B: "var(--amber)",
  "B-strategic": "var(--lilac)",
  C: "var(--mid)",
};

const CATEGORY_LABELS: Record<string, string> = {
  ux_design: "UX / Design",
  missing_features: "Missing Features",
  pricing: "Pricing",
  integration: "Integrations",
  complexity: "Complexity",
  support: "Support",
  performance: "Performance",
};

const CATEGORY_COLORS: Record<string, string> = {
  ux_design: "var(--lilac)",
  missing_features: "var(--terracotta)",
  pricing: "var(--amber)",
  integration: "var(--olive)",
  complexity: "var(--mid)",
  support: "var(--terracotta)",
  performance: "var(--mid)",
};

// ── Sub-components ───────────────────────────────────────────────

function KPIChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--warm)" }}>
      <span
        className="text-lg leading-none tabular-nums"
        style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, color: color ?? "var(--charcoal)" }}
      >
        {value}
      </span>
      <span className="text-[0.7rem] text-mid/80 mt-0.5 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function HeatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ backgroundColor: "var(--warm)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ComplaintBar({ cluster, maxCount }: { cluster: ComplaintCluster; maxCount: number }) {
  const cat = CATEGORY_LABELS[cluster.complaint_category] ?? cluster.complaint_category;
  const color = CATEGORY_COLORS[cluster.complaint_category] ?? "var(--mid)";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.8rem] text-mid/85 w-28 text-right truncate">{cat}</span>
      <HeatBar value={cluster.count} max={maxCount} color={color} />
      <span className="text-[0.8rem] tabular-nums text-mid/80 w-6">{cluster.count}</span>
      <div className="flex gap-0.5">
        {cluster.products_affected.slice(0, 3).map((p) => (
          <span
            key={p}
            className="text-[0.8rem] px-1 py-0.5 rounded bg-warm text-mid/80 truncate max-w-[60px]"
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function B2BLane() {
  const [data, setData] = useState<B2BData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/b2b");
      const json = await res.json();
      if (!json.error) setData(json);
    } catch { /* offline */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!loaded || !data) return null;

  const { summary, jtbd, complaints, verticals, topTools, verticalHeat } = data;

  // No data yet
  if (summary.totalJTBDs === 0 && summary.totalComplaints === 0) return null;

  const maxComplaints = Math.max(...complaints.clusters.map((c) => c.count), 1);
  const maxHeat = Math.max(
    ...Object.values(verticalHeat).map((v) => v.jtbds + v.complaints),
    1,
  );

  return (
    <div className="card fade-up" style={{ animationDelay: "0.58s", borderLeft: "3px solid var(--lilac)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--lilac-soft)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lilac)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="label-caps text-[0.75rem]" style={{ color: "var(--lilac)" }}>B2B Discovery Lane</p>
            <p className="text-[0.8rem] text-mid/85 mt-0.5">JTBD extraction + SaaS complaint mining</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[0.75rem] px-2.5 py-1.5 rounded-lg transition-all hover:bg-warm"
          style={{ color: "var(--mid)", border: "1px solid var(--warm)" }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* KPI row */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <KPIChip label="Verticals" value={summary.totalVerticals} />
        <KPIChip label="JTBDs" value={summary.totalJTBDs} color="var(--lilac)" />
        <KPIChip label="Automatable" value={summary.automatableJTBDs} color="var(--olive)" />
        <KPIChip label="Complaints" value={summary.totalComplaints} color="var(--terracotta)" />
        <KPIChip label="Job Posts" value={summary.totalPostings.toLocaleString()} />
        <KPIChip
          label="Avg Salary"
          value={summary.avgSalary > 0 ? `$${(summary.avgSalary / 1000).toFixed(0)}k` : "-"}
          color="var(--amber)"
        />
      </div>

      {/* Compact: Vertical tier badges + last run dates */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {verticals
          .sort((a, b) => {
            const order = { A: 0, "B-strategic": 1, B: 2, C: 3 };
            return (order[a.tier as keyof typeof order] ?? 9) - (order[b.tier as keyof typeof order] ?? 9);
          })
          .map((v) => (
            <Badge key={v.key} color={TIER_COLORS[v.tier] ?? "var(--mid)"}>
              {v.label.replace(/ /g, "\u00A0")}
              <span className="ml-1 opacity-60">({v.tier})</span>
            </Badge>
          ))}
      </div>

      {/* Run metadata */}
      <div className="flex items-center gap-4 text-[0.75rem] text-mid/85">
        {jtbd.meta && (
          <span>
            JTBD run: <span className="text-mid/85">{jtbd.meta.date}</span>
            <span className="mx-1 opacity-30">|</span>
            {jtbd.meta.summary}
          </span>
        )}
        {complaints.meta && (
          <span>
            Reviews: <span className="text-mid/85">{complaints.meta.date}</span>
            <span className="mx-1 opacity-30">|</span>
            {complaints.meta.summary}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-warm/60 space-y-5">

          {/* Vertical Heat Map */}
          <div>
            <p className="label-caps text-[0.7rem] mb-2">Vertical Heat</p>
            <div className="space-y-1.5">
              {Object.entries(verticalHeat)
                .sort((a, b) => (b[1].jtbds + b[1].complaints) - (a[1].jtbds + a[1].complaints))
                .slice(0, 8)
                .map(([key, heat]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[0.8rem] text-mid/85 w-36 text-right truncate capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 flex gap-0.5">
                      <div className="flex-1 h-2.5 rounded-l-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
                        <div
                          className="h-full rounded-l-full"
                          style={{
                            width: `${(heat.jtbds / maxHeat) * 100}%`,
                            backgroundColor: "var(--lilac)",
                          }}
                          title={`${heat.jtbds} JTBDs`}
                        />
                      </div>
                      <div className="flex-1 h-2.5 rounded-r-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
                        <div
                          className="h-full rounded-r-full"
                          style={{
                            width: `${(heat.complaints / maxHeat) * 100}%`,
                            backgroundColor: "var(--terracotta)",
                          }}
                          title={`${heat.complaints} complaints`}
                        />
                      </div>
                    </div>
                    <span className="text-[0.7rem] tabular-nums text-mid/85 w-16">
                      {heat.jtbds}j {heat.complaints}c
                    </span>
                  </div>
                ))}
            </div>
            <div className="flex items-center gap-4 mt-1.5 ml-40">
              <span className="flex items-center gap-1 text-[0.8rem] text-mid/80">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--lilac)" }} /> JTBDs
              </span>
              <span className="flex items-center gap-1 text-[0.8rem] text-mid/80">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--terracotta)" }} /> Complaints
              </span>
            </div>
          </div>

          {/* Two-column: Top JTBDs + Complaints */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top JTBD Clusters */}
            <div>
              <p className="label-caps text-[0.7rem] mb-2" style={{ color: "var(--lilac)" }}>Top JTBD Clusters</p>
              <div className="space-y-1.5">
                {jtbd.clusters.slice(0, 8).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-warm/30 transition-colors">
                    <span className="text-[0.7rem] text-mid/55 w-3 tabular-nums">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.8rem] truncate leading-snug">{c.jtbd}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[0.7rem] tabular-nums" style={{ color: "var(--lilac)" }}>
                          {c.posting_count} posts
                        </span>
                        {c.avg_salary > 0 && (
                          <span className="text-[0.7rem] tabular-nums" style={{ color: "var(--amber)" }}>
                            ${(c.avg_salary / 1000).toFixed(0)}k
                          </span>
                        )}
                        {c.is_automatable && (
                          <span
                            className="text-[0.8rem] px-1 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--olive-soft)", color: "var(--olive)" }}
                          >
                            AUTO
                          </span>
                        )}
                        {c.tool_mentions.slice(0, 2).map((t) => (
                          <span key={t} className="text-[0.8rem] px-1 py-0.5 rounded bg-warm text-mid/85">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Complaint Clusters */}
            <div>
              <p className="label-caps text-[0.7rem] mb-2" style={{ color: "var(--terracotta)" }}>Complaint Clusters</p>
              <div className="space-y-1.5">
                {complaints.clusters.slice(0, 7).map((c, i) => (
                  <ComplaintBar key={i} cluster={c} maxCount={maxComplaints} />
                ))}
              </div>
            </div>
          </div>

          {/* Tool Landscape */}
          {topTools.length > 0 && (
            <div>
              <p className="label-caps text-[0.7rem] mb-2">Incumbent Tools</p>
              <div className="flex items-center gap-2 flex-wrap">
                {topTools.map((t) => (
                  <span
                    key={t.tool}
                    className="text-[0.75rem] px-2 py-1 rounded-lg border border-warm"
                    style={{ backgroundColor: "var(--paper)" }}
                  >
                    {t.tool}
                    <span className="ml-1 text-mid/80 tabular-nums">{t.mentions}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
