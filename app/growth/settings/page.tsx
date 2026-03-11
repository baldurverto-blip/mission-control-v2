"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { TabBar } from "../../components/TabBar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";

// ─── Interfaces ─────────────────────────────────────────────

interface Project {
  slug: string;
  name: string;
  description: string;
  status: string;
  keywords: string[];
  subreddits: string[];
}

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

interface Template {
  id: string;
  project: string;
  name: string;
  engagement_type: string;
  trigger_patterns: string[];
  template_text: string;
  cta_included: boolean;
  usage_count: number;
  success_rate: number | null;
  created_at: string;
}

interface ProjectsResponse { success: boolean; projects: Project[] }
interface CampaignsResponse { success: boolean; campaigns: Campaign[] }
interface TemplatesResponse { success: boolean; templates: Template[] }

// ─── Constants ──────────────────────────────────────────────

const SECTION_TABS = [
  { id: "projects", label: "Projects" },
  { id: "campaigns", label: "Campaigns" },
  { id: "templates", label: "Templates" },
];

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "var(--olive)",
  paused: "var(--amber)",
  archived: "var(--mid)",
};

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  active: "var(--olive)",
  draft: "var(--mid)",
  paused: "var(--amber)",
  completed: "var(--charcoal)",
};

// ─── Component ──────────────────────────────────────────────

export default function SettingsPage() {
  const { data: projData, isOffline, loading: projLoading } = useGrowthOps<ProjectsResponse>("projects");
  const { data: campData, loading: campLoading, refetch: refetchCamp } = useGrowthOps<CampaignsResponse>("campaigns");
  const { data: tmplData, loading: tmplLoading, refetch: refetchTmpl } = useGrowthOps<TemplatesResponse>("templates");

  const [section, setSection] = useState("projects");
  const [acting, setActing] = useState<string | null>(null);

  // Campaign create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", project: "", description: "", strategy: "value_first" });

  // Template expand
  const [expandedTmpl, setExpandedTmpl] = useState<string | null>(null);

  const projects = projData?.projects ?? [];
  const campaigns = campData?.campaigns ?? [];
  const templates = tmplData?.templates ?? [];
  const templateProjects = [...new Set(templates.map((t) => t.project))];

  // Campaign actions
  const toggleCampaignStatus = useCallback(async (id: string, current: string) => {
    const next = current === "active" ? "paused" : "active";
    setActing(id);
    try {
      await fetch(`/api/growth/campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await refetchCamp();
    } finally {
      setActing(null);
    }
  }, [refetchCamp]);

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
      await refetchCamp();
    } finally {
      setActing(null);
    }
  }, [form, refetchCamp]);

  // Template actions
  const deleteTemplate = useCallback(async (id: string) => {
    setActing(id);
    try {
      await fetch(`/api/growth/templates/${id}`, { method: "DELETE" });
      await refetchTmpl();
    } finally {
      setActing(null);
    }
  }, [refetchTmpl]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Settings</h1>
        <p className="text-mid text-sm mb-6">Projects, campaigns, and templates</p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        <div className="mb-5 fade-up">
          <TabBar
            tabs={SECTION_TABS.map((t) => ({
              ...t,
              count:
                t.id === "projects" ? projects.length :
                t.id === "campaigns" ? campaigns.length :
                templates.length,
            }))}
            active={section}
            onChange={setSection}
          />
        </div>

        {/* ─── Projects ─── */}
        {section === "projects" && (
          projLoading ? (
            <p className="text-mid text-sm text-center py-8">Loading...</p>
          ) : projects.length === 0 ? (
            <EmptyState title="No projects" message="Add projects to start discovering signals" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project, idx) => (
                <div key={project.slug} className="card fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl text-charcoal">{project.name}</h2>
                    <Badge color={PROJECT_STATUS_COLORS[project.status] ?? "var(--mid)"}>{project.status}</Badge>
                  </div>
                  <p className="text-xs text-mid mb-3">{project.description}</p>

                  {project.keywords.length > 0 && (
                    <div className="mb-3">
                      <p className="label-caps text-[0.7rem] text-mid/70 mb-1">Keywords</p>
                      <div className="flex gap-1 flex-wrap">
                        {project.keywords.slice(0, 8).map((kw) => (
                          <span key={kw} className="text-[0.75rem] px-1.5 py-0.5 rounded bg-warm text-mid">{kw}</span>
                        ))}
                        {project.keywords.length > 8 && (
                          <span className="text-[0.75rem] text-mid/60">+{project.keywords.length - 8}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {project.subreddits.length > 0 && (
                    <div>
                      <p className="label-caps text-[0.7rem] text-mid/70 mb-1">Subreddits</p>
                      <div className="flex gap-1 flex-wrap">
                        {project.subreddits.slice(0, 6).map((sub) => (
                          <span key={sub} className="text-[0.75rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>{sub}</span>
                        ))}
                        {project.subreddits.length > 6 && (
                          <span className="text-[0.75rem] text-mid/60">+{project.subreddits.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── Campaigns ─── */}
        {section === "campaigns" && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs px-3 py-1.5 rounded-md cursor-pointer text-paper"
                style={{ backgroundColor: "var(--charcoal)" }}
              >
                + New Campaign
              </button>
            </div>
            {campLoading ? (
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
                          <Badge color={CAMPAIGN_STATUS_COLORS[c.status] ?? "var(--mid)"}>{c.status}</Badge>
                          <Badge color="var(--lilac)">{c.project}</Badge>
                        </div>
                        <p className="text-sm font-medium">{c.name}</p>
                      </div>
                    </div>
                    {c.description && <p className="text-xs text-mid mb-2">{c.description}</p>}
                    <div className="flex items-center gap-3 text-[0.75rem] text-mid/70">
                      <span>Strategy: {c.engagement_strategy?.replace(/_/g, " ")}</span>
                      <span>{new Date(c.created_at).toLocaleDateString("en-GB")}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm">
                      <button
                        onClick={() => toggleCampaignStatus(c.id, c.status)}
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
          </>
        )}

        {/* ─── Templates ─── */}
        {section === "templates" && (
          tmplLoading ? (
            <p className="text-mid text-sm text-center py-8">Loading...</p>
          ) : templates.length === 0 ? (
            <EmptyState title="No templates" message="Add templates to speed up engagement" />
          ) : (
            <div className="space-y-6">
              {templateProjects.map((project) => {
                const projectTemplates = templates.filter((t) => t.project === project);
                return (
                  <div key={project}>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge color="var(--lilac)">{project}</Badge>
                      <span className="text-[0.8rem] text-mid/70">{projectTemplates.length} templates</span>
                    </div>
                    <div className="space-y-2">
                      {projectTemplates.map((tmpl, idx) => (
                        <div
                          key={tmpl.id}
                          className="card !p-3 fade-up cursor-pointer"
                          style={{ animationDelay: `${idx * 0.02}s` }}
                          onClick={() => setExpandedTmpl(expandedTmpl === tmpl.id ? null : tmpl.id)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{tmpl.name}</span>
                              <Badge color="var(--mid)">{tmpl.engagement_type}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[0.75rem] text-mid/70 tabular-nums">used: {tmpl.usage_count}</span>
                              {tmpl.cta_included && <span className="text-[0.75rem] px-1.5 py-0.5 rounded bg-olive-soft text-olive">CTA</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {tmpl.trigger_patterns.map((p) => (
                              <span key={p} className="text-[0.75rem] px-1.5 py-0.5 rounded bg-warm text-mid">{p}</span>
                            ))}
                          </div>
                          {expandedTmpl === tmpl.id && (
                            <div className="mt-3 pt-3 border-t border-warm">
                              <p className="text-xs text-mid leading-relaxed mb-3">{tmpl.template_text}</p>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                                disabled={acting === tmpl.id}
                                className="text-xs px-3 py-1 rounded cursor-pointer disabled:opacity-50"
                                style={{ color: "var(--terracotta)", backgroundColor: "var(--terracotta-soft)" }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>

      {/* Create Campaign Modal */}
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
