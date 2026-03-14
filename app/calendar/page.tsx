"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────

type EventCategory =
  | "factory"
  | "signals"
  | "distribution"
  | "seo"
  | "system"
  | "task"
  | "milestone";

type ViewMode = "month" | "week" | "day";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  category: EventCategory;
  color: string;
  allDay?: boolean;
  count?: number;
  description?: string;
  source: "cron" | "launchagent" | "task" | "milestone";
  enabled?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const CAT_COLOR: Record<EventCategory, string> = {
  factory: "#76875A",
  signals: "#9899C1",
  distribution: "#BC6143",
  seo: "#C9A227",
  system: "#8B8078",
  task: "#2A2927",
  milestone: "#BC6143",
};

const CAT_LABEL: Record<EventCategory, string> = {
  factory: "Factory",
  signals: "Signals",
  distribution: "Dist.",
  seo: "SEO",
  system: "System",
  task: "Task",
  milestone: "Milestone",
};

const ALL_CATEGORIES = Object.keys(CAT_COLOR) as EventCategory[];
const WEEK_DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_PX = 72; // pixels per hour in week/day view

// ── Date helpers ───────────────────────────────────────────────────

function dKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeekMon(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function getMonthGrid(anchor: Date): Date[] {
  const som = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeekMon(som);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeekMon(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function fmtWeekRange(days: Date[]): string {
  const a = days[0], b = days[6];
  if (a.getMonth() === b.getMonth())
    return `${a.getDate()}–${b.getDate()} ${a.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  return `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function fmtDayFull(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function groupByCat(evs: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const r: Record<string, CalendarEvent[]> = {};
  for (const e of evs) {
    if (!r[e.category]) r[e.category] = [];
    r[e.category].push(e);
  }
  return r;
}

// ── Overlap layout (Google Calendar algorithm) ─────────────────────
// Returns each timed event with a column index and total column count
// so they can be rendered side-by-side without overlapping.

interface PositionedEvent {
  ev: CalendarEvent;
  top: number;
  height: number;
  colIndex: number;
  numCols: number;
}

function layoutEvents(timedEvs: CalendarEvent[]): PositionedEvent[] {
  if (timedEvs.length === 0) return [];

  const DUR_MIN = 30; // assumed duration for overlap detection

  type Item = {
    ev: CalendarEvent;
    startMin: number;
    endMin: number;
    colIndex: number;
    numCols: number;
  };

  const items: Item[] = timedEvs
    .filter((e) => e.time)
    .map((ev) => {
      const [h, m] = ev.time!.split(":").map(Number);
      const startMin = h * 60 + m;
      return { ev, startMin, endMin: startMin + DUR_MIN, colIndex: 0, numCols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // Greedy column assignment: each event takes the first column where it fits
  const colEnds: number[] = [];
  for (const item of items) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > item.startMin) col++;
    item.colIndex = col;
    colEnds[col] = item.endMin;
  }

  // Calculate numCols per item = max colIndex of any overlapping neighbour + 1
  for (const item of items) {
    let maxCol = item.colIndex;
    for (const other of items) {
      if (other !== item && other.startMin < item.endMin && other.endMin > item.startMin) {
        maxCol = Math.max(maxCol, other.colIndex);
      }
    }
    item.numCols = maxCol + 1;
  }

  const DISPLAY_DUR_MIN = 26; // visual height (gap between events)

  return items.map(({ ev, startMin, colIndex, numCols }) => ({
    ev,
    top: (startMin / 60) * HOUR_PX,
    height: Math.max(18, (DISPLAY_DUR_MIN / 60) * HOUR_PX),
    colIndex,
    numCols,
  }));
}

// ── Main page ──────────────────────────────────────────────────────

export default function CalendarPage() {
  const todayDate = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const todayKey = dKey(todayDate);

  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(todayDate);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCats, setActiveCats] = useState<Set<EventCategory>>(
    new Set(ALL_CATEGORIES)
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "", date: todayKey, time: "", endTime: "", description: "",
    category: "task" as EventCategory,
  });
  const [saving, setSaving] = useState(false);
  const timeGridRef = useRef<HTMLDivElement | null>(null);

  // Fetch events for visible range
  const fetchEvents = useCallback(async (a: Date, v: ViewMode) => {
    setLoading(true);
    let from: string, to: string;
    if (v === "month") {
      const grid = getMonthGrid(a);
      from = dKey(grid[0]);
      to = dKey(grid[grid.length - 1]);
    } else if (v === "week") {
      const days = getWeekDays(a);
      from = dKey(days[0]);
      to = dKey(days[6]);
    } else {
      from = to = dKey(a);
    }
    try {
      const res = await fetch(`/api/calendar/events?from=${from}&to=${to}`);
      if (res.ok) setEvents(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(anchor, view); }, [anchor, view, fetchEvents]);

  // Scroll time grid to current hour on load
  useEffect(() => {
    if ((view === "week" || view === "day") && timeGridRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 1) * HOUR_PX);
      timeGridRef.current.scrollTop = scrollTo;
    }
  }, [view]);

  function navigate(dir: 1 | -1) {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(anchor.getMonth() + dir);
    else if (view === "week") next.setDate(anchor.getDate() + 7 * dir);
    else next.setDate(anchor.getDate() + dir);
    setAnchor(next);
  }

  function toggleCat(cat: EventCategory) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
      return next;
    });
  }

  const filtered = events.filter((e) => activeCats.has(e.category));

  async function createTask() {
    if (!newTask.title.trim() || !newTask.date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTask,
          title: newTask.title.trim(),
          time: newTask.time || undefined,
          endTime: newTask.endTime || undefined,
          description: newTask.description || undefined,
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewTask({ title: "", date: dKey(anchor), time: "", endTime: "", description: "", category: "task" });
        fetchEvents(anchor, view);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    await fetch(`/api/calendar/tasks?id=${id}`, { method: "DELETE" });
    setSelectedEvent(null);
    fetchEvents(anchor, view);
  }

  function openAddForDay(d: Date) {
    setNewTask((t) => ({ ...t, date: dKey(d) }));
    setShowAdd(true);
  }

  const headerTitle =
    view === "month"
      ? fmtMonthYear(anchor)
      : view === "week"
      ? fmtWeekRange(getWeekDays(anchor))
      : fmtDayFull(anchor);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--warm)", backgroundColor: "var(--paper)" }}
      >
        {/* Title + loading dot */}
        <div className="flex items-center gap-3 min-w-0">
          <h1
            className="text-2xl text-charcoal truncate"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}
          >
            {headerTitle}
          </h1>
          {loading && (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 pulse-dot"
              style={{ backgroundColor: "var(--lilac)" }}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div
            className="flex items-center gap-px p-0.5 rounded-lg border"
            style={{ backgroundColor: "var(--warm)", borderColor: "var(--warm)" }}
          >
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-md text-[0.78rem] capitalize transition-all cursor-pointer"
                style={{
                  backgroundColor: view === v ? "var(--paper)" : "transparent",
                  color: view === v ? "var(--charcoal)" : "var(--mid)",
                  fontWeight: view === v ? 500 : 300,
                  boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.07)" : "none",
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Nav arrows + today */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-mid hover:text-charcoal hover:bg-warm transition-colors cursor-pointer text-sm"
            >
              ‹
            </button>
            <button
              onClick={() => setAnchor(new Date(todayDate))}
              className="px-2.5 h-8 text-[0.75rem] rounded-lg text-mid hover:text-charcoal hover:bg-warm transition-colors cursor-pointer label-caps"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-mid hover:text-charcoal hover:bg-warm transition-colors cursor-pointer text-sm"
            >
              ›
            </button>
          </div>

          {/* Add task */}
          <button
            onClick={() => {
              setNewTask((t) => ({ ...t, date: dKey(anchor) }));
              setShowAdd(true);
            }}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[0.8rem] text-paper transition-colors cursor-pointer"
            style={{ backgroundColor: "var(--terracotta)" }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
            Task
          </button>
        </div>
      </div>

      {/* ── Category filters ────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-1.5 px-6 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--warm)/40", backgroundColor: "var(--bg)" }}
      >
        {ALL_CATEGORIES.map((cat) => {
          const active = activeCats.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] border transition-all cursor-pointer"
              style={{
                borderColor: active ? CAT_COLOR[cat] : "var(--warm)",
                backgroundColor: active ? `${CAT_COLOR[cat]}15` : "transparent",
                color: active ? CAT_COLOR[cat] : "var(--mid)",
                opacity: active ? 1 : 0.45,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: CAT_COLOR[cat] }}
              />
              {CAT_LABEL[cat]}
            </button>
          );
        })}
        <span className="ml-auto label-caps text-[0.65rem] text-mid/40">
          {filtered.length} events
        </span>
      </div>

      {/* ── Calendar view ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden px-4 py-3">
        {view === "month" && (
          <MonthView
            anchor={anchor}
            events={filtered}
            todayKey={todayKey}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
            onEventClick={setSelectedEvent}
            onAddClick={openAddForDay}
          />
        )}
        {view === "week" && (
          <WeekView
            anchor={anchor}
            events={filtered}
            todayKey={todayKey}
            onEventClick={setSelectedEvent}
            onAddClick={openAddForDay}
            timeGridRef={timeGridRef}
          />
        )}
        {view === "day" && (
          <DayView
            anchor={anchor}
            events={filtered}
            todayKey={todayKey}
            onEventClick={setSelectedEvent}
            onAddClick={() => openAddForDay(anchor)}
            timeGridRef={timeGridRef}
          />
        )}
      </div>

      {/* ── Event detail modal ──────────────────────────────────── */}
      {selectedEvent && (
        <ModalShell onClose={() => setSelectedEvent(null)}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: selectedEvent.color }}
                  />
                  <span
                    className="label-caps text-[0.68rem]"
                    style={{ color: selectedEvent.color }}
                  >
                    {CAT_LABEL[selectedEvent.category]} · {selectedEvent.source}
                  </span>
                </div>
                <h3
                  className="text-xl text-charcoal leading-tight"
                  style={{ fontFamily: "var(--font-cormorant)" }}
                >
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-mid/60 hover:text-mid mt-0.5 cursor-pointer leading-none text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-1.5 text-[0.82rem]">
              <Row label="Date" value={selectedEvent.date} />
              {selectedEvent.time && (
                <Row
                  label="Time"
                  value={`${selectedEvent.time}${selectedEvent.endTime ? ` → ${selectedEvent.endTime}` : ""}`}
                />
              )}
              {selectedEvent.allDay && selectedEvent.count && (
                <Row label="Runs" value={`${selectedEvent.count}× / day`} />
              )}
              {selectedEvent.enabled === false && (
                <div
                  className="mt-1 px-2 py-1 rounded text-[0.75rem]"
                  style={{ backgroundColor: "var(--warm)", color: "var(--mid)" }}
                >
                  Disabled
                </div>
              )}
              {selectedEvent.description && (
                <div className="pt-1">
                  <span className="label-caps text-[0.65rem] text-mid/50 block mb-1">Note</span>
                  <p className="text-charcoal/80 text-[0.8rem] leading-relaxed">
                    {selectedEvent.description}
                  </p>
                </div>
              )}
            </div>

            {selectedEvent.source === "task" && (
              <div
                className="pt-3 border-t flex items-center justify-between"
                style={{ borderColor: "var(--warm)" }}
              >
                <button
                  onClick={() => deleteTask(selectedEvent.id)}
                  className="text-[0.8rem] transition-colors cursor-pointer"
                  style={{ color: "var(--terracotta)" }}
                >
                  Delete task
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* ── Add task modal ───────────────────────────────────────── */}
      {showAdd && (
        <ModalShell onClose={() => setShowAdd(false)}>
          <h3
            className="text-xl text-charcoal mb-5"
            style={{ fontFamily: "var(--font-cormorant)" }}
          >
            Add Task
          </h3>
          <div className="space-y-3.5">
            <Field label="Title *">
              <input
                type="text"
                value={newTask.title}
                onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                placeholder="What needs doing?"
                autoFocus
                className="w-full input-field"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) createTask();
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date *">
                <input
                  type="date"
                  value={newTask.date}
                  onChange={(e) => setNewTask((t) => ({ ...t, date: e.target.value }))}
                  className="w-full input-field"
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  value={newTask.time}
                  onChange={(e) => setNewTask((t) => ({ ...t, time: e.target.value }))}
                  className="w-full input-field"
                />
              </Field>
            </div>

            <Field label="Category">
              <div className="flex flex-wrap gap-1.5">
                {(["task", "milestone", "factory", "signals", "distribution", "seo"] as EventCategory[]).map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setNewTask((t) => ({ ...t, category: cat }))}
                      className="px-2.5 py-1 rounded-full text-[0.72rem] border transition-all cursor-pointer"
                      style={{
                        borderColor: newTask.category === cat ? CAT_COLOR[cat] : "var(--warm)",
                        backgroundColor: newTask.category === cat ? `${CAT_COLOR[cat]}18` : "transparent",
                        color: newTask.category === cat ? CAT_COLOR[cat] : "var(--mid)",
                      }}
                    >
                      {CAT_LABEL[cat]}
                    </button>
                  )
                )}
              </div>
            </Field>

            <Field label="Note">
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))}
                placeholder="Optional note…"
                rows={2}
                className="w-full input-field resize-none"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <button
                onClick={createTask}
                disabled={!newTask.title.trim() || !newTask.date || saving}
                className="flex-1 py-2.5 rounded-lg text-[0.82rem] text-paper transition-all disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: "var(--terracotta)" }}
              >
                {saving ? "Saving…" : "Add Task"}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 rounded-lg text-[0.82rem] transition-colors cursor-pointer"
                style={{ color: "var(--mid)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Inline styles for input-field class */}
      <style>{`
        .input-field {
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          background: var(--warm);
          border: 1px solid var(--warm);
          color: var(--charcoal);
          font-size: 0.82rem;
          font-family: var(--font-dm-mono), monospace;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: rgba(188, 97, 67, 0.4);
          background: var(--paper);
        }
        .input-field::placeholder { color: rgba(72,69,63,0.35); }
      `}</style>
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────────────

function MonthView({
  anchor, events, todayKey, onDayClick, onEventClick, onAddClick,
}: {
  anchor: Date;
  events: CalendarEvent[];
  todayKey: string;
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onAddClick: (d: Date) => void;
}) {
  const grid = getMonthGrid(anchor);
  const curMonth = anchor.getMonth();

  const byDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  return (
    <div
      className="h-full flex flex-col rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--warm)", backgroundColor: "var(--paper)" }}
    >
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--warm)" }}>
        {WEEK_DAYS_SHORT.map((d) => (
          <div
            key={d}
            className="py-2 text-center label-caps text-[0.65rem]"
            style={{ color: "var(--mid)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6-week grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {grid.map((day, i) => {
          const key = dKey(day);
          const isToday = key === todayKey;
          const isOtherMonth = day.getMonth() !== curMonth;
          const dayEvs = byDate[key] ?? [];

          // Consolidate: one chip per active cron category + individual tasks/milestones
          const allDayCats = groupByCat(dayEvs.filter((e) => e.allDay));
          const timedEvs = dayEvs.filter((e) => !e.allDay);

          // Build display list
          type ChipItem = { id: string; title: string; color: string; count?: number; original: CalendarEvent };
          const chips: ChipItem[] = [];

          for (const [cat, evs] of Object.entries(allDayCats)) {
            const totalRuns = evs.reduce((s, e) => s + (e.count ?? 1), 0);
            chips.push({
              id: `cat-${cat}`,
              title: CAT_LABEL[cat as EventCategory],
              color: CAT_COLOR[cat as EventCategory],
              count: totalRuns,
              original: evs[0],
            });
          }
          for (const ev of timedEvs) {
            chips.push({ id: ev.id, title: ev.title, color: ev.color, original: ev });
          }

          const visibleChips = chips.slice(0, 3);
          const extra = chips.length - visibleChips.length;

          return (
            <div
              key={key}
              className="group border-b border-r p-1 flex flex-col cursor-pointer transition-colors overflow-hidden"
              style={{
                borderColor: "var(--warm)/40",
                borderRight: (i + 1) % 7 === 0 ? "none" : undefined,
                borderBottom: i >= 35 ? "none" : undefined,
                backgroundColor: isToday ? "rgba(188,97,67,0.04)" : "transparent",
                opacity: isOtherMonth ? 0.35 : 1,
              }}
              onClick={() => onDayClick(day)}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5 px-0.5">
                <span
                  className="w-5 h-5 text-[0.75rem] flex items-center justify-center rounded-full transition-all"
                  style={{
                    backgroundColor: isToday ? "var(--terracotta)" : "transparent",
                    color: isToday
                      ? "var(--paper)"
                      : isOtherMonth
                      ? "var(--mid)"
                      : "var(--charcoal)",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  {day.getDate()}
                </span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); onAddClick(day); }}
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-mid/50 hover:text-charcoal hover:bg-warm transition-all cursor-pointer text-xs"
                >
                  +
                </button>
              </div>

              {/* Event chips */}
              <div className="space-y-px flex-1 overflow-hidden">
                {visibleChips.map((chip) => (
                  <div
                    key={chip.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(chip.original); }}
                    className="flex items-center gap-1 px-1 py-px rounded text-[0.65rem] leading-snug overflow-hidden hover:opacity-80 cursor-pointer transition-opacity"
                    style={{
                      backgroundColor: `${chip.color}18`,
                      color: chip.color,
                    }}
                    title={chip.title + (chip.count ? ` (${chip.count} runs)` : "")}
                  >
                    <span
                      className="w-1 h-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chip.color }}
                    />
                    <span className="truncate">{chip.title}</span>
                  </div>
                ))}
                {extra > 0 && (
                  <div
                    className="px-1 text-[0.62rem]"
                    style={{ color: "var(--mid)" }}
                  >
                    +{extra} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ──────────────────────────────────────────────────────

function WeekView({
  anchor, events, todayKey, onEventClick, onAddClick, timeGridRef,
}: {
  anchor: Date;
  events: CalendarEvent[];
  todayKey: string;
  onEventClick: (e: CalendarEvent) => void;
  onAddClick: (d: Date) => void;
  timeGridRef: React.RefObject<HTMLDivElement | null>;
}) {
  const days = getWeekDays(anchor);

  const byDate: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTop = (currentMinutes / 60) * HOUR_PX;

  return (
    <div
      className="h-full flex flex-col rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--warm)", backgroundColor: "var(--paper)" }}
    >
      {/* Day headers */}
      <div
        className="grid border-b flex-shrink-0"
        style={{ gridTemplateColumns: "44px repeat(7, 1fr)", borderColor: "var(--warm)" }}
      >
        <div />
        {days.map((d) => {
          const key = dKey(d);
          const isToday = key === todayKey;
          return (
            <div key={key} className="py-2 text-center border-l" style={{ borderColor: "var(--warm)/40" }}>
              <div
                className="label-caps text-[0.62rem]"
                style={{ color: isToday ? "var(--terracotta)" : "var(--mid)" }}
              >
                {d.toLocaleDateString("en-GB", { weekday: "short" })}
              </div>
              <div
                className="mx-auto mt-0.5 w-6 h-6 flex items-center justify-center rounded-full text-sm"
                style={{
                  backgroundColor: isToday ? "var(--terracotta)" : "transparent",
                  color: isToday ? "var(--paper)" : "var(--charcoal)",
                  fontFamily: "var(--font-cormorant)",
                }}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b flex-shrink-0 min-h-[2.5rem]"
        style={{ gridTemplateColumns: "44px repeat(7, 1fr)", borderColor: "var(--warm)/40" }}
      >
        <div
          className="py-1 pr-2 text-right label-caps text-[0.55rem] self-center"
          style={{ color: "var(--mid)" }}
        >
          ALL
          <br />
          DAY
        </div>
        {days.map((d) => {
          const key = dKey(d);
          const allDayEvs = (byDate[key] ?? []).filter((e) => e.allDay);
          const cats = groupByCat(allDayEvs);
          return (
            <div
              key={key}
              className="py-0.5 px-0.5 border-l"
              style={{ borderColor: "var(--warm)/30" }}
            >
              {Object.entries(cats).map(([cat, evs]) => (
                <div
                  key={cat}
                  onClick={() => onEventClick(evs[0])}
                  className="px-1.5 py-0.5 rounded text-[0.62rem] mb-0.5 cursor-pointer hover:opacity-80 truncate transition-opacity"
                  style={{
                    backgroundColor: `${CAT_COLOR[cat as EventCategory]}20`,
                    color: CAT_COLOR[cat as EventCategory],
                  }}
                >
                  {CAT_LABEL[cat as EventCategory]}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={timeGridRef} className="flex-1 overflow-y-auto custom-scroll">
        <div
          className="relative"
          style={{ height: `${24 * HOUR_PX}px` }}
        >
          {/* Hour grid lines + labels */}
          <div
            className="absolute inset-0 grid pointer-events-none"
            style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}
          >
            {HOURS.map((h) => (
              <div key={h} className="contents">
                <div
                  className="border-t text-right pr-2 label-caps text-[0.6rem] flex-shrink-0"
                  style={{
                    height: `${HOUR_PX}px`,
                    borderColor: "var(--warm)/40",
                    color: "var(--mid)",
                    paddingTop: "2px",
                  }}
                >
                  {String(h).padStart(2, "0")}
                </div>
                {days.map((_, di) => (
                  <div
                    key={di}
                    className="border-t border-l"
                    style={{
                      height: `${HOUR_PX}px`,
                      borderColor: "var(--warm)/30",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Events layer */}
          <div
            className="absolute inset-0 grid pointer-events-none"
            style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}
          >
            <div /> {/* spacer for time labels */}
            {days.map((d, di) => {
              const key = dKey(d);
              const isToday = key === todayKey;
              const timedEvs = (byDate[key] ?? []).filter((e) => !e.allDay && e.time);

              return (
                <div key={di} className="relative">
                  {/* Current time line */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                      style={{ top: `${currentTop}px` }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "var(--terracotta)" }}
                      />
                      <div
                        className="flex-1 h-px"
                        style={{ backgroundColor: "var(--terracotta)", opacity: 0.7 }}
                      />
                    </div>
                  )}

                  {/* Timed events — column-layout to prevent overlap */}
                  {layoutEvents(timedEvs).map(({ ev, top, height, colIndex, numCols }) => {
                    const widthPct = 100 / numCols;
                    const leftPct = (colIndex / numCols) * 100;
                    return (
                      <div
                        key={ev.id}
                        className="absolute rounded cursor-pointer pointer-events-auto transition-opacity hover:opacity-75 overflow-hidden"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${leftPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                          backgroundColor: `${ev.color}20`,
                          borderLeft: `2px solid ${ev.color}`,
                          zIndex: 10,
                          padding: "1px 3px",
                        }}
                        onClick={() => onEventClick(ev)}
                      >
                        <div
                          className="text-[0.58rem] font-medium leading-tight truncate"
                          style={{ color: ev.color }}
                        >
                          {ev.time}
                        </div>
                        {height >= 28 && (
                          <div
                            className="text-[0.62rem] leading-tight truncate"
                            style={{ color: "var(--charcoal)" }}
                          >
                            {ev.title}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Day View ───────────────────────────────────────────────────────

function DayView({
  anchor, events, todayKey, onEventClick, onAddClick, timeGridRef,
}: {
  anchor: Date;
  events: CalendarEvent[];
  todayKey: string;
  onEventClick: (e: CalendarEvent) => void;
  onAddClick: () => void;
  timeGridRef: React.RefObject<HTMLDivElement | null>;
}) {
  const key = dKey(anchor);
  const isToday = key === todayKey;
  const dayEvs = events.filter((e) => e.date === key);
  const allDayEvs = dayEvs.filter((e) => e.allDay);
  const timedEvs = dayEvs.filter((e) => !e.allDay && e.time);
  const untimedEvs = dayEvs.filter((e) => !e.allDay && !e.time);
  const allDayCats = groupByCat(allDayEvs);

  const now = new Date();
  const currentTop = (now.getHours() + now.getMinutes() / 60) * HOUR_PX;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-4 gap-3">
      {/* Time grid */}
      <div
        className="lg:col-span-3 flex flex-col rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--warm)", backgroundColor: "var(--paper)" }}
      >
        {/* All-day strip */}
        {Object.keys(allDayCats).length > 0 && (
          <div
            className="px-4 py-2.5 border-b flex-shrink-0"
            style={{ borderColor: "var(--warm)" }}
          >
            <p className="label-caps text-[0.62rem] mb-1.5" style={{ color: "var(--mid)" }}>
              All-day jobs
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(allDayCats).map(([cat, evs]) => {
                const totalRuns = evs.reduce((s, e) => s + (e.count ?? 1), 0);
                return (
                  <div
                    key={cat}
                    onClick={() => onEventClick(evs[0])}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.75rem] cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      backgroundColor: `${CAT_COLOR[cat as EventCategory]}18`,
                      color: CAT_COLOR[cat as EventCategory],
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: CAT_COLOR[cat as EventCategory] }}
                    />
                    <span>{CAT_LABEL[cat as EventCategory]}</span>
                    <span className="opacity-60 label-caps text-[0.6rem]">
                      {totalRuns}×
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable time grid */}
        <div ref={timeGridRef} className="flex-1 overflow-y-auto custom-scroll">
          <div className="relative" style={{ height: `${24 * HOUR_PX}px` }}>
            {/* Hour rows */}
            <div className="absolute inset-0">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="flex border-t"
                  style={{ height: `${HOUR_PX}px`, borderColor: "var(--warm)/30" }}
                >
                  <div
                    className="w-12 pr-3 text-right label-caps text-[0.62rem] flex-shrink-0 pt-1"
                    style={{ color: "var(--mid)" }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                  <div className="flex-1 border-l" style={{ borderColor: "var(--warm)/30" }} />
                </div>
              ))}
            </div>

            {/* Current time */}
            {isToday && (
              <div
                className="absolute left-12 right-0 flex items-center pointer-events-none z-20"
                style={{ top: `${currentTop}px` }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full -ml-1.5"
                  style={{ backgroundColor: "var(--terracotta)" }}
                />
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: "var(--terracotta)", opacity: 0.65 }}
                />
              </div>
            )}

            {/* Timed events — column layout prevents overlap */}
            <div className="absolute left-12 right-3 top-0 bottom-0">
              {layoutEvents(timedEvs).map(({ ev, top, height: _h, colIndex, numCols }) => {
                const widthPct = 100 / numCols;
                const leftPct = (colIndex / numCols) * 100;
                const height = Math.max(36, (30 / 60) * HOUR_PX);
                return (
                  <div
                    key={ev.id}
                    className="absolute rounded-lg cursor-pointer transition-shadow hover:shadow-md overflow-hidden"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: `${ev.color}18`,
                      borderLeft: `3px solid ${ev.color}`,
                      padding: "4px 8px",
                    }}
                    onClick={() => onEventClick(ev)}
                  >
                    <div
                      className="label-caps text-[0.62rem] mb-0.5 truncate"
                      style={{ color: ev.color }}
                    >
                      {ev.time}
                    </div>
                    <div className="text-[0.82rem] text-charcoal leading-tight truncate">{ev.title}</div>
                    {ev.description && (
                      <div className="text-[0.72rem] text-mid/60 mt-0.5 truncate">
                        {ev.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-3">
        {/* Day summary */}
        <div
          className="card"
          style={{ padding: "1rem 1.125rem" }}
        >
          <h3
            className="text-lg text-charcoal mb-3 leading-tight"
            style={{ fontFamily: "var(--font-cormorant)" }}
          >
            {anchor.toLocaleDateString("en-GB", {
              weekday: "long", day: "numeric", month: "short",
            })}
          </h3>
          <div className="space-y-1.5 text-[0.78rem]">
            <SideRow label="Cron jobs" value={dayEvs.filter((e) => e.source === "cron" || e.source === "launchagent").length} />
            <SideRow label="Timed events" value={timedEvs.length} />
            <SideRow label="Tasks" value={dayEvs.filter((e) => e.source === "task").length} />
            <SideRow label="Milestones" value={dayEvs.filter((e) => e.source === "milestone").length} />
          </div>
          <button
            onClick={onAddClick}
            className="w-full mt-4 py-2 rounded-lg text-[0.8rem] text-paper transition-colors cursor-pointer"
            style={{ backgroundColor: "var(--terracotta)" }}
          >
            + Add Task
          </button>
        </div>

        {/* Unscheduled tasks */}
        {untimedEvs.length > 0 && (
          <div className="card" style={{ padding: "1rem 1.125rem" }}>
            <p className="label-caps text-[0.65rem] mb-2" style={{ color: "var(--mid)" }}>
              Unscheduled
            </p>
            <div className="space-y-1">
              {untimedEvs.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 py-1.5 border-b cursor-pointer group"
                  style={{ borderColor: "var(--warm)/50" }}
                  onClick={() => onEventClick(ev)}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <span
                    className="text-[0.78rem] group-hover:text-charcoal transition-colors"
                    style={{ color: "var(--charcoal)" }}
                  >
                    {ev.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active cron categories today */}
        {Object.keys(allDayCats).length > 0 && (
          <div className="card" style={{ padding: "1rem 1.125rem" }}>
            <p className="label-caps text-[0.65rem] mb-2" style={{ color: "var(--mid)" }}>
              Background jobs
            </p>
            <div className="space-y-1">
              {Object.entries(allDayCats).map(([cat, evs]) => {
                const totalRuns = evs.reduce((s, e) => s + (e.count ?? 1), 0);
                return (
                  <div key={cat} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: CAT_COLOR[cat as EventCategory] }}
                      />
                      <span className="text-[0.75rem]" style={{ color: "var(--charcoal)" }}>
                        {CAT_LABEL[cat as EventCategory]}
                      </span>
                    </div>
                    <span className="label-caps text-[0.6rem]" style={{ color: "var(--mid)" }}>
                      {totalRuns}×
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(42,41,39,0.25)" }}
        onClick={onClose}
      />
      <div
        className="relative rounded-xl border shadow-xl p-6 w-full max-w-md fade-up"
        style={{
          backgroundColor: "var(--paper)",
          borderColor: "var(--warm)",
          boxShadow: "0 8px 32px rgba(42,41,39,0.14)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="label-caps text-[0.62rem] w-14 flex-shrink-0 mt-0.5"
        style={{ color: "var(--mid)" }}
      >
        {label}
      </span>
      <span style={{ color: "var(--charcoal)" }}>{value}</span>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--mid)" }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: value > 0 ? "var(--charcoal)" : "var(--mid)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="label-caps text-[0.62rem] block mb-1"
        style={{ color: "var(--mid)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
