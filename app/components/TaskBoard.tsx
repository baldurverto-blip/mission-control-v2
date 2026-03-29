"use client";

import { useState, useCallback, useMemo, type DragEvent, type FormEvent } from "react";
import { agent, ALL_AGENT_IDS, relTime } from "@/app/lib/agents";
import {
  TASK_COLUMNS,
  PRIORITY_META,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from "@/app/lib/tasks";

// ─── Task Detail Panel ───────────────────────────────────────────────

function TaskDetail({
  task,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [newNote, setNewNote] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const assigneeToken = task.assignee ? agent(task.assignee) : null;
  const priority = PRIORITY_META[task.priority];
  const col = TASK_COLUMNS.find((c) => c.key === task.status);

  function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    onUpdate(task.id, { note: newNote.trim() });
    setNewNote("");
  }

  function handleSaveTitle() {
    if (titleDraft.trim() && titleDraft !== task.title) {
      onUpdate(task.id, { title: titleDraft.trim() });
    }
    setEditingTitle(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-charcoal/20 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slide-in-right 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--board-border)" }}>
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: col?.color ?? "var(--mid)" }}
          />
          <span className="text-[0.7rem] font-medium uppercase tracking-wider" style={{ color: col?.color }}>
            {col?.label}
          </span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-[var(--board-bg)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mid)" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            {editingTitle ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  onBlur={handleSaveTitle}
                  className="flex-1 text-lg font-medium px-2 py-1 rounded border focus:outline-none focus:ring-2"
                  style={{ fontFamily: "var(--font-cormorant)", borderColor: "var(--lilac)", color: "var(--charcoal)" }}
                />
              </div>
            ) : (
              <h2
                className="text-lg font-medium cursor-pointer hover:text-[var(--lilac)] transition-colors"
                style={{ fontFamily: "var(--font-cormorant)", color: "var(--charcoal)" }}
                onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
                title="Click to edit"
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Priority */}
            <div>
              <label className="text-[0.62rem] uppercase tracking-widest block mb-1.5" style={{ color: "var(--mid)" }}>Priority</label>
              <select
                value={task.priority}
                onChange={(e) => onUpdate(task.id, { priority: e.target.value })}
                className="w-full text-[0.78rem] px-2.5 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: "var(--board-border)", color: priority.color, backgroundColor: priority.bg }}
              >
                <option value="p0">P0 — Critical</option>
                <option value="p1">P1 — High</option>
                <option value="p2">P2 — Normal</option>
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-[0.62rem] uppercase tracking-widest block mb-1.5" style={{ color: "var(--mid)" }}>Assignee</label>
              <select
                value={task.assignee ?? ""}
                onChange={(e) => onUpdate(task.id, { assignee: e.target.value || null })}
                className="w-full text-[0.78rem] px-2.5 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: "var(--board-border)", color: "var(--charcoal)" }}
              >
                <option value="">Unassigned</option>
                <option value="mads">Mads</option>
                {ALL_AGENT_IDS.map((id) => (
                  <option key={id} value={id}>{agent(id).name}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-[0.62rem] uppercase tracking-widest block mb-1.5" style={{ color: "var(--mid)" }}>Status</label>
              <select
                value={task.status}
                onChange={(e) => onUpdate(task.id, { status: e.target.value })}
                className="w-full text-[0.78rem] px-2.5 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: "var(--board-border)", color: "var(--charcoal)" }}
              >
                {TASK_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Creator */}
            <div>
              <label className="text-[0.62rem] uppercase tracking-widest block mb-1.5" style={{ color: "var(--mid)" }}>Creator</label>
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                {task.creator && (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] font-medium text-white"
                    style={{ backgroundColor: task.creator === "mads" ? "var(--charcoal)" : agent(task.creator).color }}
                  >
                    {task.creator === "mads" ? "M" : agent(task.creator).label}
                  </span>
                )}
                <span className="text-[0.78rem]" style={{ color: "var(--charcoal)" }}>
                  {task.creator === "mads" ? "Mads" : task.creator ? agent(task.creator).name : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div>
              <label className="text-[0.62rem] uppercase tracking-widest block mb-1.5" style={{ color: "var(--mid)" }}>Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[0.68rem]"
                    style={{ backgroundColor: "var(--board-bg)", color: "var(--mid)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-4 text-[0.68rem] tabular-nums" style={{ color: "var(--mid)" }}>
            <span>Created {relTime(task.created_at)} ago</span>
            <span>Updated {relTime(task.updated_at)} ago</span>
          </div>

          {/* Notes / Activity log */}
          <div>
            <label className="text-[0.62rem] uppercase tracking-widest block mb-2" style={{ color: "var(--mid)" }}>Notes</label>
            {task.notes.length > 0 ? (
              <div className="space-y-2 mb-3">
                {task.notes.map((note, i) => {
                  const match = note.match(/^\[([^\]]+)\]\s*(.*)/);
                  const ts = match ? match[1] : null;
                  const text = match ? match[2] : note;
                  return (
                    <div key={i} className="flex gap-2 text-[0.78rem] leading-relaxed">
                      {ts && (
                        <span className="text-[0.65rem] tabular-nums flex-shrink-0 pt-0.5" style={{ color: "var(--mid)", opacity: 0.5 }}>
                          {relTime(ts)}
                        </span>
                      )}
                      <span style={{ color: "var(--charcoal)" }}>{text}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[0.75rem] mb-3" style={{ color: "var(--mid)", opacity: 0.4 }}>
                No notes yet. Agents and you can add notes here.
              </p>
            )}

            {/* Add note form */}
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 text-[0.78rem] px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: "var(--board-border)", color: "var(--charcoal)" }}
              />
              <button
                type="submit"
                disabled={!newNote.trim()}
                className="px-3 py-1.5 rounded-lg text-[0.72rem] font-medium cursor-pointer transition-all disabled:opacity-30"
                style={{ backgroundColor: "var(--board-bg)", color: "var(--charcoal)" }}
              >
                Add
              </button>
            </form>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: "var(--board-border)" }}>
          <button
            onClick={() => { onDelete(task.id); onClose(); }}
            className="text-[0.72rem] px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--terracotta-soft)]"
            style={{ color: "var(--terracotta)" }}
          >
            Delete task
          </button>
          <span className="flex-1" />
          <span className="text-[0.62rem] tabular-nums" style={{ color: "var(--mid)", opacity: 0.4 }}>
            {task.id}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────

function TaskCard({
  task,
  onDragStart,
  onClick,
}: {
  task: Task;
  onDragStart: (e: DragEvent, task: Task) => void;
  onClick: (task: Task) => void;
}) {
  const assigneeToken = task.assignee ? agent(task.assignee) : null;
  const priority = PRIORITY_META[task.priority];
  const age = getAge(task.created_at);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className="group bg-white rounded-lg border border-[var(--board-border)] px-3 py-2.5 cursor-pointer active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      style={{ borderLeft: `3px solid ${assigneeToken?.color ?? "var(--board-border)"}` }}
    >
      {/* Title */}
      <p className="text-[0.82rem] text-charcoal leading-snug font-medium mb-1.5 line-clamp-2">
        {task.title}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Priority badge */}
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.6rem] font-semibold tracking-wider"
          style={{ backgroundColor: priority.bg, color: priority.color }}
        >
          {priority.label}
        </span>

        {/* Tags */}
        {task.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded text-[0.58rem] tracking-wide"
            style={{ backgroundColor: "var(--board-bg)", color: "var(--mid)" }}
          >
            {tag}
          </span>
        ))}

        <span className="flex-1" />

        {/* Age */}
        <span className="text-[0.6rem] tabular-nums" style={{ color: "var(--mid)", opacity: 0.5 }}>
          {age}
        </span>

        {/* Assignee avatar */}
        {assigneeToken && (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[0.55rem] font-medium text-white flex-shrink-0"
            style={{ backgroundColor: assigneeToken.color }}
            title={task.assignee === "mads" ? "Mads" : assigneeToken.name}
          >
            {task.assignee === "mads" ? "M" : assigneeToken.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  onDragStart,
  onDrop,
  onClickTask,
  dragOverColumn,
  onDragOver,
  onDragLeave,
}: {
  column: (typeof TASK_COLUMNS)[number];
  tasks: Task[];
  onDragStart: (e: DragEvent, task: Task) => void;
  onDrop: (e: DragEvent, status: TaskStatus) => void;
  onClickTask: (task: Task) => void;
  dragOverColumn: TaskStatus | null;
  onDragOver: (e: DragEvent, status: TaskStatus) => void;
  onDragLeave: () => void;
}) {
  const isDragOver = dragOverColumn === column.key;

  return (
    <div
      className={`flex flex-col min-w-0 flex-1 rounded-xl transition-all duration-200 ${isDragOver ? "column-drag-over" : ""}`}
      style={{ backgroundColor: isDragOver ? undefined : "var(--board-column)" }}
      onDragOver={(e) => onDragOver(e, column.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.key)}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "var(--board-border)" }}>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: column.color }}
        />
        <span className="text-[0.72rem] font-medium text-charcoal tracking-wide uppercase">
          {column.label}
        </span>
        <span
          className="ml-auto text-[0.65rem] font-medium tabular-nums px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--board-bg)", color: "var(--mid)" }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Card stack */}
      <div className="flex-1 p-2 space-y-2 min-h-[80px] overflow-y-auto custom-scroll" style={{ maxHeight: "400px" }}>
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-lg border border-dashed" style={{ borderColor: "var(--board-border)" }}>
            <span className="text-[0.68rem]" style={{ color: "var(--mid)", opacity: 0.4 }}>
              {column.key === "done" ? "Completed tasks appear here" : "Drop tasks here"}
            </span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onDragStart={onDragStart} onClick={onClickTask} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Add Task Form ───────────────────────────────────────────────────

function AddTaskForm({
  onAdd,
  onCancel,
}: {
  onAdd: (title: string, assignee: string | null, priority: TaskPriority) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("p2");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), assignee, priority);
    setTitle("");
    setAssignee(null);
    setPriority("p2");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task..."
        className="flex-1 text-[0.82rem] px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 transition-all"
        style={{ backgroundColor: "var(--board-column)", borderColor: "var(--board-border)", color: "var(--charcoal)" }}
      />
      <select
        value={assignee ?? ""}
        onChange={(e) => setAssignee(e.target.value || null)}
        className="text-[0.72rem] px-2 py-1.5 rounded-lg border cursor-pointer"
        style={{ backgroundColor: "var(--board-column)", borderColor: "var(--board-border)", color: "var(--mid)" }}
      >
        <option value="">Unassigned</option>
        <option value="mads">Mads</option>
        {ALL_AGENT_IDS.map((id) => (
          <option key={id} value={id}>{agent(id).name}</option>
        ))}
      </select>
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as TaskPriority)}
        className="text-[0.72rem] px-2 py-1.5 rounded-lg border cursor-pointer"
        style={{ backgroundColor: "var(--board-column)", borderColor: "var(--board-border)", color: "var(--mid)" }}
      >
        <option value="p0">P0</option>
        <option value="p1">P1</option>
        <option value="p2">P2</option>
      </select>
      <button
        type="submit"
        disabled={!title.trim()}
        className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium text-white cursor-pointer transition-all disabled:opacity-30"
        style={{ backgroundColor: "var(--lilac)" }}
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="text-[0.72rem] px-2 py-1.5 cursor-pointer" style={{ color: "var(--mid)" }}>
        Cancel
      </button>
    </form>
  );
}

// ─── Filter Pills ────────────────────────────────────────────────────

function FilterBar({
  activeFilter,
  onFilter,
  tasks,
}: {
  activeFilter: string | null;
  onFilter: (id: string | null) => void;
  tasks: Task[];
}) {
  const assignees = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (t.assignee) ids.add(t.assignee);
    }
    return Array.from(ids);
  }, [tasks]);

  if (assignees.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onFilter(null)}
        className="w-5 h-5 rounded-full cursor-pointer transition-all flex items-center justify-center text-[0.55rem] font-medium"
        style={{
          backgroundColor: activeFilter === null ? "var(--charcoal)" : "var(--board-border)",
          color: activeFilter === null ? "white" : "var(--mid)",
        }}
        title="All"
      >
        All
      </button>
      {assignees.map((id) => {
        const a = id === "mads" ? { color: "#2A2927", label: "M", name: "Mads" } : agent(id);
        const isActive = activeFilter === id;
        return (
          <button
            key={id}
            onClick={() => onFilter(isActive ? null : id)}
            className="w-5 h-5 rounded-full cursor-pointer transition-all flex items-center justify-center text-[0.5rem] font-medium text-white"
            style={{
              backgroundColor: isActive ? a.color : `${a.color}40`,
              outline: isActive ? `2px solid ${a.color}` : "none",
              outlineOffset: "1px",
            }}
            title={a.name}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Task Board ──────────────────────────────────────────────────────

export interface TaskBoardProps {
  tasks: Task[];
  onRefetch: () => void;
}

export function TaskBoard({ tasks, onRefetch }: TaskBoardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);

  // Filter tasks (exclude done older than 48h)
  const filteredTasks = useMemo(() => {
    let result = tasks;
    const cutoff = Date.now() - 48 * 3_600_000;
    result = result.filter(
      (t) => t.status !== "done" || new Date(t.updated_at).getTime() > cutoff
    );
    if (filterAssignee) {
      result = result.filter((t) => t.assignee === filterAssignee);
    }
    return result;
  }, [tasks, filterAssignee]);

  // Group by column
  const columns = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      backlog: [], assigned: [], in_progress: [], review: [], done: [],
    };
    for (const task of filteredTasks) {
      grouped[task.status]?.push(task);
    }
    const order: TaskPriority[] = ["p0", "p1", "p2"];
    for (const key of Object.keys(grouped) as TaskStatus[]) {
      grouped[key].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
    }
    return grouped;
  }, [filteredTasks]);

  // Keep selected task in sync with latest data
  const resolvedSelected = useMemo(() => {
    if (!selectedTask) return null;
    return tasks.find((t) => t.id === selectedTask.id) ?? null;
  }, [tasks, selectedTask]);

  const handleDragStart = useCallback((e: DragEvent, task: Task) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add("task-card-dragging");
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent, newStatus: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: taskId, status: newStatus }),
      });
      onRefetch();
    },
    [tasks, onRefetch]
  );

  const handleAddTask = useCallback(
    async (title: string, assignee: string | null, priority: TaskPriority) => {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", title, assignee, priority,
          status: assignee ? "assigned" : "backlog",
          creator: "mads",
        }),
      });
      setShowAddForm(false);
      onRefetch();
    },
    [onRefetch]
  );

  const handleUpdateTask = useCallback(
    async (id: string, updates: Record<string, unknown>) => {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...updates }),
      });
      onRefetch();
    },
    [onRefetch]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      onRefetch();
    },
    [onRefetch]
  );

  const totalActive = filteredTasks.filter((t) => t.status !== "done").length;

  return (
    <>
      <div className="rounded-xl overflow-hidden fade-up" style={{ backgroundColor: "var(--board-bg)" }}>
        {/* Board header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--board-border)" }}>
          <h2
            className="text-lg tracking-tight"
            style={{ fontFamily: "var(--font-cormorant)", color: "var(--charcoal)" }}
          >
            Task Board
          </h2>
          <span
            className="text-[0.65rem] font-medium tabular-nums px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--board-column)", color: "var(--mid)" }}
          >
            {totalActive} active
          </span>

          <FilterBar activeFilter={filterAssignee} onFilter={setFilterAssignee} tasks={tasks} />

          <span className="flex-1" />

          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.72rem] font-medium cursor-pointer transition-all hover:shadow-sm"
              style={{ backgroundColor: "var(--board-column)", color: "var(--charcoal)", border: "1px solid var(--board-border)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add task
            </button>
          ) : (
            <AddTaskForm onAdd={handleAddTask} onCancel={() => setShowAddForm(false)} />
          )}
        </div>

        {/* Columns */}
        <div className="flex gap-2 p-3 overflow-x-auto">
          {TASK_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              column={col}
              tasks={columns[col.key]}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onClickTask={setSelectedTask}
              dragOverColumn={dragOverColumn}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            />
          ))}
        </div>
      </div>

      {/* Detail panel overlay */}
      {resolvedSelected && (
        <TaskDetail
          task={resolvedSelected}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
