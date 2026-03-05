"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────

interface Schedule {
  lanes: Record<string, { active: boolean }>;
  channels: Record<string, { postsPerWeek: number; bestTimes: string[]; lane: string; method?: string }>;
}

interface ContentItem {
  filename: string;
  channel: string;
  status: "draft" | "queued" | "approved" | "published";
  date: string;
  title: string;
  source?: "supabase" | "filesystem";
}

interface CalendarData {
  schedule: Schedule;
  items: ContentItem[];
  stats: { drafts: number; queued: number; published: number };
}

// ─── Constants ───────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  x: "#1DA1F2",
  reddit: "#FF4500",
  tiktok: "#010101",
  linkedin: "#0A66C2",
};

const LANE_COLORS: Record<string, string> = {
  b2c: "var(--lilac)",
  b2b: "#C9A227",
};

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "var(--warm)", fg: "var(--mid)", label: "Draft" },
  queued: { bg: "var(--lilac-soft)", fg: "var(--lilac)", label: "Queued" },
  approved: { bg: "var(--amber-soft)", fg: "var(--amber)", label: "Approved" },
  published: { bg: "var(--olive-soft)", fg: "var(--olive)", label: "Published" },
};

const CHANNELS = ["x", "reddit", "tiktok", "linkedin"];

// ─── Helpers ─────────────────────────────────────────────────────────

function getWeekDates(offset: number): { date: Date; label: string; iso: string }[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d,
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      iso: d.toISOString().slice(0, 10),
    };
  });
}

function formatWeekRange(dates: { date: Date }[]): string {
  const first = dates[0].date;
  const last = dates[6].date;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${first.toLocaleDateString("en-GB", opts)} – ${last.toLocaleDateString("en-GB", opts)}`;
}

function gapColor(actual: number, target: number): string {
  if (target === 0) return "var(--mid)";
  const ratio = actual / target;
  if (ratio >= 0.7) return "var(--olive)";
  if (ratio >= 0.3) return "var(--amber)";
  return "var(--terracotta)";
}

// ─── Page ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      if (res.ok) {
        const d: CalendarData = await res.json();
        setData(d);
        setSchedule(d.schedule);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  async function saveSchedule() {
    if (!schedule) return;
    setSaving(true);
    try {
      await fetch("/api/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      await fetchData();
    } finally {
      setSaving(false);
    }
  }

  function updatePostsPerWeek(channel: string, value: number) {
    if (!schedule) return;
    setSchedule({
      ...schedule,
      channels: {
        ...schedule.channels,
        [channel]: { ...schedule.channels[channel], postsPerWeek: Math.max(0, Math.min(14, value)) },
      },
    });
  }

  function toggleLane(lane: string) {
    if (!schedule) return;
    setSchedule({
      ...schedule,
      lanes: {
        ...schedule.lanes,
        [lane]: { active: !schedule.lanes[lane]?.active },
      },
    });
  }

  const weekDates = getWeekDates(weekOffset);
  const today = new Date().toISOString().slice(0, 10);
  const weekIsos = new Set(weekDates.map((d) => d.iso));

  // Items in current week view
  const weekItems = data?.items.filter((i) => weekIsos.has(i.date)) ?? [];

  // Per-channel actual counts for this week
  const channelActuals: Record<string, number> = {};
  for (const ch of CHANNELS) {
    channelActuals[ch] = weekItems.filter(
      (i) => i.channel === ch && (i.status === "published" || i.status === "queued" || i.status === "approved")
    ).length;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-8 pt-8 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight">Content Calendar</h1>
            <p className="text-mid text-sm mt-1">Weekly overview across all channels</p>
          </div>
          <div className="text-right" />
        </div>

        {/* Stats Strip */}
        {data && (
          <div className="grid grid-cols-3 gap-3 fade-up">
            <StatCard label="Drafts" value={data.stats.drafts} color="var(--mid)" />
            <StatCard label="Queued" value={data.stats.queued} color="var(--lilac)" />
            <StatCard label="Published" value={data.stats.published} color="var(--olive)" />
          </div>
        )}
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ─── Week View / Swim Lanes ─────────────────────── */}
          <div className="card lg:col-span-9 fade-up" style={{ animationDelay: "0.05s" }}>
            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="flex items-center gap-1 text-sm text-mid hover:text-charcoal transition-colors px-3 py-1.5 rounded-lg hover:bg-warm/60"
              >
                <span className="text-xs">←</span> Prev
              </button>
              <div className="text-center">
                <h2 className="text-xl text-charcoal">
                  {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : weekOffset === 1 ? "Next Week" : `Week`}
                </h2>
                <p className="text-xs text-mid/60 mt-0.5">{formatWeekRange(weekDates)}</p>
              </div>
              <div className="flex items-center gap-1">
                {weekOffset !== 0 && (
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="text-xs text-terracotta hover:text-terracotta/80 transition-colors px-2 py-1.5 rounded-lg hover:bg-terracotta-soft"
                  >
                    Today
                  </button>
                )}
                <button
                  onClick={() => setWeekOffset((o) => o + 1)}
                  className="flex items-center gap-1 text-sm text-mid hover:text-charcoal transition-colors px-3 py-1.5 rounded-lg hover:bg-warm/60"
                >
                  Next <span className="text-xs">→</span>
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid gap-1" style={{ gridTemplateColumns: "100px repeat(7, 1fr)" }}>
              <div />
              {weekDates.map((d) => (
                <div
                  key={d.iso}
                  className="text-center text-xs py-1.5 rounded-md"
                  style={{
                    backgroundColor: d.iso === today ? "var(--terracotta)" : "var(--warm)",
                    color: d.iso === today ? "var(--paper)" : "var(--mid)",
                    fontWeight: d.iso === today ? 500 : 300,
                  }}
                >
                  {d.label}
                </div>
              ))}

              {/* Channel swim lanes */}
              {CHANNELS.map((ch) => {
                const chItems = data?.items.filter((i) => i.channel === ch) ?? [];
                const lane = schedule?.channels?.[ch]?.lane ?? "b2c";
                return (
                  <div key={ch} className="contents">
                    <div className="flex items-center gap-2 py-3 pr-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                      />
                      <span className="text-sm capitalize font-medium">{ch === "x" ? "X" : ch}</span>
                      <span
                        className="text-[0.55rem] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${LANE_COLORS[lane]}20`, color: LANE_COLORS[lane] }}
                      >
                        {lane.toUpperCase()}
                      </span>
                    </div>
                    {weekDates.map((d) => {
                      const dayItems = chItems.filter((i) => i.date === d.iso);
                      const visibleItems = dayItems.slice(0, 3);
                      const hiddenCount = dayItems.length - visibleItems.length;
                      return (
                        <div
                          key={`${ch}-${d.iso}`}
                          className="py-2 px-1 min-h-[5.75rem] max-h-[5.75rem] border-l border-warm/40 overflow-hidden min-w-0"
                        >
                          {visibleItems.map((item, idx) => {
                            const style = STATUS_STYLES[item.status] || STATUS_STYLES.draft;
                            return (
                              <div
                                key={idx}
                                className="text-[0.6rem] px-1.5 py-1 rounded mb-0.5 flex items-center gap-1 min-w-0 overflow-hidden"
                                style={{ backgroundColor: style.bg, color: style.fg }}
                                title={`${item.title} (${style.label}${item.source === "supabase" ? " · Supabase" : ""})`}
                              >
                                <span
                                  className="w-1 h-1 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                                />
                                <span className="truncate min-w-0">{item.title}</span>
                              </div>
                            );
                          })}
                          {hiddenCount > 0 && (
                            <div className="text-[0.55rem] px-1.5 py-1 rounded bg-warm text-mid/70">
                              +{hiddenCount} more
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* ─── Weekly Summary Row ─────────────────────────── */}
            {schedule && (
              <div className="mt-4 pt-3 border-t border-warm/60">
                <p className="label-caps text-[0.5rem] text-mid/50 mb-2">This Week · Target vs Actual</p>
                <div className="flex flex-wrap gap-3">
                  {CHANNELS.map((ch) => {
                    const target = schedule.channels[ch]?.postsPerWeek ?? 0;
                    const actual = channelActuals[ch] ?? 0;
                    const color = gapColor(actual, target);
                    return (
                      <div key={ch} className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                        />
                        <span className="text-xs capitalize">{ch === "x" ? "X" : ch}:</span>
                        <span
                          className="text-xs tabular-nums font-medium"
                          style={{ color }}
                        >
                          {actual}/{target}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── Scale Controls ──────────────────────────────── */}
          <div className="card lg:col-span-3 fade-up" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-xl text-charcoal mb-4">Scale Controls</h2>

            {/* Lane toggles */}
            {schedule && (
              <div className="mb-5">
                <p className="label-caps mb-2 text-mid/60">Lanes</p>
                {Object.entries(schedule.lanes).map(([lane, cfg]) => (
                  <button
                    key={lane}
                    onClick={() => toggleLane(lane)}
                    className="flex items-center justify-between w-full py-2 px-3 rounded-lg mb-1 transition-colors text-sm"
                    style={{
                      backgroundColor: cfg.active ? `${LANE_COLORS[lane]}15` : "var(--warm)",
                      color: cfg.active ? LANE_COLORS[lane] : "var(--mid)",
                    }}
                  >
                    <span className="font-medium uppercase text-xs tracking-wider">{lane}</span>
                    <span className="text-xs">{cfg.active ? "Active" : "Paused"}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Per-channel sliders with target vs actual */}
            {schedule && (
              <div className="space-y-4 mb-5">
                <p className="label-caps text-mid/60">Posts / Week</p>
                {CHANNELS.map((ch) => {
                  const cfg = schedule.channels[ch];
                  if (!cfg) return null;
                  const laneActive = schedule.lanes[cfg.lane]?.active ?? true;
                  const actual = channelActuals[ch] ?? 0;
                  const target = cfg.postsPerWeek;
                  const color = gapColor(actual, target);
                  return (
                    <div key={ch} className={laneActive ? "" : "opacity-40"}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch] }} />
                          <span className="capitalize">{ch === "x" ? "X" : ch}</span>
                        </span>
                        <span className="tabular-nums text-xs font-medium" style={{ color }}>
                          {actual}/{target} this week
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={14}
                        value={cfg.postsPerWeek}
                        onChange={(e) => updatePostsPerWeek(ch, parseInt(e.target.value))}
                        disabled={!laneActive}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${CHANNEL_COLORS[ch]} ${(cfg.postsPerWeek / 14) * 100}%, var(--warm) ${(cfg.postsPerWeek / 14) * 100}%)`,
                        }}
                      />
                      <div className="flex justify-between text-[0.55rem] text-mid/40 mt-0.5">
                        <span>0</span>
                        <span>Best: {cfg.bestTimes?.join(", ") ?? "—"}</span>
                        <span>14</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save button */}
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="w-full py-2.5 bg-charcoal text-paper rounded-lg text-sm tracking-wide hover:bg-charcoal/90 disabled:opacity-30 transition-all"
            >
              {saving ? "Saving..." : "Save Schedule"}
            </button>

            {/* Method legend */}
            {schedule && (
              <div className="mt-5 pt-4 border-t border-warm">
                <p className="label-caps text-mid/40 mb-2">Posting Method</p>
                {CHANNELS.map((ch) => {
                  const method = schedule.channels[ch]?.method ?? "—";
                  return (
                    <div key={ch} className="flex items-center justify-between text-[0.65rem] text-mid/60 py-0.5">
                      <span className="capitalize">{ch === "x" ? "X" : ch}</span>
                      <span>{method}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="px-8 pb-6 max-w-[1440px] mx-auto flex items-center justify-between">
        <p className="label-caps text-mid/40">Verto Studios · Content Ops</p>
        <p className="label-caps text-mid/40" suppressHydrationWarning>
          {new Date().toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen" })} · refreshes every 60s
        </p>
      </footer>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-paper/60 border border-warm/60 rounded-xl px-4 py-3 text-center">
      <p className="text-2xl font-medium leading-none mb-1 tabular-nums" style={{ color, fontFamily: "var(--font-cormorant), Georgia, serif" }}>
        {value}
      </p>
      <p className="label-caps text-mid/60 text-[0.55rem]">{label}</p>
    </div>
  );
}
