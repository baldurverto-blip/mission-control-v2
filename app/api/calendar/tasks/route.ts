import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { CALENDAR_EVENTS_JSON } from "../../../lib/paths";

export type EventCategory =
  | "factory"
  | "signals"
  | "distribution"
  | "seo"
  | "system"
  | "task"
  | "milestone";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  category: EventCategory;
  color: string;
  allDay?: boolean;
  description?: string;
  source: "task";
}

const CATEGORY_COLORS: Record<EventCategory, string> = {
  factory: "#76875A",
  signals: "#9899C1",
  distribution: "#BC6143",
  seo: "#C9A227",
  system: "#8B8078",
  task: "#2A2927",
  milestone: "#BC6143",
};

function readTasks(): CalendarEvent[] {
  if (!existsSync(CALENDAR_EVENTS_JSON)) return [];
  try {
    const data = JSON.parse(readFileSync(CALENDAR_EVENTS_JSON, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: CalendarEvent[]) {
  const dir = dirname(CALENDAR_EVENTS_JSON);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CALENDAR_EVENTS_JSON, JSON.stringify(tasks, null, 2));
}

export async function GET() {
  return NextResponse.json(readTasks());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.title || !body.date) {
      return NextResponse.json(
        { error: "title and date required" },
        { status: 400 }
      );
    }
    const category: EventCategory = body.category || "task";
    const task: CalendarEvent = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: String(body.title).trim(),
      date: body.date,
      time: body.time || undefined,
      endTime: body.endTime || undefined,
      category,
      color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.task,
      description: body.description || undefined,
      source: "task",
    };
    const tasks = readTasks();
    tasks.push(task);
    writeTasks(tasks);
    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const tasks = readTasks().map((t) =>
      t.id === id ? { ...t, ...updates } : t
    );
    writeTasks(tasks);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const tasks = readTasks().filter((t) => t.id !== id);
  writeTasks(tasks);
  return NextResponse.json({ success: true });
}
