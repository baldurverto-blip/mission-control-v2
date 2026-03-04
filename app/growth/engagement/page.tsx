"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

interface Opportunity {
  id: string;
  platform: string;
  subreddit?: string;
  title: string;
  url: string;
  status: string;
  created_at: string;
}

interface EngagementResponse {
  success: boolean;
  opportunities: Opportunity[];
}

export default function EngagementPage() {
  const { data, isOffline, loading, refetch } = useGrowthOps<EngagementResponse>("engagement");
  const [acting, setActing] = useState<string | null>(null);

  const opportunities = data?.opportunities ?? [];

  const act = useCallback(async (id: string, action: string) => {
    setActing(id);
    try {
      await fetch(`/api/growth/engagement/${id}/${action}`, { method: "PUT" });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [refetch]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Engagement</h1>
        <p className="text-mid text-sm mb-6">Community engagement opportunities</p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : opportunities.length === 0 ? (
          <EmptyState title="No opportunities" message="Engagement opportunities will appear here when detected" />
        ) : (
          <div className="space-y-3">
            {opportunities.map((opp, idx) => (
              <div key={opp.id} className="card fade-up" style={{ animationDelay: `${idx * 0.03}s` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color="var(--lilac)">{opp.platform}</Badge>
                      {opp.subreddit && <span className="text-[0.6rem] text-mid/60">{opp.subreddit}</span>}
                    </div>
                    <p className="text-sm">{opp.title}</p>
                    <span className="text-[0.55rem] text-mid/50">{new Date(opp.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                  <button
                    onClick={() => act(opp.id, "engage")}
                    disabled={acting === opp.id}
                    className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper"
                    style={{ backgroundColor: "var(--olive)" }}
                  >
                    Engage
                  </button>
                  <button
                    onClick={() => act(opp.id, "dismiss")}
                    disabled={acting === opp.id}
                    className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
                    style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
                  >
                    Dismiss
                  </button>
                  {opp.url && (
                    <a
                      href={opp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs ml-auto"
                      style={{ color: "var(--lilac)" }}
                    >
                      View &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
