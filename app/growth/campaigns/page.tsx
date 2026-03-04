"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";

interface Campaign {
  id: string;
  slug: string;
  name: string;
  project: string;
  description: string;
  status: string;
  engagement_strategy: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
}

interface CampaignsResponse {
  success: boolean;
  campaigns: Campaign[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--olive)",
  draft: "var(--mid)",
  paused: "var(--amber)",
  completed: "var(--charcoal)",
};

export default function CampaignsPage() {
  const { data, isOffline, loading, refetch } = useGrowthOps<CampaignsResponse>("campaigns");
  const [acting, setActing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", project: "", description: "", strategy: "value_first" });

  const campaigns = data?.campaigns ?? [];

  const toggleStatus = useCallback(async (id: string, current: string) => {
    const next = current === "active" ? "paused" : "active";
    setActing(id);
    try {
      await fetch(`/api/growth/campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [refetch]);

  const createCampaign = useCallback(async () => {
    if (!form.name.trim()) return;
    setActing("create");
    try {
      await fetch("/api/growth/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ name: "", project: "", description: "", strategy: "value_first" });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [form, refetch]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight mb-1">Campaigns</h1>
            <p className="text-mid text-sm">Manage engagement campaigns</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded-md cursor-pointer text-paper"
            style={{ backgroundColor: "var(--charcoal)" }}
          >
            + New Campaign
          </button>
        </div>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : campaigns.length === 0 ? (
          <EmptyState title="No campaigns" message="Create your first campaign to get started" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campaigns.map((c, idx) => (
              <div key={c.id} className="card fade-up" style={{ animationDelay: `${idx * 0.03}s` }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={STATUS_COLORS[c.status] ?? "var(--mid)"}>{c.status}</Badge>
                      <Badge color="var(--lilac)">{c.project}</Badge>
                    </div>
                    <p className="text-sm font-medium">{c.name}</p>
                  </div>
                </div>
                {c.description && <p className="text-xs text-mid mb-2">{c.description}</p>}
                <div className="flex items-center gap-3 text-[0.55rem] text-mid/50">
                  <span>Strategy: {c.engagement_strategy?.replace(/_/g, " ")}</span>
                  <span>{new Date(c.created_at).toLocaleDateString("en-GB")}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                  <button
                    onClick={() => toggleStatus(c.id, c.status)}
                    disabled={acting === c.id}
                    className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
                    style={{
                      color: c.status === "active" ? "var(--amber)" : "var(--olive)",
                      backgroundColor: c.status === "active" ? "var(--amber-soft)" : "var(--olive-soft)",
                    }}
                  >
                    {c.status === "active" ? "Pause" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Campaign">
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50"
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Project</label>
            <input
              type="text"
              value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
              className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50"
              placeholder="e.g. safebite, sync"
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="text-xs px-4 py-2 rounded-lg cursor-pointer" style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}>
              Cancel
            </button>
            <button onClick={createCampaign} disabled={acting === "create" || !form.name.trim()} className="text-xs px-4 py-2 rounded-lg cursor-pointer text-paper disabled:opacity-50" style={{ backgroundColor: "var(--charcoal)" }}>
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
