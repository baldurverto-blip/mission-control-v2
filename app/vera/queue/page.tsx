"use client";

/**
 * /vera/queue — Operator Queue
 *
 * Two-panel layout:
 *   Left:  filterable case list (All / T1 / T2 Review / T3 Escalated)
 *   Right: case detail + Vera's draft reply + [Approve] [Edit] [Escalate] buttons
 *
 * Week 4: reads from /api/vera/cases + /api/vera/cases/[id]
 * Week 5: [Approve] sends the draft reply via Discord / email
 */

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Case {
  id: string;
  subject: string;
  body: string;
  status: string;
  tier: "T1" | "T2" | "T3" | null;
  confidence_score: number | null;
  is_repeat_contact: boolean;
  customer_email: string;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
  screenshot_data?: string | null;
}

interface CaseMessage {
  id: string;
  role: "customer" | "operator" | "vera_draft";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  T1: "#4caf50",
  T2: "#ff9800",
  T3: "#f44336",
};

const TIER_LABEL: Record<string, string> = {
  T1: "T1 Auto",
  T2: "T2 Review",
  T3: "T3 Escalate",
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--font-dm-mono), monospace",
        fontWeight: 600,
        color: "#fff",
        background: TIER_COLOR[tier] ?? "#888",
        padding: "1px 6px",
        borderRadius: 3,
        letterSpacing: "0.02em",
      }}
    >
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#4caf50" : pct >= 45 ? "#ff9800" : "#f44336";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 48,
          height: 4,
          background: "var(--warm)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--mid)",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VeraQueue() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "T1" | "T2" | "T3">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ case: Case; messages: CaseMessage[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Load case list
  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const tierParam = filter !== "all" ? `&tier=${filter}` : "";
      const res = await fetch(`/api/vera/cases?status=open${tierParam}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  // Load case detail
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/vera/cases/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Operator actions
  async function handleApprove() {
    if (!detail) return;
    await fetch(`/api/vera/cases/${detail.case.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    setActionMsg("Draft approved — marked resolved (Week 5: sends reply)");
    void loadCases();
    setSelectedId(null);
  }

  async function handleEscalate() {
    if (!detail) return;
    await fetch(`/api/vera/cases/${detail.case.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "T3" }),
    });
    setActionMsg("Escalated to T3");
    void loadCases();
    setSelectedId(null);
  }

  const draft = detail?.messages.find((m) => m.role === "vera_draft");
  const customerMessages = detail?.messages.filter((m) => m.role === "customer") ?? [];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 100px)", gap: 0 }}>
      {/* ── Left: case list ── */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid var(--warm)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header + filters */}
        <div style={{ padding: "16px 12px 8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h1
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: 22,
                fontWeight: 500,
                color: "var(--charcoal)",
                margin: 0,
              }}
            >
              Queue
            </h1>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-dm-mono), monospace",
                color: "var(--mid)",
              }}
            >
              {cases.length} open
            </span>
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(["all", "T1", "T2", "T3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "3px 9px",
                  fontSize: 10,
                  fontFamily: "var(--font-dm-mono), monospace",
                  background: filter === f ? "var(--charcoal)" : "transparent",
                  color: filter === f ? "var(--paper)" : "var(--mid)",
                  border: "1px solid var(--warm)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {f === "all" ? "All" : TIER_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
          {loading ? (
            <p
              style={{
                padding: 16,
                fontSize: 11,
                color: "var(--mid)",
                fontFamily: "var(--font-dm-mono), monospace",
              }}
            >
              Loading…
            </p>
          ) : cases.length === 0 ? (
            <div style={{ padding: "32px 12px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--mid)", marginBottom: 4 }}>Queue is clear</p>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--mid)",
                  fontFamily: "var(--font-dm-mono), monospace",
                }}
              >
                Vera handled everything.
              </p>
            </div>
          ) : (
            cases.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  marginBottom: 2,
                  background: selectedId === c.id ? "#f0ebe3" : "transparent",
                  border: "1px solid",
                  borderColor: selectedId === c.id ? "var(--mid)" : "transparent",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--charcoal)",
                    marginBottom: 5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.subject || "(no subject)"}
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 4 }}
                >
                  <TierBadge tier={c.tier} />
                  {c.is_repeat_contact && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: "var(--font-dm-mono), monospace",
                        color: "#ff9800",
                        border: "1px solid #ff9800",
                        padding: "0 3px",
                        borderRadius: 2,
                      }}
                    >
                      repeat
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--mid)",
                      fontFamily: "var(--font-dm-mono), monospace",
                      marginLeft: "auto",
                    }}
                  >
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <ConfidenceBar score={c.confidence_score} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {actionMsg && (
          <div
            style={{
              background: "#e8f5e9",
              border: "1px solid #4caf50",
              borderRadius: 6,
              padding: "8px 14px",
              marginBottom: 16,
              fontSize: 11,
              fontFamily: "var(--font-dm-mono), monospace",
              color: "#2e7d32",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {actionMsg}
            <button
              onClick={() => setActionMsg(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#2e7d32",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {!selectedId ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "60%",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 28, opacity: 0.2 }}>←</span>
            <p style={{ fontSize: 12, color: "var(--mid)" }}>Select a case to review</p>
          </div>
        ) : detailLoading ? (
          <p
            style={{
              fontSize: 11,
              color: "var(--mid)",
              fontFamily: "var(--font-dm-mono), monospace",
            }}
          >
            Loading…
          </p>
        ) : !detail ? (
          <p style={{ fontSize: 12, color: "#f44336" }}>Failed to load case.</p>
        ) : (
          <div style={{ maxWidth: 660 }}>
            {/* Header */}
            <div style={{ marginBottom: 18 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-cormorant), Georgia, serif",
                    fontSize: 20,
                    fontWeight: 500,
                    color: "var(--charcoal)",
                    margin: 0,
                  }}
                >
                  {detail.case.subject || "(no subject)"}
                </h2>
                <TierBadge tier={detail.case.tier} />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  fontSize: 11,
                  fontFamily: "var(--font-dm-mono), monospace",
                  color: "var(--mid)",
                  flexWrap: "wrap",
                }}
              >
                <span>{detail.case.customer_name ?? detail.case.customer_email}</span>
                {detail.case.confidence_score !== null && (
                  <span>confidence: {Math.round(detail.case.confidence_score * 100)}%</span>
                )}
                {detail.case.is_repeat_contact && (
                  <span style={{ color: "#ff9800" }}>⚠ repeat contact</span>
                )}
                <span>{timeAgo(detail.case.created_at)}</span>
              </div>
            </div>

            {/* Customer messages */}
            {customerMessages.map((m) => (
              <div
                key={m.id}
                style={{
                  background: "#f7f3ed",
                  border: "1px solid var(--warm)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-dm-mono), monospace",
                    color: "var(--mid)",
                    marginBottom: 6,
                  }}
                >
                  customer · {timeAgo(m.created_at)}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--charcoal)",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {m.content}
                </p>
              </div>
            ))}

            {/* Screenshot (if customer shared screen) */}
            {detail.case.screenshot_data && (
              <div
                style={{
                  marginBottom: 14,
                  border: "1px solid var(--warm)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-dm-mono), monospace",
                    color: "var(--mid)",
                    padding: "6px 10px",
                    background: "#f7f3ed",
                    borderBottom: "1px solid var(--warm)",
                  }}
                >
                  customer shared screen
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.case.screenshot_data}
                  alt="Customer screen share"
                  style={{ width: "100%", display: "block" }}
                />
              </div>
            )}

            {/* Vera draft */}
            {draft ? (
              <div
                style={{
                  border: "1px solid #bc6143",
                  borderRadius: 8,
                  padding: "14px 16px",
                  marginBottom: 14,
                  background: "#fdf9f7",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "var(--font-dm-mono), monospace",
                      fontWeight: 700,
                      color: "#bc6143",
                      letterSpacing: "0.08em",
                    }}
                  >
                    VERA DRAFT
                  </span>
                  {!!draft.metadata?.category && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-dm-mono), monospace",
                        color: "var(--mid)",
                      }}
                    >
                      · {String(draft.metadata.category).replace(/_/g, " ")}
                    </span>
                  )}
                  {draft.metadata?.kb_hits !== undefined && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-dm-mono), monospace",
                        color: "var(--mid)",
                      }}
                    >
                      · {Number(draft.metadata.kb_hits)} KB hits
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--charcoal)",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {draft.content}
                </p>
                {!!draft.metadata?.reasoning && (
                  <p
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-dm-mono), monospace",
                      color: "var(--mid)",
                      marginTop: 10,
                      borderTop: "1px solid #ecddd5",
                      paddingTop: 8,
                      margin: "10px 0 0",
                    }}
                  >
                    {String(draft.metadata.reasoning)}
                  </p>
                )}
              </div>
            ) : (
              <div
                style={{
                  border: "1px dashed var(--warm)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  marginBottom: 14,
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--mid)",
                    fontFamily: "var(--font-dm-mono), monospace",
                    margin: 0,
                  }}
                >
                  Vera draft pending — pipeline processing…
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleApprove}
                disabled={!draft}
                style={{
                  padding: "8px 18px",
                  fontSize: 12,
                  fontFamily: "var(--font-dm-mono), monospace",
                  fontWeight: 600,
                  background: draft ? "var(--charcoal)" : "#e0dbd3",
                  color: draft ? "var(--paper)" : "var(--mid)",
                  border: "none",
                  borderRadius: 6,
                  cursor: draft ? "pointer" : "not-allowed",
                  transition: "opacity 0.1s",
                }}
              >
                ✓ Approve Draft
              </button>
              <button
                style={{
                  padding: "8px 18px",
                  fontSize: 12,
                  fontFamily: "var(--font-dm-mono), monospace",
                  background: "transparent",
                  color: "var(--charcoal)",
                  border: "1px solid var(--warm)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Edit Reply
              </button>
              <button
                onClick={handleEscalate}
                style={{
                  padding: "8px 18px",
                  fontSize: 12,
                  fontFamily: "var(--font-dm-mono), monospace",
                  background: "transparent",
                  color: "#f44336",
                  border: "1px solid #ffd0cc",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Escalate T3
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
