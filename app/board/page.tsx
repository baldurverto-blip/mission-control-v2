import Link from "next/link";
import { Card } from "@/app/components/Card";
import { getBoardData, type BoardAction, type BoardArchiveEntry } from "@/app/lib/board";

export const dynamic = "force-dynamic";

function formatBoardDate(date: string | null): string {
  if (!date) return "Unavailable";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatOwner(owner: string): string {
  return owner.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFileLabel(name: string): string {
  return name.replace(/\.(md|json)$/i, "").replace(/[-_]/g, " ");
}

function BoardFileLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md border border-warm bg-raised px-3 py-2 text-xs uppercase tracking-[0.14em] text-charcoal transition-colors hover:border-terracotta/40 hover:text-terracotta"
      target="_blank"
    >
      {label}
    </Link>
  );
}

function ActionList({ actions, emptyText }: { actions: BoardAction[]; emptyText: string }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-warm bg-raised px-4 py-4">
        <p className="text-sm text-charcoal">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <div key={`${action.owner}-${action.title}`} className="rounded-md border border-warm bg-raised px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-charcoal">{action.title}</p>
              {action.why ? <p className="mt-1 text-xs leading-6 text-mid">{action.why}</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 text-[0.7rem] uppercase tracking-[0.14em] text-mid">
              <span>{action.priority}</span>
              <span>{formatOwner(action.owner)}</span>
              {action.due_window ? <span>{action.due_window}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArchiveCard({ entry, defaultOpen = false }: { entry: BoardArchiveEntry; defaultOpen?: boolean }) {
  return (
    <details className="rounded-md border border-warm bg-raised" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="label-caps mb-2">{formatBoardDate(entry.date)}</p>
            <p className="text-lg text-charcoal">
              {entry.summary?.verdict ?? formatFileLabel(entry.summary?.name ?? entry.transcript?.name ?? entry.date)}
            </p>
            <p className="mt-1 text-xs text-mid">
              {entry.summary?.name ?? "No summary"} · {entry.transcript?.name ?? "No transcript"} · {entry.actionsFile?.name ?? "No actions"}
            </p>
          </div>
          <div className="text-xs uppercase tracking-[0.14em] text-mid">
            {entry.actions.length} actions
          </div>
        </div>
      </summary>

      <div className="border-t border-warm px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
          <div className="space-y-3">
            <div>
              <p className="label-caps mb-2">Executive brief</p>
              <div className="space-y-2 text-sm leading-7 text-mid">
                {(entry.summary?.executiveBrief ?? []).length > 0 ? entry.summary?.executiveBrief.map((line) => (
                  <p key={line}>• {line}</p>
                )) : <p>No executive brief yet for this meeting.</p>}
              </div>
            </div>
            {(entry.summary?.keyDecisions ?? []).length > 0 ? (
              <div>
                <p className="label-caps mb-2">Key decisions</p>
                <div className="space-y-2 text-sm leading-7 text-mid">
                  {entry.summary?.keyDecisions.map((line) => <p key={line}>• {line}</p>)}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <p className="label-caps mb-2">Transcript preview</p>
            <div className="rounded-md border border-warm bg-paper px-4 py-3">
              <div className="space-y-2 text-sm leading-7 text-charcoal">
                {entry.transcriptPreview.length > 0 ? entry.transcriptPreview.map((line) => (
                  <p key={line}>{line}</p>
                )) : <p className="text-mid">No conversational transcript found.</p>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="label-caps mb-2">Actions</p>
              <ActionList actions={entry.actions.slice(0, 4)} emptyText="No routed actions captured for this meeting." />
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.summary ? <BoardFileLink href={`/api/board/file?type=summary&name=${encodeURIComponent(entry.summary.name)}`} label="Open summary" /> : null}
              {entry.transcript ? <BoardFileLink href={`/api/board/file?type=transcript&name=${encodeURIComponent(entry.transcript.name)}`} label="Open transcript" /> : null}
              {entry.actionsFile ? <BoardFileLink href={`/api/board/file?type=action&name=${encodeURIComponent(entry.actionsFile.name)}`} label="Open actions" /> : null}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

export default async function BoardPage() {
  const data = await getBoardData();
  const latestEntry = data.archive[0] ?? null;

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="label-caps mb-2">Board</p>
            <h1 className="text-4xl text-charcoal">Strategic Board Browser</h1>
            <p className="mt-2 max-w-3xl text-sm text-mid">
              Weekly steering committee with opening brief, agenda focus, short deliberation, named actions, and explicit founder escalations.
            </p>
          </div>
          <div className="rounded-md border border-warm bg-paper px-4 py-3 shadow-sm">
            <p className="label-caps mb-1">Latest Board Date</p>
            <p className="text-lg text-charcoal">{formatBoardDate(data.latestBoardDate)}</p>
            {data.phaseHeadline ? <p className="mt-1 text-xs text-mid">{data.phaseHeadline}</p> : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-6">
            <Card className="fade-up">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="label-caps mb-2">Latest meeting</p>
                    <h2 className="text-2xl text-charcoal">
                      {data.latestSummary?.verdict ?? "Latest board materials"}
                    </h2>
                    <p className="mt-2 text-sm text-mid">
                      The latest strategic board meeting, surfaced as a readable steering brief instead of raw file links.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.latestAliasFiles.summary ? <BoardFileLink href="/api/board/file?type=summary&name=latest.md" label="Latest summary alias" /> : null}
                    {data.latestAliasFiles.transcript ? <BoardFileLink href="/api/board/file?type=transcript&name=latest.md" label="Latest transcript alias" /> : null}
                    {data.latestAliasFiles.action ? <BoardFileLink href="/api/board/file?type=action&name=latest.json" label="Latest actions alias" /> : null}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md border border-warm bg-raised px-4 py-4">
                    <p className="label-caps mb-2">Opening brief</p>
                    <div className="space-y-2 text-sm leading-7 text-mid">
                      {(data.latestSummary?.executiveBrief ?? []).length > 0 ? data.latestSummary?.executiveBrief.map((line) => (
                        <p key={line}>• {line}</p>
                      )) : <p>{data.latestSummary?.excerpt ?? "No board summary file was found."}</p>}
                    </div>
                  </div>

                  <div className="rounded-md border border-warm bg-raised px-4 py-4">
                    <p className="label-caps mb-2">Next moves</p>
                    <div className="space-y-2 text-sm leading-7 text-mid">
                      {(data.latestSummary?.nextMoves ?? []).length > 0 ? data.latestSummary?.nextMoves.map((line) => (
                        <p key={line}>• {line}</p>
                      )) : <p>No explicit next moves were captured in the latest summary.</p>}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md border border-warm bg-raised px-4 py-4">
                    <p className="label-caps mb-2">Agenda focus</p>
                    <div className="space-y-2 text-sm leading-7 text-mid">
                      {(data.latestAgendaFocus ?? []).length > 0 ? data.latestAgendaFocus.map((line) => (
                        <p key={line}>• {line}</p>
                      )) : <p>No agenda focus was captured for the latest meeting.</p>}
                    </div>
                  </div>

                  <div className="rounded-md border border-warm bg-raised px-4 py-4">
                    <p className="label-caps mb-2">Escalations for Mads</p>
                    <div className="space-y-2 text-sm leading-7 text-mid">
                      {(data.latestEscalations ?? []).length > 0 ? data.latestEscalations.map((line) => (
                        <p key={line}>• {line}</p>
                      )) : <p>No founder escalations were captured in the latest summary.</p>}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-warm bg-paper px-4 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="label-caps mb-2">Transcript preview</p>
                      <p className="text-sm text-mid">Latest conversational turns, inline.</p>
                    </div>
                    {data.latestTranscript ? <BoardFileLink href={`/api/board/file?type=transcript&name=${encodeURIComponent(data.latestTranscript.name)}`} label="Open full transcript" /> : null}
                  </div>
                  <div className="space-y-2 text-sm leading-7 text-charcoal">
                    {data.latestTranscriptPreview.length > 0 ? data.latestTranscriptPreview.map((line) => (
                      <p key={line}>{line}</p>
                    )) : <p className="text-mid">No transcript preview available.</p>}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Latest actions</p>
              <h2 className="mb-4 text-2xl text-charcoal">Real tasks from the latest meeting</h2>
              <ActionList actions={data.latestActions} emptyText="The latest board pack did not produce any actions yet." />
            </Card>

            <Card className="fade-up">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="label-caps mb-2">Archive</p>
                  <h2 className="text-2xl text-charcoal">Browse past meetings</h2>
                </div>
                <p className="text-xs text-mid">{data.archive.length} meetings indexed</p>
              </div>
              <div className="space-y-3">
                {data.archive.length > 0 ? data.archive.map((entry, index) => (
                  <ArchiveCard key={entry.date} entry={entry} defaultOpen={index === 0} />
                )) : <p className="text-sm text-mid">No board meeting archive files were found.</p>}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="fade-up">
              <p className="label-caps mb-2">Meeting format</p>
              <h2 className="mb-4 text-2xl text-charcoal">How the strategic board runs</h2>
              <div className="space-y-2">
                {data.meetingFormat.map((note) => (
                  <p key={note} className="text-sm leading-7 text-mid">• {note}</p>
                ))}
              </div>
              {data.latestAgendaFocus.length > 0 ? (
                <div className="mt-4 rounded-md border border-warm bg-raised px-4 py-4">
                  <p className="label-caps mb-2">Latest agenda focus</p>
                  <div className="space-y-2 text-sm leading-7 text-mid">
                    {data.latestAgendaFocus.map((item) => (
                      <p key={item}>• {item}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Truth sources</p>
              <h2 className="mb-4 text-2xl text-charcoal">What this board should trust</h2>
              <div className="space-y-2">
                {data.truthNotes.map((note) => (
                  <p key={note} className="text-sm leading-7 text-mid">• {note}</p>
                ))}
              </div>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Board goals</p>
              <h2 className="mb-4 text-2xl text-charcoal">Founder constraints excerpt</h2>
              <div className="space-y-2">
                {data.goalsExcerpt.length > 0 ? data.goalsExcerpt.map((line) => (
                  <p key={line} className="text-sm leading-7 text-mid">{line}</p>
                )) : <p className="text-sm text-mid">No board goals excerpt was found.</p>}
              </div>
              <div className="mt-4">
                <BoardFileLink href="/api/board/file?type=goals&name=board-goals.md" label="Open goals" />
              </div>
            </Card>

            {latestEntry ? (
              <Card className="fade-up">
                <p className="label-caps mb-2">Latest pack files</p>
                <h2 className="mb-4 text-2xl text-charcoal">Artifact access</h2>
                <div className="space-y-3 text-sm text-mid">
                  <p>{latestEntry.summary?.name ?? "No summary file"}</p>
                  <p>{latestEntry.transcript?.name ?? "No transcript file"}</p>
                  <p>{latestEntry.actionsFile?.name ?? "No actions file"}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {latestEntry.summary ? <BoardFileLink href={`/api/board/file?type=summary&name=${encodeURIComponent(latestEntry.summary.name)}`} label="Open summary" /> : null}
                  {latestEntry.transcript ? <BoardFileLink href={`/api/board/file?type=transcript&name=${encodeURIComponent(latestEntry.transcript.name)}`} label="Open transcript" /> : null}
                  {latestEntry.actionsFile ? <BoardFileLink href={`/api/board/file?type=action&name=${encodeURIComponent(latestEntry.actionsFile.name)}`} label="Open actions" /> : null}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
