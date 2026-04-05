import Link from "next/link";
import { Card } from "@/app/components/Card";
import { getBoardData } from "@/app/lib/board";

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

function formatConversationType(type: "meeting" | "transcript"): string {
  return type === "transcript" ? "Full transcript" : "Legacy meeting note";
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

export default async function BoardPage() {
  const data = await getBoardData();

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="label-caps mb-2">Board</p>
            <h1 className="text-4xl text-charcoal">Board Surface</h1>
            <p className="mt-2 max-w-3xl text-sm text-mid">
              File-backed snapshot of the latest board cycle from the Verto workspace.
            </p>
          </div>
          <div className="rounded-md border border-warm bg-paper px-4 py-3 shadow-sm">
            <p className="label-caps mb-1">Latest Board Date</p>
            <p className="text-lg text-charcoal">{formatBoardDate(data.latestBoardDate)}</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <Card className="fade-up">
              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label-caps mb-2">Latest Board Pack</p>
                    <h2 className="text-2xl text-charcoal">
                      {data.latestSummary?.verdict ?? "Latest board materials"}
                    </h2>
                    <p className="mt-2 text-sm text-mid">
                      Three board outputs: concise founder read, full multi-role conversation, and routed action payload.
                    </p>
                  </div>
                  {data.latestBoardDate ? (
                    <p className="text-xs uppercase tracking-[0.14em] text-mid">
                      {formatBoardDate(data.latestBoardDate)}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-warm bg-raised px-4 py-3">
                    <p className="label-caps mb-2">Summary</p>
                    <p className="text-sm text-charcoal">
                      {data.latestSummary ? formatFileLabel(data.latestSummary.name) : "Unavailable"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-mid">Concise founder read.</p>
                    <div className="mt-3">
                      {data.latestSummary ? (
                        <BoardFileLink
                          href={`/api/board/file?type=summary&name=${encodeURIComponent(data.latestSummary.name)}`}
                          label="Open Summary"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border border-warm bg-raised px-4 py-3">
                    <p className="label-caps mb-2">Transcript</p>
                    <p className="text-sm text-charcoal">
                      {data.latestTranscript ? formatFileLabel(data.latestTranscript.name) : "Unavailable"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-mid">Full multi-role conversation.</p>
                    <div className="mt-3">
                      {data.latestTranscript ? (
                        <BoardFileLink
                          href={`/api/board/file?type=${data.latestTranscript.type}&name=${encodeURIComponent(data.latestTranscript.name)}`}
                          label="Open Transcript"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border border-warm bg-raised px-4 py-3">
                    <p className="label-caps mb-2">Actions</p>
                    <p className="text-sm text-charcoal">
                      {data.latestActionsFile ? formatFileLabel(data.latestActionsFile.name) : "Unavailable"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-mid">Routed or routeable task payload.</p>
                    <div className="mt-3">
                      {data.latestActionsFile ? (
                        <BoardFileLink
                          href={`/api/board/file?type=action&name=${encodeURIComponent(data.latestActionsFile.name)}`}
                          label="Open Actions"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-mid">
                {data.latestSummary?.excerpt ?? "No board summary file was found."}
              </p>
            </Card>

            <Card className="fade-up">
              <p className="label-caps mb-2">Latest Actions</p>
              <h2 className="mb-4 text-2xl text-charcoal">Taskboard-ready output</h2>
              <div className="space-y-3">
                {data.latestActions.length > 0 ? data.latestActions.map((action) => (
                  <div
                    key={action.title}
                    className="rounded-md border border-warm bg-raised px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm text-charcoal">{action.title}</p>
                        {action.why && (
                          <p className="mt-1 text-xs leading-6 text-mid">{action.why}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2 text-[0.7rem] uppercase tracking-[0.14em] text-mid">
                        <span>{action.priority}</span>
                        <span>{formatOwner(action.owner)}</span>
                        {action.due_window ? <span>{action.due_window}</span> : null}
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-mid">No board actions were found.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="fade-up">
              <p className="label-caps mb-2">Conversation History</p>
              <h2 className="mb-4 text-2xl text-charcoal">Recent board conversations</h2>
              <div className="space-y-3">
                {data.recentConversations.length > 0 ? data.recentConversations.map((meeting) => (
                  <Link
                    key={`${meeting.type}-${meeting.name}`}
                    href={`/api/board/file?type=${meeting.type}&name=${encodeURIComponent(meeting.name)}`}
                    className="block rounded-md border border-warm bg-raised px-4 py-3 transition-colors hover:border-terracotta/40 hover:bg-paper"
                    target="_blank"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-charcoal">{formatFileLabel(meeting.name)}</p>
                      <span className="text-[0.7rem] uppercase tracking-[0.14em] text-terracotta">
                        {meeting.type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-mid">
                      {meeting.inferredDate ? formatBoardDate(meeting.inferredDate) : "Undated"} · {formatConversationType(meeting.type)} · {meeting.name}
                    </p>
                  </Link>
                )) : (
                  <p className="text-sm text-mid">No board conversation history files were found.</p>
                )}
              </div>
            </Card>

            <Card className="fade-up">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="label-caps mb-2">Board Goals</p>
                  <h2 className="text-2xl text-charcoal">Excerpt</h2>
                </div>
                <Link
                  href="/api/board/file?type=goals&name=board-goals.md"
                  className="text-xs text-terracotta hover:underline"
                  target="_blank"
                >
                  Open goals
                </Link>
              </div>
              <div className="space-y-2">
                {data.goalsExcerpt.length > 0 ? data.goalsExcerpt.map((line) => (
                  <p key={line} className="text-sm leading-7 text-mid">
                    {line}
                  </p>
                )) : (
                  <p className="text-sm text-mid">No board goals excerpt was found.</p>
                )}
              </div>
              <p className="mt-4 text-xs text-muted">{data.goalsPath}</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
