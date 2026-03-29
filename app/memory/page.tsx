"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Learning {
  name: string;
  date: string;
  title: string;
}

interface MemoryIndex {
  dates: string[];
  learnings: Learning[];
  proposalCount: number;
  memory: { wordCount: number; updatedAt: string };
}

interface JournalEntry {
  kind: "brief" | "decision" | "proposal" | "learning";
  time?: string;
  title: string;
  body?: string;
  meta?: string;
  tag?: string;
}

interface JournalDay {
  date: string;
  entries: JournalEntry[];
  hasContent: boolean;
  briefCount: number;
  decisionCount: number;
}

interface MemoryFile {
  name: string;
  type: string;
  description: string;
  content: string;
  source: "brain" | "mimir";
}

interface BrainDoc {
  content: string;
  wordCount: number;
  updatedAt: string;
}

interface LongTermData {
  brain: {
    insights: BrainDoc | null;
    strategy: BrainDoc | null;
    principles: BrainDoc | null;
    now: BrainDoc | null;
  };
  mimir: { files: MemoryFile[]; byType: Record<string, MemoryFile[]>; total: number };
}

interface SearchResult {
  file: string;
  source: "brain" | "mimir" | "learning" | "proposal";
  date?: string;
  preview: string;
  matchCount: number;
}

type PanelView =
  | { kind: "welcome" }
  | { kind: "journal"; date: string }
  | { kind: "long-term" }
  | { kind: "learning"; name: string }
  | { kind: "search" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupDates(dates: string[]): { label: string; dates: string[] }[] {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const groups: { label: string; dates: string[] }[] = [
    { label: "Today", dates: [] },
    { label: "Yesterday", dates: [] },
    { label: "This Week", dates: [] },
    { label: "This Month", dates: [] },
    { label: "Older", dates: [] },
  ];

  for (const d of dates) {
    if (d === today) groups[0].dates.push(d);
    else if (d === yesterday) groups[1].dates.push(d);
    else if (d > weekAgo) groups[2].dates.push(d);
    else if (d > monthAgo) groups[3].dates.push(d);
    else groups[4].dates.push(d);
  }

  return groups.filter((g) => g.dates.length > 0);
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDateLong(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  brain: "Brain",
  mimir: "Mimir",
  learning: "Learning",
  proposal: "Proposal",
};

const SOURCE_COLORS: Record<string, string> = {
  brain: "var(--olive)",
  mimir: "#5B6FA8",
  learning: "var(--terracotta)",
  proposal: "var(--amber)",
};

// ─── Markdown Renderer (reuses proposals pattern) ────────────────────────────

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("# "))
      return <h2 key={i} className="text-2xl mt-5 mb-2" style={{ color: "var(--charcoal)" }}>{line.slice(2)}</h2>;
    if (line.startsWith("## "))
      return <h3 key={i} className="text-lg mt-4 mb-1" style={{ color: "var(--charcoal)" }}>{line.slice(3)}</h3>;
    if (line.startsWith("### "))
      return <h4 key={i} className="text-base mt-3 mb-1" style={{ color: "var(--mid)" }}>{line.slice(4)}</h4>;
    if (line.startsWith("> "))
      return (
        <p key={i} className="pl-3 border-l-2 text-sm my-0.5 italic" style={{ borderColor: "var(--warm)", color: "var(--mid)" }}>
          {line.slice(2)}
        </p>
      );
    if (line.startsWith("---"))
      return <hr key={i} className="my-3" style={{ borderColor: "var(--warm)" }} />;
    if (line.match(/^\d+\.\s/))
      return <p key={i} className="ml-4 text-sm my-0.5">{line}</p>;
    if (line.startsWith("- **") || line.startsWith("- ["))
      return <p key={i} className="ml-4 text-sm my-0.5">&bull; {line.slice(2)}</p>;
    if (line.startsWith("- "))
      return <p key={i} className="ml-4 text-sm my-0.5">&bull; {line.slice(2)}</p>;
    if (line.trim() === "")
      return <div key={i} className="h-1.5" />;
    if (line.startsWith("**") && line.endsWith("**"))
      return <p key={i} className="text-sm font-semibold my-0.5">{line.replace(/\*\*/g, "")}</p>;
    return <p key={i} className="text-sm my-0.5" style={{ color: "var(--charcoal)" }}>{line}</p>;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 mt-3">
      <span className="label-caps text-xs tracking-widest">{label}</span>
      {count !== undefined && (
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--mid)", background: "var(--warm)" }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Panel: Welcome ───────────────────────────────────────────────────────────

function WelcomePanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--mid)" }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
      <p className="text-sm" style={{ opacity: 0.6 }}>Select a date or section to explore memory</p>
    </div>
  );
}

// ─── Entry kind config ────────────────────────────────────────────────────────

const KIND_CONFIG = {
  brief: { color: "var(--terracotta)", bg: "var(--terracotta-soft)", label: "Brief" },
  decision: { color: "var(--olive)", bg: "var(--olive-soft)", label: "Decision" },
  proposal: { color: "var(--lilac)", bg: "var(--lilac-soft)", label: "Proposal" },
  learning: { color: "var(--amber)", bg: "var(--amber-soft)", label: "Learning" },
} as const;

// ─── Panel: Journal Day ───────────────────────────────────────────────────────

function JournalPanel({ date }: { date: string }) {
  const [data, setData] = useState<JournalDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0])); // first entry open by default

  useEffect(() => {
    setLoading(true);
    setExpanded(new Set([0]));
    fetch(`/api/memory/journal?date=${date}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  if (loading) {
    return <div className="p-6 text-sm" style={{ color: "var(--mid)" }}>Loading {date}…</div>;
  }

  if (!data || !data.hasContent) {
    return (
      <div className="p-6">
        <h2 className="text-2xl mb-1" style={{ color: "var(--charcoal)" }}>Journal: {date}</h2>
        <p className="text-xs mb-4" style={{ color: "var(--mid)" }}>{formatDateLong(date)}</p>
        <p className="text-sm" style={{ color: "var(--mid)" }}>No briefs, decisions, or learnings recorded for this date.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scroll">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--warm)" }}>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl" style={{ color: "var(--charcoal)" }}>Journal: {date}</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--mid)" }}>
          {formatDateLong(date)}
          {data.briefCount > 0 && ` · ${data.briefCount} brief${data.briefCount > 1 ? "s" : ""}`}
          {data.decisionCount > 0 && ` · ${data.decisionCount} decision${data.decisionCount > 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Entries */}
      <div className="px-6 py-4 flex flex-col gap-3">
        {data.entries.map((entry, idx) => {
          const cfg = KIND_CONFIG[entry.kind];
          const isOpen = expanded.has(idx);
          const isBrief = entry.kind === "brief";
          const isDecision = entry.kind === "decision";

          return (
            <div key={idx} className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Entry header — always visible */}
              <button
                className="w-full text-left flex items-start gap-3 cursor-pointer"
                style={{ padding: "0.875rem 1rem", background: "transparent", border: "none" }}
                onClick={() => toggle(idx)}
              >
                {/* Kind badge + time */}
                <div className="flex flex-col items-start gap-1 shrink-0" style={{ minWidth: 80 }}>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    {entry.tag ? `${entry.tag === "morning" ? "☀" : "🌙"} ${cfg.label}` : cfg.label}
                  </span>
                  {entry.time && (
                    <span className="text-xs" style={{ color: "var(--mid)", fontFamily: "var(--font-dm-mono)" }}>
                      {entry.time}
                    </span>
                  )}
                </div>

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--charcoal)" }}>{entry.title}</p>
                  {entry.meta && !isBrief && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--mid)" }}>{entry.meta}</p>
                  )}
                  {/* Decision body shown in expanded state only — title is already a preview */}
                </div>

                {/* Expand toggle for entries with a body */}
                {entry.body && (
                  <span className="text-xs shrink-0 mt-0.5" style={{ color: "var(--mid)" }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                )}
              </button>

              {/* Expanded body */}
              {isOpen && entry.body && (
                <div
                  className="px-4 pb-4 overflow-y-auto custom-scroll"
                  style={{
                    borderTop: "1px solid var(--warm)",
                    maxHeight: isBrief ? 520 : 360,
                    paddingTop: "0.875rem",
                  }}
                >
                  {renderMarkdown(entry.body)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel: Long-Term Memory ──────────────────────────────────────────────────

type BrainTab = "strategy" | "principles" | "insights";
type MainTab = "brain" | "mimir";

const BRAIN_TABS: { key: BrainTab; label: string; field: keyof LongTermData["brain"] }[] = [
  { key: "strategy", label: "Strategy", field: "strategy" },
  { key: "principles", label: "Principles", field: "principles" },
  { key: "insights", label: "Insights", field: "insights" },
];

function LongTermPanel() {
  const [data, setData] = useState<LongTermData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>("brain");
  const [brainTab, setBrainTab] = useState<BrainTab>("strategy");
  const [expandedMimir, setExpandedMimir] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/memory/long-term")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm" style={{ color: "var(--mid)" }}>Loading long-term memory…</div>;
  if (!data) return <div className="p-6 text-sm" style={{ color: "var(--mid)" }}>Failed to load memory.</div>;

  const typeOrder = ["feedback", "project", "user", "reference"];
  const sortedTypes = Object.keys(data.mimir.byType).sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  const activeBrainDoc = data.brain[BRAIN_TABS.find((t) => t.key === brainTab)!.field];
  const totalBrainWords = [data.brain.strategy, data.brain.principles, data.brain.insights]
    .reduce((s, d) => s + (d?.wordCount ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-2xl" style={{ color: "var(--charcoal)" }}>Long-Term Memory</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: "var(--olive)", background: "var(--olive-soft)" }}>
            🧠 Shared
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--mid)" }}>
          Brain: {totalBrainWords} words &nbsp;·&nbsp; Mimir: {data.mimir.total} files
        </p>
      </div>

      {/* Main tab bar */}
      <div className="px-6 flex gap-1 shrink-0 border-b" style={{ borderColor: "var(--warm)" }}>
        {(["brain", "mimir"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            className="px-3 py-2 text-xs cursor-pointer transition-colors"
            style={{
              color: mainTab === t ? "var(--terracotta)" : "var(--mid)",
              borderBottom: mainTab === t ? "2px solid var(--terracotta)" : "2px solid transparent",
              background: "transparent",
            }}
          >
            {t === "brain" ? "OpenClaw Brain" : `Mimir (${data.mimir.total})`}
          </button>
        ))}
      </div>

      {/* Brain sub-tabs */}
      {mainTab === "brain" && (
        <div className="px-6 flex gap-0.5 shrink-0 border-b" style={{ borderColor: "var(--warm)", background: "var(--bg)" }}>
          {BRAIN_TABS.map((t) => {
            const doc = data.brain[t.field];
            return (
              <button
                key={t.key}
                onClick={() => setBrainTab(t.key)}
                className="px-3 py-1.5 text-xs cursor-pointer transition-colors flex items-center gap-1.5"
                style={{
                  color: brainTab === t.key ? "var(--charcoal)" : "var(--mid)",
                  borderBottom: brainTab === t.key ? "2px solid var(--olive)" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                {t.label}
                {doc && (
                  <span className="text-xs" style={{ color: "var(--mid)", opacity: 0.7 }}>
                    {doc.wordCount}w
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scroll px-6 py-4">
        {mainTab === "brain" && (
          activeBrainDoc
            ? (
              <div>
                <p className="text-xs mb-4" style={{ color: "var(--mid)" }}>
                  Updated {activeBrainDoc.updatedAt}
                </p>
                {renderMarkdown(activeBrainDoc.content)}
              </div>
            )
            : <p className="text-sm" style={{ color: "var(--mid)" }}>No content found.</p>
        )}

        {mainTab === "mimir" && (
          <div className="flex flex-col gap-2">
            {sortedTypes.map((type) => (
              <div key={type}>
                <SectionHeader label={type} count={data.mimir.byType[type].length} />
                {data.mimir.byType[type].map((f) => {
                  const isOpen = expandedMimir === f.name;
                  return (
                    <div
                      key={f.name}
                      className="card mb-2"
                      style={{ padding: "0.75rem 1rem" }}
                    >
                      <div
                        className="flex items-start justify-between cursor-pointer"
                        onClick={() => setExpandedMimir(isOpen ? null : f.name)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: "var(--charcoal)" }}>{f.name}</p>
                          {f.description && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--mid)" }}>{f.description}</p>
                          )}
                        </div>
                        <span className="text-xs ml-2 shrink-0" style={{ color: "var(--mid)" }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>
                      {isOpen && (
                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--warm)" }}>
                          {renderMarkdown(f.content)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel: Learning ──────────────────────────────────────────────────────────

function LearningPanel({ name }: { name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch via proposals-style API — reuse learning endpoint via search or dedicated route
    fetch(`/api/memory/search?q=${encodeURIComponent(name.replace(/\.md$/, "").slice(0, 30))}`)
      .then((r) => r.json())
      .then((d) => {
        const match = d.results?.find((r: SearchResult) => r.file === name);
        if (match) {
          // Load full file content via long-term endpoint workaround
          return fetch(`/api/memory/long-term`);
        }
        return null;
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Simpler: fetch full content directly from the server route
    fetch(`/api/memory/learning?name=${encodeURIComponent(name)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.content) setContent(d.content); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  const title = name.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-?/, "").replace(/-/g, " ");

  return (
    <div className="p-6 h-full overflow-y-auto custom-scroll">
      <h2 className="text-2xl mb-1 capitalize" style={{ color: "var(--charcoal)" }}>{title}</h2>
      <p className="text-xs mb-4" style={{ color: "var(--mid)" }}>{name}</p>
      {loading && <p className="text-sm" style={{ color: "var(--mid)" }}>Loading…</p>}
      {content && renderMarkdown(content)}
      {!loading && !content && (
        <p className="text-sm" style={{ color: "var(--mid)" }}>Select a date from the journal or use search to find content.</p>
      )}
    </div>
  );
}

// ─── Panel: Search ────────────────────────────────────────────────────────────

function SearchPanel({ query, onSelectDate }: { query: string; onSelectDate: (date: string) => void }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/memory/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => setResults(d.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  if (!query || query.length < 2) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--mid)" }}>Type at least 2 characters to search</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto custom-scroll">
      <div className="mb-4">
        <h2 className="text-2xl" style={{ color: "var(--charcoal)" }}>Search: "{query}"</h2>
        {!loading && (
          <p className="text-xs mt-1" style={{ color: "var(--mid)" }}>
            {results.length} result{results.length !== 1 ? "s" : ""} across all memory files
          </p>
        )}
      </div>

      {loading && <p className="text-sm" style={{ color: "var(--mid)" }}>Searching…</p>}

      <div className="flex flex-col gap-3">
        {results.map((r, i) => (
          <div key={i} className="card" style={{ padding: "0.75rem 1rem" }}>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: SOURCE_COLORS[r.source] ?? "var(--mid)", background: `${SOURCE_COLORS[r.source]}20` }}
              >
                {SOURCE_LABELS[r.source] ?? r.source}
              </span>
              {r.date && (
                <span className="text-xs" style={{ color: "var(--mid)" }}>{r.date}</span>
              )}
              <span className="text-xs ml-auto" style={{ color: "var(--mid)" }}>
                {r.matchCount} match{r.matchCount !== 1 ? "es" : ""}
              </span>
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "var(--charcoal)" }}>
              {r.file.replace(/\.md$/, "").replace(/_/g, " ")}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--mid)" }}>
              {r.preview}
            </p>
            {r.source === "learning" && r.date && (
              <button
                onClick={() => onSelectDate(r.date!)}
                className="mt-2 text-xs cursor-pointer"
                style={{ color: "var(--terracotta)", background: "none", border: "none", padding: 0 }}
              >
                View journal for {r.date} →
              </button>
            )}
          </div>
        ))}

        {!loading && results.length === 0 && (
          <p className="text-sm" style={{ color: "var(--mid)" }}>No results found for "{query}"</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [index, setIndex] = useState<MemoryIndex | null>(null);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [panel, setPanel] = useState<PanelView>({ kind: "welcome" });
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Today", "Yesterday", "This Week"]));
  const [learningsOpen, setLearningsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => {})
      .finally(() => setIndexLoaded(true));
  }, []);

  // Auto-open today's journal if it exists
  useEffect(() => {
    if (index?.dates?.length && panel.kind === "welcome") {
      const today = new Date().toISOString().slice(0, 10);
      if (index.dates.includes(today)) {
        setPanel({ kind: "journal", date: today });
      }
    }
  }, [index]);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length >= 2) {
      searchTimeout.current = setTimeout(() => {
        setPanel({ kind: "search" });
      }, 300);
    }
  }, []);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const dateGroups = index ? groupDates(index.dates) : [];
  const selectedDate = panel.kind === "journal" ? panel.date : null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 h-full overflow-y-auto custom-scroll"
        style={{
          width: 240,
          background: "var(--paper)",
          borderRight: "1px solid var(--warm)",
        }}
      >
        {/* Search */}
        <div className="px-3 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--bg)", border: "1px solid var(--warm)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--mid)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search memory…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--charcoal)", fontFamily: "var(--font-dm-mono)" }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setPanel({ kind: "welcome" }); }} style={{ color: "var(--mid)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>×</button>
            )}
          </div>
        </div>

        {/* Long-Term Memory card */}
        <div className="px-3 py-2">
          <button
            onClick={() => setPanel({ kind: "long-term" })}
            className="w-full text-left rounded-xl p-3 transition-all"
            style={{
              background: panel.kind === "long-term" ? "var(--terracotta-soft)" : "var(--warm)",
              border: panel.kind === "long-term" ? "1px solid var(--terracotta)" : "1px solid transparent",
            }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span>🧠</span>
              <span className="text-sm font-medium" style={{ color: "var(--charcoal)" }}>Long-Term Memory</span>
            </div>
            {index?.memory && (
              <p className="text-xs" style={{ color: "var(--mid)" }}>
                {index.memory.wordCount} words · Updated {index.memory.updatedAt}
              </p>
            )}
          </button>
        </div>

        {/* Daily Journal */}
        {indexLoaded && (
          <>
            <SectionHeader label="Daily Journal" count={index?.dates.length} />
            {dateGroups.map((group) => (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-1 text-xs cursor-pointer"
                  style={{ color: "var(--mid)", background: "transparent", border: "none" }}
                >
                  <span>
                    {expandedGroups.has(group.label) ? "▾" : "▸"} {group.label} ({group.dates.length})
                  </span>
                </button>
                {expandedGroups.has(group.label) && (
                  <div className="flex flex-col">
                    {group.dates.map((date) => (
                      <button
                        key={date}
                        onClick={() => setPanel({ kind: "journal", date })}
                        className="w-full text-left px-4 py-1.5 text-xs transition-colors"
                        style={{
                          color: selectedDate === date ? "var(--terracotta)" : "var(--charcoal)",
                          background: selectedDate === date ? "var(--terracotta-soft)" : "transparent",
                          borderLeft: selectedDate === date ? "2px solid var(--terracotta)" : "2px solid transparent",
                          cursor: "pointer",
                        }}
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Learnings */}
        {index && index.learnings.length > 0 && (
          <>
            <SectionHeader label="Learnings" count={index.learnings.length} />
            <button
              onClick={() => setLearningsOpen(!learningsOpen)}
              className="w-full flex items-center justify-between px-3 py-1 text-xs cursor-pointer"
              style={{ color: "var(--mid)", background: "transparent", border: "none" }}
            >
              <span>{learningsOpen ? "▾" : "▸"} Postmortems & Insights</span>
            </button>
            {learningsOpen && index.learnings.map((l) => (
              <button
                key={l.name}
                onClick={() => setPanel({ kind: "learning", name: l.name })}
                className="w-full text-left px-4 py-1.5 text-xs transition-colors"
                style={{
                  color: panel.kind === "learning" && (panel as {kind: string; name: string}).name === l.name ? "var(--terracotta)" : "var(--charcoal)",
                  background: panel.kind === "learning" && (panel as {kind: string; name: string}).name === l.name ? "var(--terracotta-soft)" : "transparent",
                  borderLeft: panel.kind === "learning" && (panel as {kind: string; name: string}).name === l.name ? "2px solid var(--terracotta)" : "2px solid transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span className="block truncate capitalize">{l.title || l.name.replace(/\.md$/, "")}</span>
                {l.date && <span style={{ color: "var(--mid)" }}>{l.date}</span>}
              </button>
            ))}
          </>
        )}

        {/* Proposals link */}
        {index && index.proposalCount > 0 && (
          <>
            <SectionHeader label="Proposals" count={index.proposalCount} />
            <a
              href="/proposals"
              className="block px-4 py-1.5 text-xs"
              style={{ color: "var(--mid)", textDecoration: "none" }}
            >
              → View in Proposals page
            </a>
          </>
        )}

        <div className="flex-1" />
      </aside>

      {/* ── Right Panel ────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full overflow-hidden" style={{ background: "var(--bg)" }}>
        {panel.kind === "welcome" && <WelcomePanel />}
        {panel.kind === "journal" && <JournalPanel date={panel.date} />}
        {panel.kind === "long-term" && <LongTermPanel />}
        {panel.kind === "learning" && <LearningPanel name={(panel as {kind: string; name: string}).name} />}
        {panel.kind === "search" && (
          <SearchPanel
            query={searchQuery}
            onSelectDate={(date) => setPanel({ kind: "journal", date })}
          />
        )}
      </main>
    </div>
  );
}
