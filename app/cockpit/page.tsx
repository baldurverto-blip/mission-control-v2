"use client";

import { useEffect, useState, useCallback } from "react";
import { relTime } from "../lib/agents";

// ── Types (mirror /api/cockpit) ──────────────────────────────────
interface Job {
  label: string;
  status: "ok" | "unhealthy" | "muted";
  lastExit: string;
  ageH: number;
  reasons: string;
}
interface Health {
  checkedAt: string | null;
  loaded: number;
  unhealthy: number;
  muted: number;
  plistsOnDisk: number;
  plistsUnloaded: number;
  jobs: Job[];
}
interface GateItem { n: string; title: string }
interface GateGroup { severity: "red" | "orange" | "yellow"; heading: string; items: GateItem[] }
interface Gates { openCount: number; groups: GateGroup[]; updatedAt: string | null }
interface Review {
  date: string | null;
  noopStreak: string | null;
  headline: string;
  nextMoves: string[];
  updatedAt: string | null;
}
interface QueueRow { app: string; platform: string; status: string; count: number }
interface Engine {
  totalRows: number;
  byStatus: Record<string, number>;
  queue: QueueRow[];
  readsBySource: Record<string, number>;
  totalReads: number;
  updatedAt: string | null;
}
interface DemandEntry { date: string | null; title: string }
interface Demand { latest: DemandEntry[]; updatedAt: string | null }
interface Leads {
  wired: boolean;
  count?: number;
  latest?: string | null;
  note?: string;
  error?: string;
}
interface Cockpit {
  generatedAt: string;
  health: Health | null;
  gates: Gates | null;
  review: Review | null;
  engine: Engine | null;
  demand: Demand | null;
  leads: Leads | null;
}

const SEV_COLOR: Record<string, string> = {
  red: "var(--terracotta)",
  orange: "var(--amber)",
  yellow: "var(--olive)",
};

// ── Small building blocks ────────────────────────────────────────
function SectionTitle({ children, meta }: { children: React.ReactNode; meta?: string | null }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="label-caps text-[0.8rem] text-charcoal">{children}</h2>
      {meta && <span className="text-[0.7rem] text-mid/60 tabular-nums">{meta}</span>}
    </div>
  );
}

function Stat({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="card px-4 py-3 flex-1 min-w-[140px]">
      <p
        className="leading-none tabular-nums"
        style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "2rem", color }}
      >
        {value}
      </p>
      <p className="label-caps text-[0.72rem] text-mid/80 mt-1">{label}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function CockpitPage() {
  const [data, setData] = useState<Cockpit | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit");
      setData(await res.json());
    } catch {
      /* offline */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mid text-sm">Loading cockpit…</p>
      </div>
    );
  }

  const { health, gates, review, engine, demand, leads } = data ?? {};

  return (
    <div className="px-8 py-8 max-w-[1200px] mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <h1 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.9rem", color: "var(--charcoal)" }}>
          Cockpit
        </h1>
        <span className="text-[0.72rem] text-mid/60">
          {data?.generatedAt ? `updated ${relTime(data.generatedAt)} ago` : ""}
        </span>
      </div>

      {/* headline stats */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Stat value={gates?.openCount ?? "—"} label="Open gates (need you)" color="var(--terracotta)" />
        <Stat
          value={health ? health.unhealthy : "—"}
          label={health ? `Unhealthy jobs / ${health.loaded} loaded` : "Job health"}
          color={health && health.unhealthy > 0 ? "var(--terracotta)" : "var(--olive)"}
        />
        <Stat value={engine ? engine.totalReads : "—"} label="Distribution reads (all-time)" color={engine && engine.totalReads > 0 ? "var(--olive)" : "var(--mid)"} />
        <Stat value={leads?.wired && typeof leads.count === "number" ? leads.count : "—"} label="Fake-door leads" color="var(--lilac)" />
      </div>

      {/* WHAT NEEDS YOU */}
      <section className="mb-8">
        <SectionTitle meta={gates?.updatedAt ? `GATES.md · ${relTime(gates.updatedAt)} ago` : null}>What needs you</SectionTitle>
        {!gates || gates.groups.length === 0 ? (
          <p className="text-sm text-mid">No open gates. 🎉</p>
        ) : (
          <div className="flex flex-col gap-4">
            {gates.groups.map((g) => (
              <div key={g.heading}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SEV_COLOR[g.severity] }} />
                  <span className="label-caps text-[0.7rem] text-mid">{g.heading}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.items.map((it) => (
                    <li key={it.n} className="card px-3 py-2 flex gap-2 items-start">
                      <span className="tabular-nums text-[0.75rem] text-mid/60 mt-0.5 shrink-0">{it.n}</span>
                      <span className="text-[0.85rem] text-charcoal">{it.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SYSTEM HEALTH */}
      <section className="mb-8">
        <SectionTitle meta={health?.checkedAt ? `health-monitor · ${relTime(health.checkedAt)} ago` : "monitor not run yet"}>
          System health
        </SectionTitle>
        {!health ? (
          <p className="text-sm text-mid">No health.json — the health-monitor has not run yet.</p>
        ) : (
          <>
            {health.unhealthy === 0 ? (
              <div className="card px-4 py-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--olive)" }} />
                <span className="text-sm text-charcoal">All {health.loaded} loaded jobs healthy.</span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 mb-2">
                {health.jobs
                  .filter((j) => j.status === "unhealthy")
                  .map((j) => (
                    <li key={j.label} className="card px-3 py-2 flex items-center gap-2" style={{ borderLeft: "3px solid var(--terracotta)" }}>
                      <span className="text-[0.85rem] text-charcoal font-medium">{j.label}</span>
                      <span className="text-[0.78rem] text-terracotta">{j.reasons}</span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="text-[0.72rem] text-mid/60 mt-1">
              {health.loaded} loaded · {health.muted} muted · {health.plistsUnloaded} plist(s) on disk not loaded
              {health.plistsUnloaded > 20 ? " (worth an audit)" : ""}
            </p>
          </>
        )}
      </section>

      {/* DISTRIBUTION */}
      <section className="mb-8">
        <SectionTitle meta={review?.date ? `distribution-review · ${review.date}` : null}>Distribution</SectionTitle>
        {!review ? (
          <p className="text-sm text-mid">No weekly review yet.</p>
        ) : (
          <div className="card px-4 py-3 mb-3">
            <p className="text-sm text-charcoal leading-relaxed">{review.headline}</p>
            {review.nextMoves.length > 0 && (
              <>
                <p className="label-caps text-[0.68rem] text-mid mt-3 mb-1.5">Next moves</p>
                <ol className="flex flex-col gap-1">
                  {review.nextMoves.map((m, i) => (
                    <li key={i} className="text-[0.83rem] text-charcoal flex gap-2">
                      <span className="tabular-nums text-mid/60">{i + 1}</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}

        {engine && (
          <div className="card px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="label-caps text-[0.68rem] text-mid">Content engine queue</p>
              <span className="text-[0.7rem] text-mid/60">
                {engine.totalReads === 0 ? "0 published / 0 reads — rails gated" : `${engine.totalReads} reads`}
                {engine.updatedAt ? ` · ${relTime(engine.updatedAt)} ago` : ""}
              </span>
            </div>
            {engine.queue.length === 0 ? (
              <p className="text-sm text-mid">Queue empty.</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {engine.queue.map((r) => (
                  <span key={`${r.app}-${r.platform}-${r.status}`} className="text-[0.8rem] text-charcoal tabular-nums">
                    <span className="text-mid/70">{r.app}·{r.platform}</span> {r.status}=<b className="font-medium">{r.count}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* DEMAND LOOP */}
      <section className="mb-8">
        <SectionTitle meta={demand?.updatedAt ? `discover/queue.md · ${relTime(demand.updatedAt)} ago` : null}>Demand loop</SectionTitle>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="card px-4 py-3">
            <p className="label-caps text-[0.68rem] text-mid mb-2">Recent intake</p>
            {!demand || demand.latest.length === 0 ? (
              <p className="text-sm text-mid">No entries.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {demand.latest.map((e, i) => (
                  <li key={i} className="text-[0.8rem] text-charcoal flex gap-2">
                    {e.date && <span className="tabular-nums text-mid/60 shrink-0">{e.date.slice(5)}</span>}
                    <span className="line-clamp-2">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card px-4 py-3">
            <p className="label-caps text-[0.68rem] text-mid mb-2">Fake-door demand read (RigLog)</p>
            {leads?.wired && typeof leads.count === "number" ? (
              <>
                <p style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "2rem", color: "var(--lilac)" }} className="leading-none tabular-nums">
                  {leads.count}
                </p>
                <p className="text-[0.72rem] text-mid/70 mt-1">
                  leads {leads.latest ? `· latest ${relTime(leads.latest)} ago` : ""}
                </p>
              </>
            ) : leads?.wired && leads.error ? (
              <p className="text-[0.8rem] text-terracotta">Supabase error: {leads.error}</p>
            ) : (
              <p className="text-[0.78rem] text-mid leading-relaxed">
                Not wired. {leads?.note ?? "Add RigLog Supabase creds to enable."}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
