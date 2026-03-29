"use client";

import { useState, useMemo, useCallback, type FormEvent } from "react";
import { FactorySummary, type FactorySummaryData } from "./FactorySummary";
import { PortfolioKPIs, type PortfolioKPIData } from "./PortfolioKPIs";
import { CommandBar } from "./CommandBar";
import { TaskBoard } from "./TaskBoard";
import {
  agent,
  ALL_AGENT_IDS,
  isAttention,
  relTime,
  type PulseData,
  type PulseEvent,
} from "@/app/lib/agents";
import type { Task } from "@/app/lib/tasks";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  roadmap: { done: number; total: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  failures: { recent: number; daysSince: number | null };
}

interface InboxItem { text: string; done: boolean; raw: string; }
interface BriefFile { name: string; content: string; }

interface WorkflowActive {
  workflow: string; runId: string; currentStep: string | null; approvalPending: boolean;
}
interface WorkflowData {
  state: { active: WorkflowActive[]; completed: unknown[]; blocked: unknown[] };
  stats: { approvalsPending: number };
}

interface ProjectLane {
  slug: string; name: string; isStalled: boolean; staleDays: number;
  lifecyclePhase: string; activeAgents: string[];
}

interface ExpeditionData {
  slug: string; name: string; isOverdue: boolean; timeRemaining: number | null;
}

interface ProposalData {
  filename: string; title: string; date: string; scope: string; priority: string;
  kind: "proposal" | "info"; status: "pending" | "approved" | "rejected" | "deferred";
  content: string;
}

// ─── Queue item union ────────────────────────────────────────────────────────

type QueueItem =
  | { kind: "factory"; id: string; slug: string; displayName: string; completedPhases: number; totalPhases: number; lastActivity: { agent: string; outcome: string; timestamp: string } | null; arrivedAt: string | null }
  | { kind: "proposal"; id: string; proposal: ProposalData }
  | { kind: "inbox"; id: string; item: InboxItem }
  | { kind: "stalled"; id: string; name: string; staleDays: number }
  | { kind: "overdue"; id: string; name: string; hoursOver: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMdSections(md: string) {
  const clean = md.replace(/^---[\s\S]*?---\n*/m, "");
  const status = clean.match(/## Status:?\s*(.+)/)?.[1]?.trim() ?? "";
  const focus: string[] = [], blockers: string[] = [];
  let current: string[] | null = null;
  for (const line of clean.split("\n")) {
    if (/week.*focus|sprint.*focus/i.test(line)) { current = focus; continue; }
    if (/active blockers|needs attention/i.test(line)) { current = blockers; continue; }
    if (/tonight|scheduled|current roadmap|today.s wins/i.test(line)) { current = null; continue; }
    if (/^##/.test(line)) { current = null; continue; }
    if (current && /^-\s/.test(line.trim())) {
      current.push(line.trim().replace(/^-\s*/, "").replace(/\*\*/g, "").replace(/^✅\s*/, ""));
    }
  }
  return { status, focus, blockers };
}

function stripMd(content: string, maxLen = 320): string {
  return content
    .replace(/^---[\s\S]*?---\n*/m, "")
    .replace(/^#+\s+.+/gm, "")
    .replace(/>\s*(Status|Scope|Priority|Filed)[^:\n]*:\s*[^\n]+/gi, "")
    .replace(/>\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
}

function priorityFromText(text: string): "P0" | "P1" | null {
  const m = text.match(/^\[(P[01])\]/);
  return m ? (m[1] as "P0" | "P1") : null;
}

// How long ago an ISO date string was — returns e.g. "4d", "2h", "3 wk"
function ageLabel(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return "";
  const ms = Date.now() - new Date(isoOrDate).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)} wk`;
}

function inboxDateFromText(text: string): string | null {
  const m = text.match(/\((\d{4}-\d{2}-\d{2})\)/);
  return m ? m[1] : null;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const TYPE_META = {
  factory:  { label: "FACTORY",  bg: "var(--lilac-soft)",      text: "var(--lilac)"      },
  proposal: { label: "PROPOSAL", bg: "var(--amber-soft)",      text: "var(--amber)"      },
  inbox:    { label: "INBOX",    bg: "rgba(72,69,63,0.07)",    text: "var(--mid)"        },
  stalled:  { label: "STALLED",  bg: "var(--terracotta-soft)", text: "var(--terracotta)" },
  overdue:  { label: "OVERDUE",  bg: "var(--terracotta-soft)", text: "var(--terracotta)" },
} as const;

const AGENT_STATUS_META = {
  running: { label: "Running", color: "var(--olive)",      dot: "var(--olive)",      pulse: true  },
  error:   { label: "Error",   color: "var(--terracotta)", dot: "var(--terracotta)", pulse: true  },
  idle:    { label: "Idle",    color: "var(--mid)",        dot: "var(--warm)",       pulse: false },
} as const;

// ─── Primitives ───────────────────────────────────────────────────────────────

function TypePill({ kind }: { kind: QueueItem["kind"] }) {
  const m = TYPE_META[kind];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[0.63rem] font-medium tracking-widest flex-shrink-0"
      style={{ backgroundColor: m.bg, color: m.text }}
    >
      {m.label}
    </span>
  );
}

function Btn({
  label, color, onClick, disabled,
}: {
  label: string; color: "olive" | "terracotta" | "mid"; onClick: () => void; disabled?: boolean;
}) {
  const C = {
    olive:      { bg: "var(--olive-soft)",      border: "#76875a38", text: "var(--olive)"      },
    terracotta: { bg: "var(--terracotta-soft)", border: "#bc614338", text: "var(--terracotta)" },
    mid:        { bg: "rgba(72,69,63,0.05)",    border: "#48453f22", text: "var(--mid)"        },
  }[color];
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="inline-flex items-center px-2.5 py-1 rounded-md text-[0.75rem] font-medium transition-all disabled:opacity-40 cursor-pointer active:scale-95"
      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, color: C.text }}
    >
      {label}
    </button>
  );
}

function ReversibilityFlag({ safe }: { safe: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5.5" stroke={safe ? "var(--olive)" : "var(--amber)"} strokeWidth="1" />
        <text x="6" y="9" textAnchor="middle" fontSize="7" fill={safe ? "var(--olive)" : "var(--amber)"} fontFamily="monospace">
          {safe ? "✓" : "!"}
        </text>
      </svg>
      <span className="text-[0.7rem]" style={{ color: safe ? "var(--olive)" : "var(--amber)" }}>
        {safe
          ? "Reversible — can be changed later"
          : "Irreversible — cannot be undone once confirmed"}
      </span>
    </div>
  );
}

// ─── Evidence packs ───────────────────────────────────────────────────────────

function FactoryPack({ item }: { item: Extract<QueueItem, { kind: "factory" }> }) {
  const pct = Math.round((item.completedPhases / Math.max(item.totalPhases, 1)) * 100);
  const a = item.lastActivity ? agent(item.lastActivity.agent) : null;
  return (
    <div className="space-y-3.5">
      <div>
        <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Why this needs you</p>
        <p className="text-[0.82rem] text-charcoal/80 leading-relaxed">
          All build phases are complete. The factory loop paused here specifically for your review before
          committing to App Store submission and activating the marketing and distribution pipeline.
        </p>
        <ReversibilityFlag safe={false} />
      </div>
      <div className="border-t border-warm/60 pt-3 space-y-2">
        <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Phase progress</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-warm overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "var(--lilac)" }} />
          </div>
          <span className="text-[0.75rem] text-mid tabular-nums flex-shrink-0">{item.completedPhases}/{item.totalPhases} phases</span>
        </div>
        {item.lastActivity && a && (
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[0.58rem] text-white mt-0.5" style={{ backgroundColor: a.color }}>{a.label}</span>
            <div>
              <span className="text-[0.78rem] text-charcoal/75">{item.lastActivity.outcome}</span>
              <span className="text-[0.68rem] text-mid/45 ml-2">{relTime(item.lastActivity.timestamp)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalPack({ item }: { item: Extract<QueueItem, { kind: "proposal" }> }) {
  const excerpt = stripMd(item.proposal.content);
  const agentRationale = excerpt
    ? excerpt.split("\n\n")[0]  // First paragraph = agent's top-level reasoning
    : null;
  return (
    <div className="space-y-3.5">
      <div>
        <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Why this needs you</p>
        {agentRationale ? (
          <p className="text-[0.82rem] text-charcoal/80 leading-relaxed">{agentRationale}</p>
        ) : (
          <p className="text-[0.82rem] text-mid/60 leading-relaxed">Review required before this can be implemented.</p>
        )}
        <ReversibilityFlag safe={true} />
      </div>
      {(item.proposal.priority || item.proposal.scope) && (
        <div className="border-t border-warm/60 pt-3 flex items-center gap-2 flex-wrap">
          {item.proposal.priority && (
            <span className="text-[0.72rem] px-2 py-0.5 rounded border" style={{ backgroundColor: "var(--amber-soft)", color: "var(--amber)", borderColor: "#C9A22730" }}>
              {item.proposal.priority}
            </span>
          )}
          {item.proposal.scope && (
            <span className="text-[0.72rem] px-2 py-0.5 rounded bg-warm text-mid">
              Scope: {item.proposal.scope}
            </span>
          )}
          {item.proposal.date && (
            <span className="text-[0.7rem] text-mid/40 ml-auto">Filed {item.proposal.date}</span>
          )}
        </div>
      )}
      {excerpt && agentRationale && excerpt.length > agentRationale.length + 2 && (
        <div className="border-t border-warm/60 pt-3">
          <p className="text-[0.75rem] text-mid/65 leading-relaxed whitespace-pre-line line-clamp-4">
            {excerpt.slice(agentRationale.length).trim()}
          </p>
        </div>
      )}
    </div>
  );
}

function InboxPack({ item }: { item: Extract<QueueItem, { kind: "inbox" }> }) {
  const sourceMatch = item.item.text.match(/—\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)$/);
  const cleanText = item.item.text.replace(/^\[P[01]\]\s*/, "");
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Task</p>
        <p className="text-[0.85rem] text-charcoal/85 leading-relaxed">{cleanText}</p>
        <ReversibilityFlag safe={true} />
      </div>
      {sourceMatch && (
        <div className="border-t border-warm/60 pt-2 flex items-center gap-3 text-[0.7rem] text-mid/45">
          <span>Source: <span className="text-mid/65">{sourceMatch[1]}</span></span>
          <span>·</span>
          <span>Added {sourceMatch[2]}</span>
        </div>
      )}
    </div>
  );
}

function StalledPack({ item }: { item: Extract<QueueItem, { kind: "stalled" }> }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Why this needs you</p>
        <p className="text-[0.82rem] text-charcoal/80 leading-relaxed">
          No agent activity for <strong>{item.staleDays} days</strong>. The pipeline has stalled — either a dependency is missing, the project needs re-prioritisation, or it should be paused.
          Agents will not restart this autonomously.
        </p>
      </div>
    </div>
  );
}

// ─── Queue Row ───────────────────────────────────────────────────────────────

function QueueRow({
  item, isExpanded, isLoading, onToggle, onAction,
}: {
  item: QueueItem; isExpanded: boolean; isLoading: boolean;
  onToggle: () => void;
  onAction: (item: QueueItem, action: string, extra?: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Derive title and sub-title
  const title =
    item.kind === "factory"  ? item.displayName :
    item.kind === "proposal" ? item.proposal.title :
    item.kind === "inbox"    ? item.item.text.replace(/^\[P[01]\]\s*/, "").split(" — ")[0] :
    item.kind === "stalled"  ? item.name :
                               item.name;

  const subtitle =
    item.kind === "factory"  ? `${item.completedPhases}/${item.totalPhases} phases · ready to ship` :
    item.kind === "proposal" ? item.proposal.scope || item.proposal.priority || null :
    item.kind === "stalled"  ? `stalled ${item.staleDays}d · no agent activity` :
    item.kind === "overdue"  ? `${item.hoursOver}h past deadline` :
    null;

  // ── Time-in-queue age label ──────────────────────────────────────────────
  const age =
    item.kind === "factory"  ? ageLabel(item.arrivedAt ?? item.lastActivity?.timestamp) :
    item.kind === "proposal" ? ageLabel(item.proposal.date ? `${item.proposal.date}T00:00:00` : null) :
    item.kind === "inbox"    ? ageLabel(inboxDateFromText(item.item.text) ? `${inboxDateFromText(item.item.text)}T00:00:00` : null) :
    item.kind === "stalled"  ? `${item.staleDays}d` :
    item.kind === "overdue"  ? `${item.hoursOver}h` :
    "";

  const priority = item.kind === "inbox" ? priorityFromText(item.item.text) : null;

  return (
    <div className={`border-b border-warm/40 last:border-0 transition-colors ${isExpanded ? "bg-warm/25" : "hover:bg-warm/10"}`}>

      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <TypePill kind={item.kind} />

        {priority && (
          <span
            className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}
          >
            {priority}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[0.88rem] text-charcoal leading-snug truncate">{title}</p>
          {subtitle && !isExpanded && (
            <p className="text-[0.72rem] text-mid/50 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>

        {/* ── Age badge ── */}
        {age && (
          <span
            className="text-[0.68rem] tabular-nums px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              backgroundColor: "rgba(72,69,63,0.05)",
              color: "var(--mid)",
              border: "1px solid rgba(72,69,63,0.1)",
            }}
            title="Time in queue"
          >
            {age}
          </span>
        )}

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isLoading ? (
            <span className="text-[0.75rem] text-mid/40 px-2 tabular-nums">working…</span>
          ) : (
            <>
              {item.kind === "factory" && !showReject && (
                <>
                  <Btn label="Approve →" color="olive" onClick={() => onAction(item, "approve")} />
                  <Btn label="Reject" color="terracotta" onClick={() => setShowReject(true)} />
                </>
              )}
              {item.kind === "proposal" && (
                <>
                  <Btn label="Approve" color="olive" onClick={() => onAction(item, "approved")} />
                  <Btn label="Defer" color="mid" onClick={() => onAction(item, "deferred")} />
                  <Btn label="Reject" color="terracotta" onClick={() => onAction(item, "rejected")} />
                </>
              )}
              {item.kind === "inbox" && (
                <Btn label="✓ Done" color="olive" onClick={() => onAction(item, "done")} />
              )}
              {(item.kind === "stalled" || item.kind === "overdue") && (
                <a href="/factory" className="text-[0.75rem] text-mid/50 hover:text-charcoal transition-colors px-1">
                  View →
                </a>
              )}
            </>
          )}

          <button
            onClick={onToggle}
            className="w-6 h-6 flex items-center justify-center rounded text-mid/35 hover:text-mid hover:bg-warm transition-all cursor-pointer ml-0.5"
            title={isExpanded ? "Collapse" : "Expand for context"}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {isExpanded ? <path d="M1 6.5L4.5 3L8 6.5" /> : <path d="M1 3L4.5 6.5L8 3" />}
            </svg>
          </button>
        </div>
      </div>

      {/* ── Inline reject form (collapsed state) ── */}
      {showReject && item.kind === "factory" && !isExpanded && (
        <div className="px-5 pb-3 flex items-center gap-2">
          <input
            autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)..."
            className="flex-1 text-sm px-3 py-1.5 bg-bg border border-warm rounded-lg focus:outline-none focus:border-terracotta/40 focus:ring-1 focus:ring-terracotta/10 transition-all"
          />
          <Btn label="Confirm reject" color="terracotta" onClick={() => { onAction(item, "reject", rejectReason); setShowReject(false); }} disabled={isLoading} />
          <button onClick={() => setShowReject(false)} className="text-xs text-mid/40 hover:text-mid cursor-pointer px-1">Cancel</button>
        </div>
      )}

      {/* ── Expanded evidence pack ── */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-0">
          {/* Evidence pack */}
          <div className="rounded-lg border border-warm/70 p-4 bg-paper/50 mb-3.5">
            {item.kind === "factory" && <FactoryPack item={item} />}
            {item.kind === "proposal" && <ProposalPack item={item} />}
            {item.kind === "inbox" && <InboxPack item={item} />}
            {item.kind === "stalled" && <StalledPack item={item} />}
            {item.kind === "overdue" && (
              <div>
                <p className="text-[0.68rem] text-mid/50 uppercase tracking-widest mb-1.5">Why this needs you</p>
                <p className="text-[0.82rem] text-charcoal/80 leading-relaxed">
                  This expedition is <strong>{item.hoursOver}h past its deadline</strong>. Agents are still operating within scope but time guardrails have been breached. Decide whether to extend the time box or close the expedition.
                </p>
              </div>
            )}
          </div>

          {/* Primary actions in expanded state */}
          <div className="flex items-center gap-2 flex-wrap">
            {item.kind === "factory" && (
              <>
                <Btn label="Approve and ship →" color="olive" onClick={() => onAction(item, "approve")} disabled={isLoading} />
                {!showReject ? (
                  <Btn label="Reject project" color="terracotta" onClick={() => setShowReject(true)} disabled={isLoading} />
                ) : (
                  <>
                    <input
                      autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)..."
                      className="flex-1 text-sm px-3 py-1.5 bg-bg border border-warm rounded-lg focus:outline-none focus:border-terracotta/40"
                    />
                    <Btn label="Confirm reject" color="terracotta" onClick={() => { onAction(item, "reject", rejectReason); setShowReject(false); }} disabled={isLoading} />
                    <button onClick={() => setShowReject(false)} className="text-xs text-mid/40 hover:text-mid cursor-pointer">Cancel</button>
                  </>
                )}
              </>
            )}
            {item.kind === "proposal" && (
              <>
                <Btn label="Approve" color="olive" onClick={() => onAction(item, "approved")} disabled={isLoading} />
                <Btn label="Defer" color="mid" onClick={() => onAction(item, "deferred")} disabled={isLoading} />
                <Btn label="Reject" color="terracotta" onClick={() => onAction(item, "rejected")} disabled={isLoading} />
              </>
            )}
            {item.kind === "inbox" && (
              <Btn label="✓ Mark done" color="olive" onClick={() => onAction(item, "done")} disabled={isLoading} />
            )}
            {(item.kind === "stalled" || item.kind === "overdue") && (
              <a href="/factory" className="inline-flex items-center px-2.5 py-1 text-[0.75rem] rounded-md border border-warm text-mid hover:text-charcoal hover:bg-warm transition-colors">
                Open in Factory →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Command Queue ────────────────────────────────────────────────────────────

function CommandQueue({ items, onRefetch }: { items: QueueItem[]; onRefetch: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = items.filter((i) => !dismissed.has(i.id));

  // ── Type counters (improvement #5) ──────────────────────────────────────
  const counts = useMemo(() => ({
    factory:  visible.filter((i) => i.kind === "factory").length,
    proposal: visible.filter((i) => i.kind === "proposal").length,
    inbox:    visible.filter((i) => i.kind === "inbox").length,
    stalled:  visible.filter((i) => i.kind === "stalled" || i.kind === "overdue").length,
  }), [visible]);

  const doAction = useCallback(async (item: QueueItem, action: string, extra?: string) => {
    setLoadingId(item.id);
    try {
      if (item.kind === "factory") {
        await fetch("/api/factory/approve", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: item.slug, action, reason: extra }),
        });
      } else if (item.kind === "proposal") {
        await fetch("/api/proposals", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: item.proposal.filename, status: action }),
        });
      } else if (item.kind === "inbox") {
        await fetch("/api/inbox", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw: item.item.raw }),
        });
      }
      setDismissed((prev) => new Set([...prev, item.id]));
      setExpandedId(null);
      onRefetch();
    } finally {
      setLoadingId(null);
    }
  }, [onRefetch]);

  return (
    <div className="bg-white border border-warm rounded-xl overflow-hidden fade-up shadow-sm">
      {/* Header with type counters */}
      <div className="px-5 py-3 flex items-center gap-3 border-b border-warm/50">
        <div className="flex items-center gap-2.5">
          <p className="label-caps text-mid/80">Command queue</p>
          {visible.length > 0 ? (
            <span
              className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[0.6rem] text-paper"
              style={{ backgroundColor: "var(--terracotta)" }}
            >
              {visible.length}
            </span>
          ) : (
            <span className="text-[0.75rem] text-olive">All clear</span>
          )}
        </div>

        {/* Type counters — only show populated types */}
        {visible.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {counts.factory > 0 && (
              <span className="text-[0.7rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>
                {counts.factory} factory
              </span>
            )}
            {counts.proposal > 0 && (
              <span className="text-[0.7rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--amber-soft)", color: "var(--amber)" }}>
                {counts.proposal} proposal{counts.proposal > 1 ? "s" : ""}
              </span>
            )}
            {counts.inbox > 0 && (
              <span className="text-[0.7rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(72,69,63,0.07)", color: "var(--mid)" }}>
                {counts.inbox} inbox
              </span>
            )}
            {counts.stalled > 0 && (
              <span className="text-[0.7rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}>
                {counts.stalled} stalled
              </span>
            )}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10">
          <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2.5" style={{ backgroundColor: "var(--olive-soft)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="text-[0.85rem] text-mid/60">No decisions pending</p>
          <p className="text-[0.72rem] text-mid/38 mt-0.5">Agents are operating within guardrails</p>
        </div>
      ) : (
        visible.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            isLoading={loadingId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onAction={doAction}
          />
        ))
      )}
    </div>
  );
}

// ─── Agent Status Panel (replaces StatusBar) ─────────────────────────────────

function AgentStatusPanel({
  pulseData, kpis, factoryActiveCount, roadmapPct,
}: {
  pulseData: PulseData | null;
  kpis: KPIs | null;
  factoryActiveCount: number;
  roadmapPct: number;
}) {
  const allPulses = pulseData?.pulses ?? [];
  const activeAgents = pulseData?.stats.activeAgents ?? [];
  const totalToday = pulseData?.stats.totalToday ?? 0;
  const cronOk = kpis ? kpis.cron.healthy === kpis.cron.total : true;

  // Derive per-agent state
  const agentStates = useMemo(() => {
    const now = Date.now();
    const fourHoursAgo = now - 4 * 3_600_000;
    return ALL_AGENT_IDS.map((id) => {
      const a = agent(id);
      const agentPulses = allPulses.filter((p) => p.agent === id);
      const recentPulses = agentPulses.filter((p) => new Date(p.timestamp).getTime() > fourHoursAgo);
      const hasRecentError = recentPulses.some(isAttention);
      const lastPulse = agentPulses.length > 0
        ? agentPulses.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b))
        : null;

      const status: "running" | "error" | "idle" =
        hasRecentError ? "error" :
        activeAgents.includes(id) ? "running" :
        "idle";

      return { id, a, status, lastActive: lastPulse ? relTime(lastPulse.timestamp) : null };
    });
  }, [allPulses, activeAgents]);

  return (
    <div className="bg-paper border border-warm rounded-xl overflow-hidden fade-up">
      {/* Agent grid */}
      <div className="grid px-2 py-3" style={{ gridTemplateColumns: `repeat(${ALL_AGENT_IDS.length}, 1fr)` }}>
        {agentStates.map(({ id, a, status, lastActive }) => {
          const sm = AGENT_STATUS_META[status];
          return (
            <div key={id} className="flex flex-col items-center gap-1.5 px-2 py-1">
              {/* Avatar */}
              <div className="relative">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[0.72rem] font-medium text-white transition-all"
                  style={{
                    backgroundColor: status === "idle" ? `${a.color}22` : a.color,
                    border: `1.5px solid ${status === "idle" ? `${a.color}30` : a.color}`,
                  }}
                >
                  <span style={{ color: status === "idle" ? a.color : "#fff" }}>{a.label}</span>
                </div>
                {/* Status dot */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${sm.pulse ? "pulse-dot" : ""}`}
                  style={{ backgroundColor: sm.dot, borderColor: "var(--paper)" }}
                />
              </div>
              {/* Name */}
              <p className="text-[0.72rem] text-charcoal/75 font-medium leading-none">{a.name}</p>
              {/* Status + last active */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[0.62rem] font-medium leading-none" style={{ color: sm.color }}>
                  {sm.label}
                </span>
                <span className="text-[0.6rem] text-mid/40 leading-none">
                  {lastActive ? `${lastActive} ago` : "no activity"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* System stats row */}
      <div className="border-t border-warm/50 px-5 py-2 flex items-center gap-3">
        <span className="text-[0.75rem] text-mid/60 tabular-nums">{totalToday} pulses today</span>
        <span className="text-warm text-[0.7rem]">·</span>
        <span className={`text-[0.75rem] tabular-nums ${cronOk ? "text-mid/60" : "text-amber font-medium"}`}>
          {kpis ? `${kpis.cron.healthy}/${kpis.cron.total}` : "—"} crons
          {!cronOk && " ⚠"}
        </span>
        <span className="text-warm text-[0.7rem]">·</span>
        <span className="text-[0.75rem] text-mid/60 tabular-nums">{factoryActiveCount} factory projects</span>
        {kpis?.failures.recent ? (
          <>
            <span className="text-warm text-[0.7rem]">·</span>
            <span className="text-[0.75rem] text-terracotta tabular-nums attention-pulse">{kpis.failures.recent} recent failure{kpis.failures.recent > 1 ? "s" : ""}</span>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-16 h-1 rounded-full bg-warm overflow-hidden">
            <div className="h-full bg-olive rounded-full transition-all duration-700" style={{ width: `${roadmapPct}%` }} />
          </div>
          <span className="text-[0.72rem] text-mid/55 tabular-nums">{roadmapPct}% roadmap</span>
        </div>
      </div>
    </div>
  );
}

// ─── Today strip ─────────────────────────────────────────────────────────────

function TodayStrip({ nowRaw, nowModifiedAt }: { nowRaw: string; nowModifiedAt?: string | null }) {
  const now = parseMdSections(nowRaw);
  if (!now.status && now.focus.length === 0 && now.blockers.length === 0) return null;

  const isStale = nowModifiedAt
    ? (Date.now() - new Date(nowModifiedAt).getTime()) > 48 * 3600_000
    : false;
  const staleDays = nowModifiedAt
    ? Math.floor((Date.now() - new Date(nowModifiedAt).getTime()) / 86_400_000)
    : 0;

  return (
    <div className="fade-up space-y-2.5">
      {/* Stale warning */}
      {isStale && (
        <div
          className="flex items-center gap-2.5 px-4 py-2 rounded-lg text-[0.72rem]"
          style={{ backgroundColor: "var(--amber-strong)", border: "1px solid var(--amber-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L15 14H1L8 1Z" stroke="var(--amber)" strokeWidth="1.5" fill="var(--amber-bg)" />
            <text x="8" y="12" textAnchor="middle" fontSize="8" fill="var(--amber)" fontFamily="monospace">!</text>
          </svg>
          <span style={{ color: "var(--amber)" }} className="font-medium">
            NOW.md is {staleDays}d stale
          </span>
          <span className="text-mid/55">
            Last updated {new Date(nowModifiedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </div>
      )}

      {/* Cards row */}
      <div className="grid grid-cols-12 gap-2.5">
        {/* ── Status card ── */}
        {now.status && (
          <div className="col-span-3 status-card rounded-xl px-4 py-3.5">
            <p className="label-caps text-[0.62rem] mb-2" style={{ color: "var(--terracotta)" }}>
              Status
            </p>
            <p
              className="text-lg leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-cormorant)", color: "var(--charcoal)" }}
            >
              {now.status}
            </p>
          </div>
        )}

        {/* ── Focus card ── */}
        {now.focus.length > 0 && (
          <div className={`${now.blockers.length > 0 ? "col-span-5" : "col-span-9"} ${!now.status ? "col-start-1" : ""} focus-card rounded-xl px-4 py-3.5`}>
            <p className="label-caps text-[0.62rem] mb-2" style={{ color: "var(--olive)" }}>
              This week
            </p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1">
              {now.focus.slice(0, 6).map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "var(--olive)" }}
                  />
                  <span className="text-[0.78rem] text-charcoal/80 leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Blockers card ── */}
        {now.blockers.length > 0 && (
          <div className={`${now.focus.length > 0 ? "col-span-4" : "col-span-9"} blocker-card rounded-xl px-4 py-3.5`}>
            <div className="flex items-center gap-2 mb-2">
              <p className="label-caps text-[0.62rem]" style={{ color: "var(--danger)" }}>
                Needs attention
              </p>
              <span
                className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full text-[0.55rem] text-white font-medium attention-pulse"
                style={{ backgroundColor: "var(--danger)" }}
              >
                {now.blockers.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {now.blockers.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="flex-shrink-0 mt-[3px]"
                  >
                    <circle cx="6" cy="6" r="5" stroke="var(--danger)" strokeWidth="1.2" fill="var(--danger-bg)" />
                    <text x="6" y="9" textAnchor="middle" fontSize="8" fill="var(--danger)" fontFamily="monospace">!</text>
                  </svg>
                  <span className="text-[0.75rem] text-charcoal/75 leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brief panel ─────────────────────────────────────────────────────────────

function BriefPanel({ briefs }: { briefs: { morning: BriefFile | null; evening: BriefFile | null } }) {
  const hour = new Date().getHours();
  const [tab, setTab] = useState<"morning" | "evening">(hour < 14 ? "morning" : "evening");
  const active = tab === "morning" ? briefs.morning : briefs.evening;
  return (
    <div className="rounded-xl flex flex-col overflow-hidden border" style={{ maxHeight: "320px", backgroundColor: "#FAFAF6", borderColor: "var(--warm)" }}>
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ backgroundColor: "var(--charcoal)" }}>
        <div>
          <p className="text-[0.68rem] font-medium tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
            Briefs
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
          {(["morning", "evening"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1 rounded text-[0.72rem] capitalize transition-all cursor-pointer"
              style={{
                backgroundColor: tab === t ? "rgba(255,255,255,0.15)" : "transparent",
                color: tab === t ? "#F3EEE3" : "rgba(255,255,255,0.35)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll px-5 py-3.5">
        {active ? (
          <pre className="text-[0.74rem] whitespace-pre-wrap font-[family-name:var(--font-dm-mono)] leading-[1.7] text-charcoal/70">
            {active.content.replace(/^---[\s\S]*?---\n*/m, "").trim()}
          </pre>
        ) : (
          <p className="text-sm text-mid/40">No {tab} brief yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Activity Feed (decisions-free, clearly labelled) ─────────────────────────

function ActivityFeed({ pulses }: { pulses: PulseEvent[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const recent = useMemo(() => {
    const sorted = [...pulses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return (filter ? sorted.filter((p) => p.agent === filter) : sorted).slice(0, 12);
  }, [pulses, filter]);

  const activeInFeed = useMemo(() => {
    const ids = new Set(pulses.map((p) => p.agent));
    return ALL_AGENT_IDS.filter((id) => ids.has(id));
  }, [pulses]);

  return (
    <div className="rounded-xl overflow-hidden flex flex-col border" style={{ backgroundColor: "#111110", maxHeight: "300px", borderColor: "#2A2927" }}>
      <div className="px-4 py-2.5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid #2A2927" }}>
        <div className="flex items-center gap-3">
          <p className="text-[0.68rem] font-medium tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            Activity stream
          </p>
          <span className="text-[0.6rem] tabular-nums" style={{ color: "rgba(255,255,255,0.18)" }}>
            {pulses.length} today
          </span>
        </div>
        {activeInFeed.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter(null)}
              className="px-2 py-0.5 rounded text-[0.6rem] cursor-pointer transition-all"
              style={{
                backgroundColor: filter === null ? "rgba(255,255,255,0.12)" : "transparent",
                color: filter === null ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)",
              }}
            >
              All
            </button>
            {activeInFeed.map((id) => {
              const a = agent(id);
              const isActive = filter === id;
              return (
                <button key={id} onClick={() => setFilter(isActive ? null : id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.6rem] cursor-pointer transition-all"
                  style={{
                    backgroundColor: isActive ? `${a.color}30` : "transparent",
                    color: isActive ? a.color : "rgba(255,255,255,0.2)",
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color, opacity: isActive ? 1 : 0.4 }} />
                  {a.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {recent.length === 0 ? (
          <p className="text-[0.7rem] text-center py-8" style={{ color: "rgba(255,255,255,0.15)" }}>No activity today</p>
        ) : (
          recent.map((p, i) => {
            const a = agent(p.agent);
            const err = isAttention(p);
            return (
              <div
                key={`${p.timestamp}-${i}`}
                className="flex items-start gap-2.5 px-4 py-2 transition-colors"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <span
                  className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-[0.55rem] text-white font-medium mt-0.5 ${err ? "attention-pulse" : ""}`}
                  style={{ backgroundColor: err ? "var(--danger)" : `${a.color}40`, border: `1px solid ${err ? "var(--danger)" : a.color}50` }}
                >
                  {a.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.7rem] font-medium" style={{ color: a.color }}>{a.name}</span>
                    <span className="text-[0.58rem] tabular-nums" style={{ color: "rgba(255,255,255,0.2)" }}>
                      {relTime(p.timestamp)}
                    </span>
                    {p.action && (
                      <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)" }}>
                        {p.action}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.68rem] truncate leading-snug mt-0.5" style={{ color: err ? "#E8705A" : "rgba(255,255,255,0.38)" }}>
                    {p.outcome}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── DashboardHome ────────────────────────────────────────────────────────────

export interface DashboardHomeProps {
  kpis: KPIs | null;
  nowRaw: string;
  nowModifiedAt: string | null;
  inbox: InboxItem[];
  pulseData: PulseData | null;
  briefs: { morning: BriefFile | null; evening: BriefFile | null };
  workflows: WorkflowData | null;
  projects: ProjectLane[];
  expeditions: ExpeditionData[];
  factoryData: FactorySummaryData | null;
  portfolioKPIs: PortfolioKPIData | null;
  proposals: ProposalData[];
  tasks: Task[];
  systemHealth: string;
  healthColor: string;
  roadmapPct: number;
  newItem: string;
  setNewItem: (v: string) => void;
  adding: boolean;
  handleAddItem: (e: FormEvent) => void;
  onRefetch: () => void;
}

export function DashboardHome({
  kpis, nowRaw, nowModifiedAt, inbox, pulseData, briefs,
  projects, expeditions, factoryData, portfolioKPIs, proposals, tasks,
  systemHealth, healthColor, roadmapPct, onRefetch,
}: DashboardHomeProps) {

  const queueItems = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];

    // 1. Factory approvals
    if (factoryData) {
      for (const p of factoryData.projects.filter((p) => p.status === "awaiting-approval")) {
        items.push({
          kind: "factory", id: `factory-${p.slug}`,
          slug: p.slug, displayName: p.displayName ?? p.slug.replace(/-/g, " "),
          completedPhases: p.completedPhases, totalPhases: p.totalPhases,
          lastActivity: p.lastActivity ? { agent: p.lastActivity.agent, outcome: p.lastActivity.outcome, timestamp: p.lastActivity.timestamp } : null,
          arrivedAt: p.lastActivity?.timestamp ?? null,
        });
      }
    }

    // 2. Pending proposals
    for (const p of proposals.filter((p) => p.status === "pending" && p.kind === "proposal")) {
      items.push({ kind: "proposal", id: `proposal-${p.filename}`, proposal: p });
    }

    // 3. High-priority inbox (P0/P1)
    for (const item of inbox.filter((i) => !i.done && priorityFromText(i.text) !== null).slice(0, 3)) {
      items.push({ kind: "inbox", id: `inbox-${item.raw}`, item });
    }

    // 4. Stalled projects
    for (const p of projects.filter((p) => p.isStalled).slice(0, 2)) {
      items.push({ kind: "stalled", id: `stalled-${p.slug}`, name: p.name, staleDays: p.staleDays });
    }

    // 5. Overdue expeditions
    for (const e of expeditions.filter((e) => e.isOverdue).slice(0, 2)) {
      const hours = e.timeRemaining ? Math.ceil(Math.abs(e.timeRemaining) / 3600000) : 0;
      items.push({ kind: "overdue", id: `overdue-${e.slug}`, name: e.name, hoursOver: hours });
    }

    return items;
  }, [factoryData, proposals, inbox, projects, expeditions]);

  return (
    <div className="flex flex-col pb-10">

      {/* ═══ ZONE 1 — Command Bar (dark) ═══════════════════════════════ */}
      <CommandBar
        pulseData={pulseData}
        kpis={kpis}
        systemHealth={systemHealth}
        healthColor={healthColor}
        roadmapPct={roadmapPct}
      />

      {/* Command Queue removed — approvals and decisions now flow through the Task Board */}

      {/* ═══ ZONE 3 — Task Board (cool gray) ═══════════════════════════ */}
      <div className="max-w-[1440px] mx-auto w-full px-6 pt-4 pb-3">
        <TaskBoard tasks={tasks} onRefetch={onRefetch} />
      </div>

      {/* ═══ ZONE 4 — Context (warm paper) ═════════════════════════════ */}
      <div className="max-w-[1440px] mx-auto w-full px-6 pt-1 flex flex-col gap-3">
        {/* Today focus */}
        <TodayStrip nowRaw={nowRaw} nowModifiedAt={nowModifiedAt} />

        {/* Portfolio KPIs + Briefs */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7"><BriefPanel briefs={briefs} /></div>
          <div className="col-span-5"><PortfolioKPIs data={portfolioKPIs} /></div>
        </div>

        {/* Activity stream */}
        <ActivityFeed pulses={pulseData?.pulses ?? []} />
      </div>

    </div>
  );
}
