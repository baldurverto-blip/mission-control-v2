"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

interface TikTokItem {
  id: string;
  video_url: string;
  caption: string;
  status: string;
  project: string;
  created_at: string;
  manifest_id: string;
  template: string;
}

interface TikTokResponse {
  success: boolean;
  items: TikTokItem[];
}

const TABS = [
  { id: "all", label: "All" },
  { id: "pending_approval", label: "Pending" },
  { id: "approved", label: "Ready" },
  { id: "posted", label: "Posted" },
];

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "var(--lilac)",
  approved: "var(--olive)",
  posted: "var(--charcoal)",
  rejected: "var(--terracotta)",
};

export default function TikTokPage() {
  const { data, isOffline, loading, refetch } = useGrowthOps<TikTokResponse>("tiktok");
  const [tab, setTab] = useState("all");
  const [acting, setActing] = useState<string | null>(null);

  if (isOffline) return <EmptyState offline />;

  const items = data?.items ?? [];
  const filtered = tab === "all" ? items : items.filter((i) => i.status === tab);

  const pending = items.filter((i) => i.status === "pending_approval").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const posted = items.filter((i) => i.status === "posted").length;

  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count: t.id === "all" ? items.length : items.filter((i) => i.status === t.id).length,
  }));

  const act = useCallback(async (id: string, action: string) => {
    setActing(id);
    try {
      await fetch(`/api/growth/tiktok/${id}/${action}`, { method: "PUT" });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [refetch]);

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">TikTok</h1>
        <p className="text-mid text-sm mb-6">Video content pipeline</p>
        <MetricsBar metrics={[
          { label: "Total", value: String(items.length), color: "var(--charcoal)" },
          { label: "Pending", value: String(pending), color: "var(--lilac)" },
          { label: "Ready", value: String(approved), color: "var(--olive)" },
          { label: "Posted", value: String(posted), color: "var(--mid)" },
        ]} />
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="mb-5">
          <TabBar tabs={tabsWithCounts} active={tab} onChange={setTab} />
        </div>

        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No TikTok items" message="Videos will appear here from the pipeline" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item, idx) => (
              <div key={item.id} className="card fade-up" style={{ animationDelay: `${idx * 0.03}s` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge color={STATUS_COLORS[item.status] ?? "var(--mid)"}>{item.status.replace(/_/g, " ")}</Badge>
                  <Badge color="var(--lilac)">{item.project}</Badge>
                </div>
                <p className="text-sm leading-relaxed line-clamp-4 mb-2">{item.caption}</p>
                <div className="flex items-center gap-3 text-[0.55rem] text-mid/50">
                  <span>{item.manifest_id}</span>
                  <span>{new Date(item.created_at).toLocaleDateString("en-GB")}</span>
                </div>

                {item.status === "pending_approval" && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                    <button
                      onClick={() => act(item.id, "approve")}
                      disabled={acting === item.id}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper"
                      style={{ backgroundColor: "var(--olive)" }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(item.id, "reject")}
                      disabled={acting === item.id}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
                      style={{ color: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
