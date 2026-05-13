"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";

interface IdeaEvidence {
  niche?: string;
  signals_count?: number;
  cross_source_count?: number;
  max_cpc?: number;
  avg_final_score?: number;
  sources?: string[];
  sample_titles?: string[];
  related_product?: string | null;
  dimensions?: Record<string, number>;
  composite_score?: number;
}

interface Idea {
  slug: string;
  title?: string;
  tagline?: string;
  target_audience?: string;
  score?: number;
  segment?: string;
  product_type?: string;
  painkiller?: boolean;
  source?: string;
  evidence?: IdeaEvidence;
  status?: string;
  proposed_at?: string;
  _pool?: "queue" | "parked";
}

interface QueueResponse {
  queue?: { queue?: Idea[]; parked?: Idea[]; rejected?: Idea[] };
}

const REASON_CODES: { code: string; key: string; label: string; help: string }[] = [
  { code: "generic-theme",      key: "1", label: "Generic theme",    help: "Not a specific pain, just a category" },
  { code: "no-acute-pain",      key: "2", label: "No acute pain",    help: "Nice-to-have, not painkiller" },
  { code: "wrong-wealth",       key: "3", label: "Wrong wealth",     help: "Target customer won't pay enough" },
  { code: "b2c-saturated",      key: "4", label: "B2C saturated",    help: "Too noisy a consumer space" },
  { code: "wedge-unclear",      key: "5", label: "Wedge unclear",    help: "No obvious first-100-users path" },
  { code: "not-factory-fit",    key: "6", label: "Not factory fit",  help: "Doesn't match what Verto ships well" },
  { code: "signal-noise",       key: "7", label: "Signal noise",     help: "Upstream source produced garbage" },
  { code: "weak-evidence",      key: "8", label: "Weak evidence",    help: "Single signal, no cross-source" },
  { code: "wrong-persona",      key: "9", label: "Wrong persona",    help: "Audience doesn't match shipped wins" },
  { code: "built-wrong-before", key: "q", label: "Tried before",     help: "Adjacent attempts have failed" },
  { code: "no-distribution",    key: "w", label: "No distribution",  help: "No clear acquisition story" },
  { code: "boring",             key: "e", label: "Boring",           help: "Wouldn't enjoy building" },
];

const REVIEWED_KEY = "verto.sweep.reviewed";
const SESSION_RESULTS_KEY = "verto.sweep.session";

interface SessionEntry {
  slug: string;
  decision: "kept" | "rejected";
  reason_code?: string;
  ts: string;
}

export default function SweepPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeParked, setIncludeParked] = useState(false);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<SessionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Load reviewed-slugs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(REVIEWED_KEY);
      if (stored) setReviewed(new Set(JSON.parse(stored)));
      const sess = sessionStorage.getItem(SESSION_RESULTS_KEY);
      if (sess) setSession(JSON.parse(sess));
    } catch {}
  }, []);

  const persistReviewed = useCallback((s: Set<string>) => {
    try { localStorage.setItem(REVIEWED_KEY, JSON.stringify([...s])); } catch {}
  }, []);

  const persistSession = useCallback((s: SessionEntry[]) => {
    try { sessionStorage.setItem(SESSION_RESULTS_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/growth/ideas", { cache: "no-store" });
      const j: QueueResponse = await r.json();
      const queue = (j.queue?.queue ?? []).map((it) => ({ ...it, _pool: "queue" as const }));
      const parked = (j.queue?.parked ?? []).map((it) => ({ ...it, _pool: "parked" as const }));
      const all = includeParked ? [...queue, ...parked] : queue;
      setIdeas(all);
      setCursor(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [includeParked]);

  useEffect(() => { loadIdeas(); }, [loadIdeas]);

  const visibleIdeas = useMemo(
    () => (includeReviewed ? ideas : ideas.filter((it) => !reviewed.has(it.slug))),
    [ideas, reviewed, includeReviewed],
  );

  const current = visibleIdeas[cursor];
  const total = visibleIdeas.length;

  const markReviewed = useCallback((slug: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.add(slug);
      persistReviewed(next);
      return next;
    });
  }, [persistReviewed]);

  const advance = useCallback(() => {
    setCursor((c) => Math.min(c + 1, total - 1));
    setShowDetails(false);
    setNoteOpen(null);
    setNote("");
  }, [total]);

  const recordSession = useCallback((entry: SessionEntry) => {
    setSession((prev) => {
      const next = [...prev, entry];
      persistSession(next);
      return next;
    });
  }, [persistSession]);

  const handleKeep = useCallback(() => {
    if (!current) return;
    markReviewed(current.slug);
    recordSession({ slug: current.slug, decision: "kept", ts: new Date().toISOString() });
    advance();
  }, [current, markReviewed, recordSession, advance]);

  const handlePromote = useCallback(async () => {
    if (!current || busy || current._pool !== "parked") return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/growth/ideas/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: current.slug }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "promote failed");
      markReviewed(current.slug);
      recordSession({ slug: current.slug, decision: "kept", ts: new Date().toISOString() });
      setIdeas((prev) => prev.filter((it) => it.slug !== current.slug));
      setCursor((c) => Math.min(c, total - 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "promote failed");
    } finally {
      setBusy(false);
    }
  }, [current, busy, markReviewed, recordSession, total]);

  const handleSkip = useCallback(() => {
    advance();
  }, [advance]);

  const handleReject = useCallback(async (code: string, withNote?: string) => {
    if (!current || busy) return;
    const codeMeta = REASON_CODES.find((r) => r.code === code);
    if (!codeMeta) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/growth/ideas/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: current.slug, reason_code: code, note: withNote ?? "" }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "reject failed");
      markReviewed(current.slug);
      recordSession({
        slug: current.slug,
        decision: "rejected",
        reason_code: code,
        ts: new Date().toISOString(),
      });
      // Remove from local ideas list so cursor stays in place
      setIdeas((prev) => prev.filter((it) => it.slug !== current.slug));
      setCursor((c) => Math.min(c, total - 2));
      setShowDetails(false);
      setNoteOpen(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "reject failed");
    } finally {
      setBusy(false);
    }
  }, [current, busy, markReviewed, recordSession, total]);

  const resetReviewed = useCallback(() => {
    if (!confirm("Clear local 'reviewed' marks? Rejections stay in the queue.")) return;
    setReviewed(new Set());
    persistReviewed(new Set());
    setCursor(0);
  }, [persistReviewed]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (noteOpen) return; // capture in textarea
      if (e.key === "k") { e.preventDefault(); handleKeep(); }
      else if (e.key === "p") { e.preventDefault(); handlePromote(); }
      else if (e.key === "s") { e.preventDefault(); handleSkip(); }
      else if (e.key === "d") { e.preventDefault(); setShowDetails((v) => !v); }
      else if (e.key === "ArrowRight") { e.preventDefault(); advance(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else {
        const match = REASON_CODES.find((r) => r.key === e.key.toLowerCase());
        if (match) {
          e.preventDefault();
          handleReject(match.code);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleKeep, handleSkip, handleReject, handlePromote, advance, noteOpen]);

  if (loading) {
    return <main className="p-6"><div>Loading queue…</div></main>;
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Idea Reject Sweep</h1>
          <p className="text-sm opacity-70 mt-1">
            Walk through the qualified pool. Keep what fits the{" "}
            <Link href="#" className="underline">ideal-idea-profile</Link>;
            reject the rest with a reason so the scorer can learn.
          </p>
        </div>
        <Link href="/growth/ideas" className="text-sm underline opacity-70 hover:opacity-100">← Ideas dashboard</Link>
      </header>

      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeParked} onChange={(e) => setIncludeParked(e.target.checked)} />
          Include parked
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeReviewed} onChange={(e) => setIncludeReviewed(e.target.checked)} />
          Show already-reviewed
        </label>
        <button onClick={resetReviewed} className="text-xs opacity-60 hover:opacity-100 underline">
          Reset reviewed marks
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs opacity-70">
          <span>{session.filter((s) => s.decision === "kept").length} kept</span>
          <span>{session.filter((s) => s.decision === "rejected").length} rejected this session</span>
        </div>
      </div>

      {error && (
        <Card className="mb-4" style={{ borderColor: "#e66" }}>
          <div className="text-sm" style={{ color: "#e66" }}>⚠ {error}</div>
        </Card>
      )}

      {!current ? (
        <Card>
          <div className="p-6 text-center">
            <div className="text-lg font-medium mb-2">
              {ideas.length === 0 ? "Queue is empty." : "All caught up."}
            </div>
            <div className="text-sm opacity-70">
              {ideas.length === 0
                ? "Nothing in the qualified pool right now."
                : `${ideas.length} idea(s) already reviewed this round. Uncheck 'reviewed' filter to re-walk them, or reset marks.`}
            </div>
            {session.length > 0 && (
              <div className="mt-6 text-left max-w-md mx-auto">
                <div className="text-sm font-medium mb-2">Session decisions</div>
                <ul className="text-xs space-y-1">
                  {session.slice(-12).reverse().map((e, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate">{e.slug}</span>
                      <span style={{ color: e.decision === "kept" ? "#3b8" : "#c66" }}>
                        {e.decision}{e.reason_code ? ` · ${e.reason_code}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs opacity-60 mb-2">
            <div>{cursor + 1} of {total}  ·  {current._pool}</div>
            <div>← / → navigate · k keep · s skip · d details · 1-9 q w e to reject</div>
          </div>

          <Card>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-2xl font-semibold mb-1">{current.title || current.slug}</div>
                  <div className="text-sm opacity-80">{current.tagline}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge color="#5B6FA8">score {current.score ?? "?"}</Badge>
                  <Badge color="#888">{current.source ?? "?"}</Badge>
                  {current.painkiller && <Badge color="#3b8">painkiller</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm opacity-80 mb-3">
                <div><b>Target:</b> {current.target_audience || "?"}</div>
                <div><b>Segment:</b> {current.segment || "?"}</div>
                <div><b>Niche:</b> {current.evidence?.niche || "?"}</div>
                <div><b>Signals:</b> {current.evidence?.signals_count ?? "?"} (cross-source: {current.evidence?.cross_source_count ?? "?"})</div>
              </div>

              {current.evidence?.sample_titles && current.evidence.sample_titles.length > 0 && (
                <div className="text-xs opacity-70 mb-3">
                  <b>Sample signal:</b> {current.evidence.sample_titles[0]}
                </div>
              )}

              <button
                className="text-xs underline opacity-60 hover:opacity-100 mb-3"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "Hide" : "Show"} full evidence
              </button>

              {showDetails && (
                <pre className="text-[10px] bg-black/30 p-3 rounded overflow-auto max-h-80">
                  {JSON.stringify(current, null, 2)}
                </pre>
              )}
            </div>

            <div className="border-t border-white/10 p-4 flex flex-wrap gap-2">
              <button
                onClick={handleKeep}
                disabled={busy}
                className="px-4 py-2 rounded font-medium"
                style={{ background: "#3b8", color: "#000" }}
                title={current._pool === "parked"
                  ? "Mark reviewed locally — leaves the idea parked"
                  : "Keep in queue, mark reviewed"}
              >
                Keep <span className="opacity-60 text-xs ml-1">(k)</span>
              </button>
              {current._pool === "parked" && (
                <button
                  onClick={handlePromote}
                  disabled={busy}
                  className="px-4 py-2 rounded font-medium"
                  style={{ background: "#5B6FA8", color: "#fff" }}
                  title="Move from parked to queue — Scout-synth ideas need this to escape quarantine"
                >
                  Promote → queue <span className="opacity-60 text-xs ml-1">(p)</span>
                </button>
              )}
              <button
                onClick={handleSkip}
                disabled={busy}
                className="px-4 py-2 rounded font-medium"
                style={{ background: "#444", color: "#fff" }}
              >
                Skip <span className="opacity-60 text-xs ml-1">(s)</span>
              </button>
              <div className="w-full mt-2 text-xs opacity-60">Reject with reason:</div>
              {REASON_CODES.map((r) => (
                <button
                  key={r.code}
                  onClick={() => handleReject(r.code)}
                  disabled={busy}
                  title={r.help}
                  className="px-3 py-1.5 rounded text-sm hover:opacity-80"
                  style={{ background: "#3a1f1f", color: "#fbb", border: "1px solid #5a2929" }}
                >
                  <span className="opacity-60 text-xs mr-1">{r.key}</span>{r.label}
                </button>
              ))}
              <button
                onClick={() => setNoteOpen(current.slug)}
                disabled={busy}
                className="px-3 py-1.5 rounded text-sm"
                style={{ background: "#3a1f1f", color: "#fbb", border: "1px solid #5a2929" }}
              >
                Other (with note)
              </button>
            </div>
          </Card>

          {noteOpen === current.slug && (
            <Card className="mt-3">
              <div className="p-4">
                <div className="text-sm font-medium mb-2">Reject with custom reason</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full bg-black/30 p-2 rounded text-sm"
                  placeholder="Why are you rejecting this? (this gets logged)"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    disabled={!note.trim() || busy}
                    onClick={() => handleReject("other", note.trim())}
                    className="px-3 py-1.5 rounded text-sm"
                    style={{ background: "#c66", color: "#000" }}
                  >
                    Reject with note
                  </button>
                  <button
                    onClick={() => { setNoteOpen(null); setNote(""); }}
                    className="px-3 py-1.5 rounded text-sm opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
