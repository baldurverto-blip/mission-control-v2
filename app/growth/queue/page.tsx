"use client";

import { useState, useCallback, useMemo } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { MetricsBar } from "../../components/MetricsBar";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { StatusDot } from "../../components/StatusDot";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";

// ─── Queue types ────────────────────────────────────────────

interface QueueItem {
  id: string;
  title: string | null;
  body: string | null;
  platform: string | null;
  subreddit: string | null;
  content_type: string | null;
  project: string | null;
  humanizer_score: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  posted_at: string | null;
  post_url: string | null;
  campaign_name: string | null;
  // Legacy fields (local queue format)
  caption?: string;
  hook_id?: string;
  tags?: string[];
  metadata?: {
    project?: string;
    signal_source?: string;
    content_type?: string;
    slide_count?: number;
  };
  _type: "text";
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

interface ProjectsResponse {
  success: boolean;
  projects: Array<{ slug: string; name: string }>;
}

// ─── TikTok types ───────────────────────────────────────────

interface TikTokItem {
  id: string;
  video_url: string;
  caption: string;
  status: string;
  project: string;
  created_at: string;
  manifest_id: string;
  template: string;
  _type: "video";
}

interface TikTokResponse {
  success: boolean;
  items: TikTokItem[];
}

// ─── Unified item ───────────────────────────────────────────

type UnifiedItem = (QueueItem & { _type: "text" }) | (TikTokItem & { _type: "video" });

interface HealthResponse {
  status: string;
  modules: Record<string, boolean>;
}

// ─── Constants ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "var(--lilac)",
  queued: "var(--lilac)",
  approved: "var(--olive)",
  posted: "var(--charcoal)",
  rejected: "var(--terracotta)",
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending",
  queued: "Queued",
  approved: "Approved",
  posted: "Posted",
  rejected: "Rejected",
};

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "posted", label: "Posted" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const TYPE_PILLS = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "video", label: "Video" },
];

function postingRoute(platformRaw: string | null | undefined): "manual" | "agent" | "auto" {
  const p = String(platformRaw || "").toLowerCase();
  if (p === "linkedin" || p === "tiktok") return "manual";
  if (p === "twitter" || p === "x") return "agent";
  if (p === "reddit") return "auto";
  return "manual";
}

function postingRouteMeta(route: "manual" | "agent" | "auto") {
  if (route === "manual") return { label: "MANUAL", color: "var(--amber)" };
  if (route === "agent") return { label: "AGENT", color: "var(--lilac)" };
  return { label: "AUTO", color: "var(--olive)" };
}

export default function QueuePage() {
  const { data: queueData, isOffline, loading: qLoading, refetch: refetchQueue } = useGrowthOps<QueueResponse>("queue");
  const { data: tiktokData, loading: tLoading, refetch: refetchTiktok } = useGrowthOps<TikTokResponse>("tiktok");
  const { data: stats } = useGrowthOps<QueueStats>("queue/stats");
  const { data: projectsData } = useGrowthOps<ProjectsResponse>("projects");
  const { data: health } = useGrowthOps<HealthResponse>("health", { pollInterval: 60_000 });

  const [activeTab, setActiveTab] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [acting, setActing] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editSubreddit, setEditSubreddit] = useState("");
  const [editProject, setEditProject] = useState<string>("");
  const [flash, setFlash] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [openingManualId, setOpeningManualId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);

  const projectOptions = useMemo(() => {
    const slugs = (projectsData?.projects ?? []).map((p) => p.slug).filter(Boolean);
    return [...new Set(slugs)].sort();
  }, [projectsData]);

  const editPlatform = (editItem?.platform ?? "").toLowerCase();
  const isRedditEdit = editPlatform === "reddit";

  const loading = qLoading || tLoading;

  // Merge queue + tiktok into unified list
  const allItems: UnifiedItem[] = useMemo(() => {
    const textItems: UnifiedItem[] = (queueData?.queue ?? []).map((i) => ({ ...i, _type: "text" as const }));
    const videoItems: UnifiedItem[] = (tiktokData?.items ?? []).map((i) => ({ ...i, _type: "video" as const }));
    return [...textItems, ...videoItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [queueData, tiktokData]);

  // Normalize status for filtering
  const getStatus = (item: UnifiedItem) => {
    const s = item.status;
    if (s === "pending_approval" || s === "queued") return "pending";
    return s;
  };

  const filtered = allItems
    .filter((i) => activeTab === "all" || getStatus(i) === activeTab)
    .filter((i) => typeFilter === "all" || i._type === typeFilter);

  const tabsWithCounts = STATUS_TABS.map((t) => ({
    ...t,
    count: t.id === "all" ? allItems.length : allItems.filter((i) => getStatus(i) === t.id).length,
  }));

  const approvedTextItems = allItems.filter((i) => i._type === "text" && i.status === "approved") as (QueueItem & { _type: "text" })[];
  const approvedManualItems = approvedTextItems.filter((i) => {
    const p = String(i.platform || "").toLowerCase();
    return p === "linkedin" || p === "tiktok";
  });
  const approvedAutoItems = approvedTextItems.filter((i) => {
    const p = String(i.platform || "").toLowerCase();
    return p === "twitter" || p === "x" || p === "reddit";
  });

  // TikTok video count for metrics
  const videosPending = (tiktokData?.items ?? []).filter((i) => i.status === "pending_approval").length;
  const videosReady = (tiktokData?.items ?? []).filter((i) => i.status === "approved").length;

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchQueue(), refetchTiktok()]);
  }, [refetchQueue, refetchTiktok]);

  // Text queue actions
  const actQueue = useCallback(async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await fetch(`/api/growth/queue/${id}/${action}`, { method: "PUT" });
      await refetchAll();
    } finally {
      setActing(null);
    }
  }, [refetchAll]);

  // TikTok actions
  const escalateQueue = useCallback(async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/growth/queue/${id}/escalate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data?.success || data?.escalated) {
        setFlash({ type: "ok", text: "Escalated ✅" });
      } else {
        setFlash({ type: "error", text: `Escalation failed ❌${data?.error ? ` — ${data.error}` : ""}` });
      }
    } finally {
      setActing(null);
    }
  }, []);

  const actTiktok = useCallback(async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await fetch(`/api/growth/tiktok/${id}/${action}`, { method: "PUT" });
      await refetchAll();
    } finally {
      setActing(null);
    }
  }, [refetchAll]);

  const openRedditManual = useCallback(async (id: string) => {
    setOpeningManualId(id);
    try {
      const res = await fetch(`/api/growth/queue/${id}/reddit-manual`);
      const data = await res.json().catch(() => ({}));
      if (data?.success && data?.compose_url) {
        window.open(data.compose_url, "_blank", "noopener,noreferrer");
        setFlash({ type: "ok", text: "Opened Reddit manual composer ↗" });
      } else {
        setFlash({ type: "error", text: `Could not open manual composer${data?.error ? ` — ${data.error}` : ""}` });
      }
    } finally {
      setOpeningManualId(null);
    }
  }, []);

  const markPosted = useCallback(async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/growth/queue/${id}/mark-posted`, { method: "PUT" });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setFlash({ type: "ok", text: "Marked as posted ✅" });
        await refetchAll();
      } else {
        setFlash({ type: "error", text: `Mark posted failed${data?.error ? ` — ${data.error}` : ""}` });
      }
    } finally {
      setActing(null);
    }
  }, [refetchAll]);

  const copyPreviewBody = useCallback(async () => {
    if (!previewItem) return;
    const text = previewItem.body ?? previewItem.caption ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFlash({ type: "ok", text: "Copied full post body ✅" });
    } catch {
      setFlash({ type: "error", text: "Could not copy to clipboard" });
    }
  }, [previewItem]);

  const saveEdit = useCallback(async () => {
    if (!editItem) return;
    setActing(editItem.id);
    try {
      const res = await fetch(`/api/growth/queue/${editItem.id}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editCaption,
          caption: editCaption,
          subreddit: isRedditEdit ? editSubreddit : "",
          project: editProject,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setFlash({ type: "ok", text: "Saved ✅" });
      } else {
        setFlash({ type: "error", text: `Save failed ❌${data?.error ? ` — ${data.error}` : ""}` });
      }
      setEditItem(null);
      await refetchAll();
    } finally {
      setActing(null);
    }
  }, [editItem, editCaption, editSubreddit, editProject, isRedditEdit, refetchAll]);

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

        {stats && (
          <div className="mb-6 fade-up">
            <MetricsBar metrics={[
              { label: "Queued", value: String(stats.queued), color: "var(--lilac)" },
              { label: "Approved", value: String(stats.approved), color: "var(--olive)" },
              { label: "Posted", value: String(stats.posted), color: "var(--charcoal)" },
              { label: "Rejected", value: String(stats.rejected), color: "var(--terracotta)" },
              { label: "Videos", value: String(videosPending + videosReady), color: "var(--amber)" },
            ]} />
          </div>
        )}

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
        {flash && (
          <div className="mb-4">
            <div
              className="text-xs px-3 py-2 rounded-md"
              style={{
                color: flash.type === "ok" ? "var(--olive)" : "var(--terracotta)",
                backgroundColor: flash.type === "ok" ? "var(--olive-soft)" : "var(--terracotta-soft)",
              }}
            >
              {flash.text}
            </div>
          </div>
        )}
        {/* Post-approval action board */}
        {approvedTextItems.length > 0 && (
          <div className="card mb-4 fade-up" style={{ animationDelay: "0.08s" }}>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-sm font-medium text-charcoal">Post-approval action board</h2>
                <p className="text-[0.7rem] text-mid/70 mt-1">
                  Approved ≠ posted. This board shows what you need to manually post vs what the system tries to auto-post.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#8b5cf620", color: "var(--lilac)" }}>AGENT</span>
                  <span className="text-[0.55rem] text-mid/70">posted by me via agent browser</span>
                  <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#22c55e20", color: "var(--olive)" }}>AUTO</span>
                  <span className="text-[0.55rem] text-mid/70">backend API autopost</span>
                  <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#f59e0b20", color: "var(--amber)" }}>MANUAL</span>
                  <span className="text-[0.55rem] text-mid/70">you post manually</span>
                </div>
              </div>
              <div className="text-[0.65rem] text-mid/70">
                Manual: <b>{approvedManualItems.length}</b> · Auto pending: <b>{approvedAutoItems.length}</b>
              </div>
            </div>

            <div className="space-y-2">
              {approvedTextItems.slice(0, 6).map((item) => {
                const p = String(item.platform || "").toLowerCase();
                const route = postingRoute(item.platform);
                const routeMeta = postingRouteMeta(route);
                const isManual = route === "manual";
                const isReddit = p === "reddit";
                const needsManualFallback = isReddit && !item.post_url;
                const note = isManual
                  ? "Manual post required"
                  : needsManualFallback
                  ? "Auto-post did not complete — use Reddit manual composer"
                  : route === "agent"
                  ? "Agent-browser posting path"
                  : "Auto-post handled by system (verify once posted)";

                return (
                  <div key={`action-${item.id}`} className="flex items-center justify-between gap-2 bg-bg rounded-lg px-3 py-2 border border-warm/70">
                    <div className="min-w-0">
                      <p className="text-xs text-charcoal truncate">{item.title ?? item.body ?? item.id}</p>
                      <p className="text-[0.6rem] text-mid/70 capitalize">{item.platform} · {note}</p>
                      <div className="mt-1">
                        <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${routeMeta.color}20`, color: routeMeta.color }}>
                          {routeMeta.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="text-[0.65rem] px-2.5 py-1 rounded-md cursor-pointer"
                        style={{ color: "var(--charcoal)", backgroundColor: "var(--warm)" }}
                      >
                        Open post
                      </button>
                      {needsManualFallback && (
                        <button
                          onClick={() => openRedditManual(item.id)}
                          disabled={openingManualId === item.id}
                          className="text-[0.65rem] px-2.5 py-1 rounded-md cursor-pointer disabled:opacity-50"
                          style={{ color: "var(--charcoal)", backgroundColor: "var(--sand)" }}
                        >
                          Open manual
                        </button>
                      )}
                      {isManual && (
                        <span className="text-[0.58rem] px-2 py-1 rounded bg-warm text-mid">Post manually</span>
                      )}
                      <button
                        onClick={() => markPosted(item.id)}
                        disabled={acting === item.id}
                        className="text-[0.65rem] px-2.5 py-1 rounded-md cursor-pointer disabled:opacity-50 text-paper"
                        style={{ backgroundColor: "var(--charcoal)" }}
                      >
                        Mark posted
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Status tabs + type filter */}
        <div className="flex items-center justify-between mb-5 fade-up" style={{ animationDelay: "0.1s" }}>
          <TabBar tabs={tabsWithCounts} active={activeTab} onChange={setActiveTab} />
          <div className="flex gap-1 ml-4">
            {TYPE_PILLS.map((pill) => (
              <button
                key={pill.id}
                onClick={() => setTypeFilter(pill.id)}
                className={`text-[0.6rem] px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                  typeFilter === pill.id
                    ? "bg-charcoal text-paper"
                    : "text-mid hover:text-charcoal"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items list */}
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading queue...</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Queue empty" message={`No ${activeTab === "all" ? "" : activeTab + " "}items`} />
        ) : (
          <div className="space-y-3">
            {filtered.map((item, idx) => {
              const isActing = acting === item.id;
              const isPending = item.status === "pending_approval" || item.status === "queued";

              if (item._type === "video") {
                // TikTok video card
                const video = item as TikTokItem & { _type: "video" };
                return (
                  <div key={video.id} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s` }}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge color={STATUS_COLORS[video.status] ?? "var(--mid)"}>{STATUS_LABELS[video.status] ?? video.status.replace(/_/g, " ")}</Badge>
                      <Badge color="var(--amber)">video</Badge>
                      <Badge color="var(--lilac)">{video.project}</Badge>
                    </div>
                    <p className="text-sm leading-relaxed line-clamp-3 mb-2">{video.caption}</p>
                    <div className="flex items-center gap-3 text-[0.55rem] text-mid/50">
                      <span>{video.manifest_id}</span>
                      <span>{new Date(video.created_at).toLocaleDateString("en-GB")}</span>
                    </div>

                    {isPending && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                        <button
                          onClick={() => actTiktok(video.id, "approve")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 text-paper"
                          style={{ backgroundColor: "var(--olive)" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => actTiktok(video.id, "reject")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50"
                          style={{ color: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Text queue card
              const text = item as QueueItem & { _type: "text" };
              const project = text.project ?? "—";
              const displayTitle = text.title ?? text.caption ?? "Untitled";
              const displayBody = text.body ?? text.caption ?? "";
              const platform = text.platform ?? "—";
              const route = postingRoute(text.platform);
              const routeMeta = postingRouteMeta(route);
              const contentType = text.content_type ?? text.metadata?.content_type ?? null;
              const target = text.subreddit ?? null;
              return (
                <div key={text.id} className="card fade-up" style={{ animationDelay: `${0.1 + idx * 0.03}s` }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge color={STATUS_COLORS[text.status] ?? "var(--mid)"}>{STATUS_LABELS[text.status] ?? text.status}</Badge>
                        <Badge color="var(--olive)">{platform}</Badge>
                        <Badge color="var(--lilac)">{project}</Badge>
                        <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${routeMeta.color}20`, color: routeMeta.color }}>
                          {routeMeta.label}
                        </span>
                        {contentType && (
                          <span className="text-[0.6rem] text-mid/60">{contentType}</span>
                        )}
                        {text.humanizer_score != null && (
                          <span className="text-[0.6rem] text-mid/60">score: {text.humanizer_score}</span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-charcoal mb-1">{displayTitle}</h3>
                      {target && <p className="text-[0.65rem] text-mid/70 mb-1">{target}</p>}
                      <p className="text-xs leading-relaxed text-mid line-clamp-4 whitespace-pre-line">{displayBody.replace(/^#\s.*\n\n?/, "").slice(0, 300)}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[0.6rem] text-mid/50">{new Date(text.created_at).toLocaleDateString("en-GB")}</span>
                        {text.post_url && (
                          <a href={text.post_url} target="_blank" rel="noopener" className="text-[0.6rem] text-terracotta hover:underline">View post</a>
                        )}
                        {text.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[0.55rem] px-1.5 py-0.5 rounded bg-warm text-mid">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                    {isPending && (
                      <>
                        <button
                          onClick={() => actQueue(text.id, "approve")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50 text-paper"
                          style={{ backgroundColor: "var(--olive)" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => actQueue(text.id, "reject")}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                          style={{ color: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setPreviewItem(text)}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-warm"
                      style={{ color: "var(--charcoal)", backgroundColor: "var(--sand)" }}
                    >
                      Open post
                    </button>
                    <button
                      onClick={() => {
                        setEditItem(text);
                        setEditCaption(text.body ?? text.caption ?? "");
                        setEditSubreddit(text.subreddit ?? "");
                        setEditProject(text.project ?? "");
                      }}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-warm"
                      style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
                    >
                      Edit
                    </button>
                    {isPending && (
                      <button
                        onClick={() => {
                          setEditItem(text);
                          setEditCaption(text.body ?? text.caption ?? "");
                          setEditSubreddit(text.subreddit ?? "");
                          setEditProject(text.project ?? "");
                        }}
                        className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-colors"
                        style={{ color: "var(--charcoal)", backgroundColor: "var(--sand)" }}
                      >
                        Wrong mapping
                      </button>
                    )}
                    <button
                      onClick={() => escalateQueue(text.id)}
                      disabled={isActing}
                      className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                      style={{ color: "var(--charcoal)", backgroundColor: "var(--warm)" }}
                    >
                      Escalate
                    </button>
                    {!isPending && text.status === "approved" && (
                      <>
                        {String(text.platform || "").toLowerCase() === "reddit" && !text.post_url && (
                          <button
                            onClick={() => openRedditManual(text.id)}
                            disabled={openingManualId === text.id}
                            className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50"
                            style={{ color: "var(--charcoal)", backgroundColor: "var(--sand)" }}
                          >
                            Open Reddit manual
                          </button>
                        )}
                        <button
                          onClick={() => markPosted(text.id)}
                          disabled={isActing}
                          className="text-xs px-3 py-1.5 rounded-md cursor-pointer transition-opacity disabled:opacity-50 text-paper"
                          style={{ backgroundColor: "var(--charcoal)" }}
                        >
                          Mark posted
                        </button>
                      </>
                    )}
                    {!isPending && (
                      <span className="text-[0.6rem] text-mid/40 ml-auto">
                        {STATUS_LABELS[text.status]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Preview Modal */}
      <Modal open={!!previewItem} onClose={() => setPreviewItem(null)} title="Post Content">
        {previewItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge color="var(--olive)">{previewItem.platform ?? "—"}</Badge>
              <Badge color="var(--lilac)">{previewItem.project ?? "—"}</Badge>
              {previewItem.subreddit && <span className="text-xs text-mid">r/{String(previewItem.subreddit).replace(/^r\//, "")}</span>}
            </div>
            {previewItem.title && <p className="text-sm font-medium text-charcoal">{previewItem.title}</p>}
            <textarea
              readOnly
              value={previewItem.body ?? previewItem.caption ?? ""}
              rows={14}
              className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal resize-y font-mono text-xs leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={copyPreviewBody}
                className="text-xs px-4 py-2 rounded-lg cursor-pointer text-paper"
                style={{ backgroundColor: "var(--charcoal)" }}
              >
                Copy full text
              </button>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-xs px-4 py-2 rounded-lg cursor-pointer"
                style={{ color: "var(--mid)", backgroundColor: "var(--warm)" }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Content">
        {editItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge color="var(--olive)">{editItem.platform ?? "—"}</Badge>
              <Badge color="var(--lilac)">{editItem.project ?? "—"}</Badge>
              {editItem.subreddit && <span className="text-xs text-mid">{editItem.subreddit}</span>}
            </div>
            {editItem.title && (
              <p className="text-sm font-medium text-charcoal">{editItem.title}</p>
            )}
            <div>
              <label className="label-caps block mb-1">Project</label>
              <select
                value={editProject}
                onChange={(e) => setEditProject(e.target.value)}
                className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20"
              >
                <option value="">Unmapped</option>
                {projectOptions.map((slug) => (
                  <option key={slug} value={slug}>{slug}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-caps block mb-1">Target {isRedditEdit ? "(subreddit)" : "(N/A for this platform)"}</label>
              <input
                value={isRedditEdit ? editSubreddit : ""}
                onChange={(e) => setEditSubreddit(e.target.value)}
                placeholder={isRedditEdit ? "e.g. r/Entrepreneur" : "Only Reddit uses subreddit targets"}
                disabled={!isRedditEdit}
                className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="label-caps block mb-1">Body</label>
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={12}
                className="w-full bg-bg border border-warm rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 resize-y font-mono text-xs leading-relaxed"
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
