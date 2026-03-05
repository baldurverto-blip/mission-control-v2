"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/app/components/Card";
import { StatusDot } from "@/app/components/StatusDot";

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  reportsTo: string;
  type: "human" | "orchestrator" | "specialist";
  color: string;
  crons: string[];
  status: string;
}

interface ValueStream {
  name: string;
  steps: string[];
  agents: string[];
}

interface OrgData {
  agents: Agent[];
  crons: { name: string; agentId: string; schedule: string; lastStatus: string }[];
  valueStreams: ValueStream[];
  cadences: { daily: number; weekly: number; periodic: number; total: number };
}

function AgentNode({
  agent,
  cronCount,
  isCenter,
  nodeRef,
}: {
  agent: Agent;
  cronCount: number;
  isCenter?: boolean;
  nodeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const typeLabel =
    agent.type === "human"
      ? "OWNER"
      : agent.type === "orchestrator"
        ? "ORCHESTRATOR"
        : "SPECIALIST";

  return (
    <div
      ref={nodeRef}
      className="card fade-up"
      style={{
        borderTop: `3px solid ${agent.color}`,
        minWidth: isCenter ? 220 : 180,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        <StatusDot status={agent.status} size="md" />
        <span
          className="label-caps"
          style={{ color: agent.color, fontSize: "0.7rem" }}
        >
          {typeLabel}
        </span>
      </div>
      <h3
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: isCenter ? "1.75rem" : "1.5rem",
          fontWeight: 500,
          color: "var(--charcoal)",
          margin: "0.25rem 0",
        }}
      >
        {agent.name}
      </h3>
      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--mid)",
          lineHeight: 1.4,
          marginBottom: "0.5rem",
        }}
      >
        {agent.role}
      </p>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {agent.type !== "human" && (
          <span
            className="label-caps"
            style={{
              fontSize: "0.65rem",
              padding: "3px 8px",
              borderRadius: 4,
              backgroundColor: `${agent.color}18`,
              color: agent.color,
            }}
          >
            {cronCount} crons
          </span>
        )}
        {agent.model !== "Human" && (
          <span
            className="label-caps"
            style={{
              fontSize: "0.65rem",
              padding: "3px 8px",
              borderRadius: 4,
              backgroundColor: "var(--warm)",
              color: "var(--mid)",
            }}
          >
            {agent.model.split("/").pop()?.split(" — ")[0]}
          </span>
        )}
      </div>
    </div>
  );
}

function OrgChart({
  mads,
  baldur,
  specialists,
  cronCountFor,
}: {
  mads: Agent;
  baldur: Agent;
  specialists: Agent[];
  cronCountFor: (id: string) => number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baldurRef = useRef<HTMLDivElement>(null);
  const specialistRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);

  useEffect(() => {
    function calcLines() {
      if (!containerRef.current || !baldurRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const baldurRect = baldurRef.current.getBoundingClientRect();
      const baldurBottomX = baldurRect.left + baldurRect.width / 2 - containerRect.left;
      const baldurBottomY = baldurRect.bottom - containerRect.top;

      const newLines = specialistRefs.current
        .map((ref, i) => {
          if (!ref) return null;
          const rect = ref.getBoundingClientRect();
          return {
            x1: baldurBottomX,
            y1: baldurBottomY,
            x2: rect.left + rect.width / 2 - containerRect.left,
            y2: rect.top - containerRect.top,
            color: specialists[i]?.color ?? "var(--warm)",
          };
        })
        .filter(Boolean) as typeof lines;
      setLines(newLines);
    }
    calcLines();
    window.addEventListener("resize", calcLines);
    // Recalculate after animations settle
    const t = setTimeout(calcLines, 500);
    return () => {
      window.removeEventListener("resize", calcLines);
      clearTimeout(t);
    };
  }, [specialists]);

  return (
    <div ref={containerRef} style={{ position: "relative", paddingBottom: "1rem" }}>
      {/* SVG lines layer */}
      {lines.length > 0 && (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {lines.map((l, i) => {
            const midY = l.y1 + (l.y2 - l.y1) * 0.4;
            return (
              <path
                key={i}
                d={`M${l.x1},${l.y1} C${l.x1},${midY} ${l.x2},${midY} ${l.x2},${l.y2}`}
                stroke={l.color}
                strokeWidth="1.5"
                strokeOpacity="0.35"
                fill="none"
              />
            );
          })}
        </svg>
      )}

      {/* Mads */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 0 }}>
        <AgentNode agent={mads} cronCount={0} isCenter />
      </div>

      {/* Mads → Baldur connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 2, height: 20, backgroundColor: "var(--charcoal)", opacity: 0.2 }} />
        <span className="label-caps" style={{ fontSize: "0.65rem", color: "var(--mid)", padding: "3px 0" }}>
          strategic decisions
        </span>
        <div style={{ width: 2, height: 14, backgroundColor: "var(--charcoal)", opacity: 0.2 }} />
      </div>

      {/* Baldur */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 0 }}>
        <AgentNode
          agent={baldur}
          cronCount={cronCountFor("main")}
          isCenter
          nodeRef={baldurRef}
        />
      </div>

      {/* Baldur → Specialists label */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 2, height: 16, backgroundColor: "var(--terracotta)", opacity: 0.3 }} />
        <span className="label-caps" style={{ fontSize: "0.65rem", color: "var(--terracotta)", padding: "3px 0" }}>
          orchestrates
        </span>
        <div style={{ width: 2, height: 16, backgroundColor: "var(--terracotta)", opacity: 0.3 }} />
      </div>

      {/* Specialists */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {specialists.map((a, i) => (
          <div
            key={a.id}
            ref={(el) => { specialistRefs.current[i] = el; }}
            className="fade-up"
            style={{ animationDelay: `${0.1 + i * 0.05}s` }}
          >
            <AgentNode agent={a} cronCount={cronCountFor(a.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueStreamRow({
  stream,
  agents,
}: {
  stream: ValueStream;
  agents: Agent[];
}) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        className="label-caps"
        style={{ marginBottom: "0.5rem", color: "var(--mid)", fontSize: "0.75rem" }}
      >
        {stream.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
        {stream.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                display: "inline-block",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: "0.75rem",
                fontFamily: "var(--font-dm-mono)",
                backgroundColor: "var(--warm)",
                color: "var(--charcoal)",
              }}
            >
              {step}
            </span>
            {i < stream.steps.length - 1 && (
              <svg width="24" height="14" viewBox="0 0 24 14" style={{ flexShrink: 0 }}>
                <path
                  d="M3 7h16M15 3l5 4-5 4"
                  stroke="var(--terracotta)"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        ))}
        <div style={{ marginLeft: "0.75rem", display: "flex", gap: "0.35rem" }}>
          {stream.agents.map((aId) => {
            const a = agents.find((x) => x.id === aId);
            if (!a) return null;
            return (
              <span
                key={aId}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: a.color,
                  display: "inline-block",
                }}
                title={a.name}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function OrgPage() {
  const [data, setData] = useState<OrgData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org");
      if (res.ok) setData(await res.json());
    } catch { /* retry next cycle */ }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--mid)", fontFamily: "var(--font-dm-mono)", fontSize: "0.85rem" }}>
          Loading organisation...
        </p>
      </div>
    );
  }

  const mads = data.agents.find((a) => a.id === "mads")!;
  const baldur = data.agents.find((a) => a.id === "main")!;
  const specialists = data.agents.filter((a) => a.type === "specialist");

  const cronCountFor = (id: string) =>
    data.crons.filter((c) => c.agentId === id).length;

  const healthyCrons = data.crons.filter(
    (c) => c.lastStatus === "ok" || c.lastStatus === "idle"
  ).length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-8 pt-8 pb-2 max-w-[1440px] mx-auto">
        <div className="flex items-baseline gap-3">
          <h1
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "2.25rem",
              fontWeight: 300,
              color: "var(--charcoal)",
            }}
          >
            Organisation
          </h1>
          <span className="label-caps" style={{ color: "var(--mid)", fontSize: "0.75rem" }}>
            {data.agents.length} agents
          </span>
          <span className="label-caps" style={{ color: "var(--olive)", fontSize: "0.75rem" }}>
            {healthyCrons}/{data.cadences.total} crons healthy
          </span>
        </div>
        <p
          style={{
            fontFamily: "var(--font-dm-mono)",
            fontSize: "0.8rem",
            color: "var(--mid)",
            marginTop: "0.25rem",
          }}
        >
          Governance structure, agent roles, operational cadences, and value streams
        </p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {/* Mission Statement */}
        <Card
          className="fade-up"
          style={{
            marginBottom: "1.5rem",
            textAlign: "center",
            borderLeft: "3px solid var(--terracotta)",
            padding: "1.5rem 2rem",
          }}
        >
          <h2
            className="label-caps"
            style={{ marginBottom: "0.75rem", color: "var(--terracotta)", fontSize: "0.75rem" }}
          >
            Our Mission
          </h2>
          <p
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: "1.35rem",
              fontWeight: 400,
              color: "var(--charcoal)",
              lineHeight: 1.5,
              maxWidth: 720,
              margin: "0 auto 1rem",
            }}
          >
            Build AI-native content and product infrastructure that lets one person
            do the work of a team — without burning out or losing quality.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            {[
              { label: "Compound over time", icon: "+" },
              { label: "Ship real things", icon: ">" },
              { label: "Cheap muscles, expensive brain", icon: "$" },
              { label: "Transparent to Mads", icon: "*" },
            ].map((v) => (
              <span
                key={v.label}
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.75rem",
                  color: "var(--mid)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <span style={{ color: "var(--terracotta)", fontWeight: 600 }}>{v.icon}</span>
                {v.label}
              </span>
            ))}
          </div>
        </Card>

        {/* Org Chart with lines */}
        <Card
          className="fade-up"
          style={{ marginBottom: "1.5rem", animationDelay: "0.05s", overflow: "visible" }}
        >
          <h2
            className="label-caps"
            style={{ marginBottom: "1.25rem", color: "var(--mid)", fontSize: "0.75rem" }}
          >
            Hierarchy
          </h2>
          <OrgChart
            mads={mads}
            baldur={baldur}
            specialists={specialists}
            cronCountFor={cronCountFor}
          />
        </Card>

        {/* Two-column: Value Streams + Cadences */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Value Streams */}
          <Card className="fade-up" style={{ animationDelay: "0.15s" }}>
            <h2
              className="label-caps"
              style={{ marginBottom: "1rem", color: "var(--mid)", fontSize: "0.75rem" }}
            >
              Value Streams
            </h2>
            {data.valueStreams.map((vs) => (
              <ValueStreamRow key={vs.name} stream={vs} agents={data.agents} />
            ))}
          </Card>

          {/* Cadences */}
          <Card className="fade-up" style={{ animationDelay: "0.2s" }}>
            <h2
              className="label-caps"
              style={{ marginBottom: "1rem", color: "var(--mid)", fontSize: "0.75rem" }}
            >
              Operational Cadences
            </h2>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem" }}>
              {[
                { label: "Daily", count: data.cadences.daily, color: "var(--terracotta)" },
                { label: "Weekly", count: data.cadences.weekly, color: "var(--olive)" },
                { label: "Periodic", count: data.cadences.periodic, color: "var(--lilac)" },
              ].map((c) => (
                <div key={c.label} style={{ textAlign: "center", flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-cormorant)",
                      fontSize: "2.25rem",
                      fontWeight: 300,
                      color: c.color,
                    }}
                  >
                    {c.count}
                  </div>
                  <div className="label-caps" style={{ color: "var(--mid)", fontSize: "0.7rem" }}>
                    {c.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Cron list by agent */}
            <div>
              {data.agents
                .filter((a) => a.type !== "human")
                .map((a) => {
                  const agentCrons = data.crons.filter((c) => c.agentId === a.id);
                  if (agentCrons.length === 0) return null;
                  return (
                    <div key={a.id} style={{ marginBottom: "0.85rem" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: a.color,
                            display: "inline-block",
                          }}
                        />
                        <span className="label-caps" style={{ color: "var(--charcoal)", fontSize: "0.7rem" }}>
                          {a.name}
                        </span>
                        <span className="label-caps" style={{ color: "var(--mid)", fontSize: "0.65rem" }}>
                          ({agentCrons.length})
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.3rem",
                          paddingLeft: "1.5rem",
                        }}
                      >
                        {agentCrons.map((c) => (
                          <span
                            key={c.name}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              padding: "3px 10px",
                              borderRadius: 4,
                              fontSize: "0.7rem",
                              fontFamily: "var(--font-dm-mono)",
                              backgroundColor: "var(--warm)",
                              color: "var(--charcoal)",
                            }}
                          >
                            <StatusDot status={c.lastStatus} size="sm" />
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>

        {/* Agent Detail Cards */}
        <Card className="fade-up" style={{ animationDelay: "0.25s" }}>
          <h2
            className="label-caps"
            style={{ marginBottom: "1rem", color: "var(--mid)", fontSize: "0.75rem" }}
          >
            Agent Directory
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1rem",
            }}
          >
            {data.agents
              .filter((a) => a.type !== "human")
              .map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: "1.25rem",
                    borderRadius: 8,
                    border: "1px solid var(--warm)",
                    borderLeft: `3px solid ${a.color}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: "var(--font-cormorant)",
                        fontSize: "1.5rem",
                        fontWeight: 500,
                        color: "var(--charcoal)",
                      }}
                    >
                      {a.name}
                    </h3>
                    <StatusDot status={a.status} size="md" />
                  </div>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--mid)",
                      lineHeight: 1.5,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {a.role}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span
                      className="label-caps"
                      style={{
                        fontSize: "0.65rem",
                        padding: "3px 8px",
                        borderRadius: 4,
                        backgroundColor: "var(--warm)",
                        color: "var(--mid)",
                      }}
                    >
                      {a.model.split("/").pop()?.split(" — ")[0]}
                    </span>
                    <span
                      className="label-caps"
                      style={{
                        fontSize: "0.65rem",
                        padding: "3px 8px",
                        borderRadius: 4,
                        backgroundColor: `${a.color}18`,
                        color: a.color,
                      }}
                    >
                      {cronCountFor(a.id)} crons
                    </span>
                    <span
                      className="label-caps"
                      style={{
                        fontSize: "0.65rem",
                        padding: "3px 8px",
                        borderRadius: 4,
                        backgroundColor: "var(--warm)",
                        color: "var(--mid)",
                      }}
                    >
                      reports to {a.reportsTo === "mads" ? "Mads" : "Baldur"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="px-8 pb-6 max-w-[1440px] mx-auto">
        <p
          style={{
            fontFamily: "var(--font-dm-mono)",
            fontSize: "0.7rem",
            color: "var(--mid)",
          }}
        >
          Verto Studios &copy; 2026 &middot; VertoOS Organisation &middot; Auto-refresh 60s
        </p>
      </footer>
    </div>
  );
}
