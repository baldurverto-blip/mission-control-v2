"use client";

import { useState } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { Badge } from "../../components/Badge";
import { TabBar } from "../../components/TabBar";
import { FilterBar, FilterSelect, FilterSearch } from "../../components/FilterBar";
import { EmptyState } from "../../components/EmptyState";

interface HistoryItem {
  id: string;
  project: string;
  platform: string;
  subreddit?: string;
  content_type: string;
  title: string;
  body: string;
  status: string;
  humanizer_score: number;
  post_url: string | null;
  created_at: string;
  posted_at: string | null;
  engagement: {
    upvotes?: number;
    comments?: number;
    views?: number;
  } | null;
}

interface HistoryResponse {
  success: boolean;
  history: HistoryItem[];
}

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "posted", label: "Posted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function HistoryPage() {
  const { data, isOffline, loading } = useGrowthOps<HistoryResponse>("history");
  const [tab, setTab] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");

  if (isOffline) return <EmptyState offline />;

  const items = data?.history ?? [];
  const projects = [...new Set(items.map((i) => i.project))];

  const filtered = items
    .filter((i) => tab === "all" || i.status === tab)
    .filter((i) => projectFilter === "all" || i.project === projectFilter)
    .filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  const posted = items.filter((i) => i.status === "posted");
  const totalUpvotes = posted.reduce((sum, i) => sum + (i.engagement?.upvotes ?? 0), 0);
  const totalComments = posted.reduce((sum, i) => sum + (i.engagement?.comments ?? 0), 0);

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">History</h1>
        <p className="text-mid text-sm mb-6">Posted content and engagement metrics</p>
        <MetricsBar metrics={[
          { label: "Total", value: String(items.length), color: "var(--charcoal)" },
          { label: "Posted", value: String(posted.length), color: "var(--olive)" },
          { label: "Upvotes", value: String(totalUpvotes), color: "var(--terracotta)" },
          { label: "Comments", value: String(totalComments), color: "var(--lilac)" },
        ]} />
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <TabBar tabs={STATUS_TABS} active={tab} onChange={setTab} />
          <FilterBar>
            <FilterSelect
              label="Project"
              value={projectFilter}
              options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p, label: p }))]}
              onChange={setProjectFilter}
            />
            <FilterSearch value={search} onChange={setSearch} placeholder="Search..." />
          </FilterBar>
        </div>

        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No history" message="Posted content will appear here" />
        ) : (
          <div className="space-y-2">
            {filtered.map((item, idx) => (
              <div key={item.id} className="card fade-up !py-3" style={{ animationDelay: `${idx * 0.02}s` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge color={item.status === "posted" ? "var(--olive)" : item.status === "rejected" ? "var(--terracotta)" : "var(--mid)"}>{item.status}</Badge>
                      <Badge color="var(--lilac)">{item.project}</Badge>
                      <span className="text-[0.8rem] text-mid/80 capitalize">{item.platform}</span>
                      {item.subreddit && <span className="text-[0.8rem] text-mid/70">{item.subreddit}</span>}
                    </div>
                    <p className="text-sm truncate">{item.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[0.75rem] text-mid/70">{new Date(item.created_at).toLocaleDateString("en-GB")}</span>
                      {item.humanizer_score > 0 && <span className="text-[0.75rem] text-mid/70">voice: {item.humanizer_score}</span>}
                    </div>
                  </div>
                  {item.engagement && (
                    <div className="flex gap-4 text-right flex-shrink-0">
                      {item.engagement.upvotes !== undefined && (
                        <div>
                          <p className="text-sm tabular-nums font-medium" style={{ color: "var(--terracotta)" }}>{item.engagement.upvotes}</p>
                          <p className="text-[0.7rem] text-mid/60">upvotes</p>
                        </div>
                      )}
                      {item.engagement.comments !== undefined && (
                        <div>
                          <p className="text-sm tabular-nums font-medium" style={{ color: "var(--lilac)" }}>{item.engagement.comments}</p>
                          <p className="text-[0.7rem] text-mid/60">comments</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {item.post_url && (
                  <div className="mt-2 pt-2 border-t border-warm">
                    <a href={item.post_url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--lilac)" }}>
                      View post &rarr;
                    </a>
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
