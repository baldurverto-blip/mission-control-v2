"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

// ── Types ────────────────────────────────────────────────────────

interface KeywordRow {
  keyword: string;
  volume: string;
  cpc: string;
  competition?: string;
  intent: string;
  trend: string;
}

interface Niche {
  title: string;
  viability: string;
  stats: string;
  keywords: KeywordRow[];
}

interface ProductSection {
  name: string;
  summary: string;
  niches: Niche[];
  topKeywords: KeywordRow[];
}

interface InsightSection {
  title: string;
  items: string[];
}

interface ParsedSignals {
  date: string;
  credits: string;
  products: ProductSection[];
  insights: InsightSection[];
}

interface LinkedIdea {
  slug: string;
  title: string;
  status: string;
  niche: string;
}

// ── Parser ───────────────────────────────────────────────────────

function parseMarkdown(md: string): ParsedSignals {
  const lines = md.split("\n");
  const result: ParsedSignals = {
    date: "",
    credits: "",
    products: [],
    insights: [],
  };

  // Extract header info
  const dateLine = lines.find((l) => l.startsWith("# Keyword Discovery"));
  if (dateLine) {
    const m = dateLine.match(/— (\d{4}-\d{2}-\d{2})/);
    if (m) result.date = m[1];
  }
  const creditsLine = lines.find((l) => l.includes("Credits used:"));
  if (creditsLine) {
    const m = creditsLine.match(/Credits used: (\d[\d,]*)/);
    if (m) result.credits = m[1];
  }

  let currentProduct: ProductSection | null = null;
  let currentNiche: Niche | null = null;
  let currentInsight: InsightSection | null = null;
  let inTopKeywords = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H2 — product or insight section
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      inTopKeywords = false;
      inTable = false;
      currentNiche = null;

      const h2 = line.slice(3).trim();

      if (
        h2.includes("Viability") ||
        h2.includes("Willingness") ||
        h2.includes("Underserved")
      ) {
        currentProduct = null;
        currentInsight = { title: h2, items: [] };
        result.insights.push(currentInsight);
        continue;
      }

      // Product section
      currentInsight = null;
      currentProduct = { name: h2, summary: "", niches: [], topKeywords: [] };
      result.products.push(currentProduct);
      continue;
    }

    // Insight list items
    if (currentInsight && line.startsWith("- ")) {
      currentInsight.items.push(line.slice(2).trim());
      continue;
    }

    // Product summary line (Seeds: X | Expanded: Y | Scored: Z)
    if (currentProduct && line.startsWith("Seeds:")) {
      currentProduct.summary = line.trim();
      continue;
    }

    // H3 — niche or top keywords
    if (line.startsWith("### ") && currentProduct) {
      inTable = false;
      if (line.includes("Top 10")) {
        inTopKeywords = true;
        currentNiche = null;
        continue;
      }

      inTopKeywords = false;
      const h3 = line.slice(4).trim();
      const viabilityMatch = h3.match(/\[(.*?)\]/);
      const nicheTitle = h3
        .replace(/\[.*?\]/, "")
        .replace(/^Niche:\s*/, "")
        .trim();

      currentNiche = {
        title: nicheTitle,
        viability: viabilityMatch ? viabilityMatch[1] : "LOW",
        stats: "",
        keywords: [],
      };
      currentProduct.niches.push(currentNiche);
      continue;
    }

    // Niche stats line
    if (currentNiche && line.startsWith("Keywords:") && !inTable) {
      currentNiche.stats = line.trim();
      continue;
    }

    // Table header detection
    if (line.startsWith("|") && line.includes("Keyword")) {
      inTable = true;
      continue;
    }
    // Table separator
    if (line.startsWith("|") && line.includes("---")) {
      continue;
    }

    // Table rows
    if (inTable && line.startsWith("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);

      if (cells.length >= 5) {
        const row: KeywordRow = inTopKeywords
          ? {
              keyword: cells[1] ?? "",
              volume: cells[2] ?? "",
              cpc: cells[3] ?? "",
              competition: cells[4] ?? "",
              intent: cells[5] ?? "",
              trend: cells[6] ?? "",
            }
          : {
              keyword: cells[0] ?? "",
              volume: cells[1] ?? "",
              cpc: cells[2] ?? "",
              intent: cells[3] ?? "",
              trend: cells[4] ?? "",
            };

        if (inTopKeywords && currentProduct) {
          currentProduct.topKeywords.push(row);
        } else if (currentNiche) {
          currentNiche.keywords.push(row);
        }
      }
      continue;
    }

    // End table on blank line
    if (inTable && line.trim() === "") {
      inTable = false;
    }
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────

const VIABILITY_COLORS: Record<string, string> = {
  "HIGH-VIABILITY": "var(--terracotta)",
  HIGH: "var(--terracotta)",
  MEDIUM: "var(--amber)",
  LOW: "var(--mid)",
};

const TREND_LABELS: Record<string, { icon: string; color: string }> = {
  rising: { icon: "\u2191", color: "var(--olive)" },
  declining: { icon: "\u2193", color: "var(--terracotta)" },
  stable: { icon: "\u2192", color: "var(--mid)" },
  new: { icon: "\u2605", color: "var(--lilac)" },
  unknown: { icon: "?", color: "var(--mid)" },
};

function parseCpc(s: string): number {
  return parseFloat(s.replace("$", "")) || 0;
}

function intentNum(s: string): number {
  return parseInt(s) || 0;
}

// ── Components ──────────────────────────────────────────────────

function KeywordTable({
  rows,
  showCompetition,
}: {
  rows: KeywordRow[];
  showCompetition?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left label-caps text-[0.7rem] text-mid/80">
            <th className="pb-2 pr-3">Keyword</th>
            <th className="pb-2 pr-3 text-right">Volume</th>
            <th className="pb-2 pr-3 text-right">CPC</th>
            {showCompetition && (
              <th className="pb-2 pr-3 text-right">Comp.</th>
            )}
            <th className="pb-2 pr-3 text-right">Intent</th>
            <th className="pb-2 text-center">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((kw, i) => {
            const cpc = parseCpc(kw.cpc);
            const intent = intentNum(kw.intent);
            const trendKey = (kw.trend || "unknown").toLowerCase();
            const trend = TREND_LABELS[trendKey] ?? TREND_LABELS.unknown;

            return (
              <tr
                key={`${kw.keyword}-${i}`}
                className="border-t border-warm/40 hover:bg-warm/30 transition-colors"
              >
                <td className="py-1.5 pr-3 font-medium" style={{ color: "var(--charcoal)" }}>
                  {kw.keyword}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-mid">
                  {kw.volume}
                </td>
                <td
                  className="py-1.5 pr-3 text-right tabular-nums font-medium"
                  style={{ color: cpc >= 3 ? "var(--terracotta)" : cpc >= 1 ? "var(--amber)" : "var(--mid)" }}
                >
                  {kw.cpc}
                </td>
                {showCompetition && (
                  <td className="py-1.5 pr-3 text-right tabular-nums text-mid">
                    {kw.competition}
                  </td>
                )}
                <td className="py-1.5 pr-3 text-right">
                  <span
                    className="inline-flex items-center justify-center w-8 h-5 rounded-full text-[0.8rem] font-medium tabular-nums"
                    style={{
                      backgroundColor: intent >= 70 ? "var(--terracotta-soft)" : intent >= 50 ? "var(--amber-soft)" : "var(--warm)",
                      color: intent >= 70 ? "var(--terracotta)" : intent >= 50 ? "var(--amber)" : "var(--mid)",
                    }}
                  >
                    {kw.intent}
                  </span>
                </td>
                <td className="py-1.5 text-center">
                  <span style={{ color: trend.color }} title={trendKey}>
                    {trend.icon}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NicheCard({ niche, linkedIdeas }: { niche: Niche; linkedIdeas?: LinkedIdea[] }) {
  const [expanded, setExpanded] = useState(false);
  const color = VIABILITY_COLORS[niche.viability] ?? "var(--mid)";

  const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
    qualified: { bg: "var(--olive-soft)", fg: "var(--olive)" },
    refined: { bg: "var(--amber-soft)", fg: "var(--amber)" },
    proposed: { bg: "var(--warm)", fg: "var(--mid)" },
    rejected: { bg: "var(--terracotta-soft)", fg: "var(--terracotta)" },
    shipped: { bg: "var(--olive-soft)", fg: "var(--olive)" },
  };

  return (
    <div
      className="rounded-xl border p-4 transition-all"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}06` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-medium" style={{ color: "var(--charcoal)" }}>
          {niche.title}
        </h4>
        <div className="flex items-center gap-1.5">
          {linkedIdeas && linkedIdeas.length > 0 && linkedIdeas.map((idea) => {
            const s = STATUS_STYLE[idea.status] ?? STATUS_STYLE.proposed;
            return (
              <a
                key={idea.slug}
                href="/growth/ideas"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.7rem] font-medium no-underline hover:opacity-80 transition-opacity"
                style={{ backgroundColor: s.bg, color: s.fg }}
              >
                &rarr; {idea.title} &middot; {idea.status}
              </a>
            );
          })}
          <Badge color={color}>{niche.viability}</Badge>
        </div>
      </div>
      <p className="text-[0.8rem] text-mid/80 mb-3">{niche.stats}</p>
      <KeywordTable rows={expanded ? niche.keywords : niche.keywords.slice(0, 3)} />
      {niche.keywords.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[0.8rem] mt-2 hover:underline"
          style={{ color }}
        >
          {expanded ? "Show less" : `+${niche.keywords.length - 3} more keywords`}
        </button>
      )}
    </div>
  );
}

function InsightCard({ section }: { section: InsightSection }) {
  const isWtp = section.title.includes("Willingness");
  const isUnderserved = section.title.includes("Underserved");
  const color = isWtp ? "var(--terracotta)" : isUnderserved ? "var(--olive)" : "var(--amber)";

  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <p className="label-caps text-[0.75rem] mb-2" style={{ color }}>
        {section.title}
      </p>
      <ul className="space-y-1">
        {section.items.map((item, i) => (
          <li key={i} className="text-xs text-mid leading-relaxed">
            {item.split("**").map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} style={{ color: "var(--charcoal)" }}>
                  {part}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function KeywordsPage() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [linkedIdeas, setLinkedIdeas] = useState<LinkedIdea[]>([]);

  // Fetch idea queue for niche → idea lineage
  useEffect(() => {
    fetch("/api/growth/ideas")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || !data.queue) return;
        const q = data.queue;
        const all = [...(q.queue ?? []), ...(q.shipped ?? []), ...(q.rejected ?? []), ...(q.parked ?? [])];
        setLinkedIdeas(
          all
            .filter((i: Record<string, unknown>) => (i.evidence as Record<string, unknown>)?.niche || i.source === "keyword_discovery")
            .map((i: Record<string, unknown>) => ({
              slug: (i.slug ?? "") as string,
              title: (i.title ?? "") as string,
              status: (i.status ?? "proposed") as string,
              niche: (((i.evidence as Record<string, unknown>)?.niche ?? "") as string).toLowerCase().trim(),
            })),
        );
      })
      .catch(() => {});
  }, []);

  const fetchSignals = useCallback(async (file?: string) => {
    try {
      const qs = file ? `?file=${encodeURIComponent(file)}` : "";
      const res = await fetch(`/api/keywords${qs}`);
      const data = await res.json();
      if (data.success) {
        setMarkdown(data.markdown);
        setDate(data.date);
        setLatestDate(data.latest_date ?? null);
        setFiles(Array.isArray(data.files) ? data.files : []);
        setSelectedFile(data.selected_file ?? "");
        setFallbackUsed(!!data.fallback_used);
        setFallbackReason(data.fallback_reason ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const triggerRun = async () => {
    setRunning(true);
    try {
      await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      // After trigger, wait a moment then refetch the file
      setTimeout(fetchSignals, 3000);
    } catch {
      // ignore
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading...</p>
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="px-8 py-8 max-w-[1440px] mx-auto">
        <EmptyState
          title="No keyword signals yet"
          message="Run a keyword discovery to see what people are searching for"
        />
        <div className="flex justify-center mt-4">
          <button
            onClick={triggerRun}
            disabled={running}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: running ? "var(--warm)" : "var(--charcoal)",
              color: running ? "var(--mid)" : "var(--paper)",
            }}
          >
            {running ? "Running discovery..." : "Run Keyword Discovery"}
          </button>
        </div>
      </div>
    );
  }

  const parsed = parseMarkdown(markdown);
  const products = parsed.products.filter((p) => p.topKeywords.length > 0 || p.niches.some((n) => n.keywords.length > 0));
  const selectedProduct = activeProduct ? products.find((p) => p.name === activeProduct) : products[0];

  // Aggregate stats
  const totalKeywords = products.reduce((sum, p) => sum + p.topKeywords.length, 0);
  const highViabilityNiches = products.flatMap((p) => p.niches).filter((n) => n.viability === "HIGH-VIABILITY" || n.viability === "HIGH" || n.viability === "MEDIUM");
  const topCpc = products
    .flatMap((p) => p.topKeywords)
    .sort((a, b) => parseCpc(b.cpc) - parseCpc(a.cpc))[0];

  return (
    <div className="px-8 pt-6 pb-12 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-caps text-[0.75rem] text-mid/80">
            Keyword Signals {date && `\u2014 ${date}`}
            {date && (() => {
              const daysOld = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
              return daysOld > 7 ? (
                <span className="ml-2 text-[0.65rem] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}>
                  {daysOld}d old — stale
                </span>
              ) : null;
            })()}
          </p>
          <p className="text-[0.8rem] text-mid/60 mt-0.5">
            {parsed.credits && `${parsed.credits} credits used`}
          </p>
          {fallbackUsed && (
            <p className="text-[0.8rem] mt-1" style={{ color: "var(--amber)" }}>
              Showing fallback report. {fallbackReason}
            </p>
          )}
          {latestDate && date && latestDate !== date && (
            <p className="text-[0.8rem] text-mid/70 mt-1">
              Latest file exists for {latestDate}, but it has no scored keywords yet.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <select
              value={selectedFile}
              onChange={(e) => fetchSignals(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-[0.8rem] border bg-transparent"
              style={{ borderColor: "var(--warm)", color: "var(--charcoal)" }}
            >
              {files.map((f) => (
                <option key={f} value={f}>{f.replace('.md', '')}</option>
              ))}
            </select>
          )}
          <button
            onClick={triggerRun}
            disabled={running}
            className="px-3 py-1.5 rounded-lg text-[0.8rem] font-medium transition-all border"
            style={{
              borderColor: running ? "var(--warm)" : "var(--charcoal)",
              color: running ? "var(--mid)" : "var(--charcoal)",
              backgroundColor: running ? "var(--warm)" : "transparent",
            }}
          >
            {running ? "Running..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Products", value: String(products.length), color: "var(--charcoal)" },
          { label: "Niches Found", value: String(highViabilityNiches.length), sub: "medium+ viability", color: "var(--amber)" },
          { label: "Keywords Scored", value: String(totalKeywords), color: "var(--olive)" },
          { label: "Top CPC", value: topCpc ? topCpc.cpc : "$0", sub: topCpc?.keyword?.slice(0, 25) ?? "", color: "var(--terracotta)" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center"
          >
            <p
              className="leading-none mb-0.5 tabular-nums"
              style={{
                color: kpi.color,
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontWeight: 400,
                fontSize: "1.5rem",
              }}
            >
              {kpi.value}
            </p>
            <p className="label-caps text-[0.7rem] text-mid/80">{kpi.label}</p>
            {kpi.sub && (
              <p className="text-[0.7rem] text-mid/60 mt-0.5 truncate">{kpi.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Insight cards */}
      {parsed.insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {parsed.insights.map((s, i) => (
            <InsightCard key={i} section={s} />
          ))}
        </div>
      )}

      {/* Product switcher — demand-derived vs monitoring */}
      {products.length > 1 && (
        <div className="flex gap-1 bg-warm/50 p-1 rounded-lg flex-wrap">
          {products.map((p) => {
            const active = selectedProduct?.name === p.name;
            const isDemand = p.name.toLowerCase().includes("demand");
            const isPain = p.name.toLowerCase().includes("pain");
            return (
              <button
                key={p.name}
                onClick={() => setActiveProduct(p.name)}
                className={`px-3 py-1.5 rounded-md text-xs tracking-wide transition-all ${
                  active
                    ? "bg-paper text-charcoal shadow-sm font-medium"
                    : "text-mid hover:text-charcoal"
                }`}
              >
                {isDemand && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: "var(--terracotta)" }} />}
                {isPain && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: "var(--amber)" }} />}
                {p.name}
                {isDemand && <span className="ml-1 text-[0.6rem] opacity-60">demand</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected product content */}
      {selectedProduct && (
        <>
          <p className="text-[0.8rem] text-mid/70">{selectedProduct.summary}</p>

          {/* Top 10 keywords table */}
          {selectedProduct.topKeywords.length > 0 && (
            <div className="card">
              <p className="label-caps text-[0.75rem] text-mid/80 mb-3">
                Top Keywords by Intent Score
              </p>
              <KeywordTable rows={selectedProduct.topKeywords} showCompetition />
            </div>
          )}

          {/* Niches grid — filter out 1-keyword and navigational/generic niches */}
          {(() => {
            const genericTerms = new Set(["app", "best", "free", "alternative", "software", "tool", "managing", "tracker", "tracking"]);
            const validNiches = selectedProduct.niches.filter((n) => {
              if (n.keywords.length < 3) return false;
              const titleWords = n.title.toLowerCase().split(/\s+/).filter(Boolean);
              // Skip single-word niches (brand/navigational)
              if (titleWords.length < 2) return false;
              // Skip if all words are generic
              if (titleWords.every((w) => genericTerms.has(w))) return false;
              return true;
            });
            return validNiches.length > 0 ? (
              <>
                <p className="label-caps text-[0.75rem] text-mid/80">Niches</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {validNiches
                    .sort((a, b) => {
                      const order = ["HIGH-VIABILITY", "HIGH", "MEDIUM", "LOW"];
                      return order.indexOf(a.viability) - order.indexOf(b.viability);
                    })
                    .map((n, i) => (
                      <NicheCard key={i} niche={n} linkedIdeas={linkedIdeas.filter((idea) => {
                        const nicheKey = n.title.toLowerCase().trim();
                        return idea.niche && (idea.niche === nicheKey || idea.niche.includes(nicheKey) || nicheKey.includes(idea.niche));
                      })} />
                    ))}
                </div>
              </>
            ) : null;
          })()}
        </>
      )}
    </div>
  );
}
