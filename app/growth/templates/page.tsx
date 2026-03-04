"use client";

import { useState, useCallback } from "react";
import { useGrowthOps } from "../../lib/useGrowthOps";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

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

interface TemplatesResponse {
  success: boolean;
  templates: Template[];
}

export default function TemplatesPage() {
  const { data, isOffline, loading, refetch } = useGrowthOps<TemplatesResponse>("templates");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const templates = data?.templates ?? [];
  const projects = [...new Set(templates.map((t) => t.project))];

  const deleteTemplate = useCallback(async (id: string) => {
    setActing(id);
    try {
      await fetch(`/api/growth/templates/${id}`, { method: "DELETE" });
      await refetch();
    } finally {
      setActing(null);
    }
  }, [refetch]);

  if (isOffline) return <EmptyState offline />;

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Templates</h1>
        <p className="text-mid text-sm mb-6">Engagement reply templates by project</p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : templates.length === 0 ? (
          <EmptyState title="No templates" message="Add templates to speed up engagement" />
        ) : (
          <div className="space-y-6">
            {projects.map((project) => {
              const projectTemplates = templates.filter((t) => t.project === project);
              return (
                <div key={project}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge color="var(--lilac)">{project}</Badge>
                    <span className="text-[0.6rem] text-mid/50">{projectTemplates.length} templates</span>
                  </div>
                  <div className="space-y-2">
                    {projectTemplates.map((tmpl, idx) => (
                      <div
                        key={tmpl.id}
                        className="card !p-3 fade-up cursor-pointer"
                        style={{ animationDelay: `${idx * 0.02}s` }}
                        onClick={() => setExpanded(expanded === tmpl.id ? null : tmpl.id)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tmpl.name}</span>
                            <Badge color="var(--mid)">{tmpl.engagement_type}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[0.55rem] text-mid/50 tabular-nums">used: {tmpl.usage_count}</span>
                            {tmpl.cta_included && <span className="text-[0.55rem] px-1.5 py-0.5 rounded bg-olive-soft text-olive">CTA</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {tmpl.trigger_patterns.map((p) => (
                            <span key={p} className="text-[0.55rem] px-1.5 py-0.5 rounded bg-warm text-mid">{p}</span>
                          ))}
                        </div>
                        {expanded === tmpl.id && (
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
        )}
      </main>
    </div>
  );
}
