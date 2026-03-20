"use client";

import { useState, useCallback, useEffect } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { FilterBar, FilterSelect, FilterSearch } from "../../components/FilterBar";

// ── Types ────────────────────────────────────────────────────────

interface Signal {
  id: string;
  source: string;
  project: string;
  signal_type: string;
  title: string;
  description: string;
  raw_data?: string;
  final_score: number;
  base_score: number;
  pain_score: number;
  volume_score: number;
  quality_score: number;
  competition_score?: number;
  approval_boost?: number;
  engagement_boost?: number;
  conversion_boost?: number;
  status: string;
  cross_source_count: number;
  cross_source_ids?: string[] | null;
  discovered_at: string;
  last_scored_at?: string;
  expires_at?: string;
  pipeline_tags: string[];
  radar_tier?: string;
  country?: string | null;
  segment?: string;
}

interface DiscoveryResponse {
  success: boolean;
  signals: Signal[];
  total?: number;
}

interface LinkedIdea {
  slug: string;
  title: string;
  status: string;
}

interface Source {
  source: string;
  current_weight: number;
  total_signals: number;
  active_signals: number;
  last_signal: string | null;
}

interface SourcesResponse {
  success: boolean;
  sources: Source[];
}

interface Theme {
  theme_key: string;
  theme_title: string;
  theme_confidence: number;
  theme_examples?: string[];
  tier: string;
  total_signals: number;
  avg_score: number;
  avg_final_score?: number;
  max_final_score?: number;
  cross_source_count_avg?: number;
  sources: string[];
  momentum_7d: { direction: string };
  last_seen_at?: string;
}

interface ThemesResponse {
  success: boolean;
  themes: Theme[];
}

// ── Constants ────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  hot: "var(--terracotta)",
  warm: "var(--amber)",
  emerging: "var(--olive)",
  monitoring: "var(--mid)",
};

const SOURCE_COLORS: Record<string, string> = {
  reddit: "#FF4500",
  google_trends: "#4285F4",
  keywords_everywhere: "#F4B400",
  g2_reviews: "#FF492C",
  nordic_jobs: "#0A66C2",
  jobad_jtbd: "#7C6BC4",
  saas_review_miner: "#BC6143",
  adzuna_us: "#0A66C2",
  adzuna_gb: "#0A66C2",
  adzuna_de: "#0A66C2",
  jtbd_miner: "var(--lilac)",
  product_hunt: "#DA552F",
};

const TIER_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  hot: { color: "var(--terracotta)", label: "Hot", icon: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" },
  warm: { color: "var(--amber)", label: "Warm", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  emerging: { color: "var(--olive)", label: "Emerging", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  monitoring: { color: "var(--mid)", label: "Monitoring", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
};

const VIEW_TABS = [
  { id: "featured", label: "Research" },
  { id: "table", label: "Database" },
  { id: "themes", label: "Themes" },
  { id: "sources", label: "Sources" },
];

// ── Score Bar Component ──────────────────────────────────────────

function ScoreBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] text-mid/70 w-12 text-right">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[0.75rem] tabular-nums text-mid/80 w-6">{Math.round(value)}</span>
    </div>
  );
}

// ── Score Breakdown Card ─────────────────────────────────────────

function ScoreBreakdown({ signal }: { signal: Signal }) {
  const hasVolume = signal.volume_score > 0;
  const hasQuality = signal.quality_score > 0;
  const isEnriched = hasVolume || hasQuality;

  return (
    <div className="space-y-1.5 mt-2">
      <ScoreBar label="Pain" value={signal.pain_score} color="var(--terracotta)" />
      {hasVolume ? (
        <ScoreBar label="Volume" value={signal.volume_score} color="var(--lilac)" />
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-mid/70 w-12 text-right">Volume</span>
          <span className="text-[0.65rem] text-mid/40 italic">not enriched</span>
        </div>
      )}
      {hasQuality ? (
        <ScoreBar label="Quality" value={signal.quality_score} color="var(--olive)" />
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-mid/70 w-12 text-right">Quality</span>
          <span className="text-[0.65rem] text-mid/40 italic">not enriched</span>
        </div>
      )}
      {(signal.approval_boost ?? 0) > 0 && (
        <ScoreBar label="Boost" value={(signal.approval_boost ?? 0) + (signal.engagement_boost ?? 0) + (signal.conversion_boost ?? 0)} max={50} color="var(--amber)" />
      )}
      {isEnriched && (
        <span className="inline-block mt-1 text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "var(--olive-soft)", color: "var(--olive)" }}>
          Enriched
        </span>
      )}
    </div>
  );
}

// ── Parse raw_data for metadata ──────────────────────────────────

function parseRawData(raw: string | undefined): { subreddit?: string; url?: string; upvotes?: number; keyword?: string } {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw);
    return {
      subreddit: d.subreddit,
      url: d.url,
      upvotes: d.upvotes,
      keyword: d.search_keyword,
    };
  } catch {
    return {};
  }
}

// ── Days ago helper ──────────────────────────────────────────────

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// ── Featured Signal Card ─────────────────────────────────────────

function FeaturedSignalCard({ signal, onGenerate }: { signal: Signal; onGenerate: (s: Signal) => void }) {
  const raw = parseRawData(signal.raw_data);
  const tier = signal.radar_tier ?? "emerging";
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.monitoring;

  return (
    <div className="card fade-up relative overflow-hidden" style={{ borderLeft: `3px solid ${tierCfg.color}` }}>
      <div className="absolute top-3 right-3">
        <span
          className="text-[0.75rem] px-2 py-1 rounded-full font-medium uppercase tracking-wider"
          style={{ backgroundColor: `${tierCfg.color}18`, color: tierCfg.color }}
        >
          {tierCfg.label}
        </span>
      </div>

      <p className="label-caps text-[0.7rem] text-mid/60 mb-2">Top Signal</p>

      <div className="flex gap-6">
        {/* Left — Score ring */}
        <div className="flex-shrink-0">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--warm)" strokeWidth="2.5" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={tierCfg.color} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${(signal.final_score / 100) * 97.4} 97.4`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl tabular-nums" style={{ color: tierCfg.color, fontFamily: "var(--font-cormorant), Georgia, serif" }}>
                {Math.round(signal.final_score)}
              </span>
            </div>
          </div>
        </div>

        {/* Center — Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base leading-snug mb-2 pr-16">{signal.title}</h3>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge color={SOURCE_COLORS[signal.source] ?? "var(--mid)"}>{signal.source.replace(/_/g, " ")}</Badge>
            <Badge color="var(--lilac)">{signal.project}</Badge>
            {raw.subreddit && <span className="text-[0.75rem] text-mid/70">{raw.subreddit}</span>}
            {raw.upvotes && <span className="text-[0.75rem] text-mid/60">{raw.upvotes} upvotes</span>}
            <span className="text-[0.75rem] text-mid/60">{daysAgo(signal.discovered_at)}</span>
            {signal.cross_source_count > 1 && (
              <span className="text-[0.75rem] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>
                {signal.cross_source_count}x validated
              </span>
            )}
          </div>

          {/* Score breakdown */}
          <ScoreBreakdown signal={signal} />
        </div>

        {/* Right — Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0 pt-1">
          <button
            onClick={() => onGenerate(signal)}
            className="text-[0.8rem] px-3 py-2 rounded-lg font-medium tracking-wide transition-all hover:scale-105"
            style={{ backgroundColor: "var(--olive-soft)", color: "var(--olive)" }}
          >
            Generate Content
          </button>
          {raw.url && (
            <a
              href={raw.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.8rem] px-3 py-1.5 rounded-lg text-center transition-all hover:bg-warm"
              style={{ color: "var(--mid)", border: "1px solid var(--warm)" }}
            >
              View Source
            </a>
          )}
        </div>
      </div>

      {/* Pipeline tags */}
      {signal.pipeline_tags?.length > 0 && (
        <div className="flex gap-1.5 mt-3 pt-2 border-t border-warm/60">
          <span className="text-[0.7rem] text-mid/60">Content angles:</span>
          {signal.pipeline_tags.map((tag) => (
            <span key={tag} className="text-[0.7rem] px-1.5 py-0.5 rounded bg-warm/80 text-mid capitalize">{tag.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Signal Row (Research view) ───────────────────────────────────

function IdeaLineageBadge({ ideas }: { ideas?: LinkedIdea[] }) {
  if (!ideas || ideas.length === 0) return null;
  const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
    qualified: { bg: "var(--olive-soft)", fg: "var(--olive)" },
    refined: { bg: "var(--amber-soft)", fg: "var(--amber)" },
    proposed: { bg: "var(--warm)", fg: "var(--mid)" },
    rejected: { bg: "var(--terracotta-soft)", fg: "var(--terracotta)" },
    shipped: { bg: "var(--olive-soft)", fg: "var(--olive)" },
  };
  return (
    <>
      {ideas.map((idea) => {
        const s = STATUS_STYLE[idea.status] ?? STATUS_STYLE.proposed;
        return (
          <a
            key={idea.slug}
            href="/growth/ideas"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.7rem] font-medium no-underline hover:opacity-80 transition-opacity"
            style={{ backgroundColor: s.bg, color: s.fg }}
            onClick={(e) => e.stopPropagation()}
          >
            &rarr; {idea.title} &middot; {idea.status}
          </a>
        );
      })}
    </>
  );
}

function SignalRow({ signal, isExpanded, onToggle, onGenerate, rank, linkedIdeas }: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
  onGenerate: (s: Signal) => void;
  rank: number;
  linkedIdeas?: LinkedIdea[];
}) {
  const raw = parseRawData(signal.raw_data);
  const tier = signal.radar_tier ?? "emerging";
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.monitoring;

  return (
    <div
      className="card !p-0 fade-up overflow-hidden"
      style={{ animationDelay: `${rank * 0.02}s` }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-warm/20 transition-colors"
        onClick={onToggle}
      >
        {/* Rank */}
        <span className="text-[0.8rem] text-mid/55 w-4 text-right tabular-nums">#{rank}</span>

        {/* Score circle */}
        <div className="relative w-9 h-9 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--warm)" strokeWidth="2" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke={tierCfg.color} strokeWidth="2" strokeLinecap="round"
              strokeDasharray={`${(signal.final_score / 100) * 94.2} 94.2`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[0.8rem] tabular-nums font-medium" style={{ color: tierCfg.color }}>
              {Math.round(signal.final_score)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug truncate">{signal.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {(signal.segment === "b2b" || ["jobad_jtbd", "saas_review_miner", "alternative_seeker", "nordic_jobs"].includes(signal.source)) && (
              <span className="text-[0.8rem] px-1.5 py-0.5 rounded-full font-medium tracking-wide" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>B2B</span>
            )}
            <Badge color={SOURCE_COLORS[signal.source] ?? "var(--mid)"}>{signal.source.replace(/_/g, " ")}</Badge>
            <Badge color="var(--lilac)">{signal.project}</Badge>
            <span className="text-[0.7rem] text-mid/60">{daysAgo(signal.discovered_at)}</span>
            <IdeaLineageBadge ideas={linkedIdeas} />
          </div>
        </div>

        {/* Pain indicator */}
        <div className="flex-shrink-0 text-center w-12">
          <div className="flex gap-px justify-center mb-0.5">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-3 rounded-sm"
                style={{
                  backgroundColor: i < Math.ceil(signal.pain_score / 20) ? "var(--terracotta)" : "var(--warm)",
                }}
              />
            ))}
          </div>
          <span className="text-[0.8rem] text-mid/60">PAIN</span>
        </div>

        {/* Cross-source */}
        <div className="flex-shrink-0 w-8 text-center">
          {signal.cross_source_count > 1 ? (
            <span className="text-[0.8rem] font-medium" style={{ color: "var(--lilac)" }}>
              {signal.cross_source_count}x
            </span>
          ) : (
            <span className="text-[0.8rem] text-mid/20">1x</span>
          )}
        </div>

        {/* Tier badge */}
        <div className="flex-shrink-0">
          <span
            className="text-[0.7rem] px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            style={{ backgroundColor: `${tierCfg.color}18`, color: tierCfg.color }}
          >
            {tierCfg.label}
          </span>
        </div>

        {/* Expand arrow */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--mid)"
          strokeWidth="1.5" strokeLinecap="round" className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-warm/40 bg-warm/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Score breakdown */}
            <div>
              <p className="label-caps text-[0.8rem] text-mid/60 mb-2">Score Breakdown</p>
              <ScoreBreakdown signal={signal} />
            </div>

            {/* Metadata */}
            <div>
              <p className="label-caps text-[0.8rem] text-mid/60 mb-2">Details</p>
              <div className="space-y-1 text-[0.8rem] text-mid">
                {raw.subreddit && <p>Source: <span className="text-charcoal">{raw.subreddit}</span></p>}
                {raw.upvotes !== undefined && <p>Upvotes: <span className="text-charcoal">{raw.upvotes}</span></p>}
                {raw.keyword && <p>Keyword: <span className="text-charcoal">{raw.keyword}</span></p>}
                <p>Discovered: <span className="text-charcoal">{new Date(signal.discovered_at).toLocaleDateString("en-GB")}</span></p>
                <p>Status: <span className="text-charcoal capitalize">{signal.status}</span></p>
                {signal.cross_source_count > 1 && (
                  <p>Cross-source: <span className="font-medium" style={{ color: "var(--lilac)" }}>{signal.cross_source_count}x validated</span></p>
                )}
                {signal.pipeline_tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {signal.pipeline_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-warm text-mid text-[0.7rem] capitalize">{tag.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div>
              <p className="label-caps text-[0.8rem] text-mid/60 mb-2">Actions</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerate(signal); }}
                  className="text-[0.8rem] px-3 py-2 rounded-lg font-medium tracking-wide transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--olive-soft)", color: "var(--olive)" }}
                >
                  Generate Content from Signal
                </button>
                {raw.url && (
                  <a
                    href={raw.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[0.8rem] px-3 py-1.5 rounded-lg text-center transition-all hover:bg-warm"
                    style={{ color: "var(--mid)", border: "1px solid var(--warm)" }}
                  >
                    View Original Source
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {signal.description && signal.description !== signal.title && (
            <div className="mt-3 pt-2 border-t border-warm/40">
              <p className="text-xs text-mid leading-relaxed">{signal.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tier Distribution Bar ────────────────────────────────────────

function TierDistribution({ signals }: { signals: Signal[] }) {
  const counts = {
    hot: signals.filter((s) => s.radar_tier === "hot").length,
    warm: signals.filter((s) => s.radar_tier === "warm").length,
    emerging: signals.filter((s) => s.radar_tier === "emerging").length,
    monitoring: signals.filter((s) => !s.radar_tier || s.radar_tier === "monitoring").length,
  };
  const total = signals.length || 1;

  return (
    <div>
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
        {counts.hot > 0 && (
          <div className="h-full rounded-full" style={{ width: `${(counts.hot / total) * 100}%`, backgroundColor: TIER_COLORS.hot }} title={`${counts.hot} hot`} />
        )}
        {counts.warm > 0 && (
          <div className="h-full rounded-full" style={{ width: `${(counts.warm / total) * 100}%`, backgroundColor: TIER_COLORS.warm }} title={`${counts.warm} warm`} />
        )}
        {counts.emerging > 0 && (
          <div className="h-full rounded-full" style={{ width: `${(counts.emerging / total) * 100}%`, backgroundColor: TIER_COLORS.emerging }} title={`${counts.emerging} emerging`} />
        )}
      </div>
      <div className="flex gap-3 mt-1.5">
        {(["hot", "warm", "emerging", "monitoring"] as const).map((tier) => (
          <span key={tier} className="flex items-center gap-1 text-[0.7rem]" style={{ color: TIER_COLORS[tier] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] }} />
            {counts[tier]} {tier}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function SignalsPage() {
  const { data: discData, isOffline, loading, refetch } = useGrowthOps<DiscoveryResponse>("discovery");
  const { data: sourcesData } = useGrowthOps<SourcesResponse>("discovery/sources");
  const { data: themesData } = useGrowthOps<ThemesResponse>("themes");

  const [view, setView] = useState("featured");
  const [projectFilter, setProjectFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  // Signal → Idea lineage map
  const [signalIdeaMap, setSignalIdeaMap] = useState<Map<string, LinkedIdea[]>>(new Map());
  useEffect(() => {
    fetch("/api/growth/ideas")
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || !data.queue) return;
        const q = data.queue;
        const all = [...(q.queue ?? []), ...(q.shipped ?? []), ...(q.rejected ?? []), ...(q.parked ?? [])];
        const map = new Map<string, LinkedIdea[]>();
        for (const idea of all) {
          for (const sid of idea.signal_ids ?? []) {
            if (!map.has(sid)) map.set(sid, []);
            map.get(sid)!.push({ slug: idea.slug, title: idea.title, status: idea.status ?? "proposed" });
          }
        }
        setSignalIdeaMap(map);
      })
      .catch(() => {});
  }, []);

  const signals = discData?.signals ?? [];
  const sources = sourcesData?.sources ?? [];
  const themes = themesData?.themes ?? [];

  const totalSignals = signals.length;
  const newSignals = signals.filter((s) => s.status === "new" || s.status === "active").length;
  const crossValidated = signals.filter((s) => s.cross_source_count > 1).length;
  const avgScore = totalSignals > 0 ? Math.round(signals.reduce((sum, s) => sum + s.final_score, 0) / totalSignals) : 0;
  const highPain = signals.filter((s) => s.pain_score >= 80).length;
  const usedForContent = signals.filter((s) => s.status === "used").length;

  const projects = [...new Set(signals.map((s) => s.project))];

  // Detect segment from source
  const B2B_SOURCES = new Set(["jobad_jtbd", "saas_review_miner", "alternative_seeker", "nordic_jobs"]);
  const getSegment = (s: Signal) => s.segment ?? (B2B_SOURCES.has(s.source) ? "b2b" : "b2c");

  // Sorted by final_score, filtered
  const filtered = signals
    .filter((s) => projectFilter === "all" || s.project === projectFilter)
    .filter((s) => tierFilter === "all" || (s.radar_tier ?? "monitoring") === tierFilter)
    .filter((s) => segmentFilter === "all" || getSegment(s) === segmentFilter)
    .filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.final_score - a.final_score);

  const b2cCount = signals.filter((s) => getSegment(s) === "b2c").length;
  const b2bCount = signals.filter((s) => getSegment(s) === "b2b").length;

  // Featured signal = highest scoring unused signal
  const featuredSignal = signals
    .filter((s) => s.status !== "used" && s.status !== "dismissed")
    .sort((a, b) => b.final_score - a.final_score)[0]
    ?? signals.sort((a, b) => b.final_score - a.final_score)[0];

  // Top 5 by different dimensions
  const topPain = [...signals].sort((a, b) => b.pain_score - a.pain_score).slice(0, 5);
  const topVolume = [...signals].sort((a, b) => b.volume_score - a.volume_score).slice(0, 5);
  const recentSignals = [...signals].sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()).slice(0, 5);

  const runAction = useCallback(async (endpoint: string) => {
    setActing(true);
    try {
      await fetch(`/api/growth/${endpoint}`, { method: "POST" });
      await refetch();
    } finally {
      setActing(false);
    }
  }, [refetch]);

  const handleGenerate = useCallback(async (signal: Signal) => {
    setGenerating(signal.id);
    try {
      // Queue content generation via Growth-Ops
      await fetch("/api/growth/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal_id: signal.id,
          title: signal.title,
          project: signal.project,
          platform: signal.pipeline_tags?.[0] ?? "reddit",
          content_type: signal.pipeline_tags?.includes("reddit_post") ? "post" : "comment",
        }),
      });
      await refetch();
    } finally {
      setGenerating(null);
    }
  }, [refetch]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight">Signals</h1>
            <p className="text-mid text-sm mt-1">Discovery signals, validation, and content opportunities</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runAction("discovery/run-daily")}
              disabled={acting}
              className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper"
              style={{ backgroundColor: "var(--charcoal)" }}
            >
              {acting ? "Running..." : "Run Discovery"}
            </button>
            <button
              onClick={async () => {
                setActing(true);
                try {
                  await fetch("/api/growth/discovery/cross-validate", { method: "POST" });
                  await fetch("/api/growth/discovery/rank", { method: "POST" });
                  await refetch();
                } finally {
                  setActing(false);
                }
              }}
              disabled={acting}
              className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
              style={{ color: "var(--lilac)", backgroundColor: "var(--lilac-soft)" }}
            >
              Cross-Validate + Rank
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="mb-4 fade-up">
          <MetricsBar metrics={[
            { label: "Total", value: String(totalSignals), color: "var(--charcoal)" },
            { label: "New", value: String(newSignals), color: "var(--olive)" },
            { label: "High Pain", value: String(highPain), sub: "≥80", color: "var(--terracotta)" },
            { label: "Cross-val", value: String(crossValidated), color: "var(--lilac)" },
            { label: "Avg Score", value: String(avgScore), color: "var(--amber)" },
            { label: "Used", value: String(usedForContent), color: "var(--mid)" },
          ]} />
        </div>

        {/* Tier Distribution */}
        <div className="fade-up" style={{ animationDelay: "0.03s" }}>
          <TierDistribution signals={signals} />
        </div>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="mb-5 fade-up" style={{ animationDelay: "0.05s" }}>
          <TabBar
            tabs={VIEW_TABS.map((t) => ({
              ...t,
              count: t.id === "table" ? totalSignals
                : t.id === "themes" ? themes.length
                : t.id === "sources" ? sources.length
                : undefined,
            }))}
            active={view}
            onChange={setView}
          />
        </div>

        {/* ─── Research View (Featured + Top Lists) ─── */}
        {view === "featured" && (
          loading ? (
            <p className="text-mid text-sm text-center py-8">Loading signals...</p>
          ) : signals.length === 0 ? (
            <EmptyState title="No signals yet" message="Run a discovery cycle to populate signals" />
          ) : (
            <div className="space-y-5">
              {/* Featured Signal */}
              {featuredSignal && (
                <FeaturedSignalCard signal={featuredSignal} onGenerate={handleGenerate} />
              )}

              {/* Three columns: Top Pain / Top Volume / Recent */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Highest Pain */}
                <div className="card fade-up" style={{ animationDelay: "0.1s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={TIER_CONFIG.hot.icon} />
                    </svg>
                    <p className="label-caps text-[0.75rem]" style={{ color: "var(--terracotta)" }}>Highest Pain</p>
                  </div>
                  <div className="space-y-2">
                    {topPain.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-warm/30 last:border-0">
                        <div className="flex gap-px">
                          {[...Array(5)].map((_, j) => (
                            <div key={j} className="w-1 h-2.5 rounded-sm" style={{ backgroundColor: j < Math.ceil(s.pain_score / 20) ? "var(--terracotta)" : "var(--warm)" }} />
                          ))}
                        </div>
                        <p className="text-[0.8rem] truncate flex-1">{s.title}</p>
                        <span className="text-[0.75rem] tabular-nums text-mid/70">{Math.round(s.pain_score)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Highest Volume */}
                <div className="card fade-up" style={{ animationDelay: "0.15s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lilac)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <p className="label-caps text-[0.75rem]" style={{ color: "var(--lilac)" }}>Highest Volume</p>
                  </div>
                  <div className="space-y-2">
                    {topVolume.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-warm/30 last:border-0">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--warm)" }}>
                          <div className="h-full rounded-full" style={{ width: `${s.volume_score}%`, backgroundColor: "var(--lilac)" }} />
                        </div>
                        <p className="text-[0.8rem] truncate flex-1">{s.title}</p>
                        <span className="text-[0.75rem] tabular-nums text-mid/70">{Math.round(s.volume_score)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most Recent */}
                <div className="card fade-up" style={{ animationDelay: "0.2s" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--olive)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="label-caps text-[0.75rem]" style={{ color: "var(--olive)" }}>Most Recent</p>
                  </div>
                  <div className="space-y-2">
                    {recentSignals.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-warm/30 last:border-0">
                        <span className="text-[0.7rem] text-mid/60 w-10 flex-shrink-0">{daysAgo(s.discovered_at)}</span>
                        <p className="text-[0.8rem] truncate flex-1">{s.title}</p>
                        <Badge color={SOURCE_COLORS[s.source] ?? "var(--mid)"}>{s.source.replace(/_/g, " ").slice(0, 8)}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Full ranked list with filters */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="label-caps text-[0.75rem] text-mid/70">All Signals · Ranked by Score</p>
                  <FilterBar>
                    <FilterSelect
                      label="Segment"
                      value={segmentFilter}
                      options={[
                        { value: "all", label: `All (${signals.length})` },
                        { value: "b2c", label: `B2C (${b2cCount})` },
                        { value: "b2b", label: `B2B (${b2bCount})` },
                      ]}
                      onChange={setSegmentFilter}
                    />
                    <FilterSelect
                      label="Project"
                      value={projectFilter}
                      options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p, label: p }))]}
                      onChange={setProjectFilter}
                    />
                    <FilterSelect
                      label="Tier"
                      value={tierFilter}
                      options={[
                        { value: "all", label: "All Tiers" },
                        { value: "hot", label: "Hot" },
                        { value: "warm", label: "Warm" },
                        { value: "emerging", label: "Emerging" },
                        { value: "monitoring", label: "Monitoring" },
                      ]}
                      onChange={setTierFilter}
                    />
                    <FilterSearch value={search} onChange={setSearch} placeholder="Search signals..." />
                  </FilterBar>
                </div>
                <div className="space-y-1.5">
                  {filtered.slice(0, 30).map((signal, idx) => (
                    <SignalRow
                      key={signal.id}
                      signal={signal}
                      rank={idx + 1}
                      isExpanded={expandedId === signal.id}
                      onToggle={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
                      onGenerate={handleGenerate}
                      linkedIdeas={signalIdeaMap.get(signal.id)}
                    />
                  ))}
                  {filtered.length > 30 && (
                    <p className="text-xs text-mid/60 text-center py-2">Showing 30 of {filtered.length} signals</p>
                  )}
                </div>
              </div>
            </div>
          )
        )}


        {/* ─── Database View (Table) ─── */}
        {view === "table" && (
          <>
            <div className="mb-4 fade-up" style={{ animationDelay: "0.1s" }}>
              <FilterBar>
                <FilterSelect
                  label="Segment"
                  value={segmentFilter}
                  options={[
                    { value: "all", label: `All (${signals.length})` },
                    { value: "b2c", label: `B2C (${b2cCount})` },
                    { value: "b2b", label: `B2B (${b2bCount})` },
                  ]}
                  onChange={setSegmentFilter}
                />
                <FilterSelect
                  label="Project"
                  value={projectFilter}
                  options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p, label: p }))]}
                  onChange={setProjectFilter}
                />
                <FilterSelect
                  label="Tier"
                  value={tierFilter}
                  options={[
                    { value: "all", label: "All Tiers" },
                    { value: "hot", label: "Hot" },
                    { value: "warm", label: "Warm" },
                    { value: "emerging", label: "Emerging" },
                  ]}
                  onChange={setTierFilter}
                />
                <FilterSearch value={search} onChange={setSearch} placeholder="Search signals..." />
              </FilterBar>
            </div>

            {loading ? (
              <p className="text-mid text-sm text-center py-8">Loading signals...</p>
            ) : filtered.length === 0 ? (
              <EmptyState title="No signals" message="Adjust filters or run a discovery cycle" />
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[0.8rem] label-caps text-mid/80">
                  <span className="col-span-4">Signal</span>
                  <span className="col-span-1 text-right">Score</span>
                  <span className="col-span-1 text-right">Pain</span>
                  <span className="col-span-1 text-right">Vol</span>
                  <span className="col-span-1 text-center">X-val</span>
                  <span className="col-span-1">Source</span>
                  <span className="col-span-1">Project</span>
                  <span className="col-span-1">Tier</span>
                  <span className="col-span-1">Status</span>
                </div>
                {filtered.slice(0, 50).map((signal, idx) => {
                  const tier = signal.radar_tier ?? "monitoring";
                  return (
                    <div
                      key={signal.id}
                      className="card grid grid-cols-12 gap-3 items-center !py-3 fade-up"
                      style={{ animationDelay: `${0.1 + idx * 0.02}s` }}
                    >
                      <div className="col-span-4 min-w-0">
                        <p className="text-sm truncate">{signal.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[0.8rem] text-mid/70">{daysAgo(signal.discovered_at)}</span>
                          <IdeaLineageBadge ideas={signalIdeaMap.get(signal.id)} />
                        </div>
                      </div>
                      <div className="col-span-1 text-right">
                        <span className="text-sm tabular-nums font-medium" style={{ color: TIER_COLORS[tier] }}>
                          {Math.round(signal.final_score)}
                        </span>
                      </div>
                      <div className="col-span-1 text-right">
                        <span className="text-[0.8rem] tabular-nums" style={{ color: signal.pain_score >= 80 ? "var(--terracotta)" : "var(--mid)" }}>
                          {Math.round(signal.pain_score)}
                        </span>
                      </div>
                      <div className="col-span-1 text-right">
                        <span className="text-[0.8rem] tabular-nums" style={{ color: signal.volume_score >= 50 ? "var(--lilac)" : "var(--mid)" }}>
                          {Math.round(signal.volume_score)}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        {signal.cross_source_count > 1 ? (
                          <span className="text-[0.8rem] font-medium" style={{ color: "var(--lilac)" }}>{signal.cross_source_count}x</span>
                        ) : (
                          <span className="text-[0.8rem] text-mid/50">—</span>
                        )}
                      </div>
                      <div className="col-span-1">
                        <Badge color={SOURCE_COLORS[signal.source] ?? "var(--mid)"}>{signal.source.replace(/_/g, " ").slice(0, 8)}</Badge>
                      </div>
                      <div className="col-span-1">
                        <Badge color="var(--lilac)">{signal.project}</Badge>
                      </div>
                      <div className="col-span-1">
                        <Badge color={TIER_COLORS[tier]}>{tier}</Badge>
                      </div>
                      <div className="col-span-1">
                        <Badge color={signal.status === "used" ? "var(--olive)" : signal.status === "new" || signal.status === "active" ? "var(--amber)" : "var(--mid)"}>
                          {signal.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── Themes View ─── */}
        {view === "themes" && (
          <div className="space-y-3">
            {themes.length === 0 ? (
              <EmptyState title="No themes" message="Run discovery to generate themes" />
            ) : (
              themes.sort((a, b) => b.avg_score - a.avg_score).map((theme, idx) => (
                <div key={theme.theme_key} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s`, borderLeft: `3px solid ${TIER_COLORS[theme.tier] ?? "var(--mid)"}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge color={TIER_COLORS[theme.tier] ?? "var(--mid)"}>{theme.tier}</Badge>
                        <span className="text-[0.8rem] text-mid/70">{theme.total_signals} signal{theme.total_signals !== 1 ? "s" : ""}</span>
                        {theme.momentum_7d?.direction === "up" && <span className="text-olive text-xs">&#9650; trending</span>}
                        {theme.momentum_7d?.direction === "down" && <span className="text-terracotta text-xs">&#9660; declining</span>}
                        {theme.theme_confidence < 1 && (
                          <span className="text-[0.7rem] text-mid/55">{Math.round(theme.theme_confidence * 100)}% confidence</span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{theme.theme_title}</p>
                      {theme.theme_examples && theme.theme_examples.length > 0 && (
                        <p className="text-[0.8rem] text-mid/70 mt-1 italic truncate">&ldquo;{theme.theme_examples[0]}&rdquo;</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg tabular-nums" style={{ color: TIER_COLORS[theme.tier], fontFamily: "var(--font-cormorant), Georgia, serif" }}>
                        {Math.round(theme.avg_score)}
                      </p>
                      <p className="text-[0.75rem] text-mid/70">avg score</p>
                      {(theme.cross_source_count_avg ?? 0) > 1 && (
                        <p className="text-[0.7rem] mt-0.5" style={{ color: "var(--lilac)" }}>
                          {(theme.cross_source_count_avg ?? 0).toFixed(1)}x avg
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {theme.sources.map((src) => (
                      <span key={src} className="text-[0.75rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${SOURCE_COLORS[src] ?? "var(--mid)"}15`, color: SOURCE_COLORS[src] ?? "var(--mid)" }}>
                        {src.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── Sources View ─── */}
        {view === "sources" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.length === 0 ? (
              <EmptyState title="No sources" message="Sources appear after discovery runs" />
            ) : (
              sources.sort((a, b) => b.active_signals - a.active_signals).map((src, idx) => (
                <div key={src.source} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s`, borderLeft: `3px solid ${SOURCE_COLORS[src.source] ?? "var(--mid)"}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[src.source] ?? "var(--mid)" }}
                      />
                      <span className="text-sm font-medium capitalize">{src.source.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-xs tabular-nums px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--warm)", color: "var(--mid)" }}>
                      weight: {src.current_weight}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[0.75rem] text-mid/70 label-caps">Total</p>
                      <p className="text-lg tabular-nums" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>{src.total_signals}</p>
                    </div>
                    <div>
                      <p className="text-[0.75rem] text-mid/70 label-caps">Active</p>
                      <p className="text-lg tabular-nums" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--olive)" }}>{src.active_signals}</p>
                    </div>
                  </div>
                  {/* Activity bar */}
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--warm)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${src.total_signals > 0 ? (src.active_signals / src.total_signals) * 100 : 0}%`,
                      backgroundColor: SOURCE_COLORS[src.source] ?? "var(--mid)",
                    }} />
                  </div>
                  {src.last_signal && (
                    <p className="text-[0.75rem] text-mid/60 mt-2">
                      Last signal: {daysAgo(src.last_signal)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
