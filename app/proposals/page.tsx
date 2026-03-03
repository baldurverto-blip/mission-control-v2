"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────

type ProposalStatus = "pending" | "approved" | "rejected" | "deferred";

interface Proposal {
  filename: string;
  title: string;
  date: string;
  statusLine: string;
  scope: string;
  priority: string;
  kind: "proposal" | "info";
  status: ProposalStatus;
  decidedAt?: string;
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const statusConfig: Record<ProposalStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "var(--terracotta)", bg: "var(--terracotta-soft)" },
  approved: { label: "Approved", color: "var(--olive)", bg: "var(--olive-soft)" },
  rejected: { label: "Rejected", color: "var(--mid)", bg: "var(--warm)" },
  deferred: { label: "Deferred", color: "var(--lilac)", bg: "var(--lilac-soft)" },
};

function Badge({ status }: { status: ProposalStatus }) {
  const cfg = statusConfig[status];
  return (
    <span
      style={{ color: cfg.color, background: cfg.bg }}
      className="text-xs px-2 py-0.5 rounded-full font-medium"
    >
      {cfg.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [pending, setPending] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals");
      const data = await res.json();
      setProposals(data.proposals ?? []);
      setPending(data.pending ?? 0);
    } catch {
      /* silent */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  async function handleDecision(filename: string, status: ProposalStatus) {
    setUpdating(filename);
    try {
      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, status }),
      });
      await fetchProposals();
    } finally {
      setUpdating(null);
    }
  }

  function renderContent(content: string) {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("# ")) return <h2 key={i} className="text-xl mt-4 mb-2">{line.slice(2)}</h2>;
      if (line.startsWith("## ")) return <h3 key={i} className="text-lg mt-3 mb-1" style={{ color: "var(--charcoal)" }}>{line.slice(3)}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} className="text-base mt-2 mb-1" style={{ color: "var(--mid)" }}>{line.slice(4)}</h4>;
      if (line.startsWith("> ")) return <p key={i} className="pl-3 border-l-2 text-sm my-0.5" style={{ borderColor: "var(--warm)", color: "var(--mid)" }}>{line.slice(2)}</p>;
      if (line.startsWith("---")) return <hr key={i} className="my-3" style={{ borderColor: "var(--warm)" }} />;
      if (line.match(/^\d+\.\s/)) return <p key={i} className="ml-4 text-sm my-0.5">{line}</p>;
      if (line.startsWith("- [x]")) return <p key={i} className="ml-4 text-sm my-0.5" style={{ color: "var(--olive)" }}>&#x2713; {line.slice(5)}</p>;
      if (line.startsWith("- [ ]")) return <p key={i} className="ml-4 text-sm my-0.5">&#x25CB; {line.slice(5)}</p>;
      if (line.startsWith("- ")) return <p key={i} className="ml-4 text-sm my-0.5">&bull; {line.slice(2)}</p>;
      if (line.startsWith("**")) return <p key={i} className="text-sm font-medium my-0.5">{line.replace(/\*\*/g, "")}</p>;
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <p key={i} className="text-sm my-0.5">{line}</p>;
    });
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p style={{ color: "var(--mid)" }}>Loading proposals...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs mb-1 block" style={{ color: "var(--mid)" }}>
            &larr; Mission Control
          </Link>
          <h1 className="text-3xl" style={{ color: "var(--charcoal)" }}>Proposals</h1>
          <p className="text-xs mt-1" style={{ color: "var(--mid)" }}>
            {pending > 0 ? `${pending} awaiting your decision` : "All proposals reviewed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pending > 0 && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ color: "var(--terracotta)", background: "var(--terracotta-soft)" }}
            >
              {pending} pending
            </span>
          )}
        </div>
      </header>

      {/* Proposals List */}
      <main className="px-6 pb-8 max-w-4xl">
        <div className="flex flex-col gap-4">
          {proposals.map((p, idx) => {
            const isExpanded = expanded === p.filename;
            const isPending = p.status === "pending" && p.kind === "proposal";
            const isUpdating = updating === p.filename;

            return (
              <div
                key={p.filename}
                className="card fade-up"
                style={{
                  animationDelay: `${idx * 60}ms`,
                  borderLeft: isPending ? "3px solid var(--terracotta)" : undefined,
                }}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge status={p.status} />
                      {p.kind === "info" && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: "var(--mid)", background: "var(--warm)" }}>
                          Info
                        </span>
                      )}
                      {p.date && (
                        <span className="text-xs" style={{ color: "var(--mid)" }}>{p.date}</span>
                      )}
                    </div>
                    <h2
                      className="text-xl cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setExpanded(isExpanded ? null : p.filename)}
                      style={{ color: "var(--charcoal)" }}
                    >
                      {p.title}
                    </h2>
                    {p.scope && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--mid)" }}>
                        Scope: {p.scope}
                      </p>
                    )}
                    {p.priority && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--mid)" }}>
                        {p.priority}
                      </p>
                    )}
                    {p.decidedAt && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--mid)" }}>
                        Decided: {p.decidedAt}
                      </p>
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : p.filename)}
                    className="text-xs px-2 py-1 rounded shrink-0 cursor-pointer"
                    style={{ color: "var(--mid)", background: "var(--warm)" }}
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>

                {/* Action Buttons — always visible for proposals */}
                {p.kind === "proposal" && (
                  <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--warm)" }}>
                    <button
                      onClick={() => handleDecision(p.filename, "approved")}
                      disabled={isUpdating}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                      style={{
                        color: "#fff",
                        background: p.status === "approved" ? "var(--olive)" : "var(--charcoal)",
                        opacity: p.status === "approved" ? 0.6 : 1,
                      }}
                    >
                      {p.status === "approved" ? "Approved" : "Approve"}
                    </button>
                    <button
                      onClick={() => handleDecision(p.filename, "rejected")}
                      disabled={isUpdating}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                      style={{
                        color: p.status === "rejected" ? "#fff" : "var(--mid)",
                        background: p.status === "rejected" ? "var(--mid)" : "var(--warm)",
                      }}
                    >
                      {p.status === "rejected" ? "Rejected" : "Reject"}
                    </button>
                    <button
                      onClick={() => handleDecision(p.filename, "deferred")}
                      disabled={isUpdating}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                      style={{
                        color: p.status === "deferred" ? "#fff" : "var(--lilac)",
                        background: p.status === "deferred" ? "var(--lilac)" : "var(--lilac-soft)",
                      }}
                    >
                      {p.status === "deferred" ? "Deferred" : "Defer"}
                    </button>
                    {p.status !== "pending" && (
                      <button
                        onClick={() => handleDecision(p.filename, "pending")}
                        disabled={isUpdating}
                        className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50 ml-auto"
                        style={{ color: "var(--mid)", background: "transparent", textDecoration: "underline" }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    className="mt-3 pt-3 max-h-96 overflow-y-auto custom-scroll"
                    style={{ borderTop: "1px solid var(--warm)" }}
                  >
                    {renderContent(p.content)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {proposals.length === 0 && (
          <div className="card text-center py-8">
            <p style={{ color: "var(--mid)" }}>No proposals found in brain/proposals/</p>
          </div>
        )}
      </main>
    </div>
  );
}
