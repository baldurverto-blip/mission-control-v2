"use client";

import { Card } from "./Card";
import { Badge } from "./Badge";

interface DecisionItem {
  type: "inbox" | "approval" | "stalled" | "overdue";
  title: string;
  detail: string;
}

interface InboxItem { text: string; done: boolean; }

interface ProjectLane {
  slug: string;
  name: string;
  isStalled: boolean;
  staleDays: number;
}

interface Expedition {
  slug: string;
  name: string;
  isOverdue: boolean;
  timeRemaining: number | null;
}

interface WorkflowActive {
  workflow: string;
  runId: string;
  approvalPending: boolean;
  currentStep: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  inbox: "var(--terracotta)",
  approval: "var(--amber)",
  stalled: "var(--terracotta)",
  overdue: "var(--terracotta)",
};

export function DecisionBox({
  inbox,
  workflows,
  projects,
  expeditions,
}: {
  inbox: InboxItem[];
  workflows: WorkflowActive[];
  projects: ProjectLane[];
  expeditions: Expedition[];
}) {
  const items: DecisionItem[] = [];

  // Open inbox items
  for (const item of inbox.filter((i) => !i.done).slice(0, 3)) {
    items.push({ type: "inbox", title: "Inbox", detail: item.text });
  }

  // Approval gates
  for (const w of workflows.filter((w) => w.approvalPending)) {
    items.push({
      type: "approval",
      title: "Approval gate",
      detail: `${w.workflow} — step: ${w.currentStep ?? "pending"}`,
    });
  }

  // Stalled projects
  for (const p of projects.filter((p) => p.isStalled)) {
    items.push({
      type: "stalled",
      title: "Stalled",
      detail: `${p.name} — ${p.staleDays}d without activity`,
    });
  }

  // Overdue expeditions
  for (const e of expeditions.filter((e) => e.isOverdue)) {
    const hours = e.timeRemaining ? Math.ceil(Math.abs(e.timeRemaining) / 3600000) : 0;
    items.push({
      type: "overdue",
      title: "Overdue",
      detail: `${e.name} — ${hours}h past deadline`,
    });
  }

  return (
    <Card className="p-4 h-full">
      <p className="label-caps text-mid/80 mb-3">Decisions</p>
      {items.length === 0 ? (
        <p className="text-sm text-mid/70 text-center py-4">
          No decisions pending. Agents operating within guardrails.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1.5">
              <Badge color={TYPE_COLORS[item.type]}>{item.title}</Badge>
              <p className="text-xs text-mid leading-relaxed flex-1">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
