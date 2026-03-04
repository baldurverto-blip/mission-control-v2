"use client";

import { useGrowthOps } from "../../lib/useGrowthOps";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";

interface Project {
  slug: string;
  name: string;
  description: string;
  status: string;
  keywords: string[];
  subreddits: string[];
}

interface ProjectsResponse {
  success: boolean;
  projects: Project[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--olive)",
  paused: "var(--amber)",
  archived: "var(--mid)",
};

export default function ProjectsPage() {
  const { data, isOffline, loading } = useGrowthOps<ProjectsResponse>("projects");

  if (isOffline) return <EmptyState offline />;

  const projects = data?.projects ?? [];

  return (
    <div className="min-h-screen">
      <header className="px-8 pt-4 pb-6 max-w-[1440px] mx-auto">
        <h1 className="text-4xl text-charcoal tracking-tight mb-1">Projects</h1>
        <p className="text-mid text-sm mb-6">Managed product projects for content discovery</p>
      </header>

      <main className="px-8 pb-12 max-w-[1440px] mx-auto">
        {loading ? (
          <p className="text-mid text-sm text-center py-8">Loading...</p>
        ) : projects.length === 0 ? (
          <EmptyState title="No projects" message="Add projects to start discovering signals" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project, idx) => (
              <div key={project.slug} className="card fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl text-charcoal">{project.name}</h2>
                  <Badge color={STATUS_COLORS[project.status] ?? "var(--mid)"}>{project.status}</Badge>
                </div>
                <p className="text-xs text-mid mb-3">{project.description}</p>

                {project.keywords.length > 0 && (
                  <div className="mb-3">
                    <p className="label-caps text-[0.5rem] text-mid/50 mb-1">Keywords</p>
                    <div className="flex gap-1 flex-wrap">
                      {project.keywords.slice(0, 8).map((kw) => (
                        <span key={kw} className="text-[0.55rem] px-1.5 py-0.5 rounded bg-warm text-mid">{kw}</span>
                      ))}
                      {project.keywords.length > 8 && (
                        <span className="text-[0.55rem] text-mid/40">+{project.keywords.length - 8}</span>
                      )}
                    </div>
                  </div>
                )}

                {project.subreddits.length > 0 && (
                  <div>
                    <p className="label-caps text-[0.5rem] text-mid/50 mb-1">Subreddits</p>
                    <div className="flex gap-1 flex-wrap">
                      {project.subreddits.slice(0, 6).map((sub) => (
                        <span key={sub} className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--lilac-soft)", color: "var(--lilac)" }}>{sub}</span>
                      ))}
                      {project.subreddits.length > 6 && (
                        <span className="text-[0.55rem] text-mid/40">+{project.subreddits.length - 6}</span>
                      )}
                    </div>
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
