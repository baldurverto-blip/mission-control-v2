import Link from "next/link";
import { Card } from "@/app/components/Card";
import { getCompanyBrainData } from "@/app/lib/brain";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function openDocHref(name: string): string {
  return `/api/brain/file?name=${encodeURIComponent(name)}`;
}

function freshnessTone(freshness: "fresh" | "aging" | "stale" | "critical_stale" | "unknown"): string {
  if (freshness === "fresh") return "border-olive/30 bg-olive/10 text-charcoal";
  if (freshness === "aging") return "border-amber/40 bg-amber/10 text-charcoal";
  if (freshness === "stale") return "border-terracotta/30 bg-terracotta/10 text-charcoal";
  if (freshness === "critical_stale") return "border-terracotta bg-terracotta/20 text-charcoal";
  return "border-warm bg-raised text-mid";
}

function freshnessLabel(freshness: "fresh" | "aging" | "stale" | "critical_stale" | "unknown"): string {
  if (freshness === "fresh") return "Fresh";
  if (freshness === "aging") return "Aging";
  if (freshness === "stale") return "Stale";
  if (freshness === "critical_stale") return "Critical stale";
  return "Unknown";
}

export default async function BrainPage() {
  const data = await getCompanyBrainData();
  const [schemaDoc, logDoc, lintDoc, boundaryDoc] = data.coreDocs;

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="fade-up">
            <p className="label-caps mb-2">Company Brain</p>
            <h1 className="text-4xl text-charcoal">Browse the operating wiki, then inspect the maintenance layer</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-mid">
              /brain now separates founder reading from system upkeep. Start with the browse paths below to understand the company,
              products, runtime, research, tools, and ops. Drop into the maintenance panels when you want freshness, curation debt,
              and trust mechanics.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-warm bg-raised px-4 py-3">
                <p className="label-caps mb-1">Start here</p>
                <p className="text-sm text-charcoal">Company and runtime foundations first.</p>
              </div>
              <div className="rounded-md border border-warm bg-raised px-4 py-3">
                <p className="label-caps mb-1">Browse domains</p>
                <p className="text-sm text-charcoal">Products, research, skills, and ops are grouped into real doc lanes.</p>
              </div>
              <div className="rounded-md border border-warm bg-raised px-4 py-3">
                <p className="label-caps mb-1">Trust the layer</p>
                <p className="text-sm text-charcoal">Freshness, log, lint, contradictions, and gaps stay visible below.</p>
              </div>
            </div>
          </Card>

          <Card className="fade-up">
            <p className="label-caps mb-2">Coverage</p>
            <p className="text-3xl text-charcoal">{data.canonicalDocs.length} browseable pages</p>
            <p className="mt-2 text-sm text-mid">{data.maintenanceDocs.length} maintenance docs, {data.coreDocs.length} trust anchors.</p>
            <div className="mt-4 space-y-2 text-xs text-mid">
              <p>Status generated {formatDate(data.status.generatedAt)}</p>
              <p>{data.status.gaps.length} open gaps, {data.status.contradictions.length} contradictions logged.</p>
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <Card className="fade-up">
            <p className="label-caps mb-1">Docs</p>
            <p className="text-2xl text-charcoal">{data.metadataStats.total}</p>
            <p className="mt-2 text-xs text-mid">Core, browse, and maintenance pages.</p>
          </Card>
          <Card className="fade-up">
            <p className="label-caps mb-1">Fresh</p>
            <p className="text-2xl text-charcoal">{data.status.counts.fresh}</p>
            <p className="mt-2 text-xs text-mid">Recently verified pages.</p>
          </Card>
          <Card className="fade-up">
            <p className="label-caps mb-1">Needs review</p>
            <p className="text-2xl text-charcoal">{data.status.counts.aging + data.status.counts.stale + data.status.counts.criticalStale}</p>
            <p className="mt-2 text-xs text-mid">Aging and stale pages combined.</p>
          </Card>
          <Card className="fade-up">
            <p className="label-caps mb-1">Metadata gaps</p>
            <p className="text-2xl text-charcoal">{data.status.counts.missingMetadata}</p>
            <p className="mt-2 text-xs text-mid">Pages failing the maintenance contract.</p>
          </Card>
          <Card className="fade-up">
            <p className="label-caps mb-1">Promotions</p>
            <p className="text-2xl text-charcoal">{data.status.recentPromotions.length}</p>
            <p className="mt-2 text-xs text-mid">Recently promoted source-to-canonical moves.</p>
          </Card>
        </div>

        <Card className="fade-up mt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="label-caps mb-2">Learning loop</p>
              <h2 className="text-2xl text-charcoal">Archive → wiki → skill/task/proposal health</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-mid">
                This panel shows whether recent raw evidence is being reviewed, promoted into durable wiki/Company Brain synthesis,
                and converted into reusable skills, task-board work, or gated proposals instead of disappearing into archives.
              </p>
            </div>
            <div className="rounded-md border border-warm bg-raised px-4 py-3 text-xs text-mid lg:min-w-[260px]">
              <p><span className="text-charcoal">Latest audit:</span> {data.learningLoop.latestOutput.name ?? "Not found"}</p>
              <p className="mt-1"><span className="text-charcoal">Modified:</span> {formatDate(data.learningLoop.latestOutput.modifiedAt)}</p>
              {data.learningLoop.latestOutput.path ? <p className="mt-1 text-[11px]">{data.learningLoop.latestOutput.path}</p> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-1">Archive reviewed</p>
              <p className="text-2xl text-charcoal">{data.learningLoop.latestOutput.reviewedCount ?? "—"}</p>
              <p className="mt-2 text-xs text-mid">Candidate files in the latest audit window.</p>
            </div>
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-1">Wiki queue</p>
              <p className="text-2xl text-charcoal">{data.learningLoop.latestOutput.queueCounts.researchWiki}</p>
              <p className="mt-2 text-xs text-mid">Items flagged for durable research/wiki synthesis.</p>
            </div>
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-1">Company Brain</p>
              <p className="text-2xl text-charcoal">{data.learningLoop.latestOutput.queueCounts.companyBrain}</p>
              <p className="mt-2 text-xs text-mid">Founder-facing synthesis candidates.</p>
            </div>
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-1">Skills/tasks</p>
              <p className="text-2xl text-charcoal">{data.learningLoop.latestOutput.queueCounts.skills}/{data.learningLoop.latestOutput.queueCounts.tasks}</p>
              <p className="mt-2 text-xs text-mid">Reusable methods and action-board candidates.</p>
            </div>
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-1">Proposals</p>
              <p className="text-2xl text-charcoal">{data.learningLoop.latestOutput.queueCounts.proposals}</p>
              <p className="mt-2 text-xs text-mid">Doctrine/preference changes needing gated promotion.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-2">Wiki health</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <p><span className="block text-2xl text-charcoal">{data.learningLoop.wiki.pageCount}</span><span className="text-xs text-mid">pages</span></p>
                <p><span className="block text-2xl text-charcoal">{data.learningLoop.wiki.freshCount}</span><span className="text-xs text-mid">fresh</span></p>
                <p><span className="block text-2xl text-charcoal">{data.learningLoop.wiki.staleCount}</span><span className="text-xs text-mid">stale</span></p>
              </div>
              <p className="mt-3 text-xs leading-6 text-mid">{data.learningLoop.wiki.latestLogEntry ?? "No research/wiki log entry found."}</p>
            </div>

            <div className="rounded-md border border-warm bg-raised px-4 py-3">
              <p className="label-caps mb-2">Downstream conversion</p>
              <div className="grid gap-3 md:grid-cols-3">
                <p className="text-sm text-mid"><span className="block text-2xl text-charcoal">{data.learningLoop.downstream.skillsTotal}</span>skills total {data.learningLoop.downstream.wikiLoopSkillExists ? "· loop skill exists" : "· loop skill missing"}</p>
                <p className="text-sm text-mid"><span className="block text-2xl text-charcoal">{data.learningLoop.downstream.openLearningTasks.length}</span>open learning/company-brain tasks</p>
                <p className="text-sm text-mid"><span className="block text-2xl text-charcoal">{data.learningLoop.downstream.recentProposalCount}</span>recent proposals</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-terracotta">Next promotions</p>
                  {data.learningLoop.latestOutput.recommendedNextPromotions.length > 0 ? (
                    <ul className="space-y-2 text-xs leading-5 text-charcoal">
                      {data.learningLoop.latestOutput.recommendedNextPromotions.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  ) : <p className="text-xs text-mid">No recommendations in the latest audit.</p>}
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-terracotta">Open tasks</p>
                  {data.learningLoop.downstream.openLearningTasks.length > 0 ? (
                    <ul className="space-y-2 text-xs leading-5 text-charcoal">
                      {data.learningLoop.downstream.openLearningTasks.map((task) => <li key={task.id}>• {task.title} <span className="text-mid">({task.status})</span></li>)}
                    </ul>
                  ) : <p className="text-xs text-mid">No open learning-loop tasks found.</p>}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-6">
            <Card className="fade-up">
              <p className="label-caps mb-2">Browse layer</p>
              <h2 className="mb-2 text-2xl text-charcoal">Wiki paths by domain</h2>
              <p className="mb-5 max-w-3xl text-sm leading-6 text-mid">
                Every card opens a real curated doc. The sections are arranged as a reading path instead of a maintenance checklist.
              </p>
              <div className="space-y-5">
                {data.browseSections.map((section) => (
                  <div key={section.id}>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="label-caps mb-1">{section.title}</p>
                        <p className="text-sm text-mid">{section.summary}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {section.docs.map((doc) => (
                        <div key={doc.name} className="rounded-md border border-warm bg-raised px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-charcoal">{doc.title}</p>
                              <p className="mt-1 text-xs text-mid">Updated {formatDate(doc.modifiedAt)}</p>
                            </div>
                            <Link href={openDocHref(doc.name)} className="text-xs text-terracotta hover:underline" target="_blank">
                              Open
                            </Link>
                          </div>
                          <p className="mt-3 text-xs leading-6 text-mid">{doc.summary}</p>
                          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                            <span className={`rounded-full border px-2 py-1 ${freshnessTone(doc.freshness)}`}>
                              {freshnessLabel(doc.freshness)}
                            </span>
                            <span className="rounded-full border border-warm px-2 py-1 text-mid">Owner: {doc.owner ?? "Missing"}</span>
                          </div>
                          <p className="mt-3 text-[11px] leading-5 text-mid">
                            <span className="text-charcoal">Source:</span> {doc.sourceOfTruth ?? "Missing"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Canonical library</p>
              <h2 className="mb-4 text-2xl text-charcoal">All browseable pages</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {data.canonicalDocs.map((doc) => (
                  <div key={doc.name} className="rounded-md border border-warm bg-raised px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-charcoal">{doc.title}</p>
                        <p className="mt-1 text-xs text-mid">Verified {doc.lastVerified ?? "Missing"}</p>
                      </div>
                      <Link href={openDocHref(doc.name)} className="text-xs text-terracotta hover:underline" target="_blank">
                        Open
                      </Link>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-mid">{doc.summary}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Recent promotions</p>
              <h2 className="mb-4 text-2xl text-charcoal">Source to canonical movement</h2>
              <div className="space-y-3">
                {data.status.recentPromotions.length > 0 ? data.status.recentPromotions.map((entry) => (
                  <div key={`${entry.date}-${entry.title}`} className="rounded-md border border-warm bg-raised px-4 py-3">
                    <p className="text-sm font-medium text-charcoal">{entry.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-terracotta">{entry.date} {entry.type ? `· ${entry.type}` : ""}</p>
                    {entry.note ? <p className="mt-3 text-xs leading-6 text-mid">{entry.note}</p> : null}
                  </div>
                )) : (
                  <p className="text-sm text-mid">No promotion entries logged yet.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="fade-up">
              <p className="label-caps mb-2">Maintenance layer</p>
              <h2 className="mb-4 text-2xl text-charcoal">Trust anchors</h2>
              <div className="space-y-3 text-sm text-mid">
                <p><span className="text-charcoal">Schema:</span> {schemaDoc?.summary}</p>
                <p><span className="text-charcoal">Log:</span> {logDoc?.summary}</p>
                <p><span className="text-charcoal">Lint:</span> {lintDoc?.summary}</p>
                <p><span className="text-charcoal">Boundary:</span> {boundaryDoc?.summary}</p>
              </div>
              <div className="mt-4 grid gap-3">
                {data.maintenanceDocs.map((doc) => (
                  <div key={doc.name} className="rounded-md border border-warm bg-raised px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-charcoal">{doc.title}</p>
                        <p className="mt-1 text-xs text-mid">Owner {doc.owner ?? "Missing"}</p>
                      </div>
                      <Link href={openDocHref(doc.name)} className="text-xs text-terracotta hover:underline" target="_blank">
                        Open
                      </Link>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-mid">{doc.summary}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">System health</p>
              <h2 className="mb-4 text-2xl text-charcoal">Freshness and trust</h2>
              <div className="space-y-3">
                <div className="rounded-md border border-warm bg-raised px-4 py-3 text-sm text-mid">
                  <p><span className="text-charcoal">Thresholds:</span> fresh {data.status.thresholds?.freshDays ?? "?"}d, aging through {data.status.thresholds?.agingDays ?? "?"}d, stale through {data.status.thresholds?.staleDays ?? "?"}d.</p>
                  <p className="mt-2"><span className="text-charcoal">Last generated:</span> {formatDate(data.status.generatedAt)}</p>
                </div>
                {data.status.staleDocs.length > 0 ? data.status.staleDocs.map((doc) => (
                  <div key={doc.name} className="rounded-md border border-warm bg-raised px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-charcoal">{doc.title}</p>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${freshnessTone(doc.freshness)}`}>
                        {freshnessLabel(doc.freshness)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-mid">Owner: {doc.owner ?? "Missing"}</p>
                  </div>
                )) : (
                  <div className="rounded-md border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-charcoal">
                    No stale or unknown company-brain pages right now.
                  </div>
                )}
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Contradictions and gaps</p>
              <h2 className="mb-4 text-2xl text-charcoal">Known curation debt</h2>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-terracotta">Contradictions</p>
                  {data.status.contradictions.length > 0 ? (
                    <ul className="space-y-2 text-sm text-charcoal">
                      {data.status.contradictions.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-mid">No active contradictions logged.</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-terracotta">Gaps</p>
                  {data.status.gaps.length > 0 ? (
                    <ul className="space-y-2 text-sm text-charcoal">
                      {data.status.gaps.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-mid">No open gaps logged.</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Latest log</p>
              <h2 className="mb-4 text-2xl text-charcoal">Recent company-brain changes</h2>
              <div className="space-y-4">
                {data.latestLogEntries.length > 0 ? data.latestLogEntries.map((entry) => (
                  <div key={entry.date} className="rounded-md border border-warm bg-raised px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-terracotta">{entry.date}</p>
                    <ul className="mt-2 space-y-2 text-sm text-charcoal">
                      {entry.bullets.slice(0, 5).map((bullet) => (
                        <li key={bullet} className="leading-6">• {bullet}</li>
                      ))}
                    </ul>
                  </div>
                )) : (
                  <p className="text-sm text-mid">No company-brain log entries found.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
