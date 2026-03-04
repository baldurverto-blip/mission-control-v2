"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { StatusDot } from "../../components/StatusDot";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";

interface QueueItem {
  id: string;
  caption: string;
  hook_id: string;
  tags: string[];
  metadata: {
    project?: string;
    signal_source?: string;
    content_type?: string;
    slide_count?: number;
  };
  status: string;
  approval_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface QueueResponse {
  success: boolean;
  queue: QueueItem[];
  source: string;
}

interface QueueStats {
  success: boolean;
  queued: number;
  approved: number;
  posted: number;
  rejected: number;
}

interface HealthResponse {
  status: string;
  modules: Record<string, boolean>;
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "var(--lilac)",
  approved: "var(--olive)",
  posted: "var(--charcoal)",
  rejected: "var(--terracotta)",
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  posted: "Posted",
  rejected: "Rejected",
};

const TABS = [
  { id: "pending_approval", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export default function QueuePage() {
  const { data: queueData, isOffline, loading, refetch } = useGrowthOps<QueueResponse>("queue");
  const { data: stats } = useGrowthOps<QueueStats>("queue/stats");
  const { data: health } = useGrowthOps<HealthResponse>("health", { pollInterval: 60_000 });

  const [activeTab, setActiveTab] = useState("pending_approval");
  const [acting, setActing] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  const [editCaption, setEditCaption] = useState("");

  const items = queueData?.queue ?? [];
  const filtered = activeTab === "all" ? items : items.filter((i) => i.status === activeTab);

  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count: t.id === "all" ? items.length : items.filter((i) => i.status === t.id).length,
  }));

  const act = useCallback(async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await fetch(`/api/growth/queue/${id}/${action}`, { method: "PUT" });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [refetch]);

  const saveEdit = useCallback(async () => {
    if (!editItem) return;
    setActing(editItem.id);
    try {
      await fetch(`/api/growth/queue/${editItem.id}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: editCaption }),
      });
      setEditItem(null);
      await refetch();
    } finally {
      setActing(null);
    }
  }, [editItem, editCaption, refetch]);

  if (isOffline) return <EmptyState offline title="Backend offline" message="Growth-Ops server is not reachable on :3002" />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight">Approval Queue</h1>
            <p className="text-mid text-sm mt-1">Review and approve content before posting</p>
          </div>
        </div>

        {/* Metrics */}
        {stats && (
          <div className="mb-6 fade-up">
            <MetricsBar metrics={[
              { label: "Queued", value: String(stats.queued), color: "var(--lilac)" },
              { label: "Approved", value: String(stats.approved), color: "var(--olive)" },
              { label: "Posted", value: String(stats.posted), color: "var(--charcoal)" },
              { label: "Rejected", value: String(stats.rejected), color: "var(--terracotta)" },
            ]} />
          </div>
        )}

        {/* Module Health */}
        {health?.modules && (
          <div className="flex items-center gap-4 mb-4 fade-up" style={{ animationDelay: "0.05s" }}>
            <span className="label-caps text-[0.55rem]">Modules</span>
            {Object.entries(health.modules).map(([mod, active]) => (
              <div key={mod} className="flex items-center gap-1.5">
                <StatusDot status={active ? "ok" : "error"} size="sm" />
                <span className="text-xs text-mid capitalize">{mod.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {/* Tabs */}
        <div className="mb-5 fade-up" style={{ animationDelay: "0.1s" }}>
          <TabBar tabs={tabsWithCounts} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Queue List */}
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading queue...</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Queue empty" message={`No ${activeTab === "all" ? "" : STATUS_LABELS[activeTab]?.toLowerCase() + " "}items`} />
        ) : (
          <div className="space-y-3">
            {filtered.map((item, idx) => {
              const project = item.metadata?.project ?? "—";
              const statusColor = STATUS_COLORS[item.status] ?? "var(--mid)";
              const isActing = acting === item.id;
              return (
                <div
                  key={item.id}
                  className="card fade-up"
                  style={{ animationDelay: `${0.1 + idx * 0.03}s` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge color={statusColor}>{STATUS_LABELS[item.status] ?? item.status}</Badge>
                        <Badge color="var(--lilac)">{project}</Badge>
                        {item.metadata?.content_type && (
                          <span className="text-[0.6rem] text-mid/60">{item.metadata.content_type}</span>
                        )}
                        {item.hook_id && (
                          <span className="text-[0.6rem] text-mid/60">{item.hook_id}</span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed line-clamp-3">{item.caption}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[0.6rem] text-mid/50">{item.id}</span>
                        <span className="text-[0.6rem] text-mid/50">{new Date(item.created_at).toLocaleDateString("en-GB")}</span>
                        {item.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[0.55rem] px-1.5 py-0.5 rounded bg-warm text-mid">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                    {item.status === "pending_approval" && (
                      <>
                        <button
                          onClick={() => act(item.id, "approve")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50 text-paper"
                          style={{ backgroundColor: "var(--olive)" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => act(item.id, "reject")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                          style={{ color: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => { setEditItem(item); setEditCaption(item.caption); }}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-warm"
                      style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
                    >
                      Edit
                    </button>
                    {item.status !== "pending_approval" && (
                      <span className="text-[0.6rem] text-mid/40 ml-auto">
                        {STATUS_LABELS[item.status]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Content">
        {editItem && (
          <div className="space-y-4">
            <div>
              <label className="label-caps block mb-1">Caption</label>
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={6}
                className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditItem(null)}
                className="text-xs px-4 py-2 rounded-lg cursor-pointer"
                style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!!acting}
                className="text-xs px-4 py-2 rounded-lg cursor-pointer text-paper disabled:opacity-50"
                style={{ backgroundColor: "var(--charcoal)" }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
