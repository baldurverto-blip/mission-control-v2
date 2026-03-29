import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { TASKS_JSON } from "@/app/lib/paths";
import type { Task, TaskStatus } from "@/app/lib/tasks";
import { generateTaskId } from "@/app/lib/tasks";

async function readTasks(): Promise<Task[]> {
  if (!existsSync(TASKS_JSON)) return [];
  try {
    const raw = await readFile(TASKS_JSON, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : data.tasks ?? [];
  } catch {
    return [];
  }
}

async function writeTasks(tasks: Task[]): Promise<void> {
  await writeFile(TASKS_JSON, JSON.stringify(tasks, null, 2), "utf-8");
}

// GET — return all tasks
export async function GET() {
  const tasks = await readTasks();
  return NextResponse.json({ tasks });
}

// POST — create or update a task
export async function POST(req: NextRequest) {
  const body = await req.json();
  const tasks = await readTasks();

  if (body.action === "create") {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateTaskId(),
      title: body.title ?? "Untitled task",
      status: (body.status as TaskStatus) ?? "backlog",
      assignee: body.assignee ?? null,
      creator: body.creator ?? "mads",
      created_at: now,
      updated_at: now,
      parent_id: body.parent_id,
      priority: body.priority ?? "p2",
      tags: body.tags ?? [],
      notes: body.notes ?? [],
    };
    tasks.push(task);
    await writeTasks(tasks);
    return NextResponse.json({ ok: true, task });
  }

  if (body.action === "update") {
    const idx = tasks.findIndex((t) => t.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const now = new Date().toISOString();
    if (body.status !== undefined) tasks[idx].status = body.status;
    if (body.title !== undefined) tasks[idx].title = body.title;
    if (body.assignee !== undefined) tasks[idx].assignee = body.assignee;
    if (body.priority !== undefined) tasks[idx].priority = body.priority;
    if (body.tags !== undefined) tasks[idx].tags = body.tags;
    if (body.note) tasks[idx].notes.push(`[${now}] ${body.note}`);
    tasks[idx].updated_at = now;

    await writeTasks(tasks);
    return NextResponse.json({ ok: true, task: tasks[idx] });
  }

  if (body.action === "delete") {
    const filtered = tasks.filter((t) => t.id !== body.id);
    await writeTasks(filtered);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
