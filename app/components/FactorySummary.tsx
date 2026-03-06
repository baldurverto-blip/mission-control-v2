"use client";

import { agent as agentToken, relTime } from "@/app/lib/agents";

interface ActivityEvent {
  agent: string;
  action: string;
  goal: string;
  outcome: string;
  timestamp: string;
  model?: string;
}

interface FactoryProject {
  slug: string;
  status: string;
  completedPhases: number;
  totalPhases: number;
  lastActivity?: ActivityEvent | null;
}

export interface FactorySummaryData {
  projects: FactoryProject[];
  stats: { building: number; shipping: number; shipped: number; queued: number; attention: number };
  activityFeed: ActivityEvent[];
  loopRunning: boolean;
  lastPulseAt: string | null;
}

const MODEL_COLORS: Record<string, string> = {
  "Opus 4.6": "#6B21A8",
  "opus": "#6B21A8",
  "Sonnet 4.6": "#1D4ED8",
  "sonnet": "#1D4ED8",
  "MiniMax-M2.5": "#374151",
  "minimax": "#374151",
};

const MODEL_LABELS: Record<string, string> = {
  "Opus 4.6": "OPUS",
  "opus": "OPUS",
  "Sonnet 4.6": "SONNET",
  "sonnet": "SONNET",
  "MiniMax-M2.5": "MINIMAX",
  "minimax": "MINIMAX",
};

export function FactorySummary({ data }: { data: FactorySummaryData | null }) {
  if (!data) return null;

  const { stats, activityFeed, projects, loopRunning, lastPulseAt } = data;
  const now = Date.now();
  const LIVE_THRESHOLD = 30 * 60 * 1000;
  const isLive = loopRunning;

  return (
    <div className="bg-paper border border-warm rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="label-caps text-mid/60">App Factory</p>
          {isLive ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#16A34A" }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ backgroundColor: "#4ADE80" }} />
              <span className="text-[0.45rem] text-white font-semibold tracking-wide uppercase">Live</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warm">
              <span className="w-1.5 h-1.5 rounded-full bg-mid/30" />
              <span className="text-[0.45rem] text-mid/50 tracking-wide uppercase">Idle</span>
            </span>
          )}
        </div>
        <a
          href="/factory"
          className="text-[0.55rem] text-mid/40 hover:text-charcoal transition-colors"
        >
          View all &rarr;
        </a>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-3">
        <Stat label="Building" value={stats.building} color="var(--lilac)" />
        <Stat label="Shipped" value={stats.shipped} color="var(--olive)" />
        <Stat label="Queued" value={stats.queued} color="var(--mid)" />
        {stats.attention > 0 && (
          <Stat label="Attention" value={stats.attention} color="var(--terracotta)" pulse />
        )}
      </div>

      {/* Active project progress bars */}
      {projects.filter((p) => !["shipped", "paused", "rejected"].includes(p.status)).length > 0 && (
        <div className="space-y-2 mb-3">
          {projects
            .filter((p) => !["shipped", "paused", "rejected"].includes(p.status))
            .slice(0, 3)
            .map((p) => {
              const pct = Math.round((p.completedPhases / Math.max(p.totalPhases, 1)) * 100);
              const activity = p.lastActivity;
              const hasActivity = activity && (now - new Date(activity.timestamp).getTime() < LIVE_THRESHOLD);
              const activityAgent = hasActivity ? agentToken(activity!.agent) : null;

              const isAwaitingApproval = p.status === "awaiting-approval";

              return (
                <div key={p.slug} className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-charcoal capitalize w-16 truncate">{p.slug}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-warm overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isAwaitingApproval ? "var(--amber)" : hasActivity ? activityAgent!.color : "var(--lilac)",
                      }}
                    />
                  </div>
                  <span className="text-[0.5rem] text-mid/40 tabular-nums w-6 text-right">{pct}%</span>
                  {isAwaitingApproval ? (
                    <a
                      href="/factory"
                      className="px-1.5 py-0.5 rounded text-[0.35rem] font-bold tracking-wider text-white flex-shrink-0 attention-pulse"
                      style={{ backgroundColor: "var(--amber)" }}
                    >
                      APPROVE
                    </a>
                  ) : hasActivity && activityAgent ? (
                    <span
                      className="w-3 h-3 rounded-full flex items-center justify-center text-[0.3rem] text-white font-bold flex-shrink-0 pulse-dot-subtle"
                      style={{ backgroundColor: activityAgent.color }}
                    >
                      {activityAgent.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
        </div>
      )}

      {/* Recent activity feed (compact) */}
      {activityFeed.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-md" style={{ backgroundColor: "#1C1B19" }}>
          {activityFeed.slice(0, 4).map((event, i) => {
            const token = agentToken(event.agent);
            const modelColor = MODEL_COLORS[event.model ?? ""] ?? "#374151";
            const modelLabel = MODEL_LABELS[event.model ?? ""] ?? "";
            const isRecent = now - new Date(event.timestamp).getTime() < LIVE_THRESHOLD;
            return (
              <div
                key={`${event.timestamp}-${i}`}
                className={`flex items-start gap-2 px-2.5 py-1.5 border-b border-white/5 transition-opacity ${isRecent ? "opacity-100" : "opacity-60"}`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[0.35rem] text-white font-medium flex-shrink-0 mt-0.5 ${isRecent ? "pulse-dot-subtle" : ""}`}
                  style={{ backgroundColor: token.color }}
                >
                  {token.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.55rem] font-medium font-[family-name:var(--font-dm-mono)]" style={{ color: token.color }}>
                      {token.name}
                    </span>
                    {modelLabel && (
                      <span
                        className="px-1 py-0 rounded text-[0.35rem] font-bold tracking-wider font-[family-name:var(--font-dm-mono)]"
                        style={{ backgroundColor: modelColor, color: "#fff" }}
                      >
                        {modelLabel}
                      </span>
                    )}
                    <span className="text-[0.45rem] text-white/20 tabular-nums font-[family-name:var(--font-dm-mono)]">
                      {relTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-[0.5rem] text-white/40 truncate font-[family-name:var(--font-dm-mono)]">
                    {event.outcome}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[0.55rem] text-mid/30">No factory activity yet</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, pulse = false }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div className={`text-center ${pulse ? "attention-pulse" : ""}`}>
      <p className="text-lg font-light tabular-nums" style={{ fontFamily: "var(--font-cormorant)", color }}>
        {value}
      </p>
      <p className="label-caps text-[0.4rem]">{label}</p>
    </div>
  );
}
