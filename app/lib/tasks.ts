// ─── Task System — Agent-driven Kanban ───────────────────────────────

export type TaskStatus = "backlog" | "assigned" | "in_progress" | "review" | "done";
export type TaskPriority = "p0" | "p1" | "p2";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string | null; // agent id (e.g. "baldur") or "mads"
  creator: string;         // who created it
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
  parent_id?: string;
  priority: TaskPriority;
  tags: string[];
  notes: string[];         // timestamped notes appended by agents
}

export interface TaskColumn {
  key: TaskStatus;
  label: string;
  color: string;       // accent color for the column header
  description: string;  // tooltip / sub-label
}

export const TASK_COLUMNS: TaskColumn[] = [
  { key: "backlog",     label: "Backlog",     color: "#48453F", description: "Queued work" },
  { key: "assigned",    label: "Assigned",    color: "#C9A227", description: "Picked up" },
  { key: "in_progress", label: "In Progress", color: "#9899C1", description: "Actively working" },
  { key: "review",      label: "Review",      color: "#BC6143", description: "Needs your eyes" },
  { key: "done",        label: "Done",        color: "#76875A", description: "Completed" },
];

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  p0: { label: "P0", color: "#BC6143", bg: "#bc614318" },
  p1: { label: "P1", color: "#C9A227", bg: "#C9A22718" },
  p2: { label: "P2", color: "#48453F", bg: "#48453f10" },
};

export function generateTaskId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
