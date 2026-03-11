"use client";

import { useMemo } from "react";
import { isAttention, type PulseData } from "@/app/lib/agents";
import { NerveCenter } from "./NerveCenter";
import { AttentionBar } from "./AttentionBar";
import { MissionBands } from "./MissionBands";
import { ActivityTimeline } from "./ActivityTimeline";
import { StatusDot } from "./StatusDot";
import { Badge } from "./Badge";
import { TabBar } from "./TabBar";
import type { FormEvent } from "react";

interface KPIs {
  roadmap: { done: number; total: number };
  week: { number: number; day: number };
  cron: { healthy: number; total: number; heartbeatAgeMs: number | null };
  inbox: { open: number };
  research: { count: number; scoutScore: number };
  failures: { recent: number; daysSince: number | null };
  skills: { count: number };
  workflows?: { active: number; approvalPending: number; completedToday: number; totalRuns: number };
}

interface InboxItem { text: string; done: boolean; }
interface BriefFile { name: string; content: string; }

interface GoalData {
  id: string;
  name: string;
  pulseCount: number;
  agents: { id: string; count: number }[];
  lastPulse: string | null;
}

interface WorkflowDef { name: string; file: string; steps: string[]; }
interface WorkflowActive { workflow: string; runId: string; trigger: string; startedAt: string; currentStep: string | null; approvalPending: boolean; }
interface WorkflowCompleted { workflow: string; runId: string; startedAt: string; finishedAt: string; finalStatus: string; }
interface WorkflowData {
  state: { active: WorkflowActive[]; completed: WorkflowCompleted[]; blocked: unknown[] };
  stats: { totalRuns: number; completedToday: number; approvalsPending: number };
  definitions: WorkflowDef[];
}

function parseMdSections(md: string): { status: string; wins: string[]; focus: string[]; blockers: string[] } {
  const clean = md.replace(/^---[\s\S]*?---\n*/m, "");
  const status = clean.match(/## Status:?\s*(.+)/)?.[1]?.trim() ?? "";
  const wins: string[] = [];
  const focus: string[] = [];
  const blockers: string[] = [];
  let current: string[] | null = null;
  for (const line of clean.split("\n")) {
    if (/today.s wins/i.test(line)) { current = wins; continue; }
    if (/week.*focus|sprint.*focus/i.test(line)) { current = focus; continue; }
    if (/active blockers|needs attention/i.test(line)) { current = blockers; continue; }
    if (/tonight|scheduled|current roadmap/i.test(line)) { current = null; continue; }
    if (/^##/.test(line)) { current = null; continue; }
    if (current && /^-\s/.test(line.trim())) {
      current.push(line.trim().replace(/^-\s*/, "").replace(/^\*\*/, "").replace(/\*\*:?\s*/, ": ").replace(/\*\*/g, ""));
    }
  }
  return { status, wins, focus, blockers };
}

function previewBrief(content: string, max = 900): string {
  return content.replace(/^---[\s\S]*?---\n*/m, "").trim().slice(0, max);
}

function relTimeMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function OperationsView({
  kpis,
  pulseData,
  goals,
  inbox,
  briefs,
  workflows,
  nowRaw,
  selectedAgent,
  setSelectedAgent,
  selectedGoal,
  setSelectedGoal,
  contextTab,
  setContextTab,
  newItem,
  setNewItem,
  adding,
  handleAddItem,
}: {
  kpis: KPIs | null;
  pulseData: PulseData | null;
  goals: GoalData[];
  inbox: InboxItem[];
  briefs: { morning: BriefFile | null; evening: BriefFile | null };
  workflows: WorkflowData | null;
  nowRaw: string;
  selectedAgent: string | null;
  setSelectedAgent: (id: string | null) => void;
  selectedGoal: string | null;
  setSelectedGoal: (id: string | null) => void;
  contextTab: string;
  setContextTab: (id: string) => void;
  newItem: string;
  setNewItem: (v: string) => void;
  adding: boolean;
  handleAddItem: (e: FormEvent) => void;
}) {
  const now = parseMdSections(nowRaw);
  const openInbox = inbox.filter(i => !i.done);
  const doneInbox = inbox.filter(i => i.done);

  const attentionPulses = useMemo(() => {
    if (!pulseData) return [];
    const today = new Date().toISOString().slice(0, 10);
    return pulseData.pulses.filter(p => p.timestamp.startsWith(today) && isAttention(p));
  }, [pulseData]);

  const contextTabs = [
    { id: "inbox", label: "Inbox", count: openInbox.length || undefined },
    { id: "brief", label: "Briefs" },
    { id: "focus", label: "Focus" },
    { id: "flows", label: "Workflows", count: workflows?.stats.approvalsPending || undefined },
  ];

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ─── ZONE 1: Nerve Center ─────────────────────────── */}
      {pulseData && (
        <NerveCenter
          pulses={pulseData.pulses}
          stats={pulseData.stats}
          cronHealth={kpis ? { healthy: kpis.cron.healthy, total: kpis.cron.total } : undefined}
          selectedAgent={selectedAgent}
          onSelectAgent={(id) => { setSelectedAgent(id); setSelectedGoal(null); }}
        />
      )}

      {/* ─── ZONE 2: Attention + Mission Bands ────────────── */}
      {attentionPulses.length > 0 && !selectedAgent && !selectedGoal && (
        <AttentionBar pulses={attentionPulses} />
      )}

      {goals.length > 0 && (
        <MissionBands
          goals={goals}
          selectedGoal={selectedGoal}
          onSelectGoal={(id) => { setSelectedGoal(id); setSelectedAgent(null); }}
        />
      )}

      {/* ─── ZONE 3: Timeline + Context Panel ─────────────── */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* Activity Timeline (7 cols) */}
        <div className="col-span-7 min-h-0 flex flex-col">
          {pulseData && (
            <ActivityTimeline
              pulses={pulseData.pulses}
              selectedAgent={selectedAgent}
              selectedGoal={selectedGoal}
            />
          )}
        </div>

        {/* Context Panel (5 cols) */}
        <div className="col-span-5 bg-paper border border-warm rounded-xl overflow-hidden flex flex-col fade-up min-h-0">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <TabBar tabs={contextTabs} active={contextTab} onChange={setContextTab} />
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
            {/* ── Inbox Tab ─────────────────────────────── */}
            {contextTab === "inbox" && (
              <div>
                <div className="space-y-0.5 mb-4">
                  {openInbox.length === 0 && doneInbox.length === 0 && (
                    <p className="text-mid text-sm py-4 text-center">Inbox zero</p>
                  )}
                  {openInbox.map((item, i) => (
                    <div key={`open-${i}`} className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-warm/50 transition-colors text-sm group">
                      <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded border border-mid/40 group-hover:border-terracotta transition-colors" />
                      <span className="leading-snug">{item.text}</span>
                    </div>
                  ))}
                  {doneInbox.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-warm">
                      {doneInbox.map((item, i) => (
                        <div key={`done-${i}`} className="flex items-start gap-2.5 py-1 px-2 text-sm text-mid/70">
                          <span className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded bg-olive/30 border border-olive/30 flex items-center justify-center text-[8px] text-olive">&#10003;</span>
                          <span className="leading-snug line-through">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <form onSubmit={handleAddItem} className="flex gap-2">
                  <input
                    type="text"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add to inbox..."
                    className="flex-1 bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-mid/70 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={adding || !newItem.trim()}
                    className="px-3 py-2 bg-charcoal text-paper rounded-lg text-sm tracking-wide hover:bg-charcoal/90 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    {adding ? "..." : "Add"}
                  </button>
                </form>
              </div>
            )}

            {/* ── Brief Tab ─────────────────────────────── */}
            {contextTab === "brief" && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="label-caps" style={{ color: "var(--charcoal)" }}>Morning</p>
                    <span className="text-[0.8rem] text-mid/70">{briefs.morning?.name ?? "—"}</span>
                  </div>
                  {briefs.morning ? (
                    <pre className="text-xs whitespace-pre-wrap font-[family-name:var(--font-dm-mono)] leading-relaxed text-mid">{previewBrief(briefs.morning.content)}</pre>
                  ) : (
                    <p className="text-sm text-mid/80">No morning brief yet.</p>
                  )}
                </div>
                <div className="border-t border-warm pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="label-caps" style={{ color: "var(--charcoal)" }}>Evening</p>
                    <span className="text-[0.8rem] text-mid/70">{briefs.evening?.name ?? "—"}</span>
                  </div>
                  {briefs.evening ? (
                    <pre className="text-xs whitespace-pre-wrap font-[family-name:var(--font-dm-mono)] leading-relaxed text-mid">{previewBrief(briefs.evening.content)}</pre>
                  ) : (
                    <p className="text-sm text-mid/80">No evening brief yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Focus Tab ─────────────────────────────── */}
            {contextTab === "focus" && (
              <div>
                {now.status && (
                  <div className="mb-3">
                    <Badge color="var(--terracotta)">{now.status}</Badge>
                  </div>
                )}
                {now.focus.length > 0 && (
                  <div className="mb-4">
                    <p className="label-caps mb-2" style={{ color: "var(--terracotta)" }}>This week</p>
                    <div className="space-y-1.5">
                      {now.focus.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-terracotta flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {now.wins.length > 0 && (
                  <div className="mb-4">
                    <p className="label-caps mb-2" style={{ color: "var(--olive)" }}>Wins today</p>
                    <div className="space-y-1.5">
                      {now.wins.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-mid">
                          <span className="mt-0.5 flex-shrink-0 text-olive">&#10003;</span>
                          <span>{item.replace(/^✅\s*/, "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {now.blockers.length > 0 && (
                  <div>
                    <p className="label-caps mb-2" style={{ color: "var(--terracotta)" }}>Blockers</p>
                    <div className="space-y-1.5">
                      {now.blockers.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-mid">
                          <span className="mt-0.5 flex-shrink-0 text-terracotta">!</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!nowRaw && <p className="text-mid text-sm">Loading...</p>}
              </div>
            )}

            {/* ── Workflows Tab ─────────────────────────── */}
            {contextTab === "flows" && (
              <div className="space-y-3">
                {workflows ? (
                  <>
                    {workflows.state.active.length > 0 && (
                      <div>
                        <p className="label-caps text-mid/80 mb-2">Active</p>
                        {workflows.state.active.map((w) => (
                          <div key={w.runId} className="flex items-center gap-3 p-2.5 rounded-lg bg-warm/40 mb-2">
                            <StatusDot status={w.approvalPending ? "warn" : "ok"} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{w.workflow}</p>
                              <p className="text-xs text-mid">
                                Step: <span className="text-charcoal">{w.currentStep ?? "starting"}</span>
                                {w.approvalPending && <span className="text-terracotta ml-2">· awaiting approval</span>}
                              </p>
                            </div>
                            <p className="text-[0.8rem] text-mid/70" suppressHydrationWarning>{relTimeMs(new Date(w.startedAt).getTime())}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <p className="label-caps text-mid/80 mb-2">Pipelines</p>
                      <div className="space-y-1.5">
                        {workflows.definitions.map((def) => (
                          <div key={def.file} className="p-2.5 rounded-lg bg-warm/30">
                            <p className="text-sm font-medium mb-1">{def.name}</p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {def.steps.map((step, i) => (
                                <span key={step} className="flex items-center gap-1">
                                  <span className="text-[0.75rem] text-mid bg-warm rounded px-1 py-0.5">{step}</span>
                                  {i < def.steps.length - 1 && <span className="text-mid/55 text-[0.7rem]">&rarr;</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {workflows.state.completed.length > 0 && (
                      <div>
                        <p className="label-caps text-mid/80 mb-2">Recent</p>
                        {workflows.state.completed.slice(0, 5).map((w) => (
                          <div key={w.runId} className="flex items-center gap-3 py-1.5">
                            <StatusDot status={w.finalStatus === "done" ? "ok" : "error"} />
                            <p className="text-xs text-mid flex-1">{w.workflow}</p>
                            <p className="text-[0.8rem] text-mid/70">{w.finalStatus}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {workflows.state.active.length === 0 && workflows.state.completed.length === 0 && (
                      <p className="text-sm text-mid/80 py-2 text-center">No pipeline activity yet</p>
                    )}
                  </>
                ) : (
                  <p className="text-mid text-sm py-4 text-center">Loading...</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
