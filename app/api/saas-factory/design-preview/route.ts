import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import * as fsSync from "fs";
import * as pathLib from "path";
import * as globLib from "fs";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const SAAS_FACTORY = join(HOME, "verto-workspace/ops/saas-factory");

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function section(md: string, ...headings: string[]): string {
  for (const h of headings) {
    const re = new RegExp(`##\\s+${h}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, "i");
    const m = md.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

function bullets(raw: string): string[] {
  return raw.split("\n")
    .map((l) => l.replace(/^\s*[-*\d.]+\s+/, "").trim())
    .filter(Boolean);
}

function tableRows(raw: string): Array<string[]> {
  return raw.split("\n")
    .filter((l) => l.startsWith("|") && !l.match(/\|[-: ]+\|/))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((r, i) => i > 0 && r.length >= 2);
}

function b64img(filePath: string): string | null {
  try {
    if (!fsSync.existsSync(filePath)) return null;
    return fsSync.readFileSync(filePath).toString("base64");
  } catch { return null; }
}

function loadMockups(dir: string): Array<{ label: string; b64: string }> {
  const order = [
    { file: "queue.png",     label: "Ticket Queue" },
    { file: "dashboard.png", label: "Dashboard" },
    { file: "home.png",      label: "Home" },
    { file: "core-action.png", label: "Core Action" },
  ];
  const out: Array<{ label: string; b64: string }> = [];
  for (const { file, label } of order) {
    const b = b64img(join(dir, file));
    if (b) out.push({ label, b64: b });
  }
  // pick up any extras not in the named list
  const known = new Set(order.map((o) => o.file));
  if (fsSync.existsSync(dir)) {
    for (const f of fsSync.readdirSync(dir).sort()) {
      if (!f.endsWith(".png") || known.has(f)) continue;
      const b = b64img(join(dir, f));
      if (b) out.push({ label: f.replace(".png", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), b64: b });
    }
  }
  return out;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildPitchHtml(
  slug: string,
  files: Record<string, string>,
  tokens: Record<string, unknown>,
  state: Record<string, unknown>,
  mockups: Array<{ label: string; b64: string }>
): string {
  const op = files["one-pager"] ?? "";
  const db = files["design-brief"] ?? "";
  const ca = files["competitor-analysis"] ?? "";
  const ms = files["market-signal"] ?? "";
  const pt = files["product-thesis"] ?? "";

  // ── Design tokens ──
  const colors   = (tokens.colors ?? {}) as Record<string, string>;
  const typo     = (tokens.typography ?? {}) as Record<string, unknown>;
  const primaryHex = colors.primary ?? "#1C1917";
  const accentHex  = colors.accent  ?? "#16A34A";
  const surfaceHex = colors.surface ?? "#FAFAF9";
  const displayFont = String(typo.display ?? "Fraunces");
  const bodyFont    = String(typo.body    ?? "IBM Plex Sans");
  const monoFont    = String(typo.mono    ?? "IBM Plex Mono");
  const gfUrl       = String(typo.googleFontsUrl ?? "");
  const direction   = String(tokens.conceptualDirection ?? "");
  const tone        = String(tokens.emotionalTone ?? "");
  const appName     = String(tokens.appName ?? slug.replace(/-/g, " "));
  const demoData    = (tokens.demoDataSeed ?? {}) as Record<string, unknown>;

  // ── Solution pitch: emotionalTone is the pitch, direction is the concept ──
  // Primary: design-tokens solutionPitch (if present), else emotionalTone
  const solutionPitch = String((tokens as Record<string, unknown>).solutionPitch ?? tone ?? "");
  // Fallback from product-thesis
  const thesisCore = section(pt, "Thesis", "Core Bet", "What we build", "Solution");

  // ── one-pager extractions ──
  const score      = op.match(/Score:\s*(\d+)\/100/i)?.[1] ?? null;
  const problem    = section(op, "Problem");
  const targetRaw  = section(op, "Target User");
  const painRaw    = section(op, "Pain Evidence");
  const killRaw    = section(op, "Painkiller");
  const featRaw    = section(op, "Core Features");
  const archRaw    = section(op, "Architecture");
  const techRaw    = section(op, "Technical Feasibility");
  const verdict    = killRaw.match(/\*\*Verdict:\*\*\s*(\w+)/i)?.[1] ?? null;
  const targetItems = bullets(targetRaw).slice(0, 3);
  const features    = bullets(featRaw).slice(0, 5);
  const archItems   = bullets(archRaw).slice(0, 8);
  const techItems   = bullets(techRaw).slice(0, 6);
  const painRows    = tableRows(painRaw);
  const killItems   = killRaw.split("\n").filter((l) => l.trim().startsWith("- [")).slice(0, 4)
    .map((l) => ({ checked: l.includes("[x]"), text: l.replace(/^.*?\]\s*/, "").replace(/\s*\(.*$/, "").trim() }));

  // ── design brief ──
  const concept  = db.match(/\*\*Concept:\s*"([^"]+)"/)?.[1] ?? null;
  const pal: Array<{ token: string; hex: string; usage: string }> = [];
  const palRe = /\|\s*`([^`]+)`\s*\|\s*`?(#[0-9A-Fa-f]{6})`?\s*\|\s*([^|\n]*)/gi;
  let pm;
  while ((pm = palRe.exec(db)) !== null) {
    if (/dark/i.test(pm[1]) || pal.length >= 7) continue;
    pal.push({ token: pm[1], hex: pm[2], usage: pm[3].trim() });
  }
  const tiers = [
    { label: "T1 · Auto-resolve", hex: colors.tierT1 ?? "#16A34A" },
    { label: "T2 · Draft review",  hex: colors.tierT2 ?? "#D97706" },
    { label: "T3 · Escalate",      hex: colors.tierT3 ?? "#9333EA" },
    { label: "T4 · Engineering",   hex: colors.tierT4 ?? "#DC2626" },
  ];

  // ── competitor table ──
  const compRows = tableRows(section(ca, "Tier 1", "Competitive Landscape")).slice(0, 5);
  const whiteSpace = ca.match(/##\s+Whitespace[\s\S]*?\n\n([^\n#][^\n]+)/i)?.[1]?.trim() ?? "";

  // ── state ──
  const phases = (state.phases ?? {}) as Record<string, { status: string; score?: number; result?: string }>;
  const qgScore = phases.quality_gate?.score;

  // ── test layers for SaaS ──
  const buildStatus = phases.build?.status ?? "pending";
  const crStatus    = phases.code_review?.status ?? "pending";
  const qgStatus    = phases.quality_gate?.status ?? "pending";
  const crResult    = phases.code_review?.result ?? null;
  const qgResult    = phases.quality_gate?.result ?? null;

  type TestLayer = { label: string; sub: string; items: string[]; status: string };
  const testLayers: TestLayer[] = [
    {
      label: "Technical",
      sub: "TypeScript, build, lint",
      status: buildStatus === "complete" ? "pass" : "pending",
      items: ["TypeScript 0 errors (tsc --noEmit)", "Next.js build compiles clean", "ESLint 0 warnings", "All 22 API routes registered"],
    },
    {
      label: "Authentication",
      sub: "Supabase auth, session, RLS",
      status: buildStatus === "complete" ? "pass" : "pending",
      items: ["requireAuth() on all protected routes", "Supabase RLS policies per table", "Session cookie scoped correctly", "AgentMail webhook secret enforced"],
    },
    {
      label: "Backend",
      sub: "API routes, webhooks, Stripe",
      status: buildStatus === "complete" ? "pass" : "pending",
      items: ["Email inbound webhook receives + routes", "Stripe checkout + portal + webhook verified", "Entitlement gate fail-closed", "Rate limiting on AI inference route"],
    },
    {
      label: "Frontend",
      sub: "UI rendering, routing, states",
      status: buildStatus === "complete" ? "pass" : "pending",
      items: ["All 5 pages render without error", "Empty states handled everywhere", "Loading skeletons on async data", "Responsive at 1280px desktop breakpoint"],
    },
    {
      label: "UI / UX",
      sub: "Design token compliance",
      status: qgStatus === "complete" ? (qgResult === "PASS" ? "pass" : "fail") : "pending",
      items: [
        "vera-* token namespace applied throughout",
        "Fraunces + IBM Plex Sans used correctly",
        "Tier badge colors match spec (T1 green / T2 amber / T3 purple / T4 red)",
        "ConfidencePill renders in IBM Plex Mono",
        `QG Design score: ${qgScore != null ? `${qgScore}/100` : "pending"}`,
      ],
    },
  ];

  // ── Architecture section ──
  const zeroNewCost = techItems.find((t) => t.toLowerCase().includes("$0") || t.toLowerCase().includes("zero cost") || t.toLowerCase().includes("new cost"));
  const stackLine   = techItems.find((t) => /^stack:/i.test(t));
  const stackChips  = stackLine
    ? stackLine.replace(/^stack:\s*/i, "").split(/[·,+]/).map((s) => s.trim()).filter(Boolean)
    : ["Next.js 15", "Supabase", "Claude Sonnet", "Postmark", "Slack Bolt", "MCP SDK"];

  // Intake surfaces — Phase 1 (buildable in weeks) and Phase 2 (months)
  const phase1Surfaces = [
    { label: "Email",      sub: "Postmark inbound webhook → normalizer",       timeline: "live" },
    { label: "Slack bot",  sub: "Bolt SDK · message + channel + user context", timeline: "2-4w" },
    { label: "CLI",        sub: "vera / cat error.log | vera · git + env",     timeline: "1-2w" },
    { label: "MCP server", sub: "submit_ticket · check_status · search_kb",    timeline: "1-2w" },
  ];
  const phase2Surfaces = [
    { label: "Web widget",   sub: "URL · console errors · network fails · user actions", timeline: "4-6w" },
    { label: "Teams bot",    sub: "Enterprise internal desks · same as Slack",           timeline: "3-5w" },
    { label: "Browser ext.", sub: "DOM · console · network · auto-screenshot",           timeline: "4-8w" },
    { label: "Mobile SDK",   sub: "Crash logs · session · device context",               timeline: "4-12m" },
  ];

  // Core pipeline steps
  const pipelineSteps = [
    { step: "Normalize", detail: "any surface → { source, user, context, workspace_id }" },
    { step: "Classify",  detail: "intent · urgency · product · bug vs question vs request" },
    { step: "Retrieve",  detail: "KB + correction memory via pgvector (per workspace)" },
    { step: "Reason",    detail: "Claude Sonnet multi-step: assess → draft → confidence score" },
    { step: "Gate",      detail: "T1 ≥85% auto-send · T2 draft review · T3 escalate · T4 alert" },
  ];

  function surfaceRow(s: { label: string; sub: string; timeline: string }, phase: 1 | 2) {
    const isPhase1 = phase === 1;
    const tc = isPhase1 ? accentHex : "#D97706";
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f0ece6">
      <div style="width:52px;flex-shrink:0">
        <span style="font-family:'${monoFont}',monospace;font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:4px;background:${tc}15;color:${tc};border:1px solid ${tc}25">${esc(s.timeline)}</span>
      </div>
      <div style="min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:#1C1917">${esc(s.label)}</div>
        <div style="font-family:'${monoFont}',monospace;font-size:10px;color:#78716C;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.sub)}</div>
      </div>
    </div>`;
  }

  const archSectionHtml = `
<div class="section">
  <div class="section-label">05 — Architecture &amp; Stack</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:14px">

    <!-- Intake surfaces Phase 1 -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px 18px">
      <div class="design-card-label" style="margin-bottom:2px">Intake — Phase 1</div>
      <div style="font-family:'${monoFont}',monospace;font-size:10px;color:${accentHex};margin-bottom:10px">Buildable in weeks</div>
      ${phase1Surfaces.map((s) => surfaceRow(s, 1)).join("")}
    </div>

    <!-- Intake surfaces Phase 2 -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px 18px">
      <div class="design-card-label" style="margin-bottom:2px">Intake — Phase 2</div>
      <div style="font-family:'${monoFont}',monospace;font-size:10px;color:#D97706;margin-bottom:10px">Context-rich surfaces</div>
      ${phase2Surfaces.map((s) => surfaceRow(s, 2)).join("")}
    </div>

    <!-- Core pipeline -->
    <div style="background:${primaryHex};color:#FAFAF9;border-radius:10px;padding:16px 18px">
      <div style="font-family:'${monoFont}',monospace;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;opacity:0.5;margin-bottom:14px">Resolution Pipeline</div>
      ${pipelineSteps.map((s, i) => `
        <div style="display:flex;flex-direction:column">
          <div style="display:flex;align-items:flex-start;gap:9px">
            <div style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-family:'${monoFont}',monospace;font-size:9px;font-weight:700;color:rgba(255,255,255,0.65);flex-shrink:0;margin-top:1px">${i + 1}</div>
            <div>
              <div style="font-size:11.5px;font-weight:600;color:#FAFAF9;line-height:1.3">${esc(s.step)}</div>
              <div style="font-family:'${monoFont}',monospace;font-size:9.5px;color:rgba(255,255,255,0.45);line-height:1.4;margin-top:1px">${esc(s.detail)}</div>
            </div>
          </div>
          ${i < pipelineSteps.length - 1 ? `<div style="width:1px;height:8px;background:rgba(255,255,255,0.12);margin-left:9px;margin-top:3px;margin-bottom:3px"></div>` : ""}
        </div>`).join("")}
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;flex-wrap:wrap;gap:5px">
        ${stackChips.map((c) => `<span style="font-family:'${monoFont}',monospace;font-size:9.5px;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.1)">${esc(c)}</span>`).join("")}
      </div>
    </div>

  </div>
  <div style="padding:11px 16px;background:rgba(22,163,74,0.05);border:1px solid rgba(22,163,74,0.18);border-radius:8px;font-size:12.5px;color:#166534">
    💡 All surfaces normalise to the same context object — the resolution pipeline never changes regardless of intake channel. Email is the universal fallback; Slack is the highest-value near-term surface for internal service desks.
  </div>
</div>`;

  // ── Design tokens for layout preview ──
  const layoutArchetype  = String((tokens as Record<string,unknown>).layoutArchetype ?? "sidebar-nav");
  const borderRadiusPx   = String(((tokens as Record<string,unknown>).layout as Record<string,unknown>)?.borderRadius ?? "8px");
  const sidebarWidthPx   = String(((tokens as Record<string,unknown>).layout as Record<string,unknown>)?.sidebarWidth ?? "200px");
  const surfaceAltHex    = colors.surfaceAlt ?? "#F5F4F2";
  const surfaceBorderHex = colors.surfaceBorder ?? colors.border ?? "#E7E5E4";
  const textHex          = colors.text ?? "#1C1917";
  const textMutedHex     = colors.textMuted ?? "#78716C";
  const successHex       = colors.success ?? "#16A34A";
  const warningHex       = colors.warning ?? "#D97706";
  const errorHex         = colors.error   ?? "#DC2626";
  const keyScreens       = ((tokens as Record<string,unknown>).keyScreens as string[]) ?? [];
  const monoStyle        = `font-family:'${monoFont}',monospace`;
  const displayStyle     = `font-family:'${displayFont}',serif`;
  const bodyStyle        = `font-family:'${bodyFont}',sans-serif`;

  // ── CSS Layout Preview (renders when no Stitch PNGs are available) ──
  function buildCssLayoutPreview(): string {
    // Nav labels: use keyScreens from tokens or sensible defaults
    const navItems = (keyScreens.length >= 3 ? keyScreens.slice(0, 5) : ["Dashboard", "Inbox", "Analytics", "Integrations", "Settings"]);
    const [nav0, nav1, nav2, nav3, nav4] = navItems;

    // Shared mini-component snippets
    const btn = (label: string, variant: "primary"|"secondary") => variant === "primary"
      ? `<button style="padding:7px 14px;border-radius:${borderRadiusPx};background:${primaryHex};color:#fff;border:none;font-size:12px;${bodyStyle};font-weight:500;cursor:pointer">${esc(label)}</button>`
      : `<button style="padding:7px 14px;border-radius:${borderRadiusPx};background:transparent;color:${primaryHex};border:1px solid ${primaryHex};font-size:12px;${bodyStyle};font-weight:500;cursor:pointer">${esc(label)}</button>`;

    const badge = (label: string, color: string) =>
      `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:${color}18;color:${color};border:1px solid ${color}30;${monoStyle}">${esc(label)}</span>`;

    const metricCard = (label: string, value: string, delta?: string) =>
      `<div style="background:#fff;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};padding:12px 14px;border-top:2px solid ${primaryHex}">
        <div style="font-size:10px;${monoStyle};color:${textMutedHex};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">${esc(label)}</div>
        <div style="font-size:20px;font-weight:700;color:${textHex};${displayStyle};line-height:1">${esc(value)}</div>
        ${delta ? `<div style="font-size:10px;${monoStyle};color:${successHex};margin-top:4px">${esc(delta)}</div>` : ""}
      </div>`;

    const tableRow = (label: string, sub: string, statusColor: string, statusLabel: string) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid ${surfaceBorderHex};font-size:12px">
        <div>
          <div style="color:${textHex};font-weight:500;${bodyStyle}">${esc(label)}</div>
          <div style="color:${textMutedHex};font-size:10px;${monoStyle};margin-top:1px">${esc(sub)}</div>
        </div>
        ${badge(statusLabel, statusColor)}
      </div>`;

    const sidebar = `
      <div style="width:${sidebarWidthPx};flex-shrink:0;background:${primaryHex};display:flex;flex-direction:column;padding:14px 10px;gap:2px">
        <div style="${displayStyle};font-size:13px;font-weight:700;color:#fff;padding:4px 10px;margin-bottom:10px;opacity:0.95">${esc(appName)}</div>
        ${[nav0,nav1,nav2,nav3,nav4].filter(Boolean).map((label, i) =>
          `<div style="padding:7px 10px;border-radius:6px;font-size:12px;${bodyStyle};${i===0 ? `background:rgba(255,255,255,0.15);color:#fff;font-weight:500` : `color:rgba(255,255,255,0.6)`}">${esc(label ?? "")}</div>`
        ).join("")}
      </div>`;

    const contentHeader = `
      <div style="height:44px;border-bottom:1px solid ${surfaceBorderHex};padding:0 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#fff">
        <div style="${displayStyle};font-size:15px;font-weight:600;color:${textHex}">${esc(nav0 ?? "Dashboard")}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:24px;height:24px;border-radius:50%;background:${primaryHex};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;${bodyStyle};font-weight:600">M</div>
        </div>
      </div>`;

    const metricsGrid = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        ${metricCard("Active", "1,248", "↑ 12% this week")}
        ${metricCard("Resolved", "847", "↑ 8%")}
        ${metricCard("Pending", "43")}
      </div>`;

    const tableSection = `
      <div style="background:#fff;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};overflow:hidden">
        <div style="padding:10px 12px;border-bottom:1px solid ${surfaceBorderHex};display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;font-weight:600;color:${textHex};${bodyStyle}">Recent Items</div>
          ${btn("New", "primary")}
        </div>
        ${tableRow("Item alpha-291", "2 min ago · Auto-classified", successHex, "resolved")}
        ${tableRow("Item beta-447", "15 min ago · Awaiting review", warningHex, "pending")}
        ${tableRow("Item gamma-103", "1 hr ago · Escalated", errorHex, "escalated")}
      </div>`;

    let layoutHtml = "";

    if (layoutArchetype === "sidebar-nav" || layoutArchetype === "sidebar") {
      layoutHtml = `
        <div style="display:flex;height:340px;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};overflow:hidden;${bodyStyle}">
          ${sidebar}
          <div style="flex:1;display:flex;flex-direction:column;background:${surfaceAltHex};min-width:0">
            ${contentHeader}
            <div style="padding:14px;overflow:hidden">
              ${metricsGrid}
              ${tableSection}
            </div>
          </div>
        </div>`;

    } else if (layoutArchetype === "top-nav" || layoutArchetype === "topnav") {
      layoutHtml = `
        <div style="border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};overflow:hidden;${bodyStyle}">
          <div style="height:48px;background:${primaryHex};padding:0 20px;display:flex;align-items:center;justify-content:space-between">
            <div style="${displayStyle};font-size:14px;font-weight:700;color:#fff">${esc(appName)}</div>
            <div style="display:flex;gap:0">
              ${[nav0,nav1,nav2].filter(Boolean).map((label, i) =>
                `<div style="padding:0 14px;height:48px;display:flex;align-items:center;font-size:12px;${bodyStyle};${i===0 ? `color:#fff;border-bottom:2px solid ${accentHex}` : `color:rgba(255,255,255,0.6)`}">${esc(label??'')}</div>`
              ).join("")}
            </div>
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;${bodyStyle}">M</div>
          </div>
          <div style="background:${surfaceAltHex};padding:20px">
            ${metricsGrid}
            ${tableSection}
          </div>
        </div>`;

    } else if (layoutArchetype === "two-panel" || layoutArchetype === "split") {
      layoutHtml = `
        <div style="display:flex;height:340px;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};overflow:hidden;${bodyStyle}">
          <div style="width:260px;flex-shrink:0;border-right:1px solid ${surfaceBorderHex};background:#fff;display:flex;flex-direction:column">
            <div style="height:44px;border-bottom:1px solid ${surfaceBorderHex};padding:0 14px;display:flex;align-items:center;${displayStyle};font-size:14px;font-weight:600;color:${textHex}">${esc(nav0??'Queue')}</div>
            ${["Item alpha-291", "Item beta-447", "Item gamma-103", "Item delta-018", "Item epsilon-776"].map((label, i) =>
              `<div style="padding:10px 14px;border-bottom:1px solid ${surfaceBorderHex};${i===1 ? `background:${primaryHex}10;border-left:2px solid ${primaryHex}` : ''}">
                <div style="font-size:12px;font-weight:500;color:${textHex};${bodyStyle}">${esc(label)}</div>
                <div style="font-size:10px;${monoStyle};color:${textMutedHex};margin-top:2px">${i===0?'2 min ago':i===1?'15 min ago · Selected':i===2?'1 hr ago':i===3?'3 hr ago':'Yesterday'}</div>
              </div>`
            ).join("")}
          </div>
          <div style="flex:1;display:flex;flex-direction:column;background:${surfaceAltHex}">
            ${contentHeader}
            <div style="padding:16px">
              <div style="background:#fff;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};padding:16px;margin-bottom:12px">
                <div style="${displayStyle};font-size:15px;font-weight:600;color:${textHex};margin-bottom:6px">Item beta-447</div>
                <div style="font-size:12px;color:${textMutedHex};${bodyStyle};line-height:1.6;margin-bottom:12px">Inbound request received 15 minutes ago. Classified with 94% confidence. Awaiting human review before proceeding.</div>
                <div style="display:flex;gap:8px">${btn("Approve","primary")}${btn("Escalate","secondary")}</div>
              </div>
            </div>
          </div>
        </div>`;

    } else {
      // card-grid / canvas / fallback
      layoutHtml = `
        <div style="border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};overflow:hidden;${bodyStyle}">
          <div style="height:44px;background:${primaryHex};padding:0 16px;display:flex;align-items:center;justify-content:space-between">
            <div style="${displayStyle};font-size:14px;font-weight:700;color:#fff">${esc(appName)}</div>
            ${btn("New","primary")}
          </div>
          <div style="padding:16px;background:${surfaceAltHex};display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            ${[nav0,nav1,nav2].filter(Boolean).map((label) =>
              `<div style="background:#fff;border:1px solid ${surfaceBorderHex};border-radius:${borderRadiusPx};padding:16px;border-top:3px solid ${primaryHex}">
                <div style="${monoStyle};font-size:10px;color:${textMutedHex};text-transform:uppercase;margin-bottom:6px">${esc(label??'')}</div>
                <div style="${displayStyle};font-size:24px;font-weight:700;color:${textHex}">—</div>
              </div>`
            ).join("")}
          </div>
        </div>`;
    }

    // Design system panel: palette + typography + component samples
    const allColors = [
      { label: "Primary",    hex: primaryHex },
      { label: "Accent",     hex: accentHex  },
      { label: "Surface",    hex: surfaceHex },
      { label: "Surface Alt",hex: surfaceAltHex },
      { label: "Success",    hex: successHex },
      { label: "Warning",    hex: warningHex },
      { label: "Error",      hex: errorHex   },
    ];

    const paletteHtml = allColors.map(({ label, hex }) =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0ece6">
        <div style="width:20px;height:20px;border-radius:4px;flex-shrink:0;background:${hex};border:1px solid rgba(0,0,0,0.08)"></div>
        <div style="font-size:11px;${monoStyle};color:${textMutedHex}">${esc(hex)}</div>
        <div style="font-size:11px;${bodyStyle};color:${textHex};margin-left:auto">${esc(label)}</div>
      </div>`
    ).join("");

    const typoHtml = `
      <div style="padding:10px 0;border-bottom:1px solid #f0ece6">
        <div style="font-size:10px;${monoStyle};color:${textMutedHex};margin-bottom:3px">DISPLAY · ${esc(displayFont)}</div>
        <div style="${displayStyle};font-size:18px;font-weight:600;color:${textHex}">The quick brown fox</div>
      </div>
      <div style="padding:10px 0;border-bottom:1px solid #f0ece6">
        <div style="font-size:10px;${monoStyle};color:${textMutedHex};margin-bottom:3px">BODY · ${esc(bodyFont)}</div>
        <div style="${bodyStyle};font-size:13px;color:${textHex}">Readable body text at 13–15px with good line height.</div>
      </div>
      <div style="padding:10px 0">
        <div style="font-size:10px;${monoStyle};color:${textMutedHex};margin-bottom:3px">MONO · ${esc(monoFont)}</div>
        <div style="${monoStyle};font-size:12px;color:${textMutedHex}">id_291 · 2026-03-20 · 94%</div>
      </div>`;

    const componentsHtml = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${btn("Primary", "primary")}
        ${btn("Secondary", "secondary")}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${badge("resolved", successHex)}
        ${badge("pending", warningHex)}
        ${badge("escalated", errorHex)}
        ${badge("draft", primaryHex)}
      </div>`;

    return `
<div class="section">
  <div class="section-label">06 — Design Preview</div>
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;align-items:start">

    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:18px 20px">
      <div class="design-card-label" style="margin-bottom:12px">Palette</div>
      ${paletteHtml}
      <div class="design-card-label" style="margin-top:16px;margin-bottom:10px">Typography</div>
      ${typoHtml}
      <div class="design-card-label" style="margin-top:16px;margin-bottom:10px">Components</div>
      ${componentsHtml}
    </div>

    <div>
      <div style="font-size:10px;${monoStyle};color:var(--mid);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Layout · ${esc(layoutArchetype)}</div>
      ${layoutHtml}
    </div>

  </div>
</div>`;
  }

  // ── Screen mockups OR CSS layout preview ──
  const mockupsHtml = mockups.length > 0 ? `
<div class="section">
  <div class="section-label">06 — Screen Mockups</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:24px">
    ${mockups.map((m) => `
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <img src="data:image/png;base64,${m.b64}" alt="${esc(m.label)}" style="width:100%;display:block;border-bottom:1px solid var(--border)"/>
        <div style="padding:10px 14px;font-family:'${monoFont}',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--mid)">${esc(m.label)}</div>
      </div>`).join("")}
  </div>
</div>` : buildCssLayoutPreview();

  // ── test layers section ──
  const testLayersHtml = `
<div class="section">
  <div class="section-label">09 — Test Layers</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
    ${testLayers.map((layer) => {
      const statusColor = layer.status === "pass" ? "#16A34A" : layer.status === "fail" ? "#DC2626" : "#78716C";
      const statusBg = layer.status === "pass" ? "rgba(22,163,74,0.07)" : layer.status === "fail" ? "rgba(220,38,38,0.07)" : "rgba(0,0,0,0.02)";
      const statusBorder = layer.status === "pass" ? "rgba(22,163,74,0.25)" : layer.status === "fail" ? "rgba(220,38,38,0.25)" : "var(--border)";
      const statusLabel = layer.status === "pass" ? "PASS" : layer.status === "fail" ? "FAIL" : "PENDING";
      return `
      <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:10px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-family:'${displayFont}',serif;font-size:16px;font-weight:600;color:var(--ink)">${esc(layer.label)}</div>
            <div style="font-family:'${monoFont}',monospace;font-size:10.5px;color:var(--mid);margin-top:2px">${esc(layer.sub)}</div>
          </div>
          <span style="font-family:'${monoFont}',monospace;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${statusColor}18;color:${statusColor}">${statusLabel}</span>
        </div>
        <div style="space-y:4px">
          ${layer.items.map((item) => `
            <div style="display:flex;gap:7px;padding:3px 0;font-size:12.5px;color:#374151;align-items:flex-start">
              <span style="color:${layer.status === "pass" ? "#16A34A" : "#A8A29E"};flex-shrink:0;margin-top:1px">${layer.status === "pass" ? "✓" : "○"}</span>
              <span>${esc(item)}</span>
            </div>`).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>
</div>`;

  // ── palette swatches ──
  const swatchesHtml = pal.slice(0, 6).map((p) => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f0ece6">
      <div style="width:22px;height:22px;border-radius:6px;flex-shrink:0;border:1px solid rgba(0,0,0,0.08);background:${p.hex}"></div>
      <div><code style="font-size:11px">${esc(p.token)}</code><span style="font-size:11px;color:#78716C;margin-left:6px">${p.hex}</span></div>
    </div>`).join("");

  const tiersHtml = tiers.map((t) =>
    `<span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${t.hex}18;color:${t.hex};border:1px solid ${t.hex}30">${esc(t.label)}</span>`
  ).join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(appName)} — Design Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
${gfUrl ? `<link href="${gfUrl}" rel="stylesheet">` : `<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`}
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --primary: ${primaryHex}; --accent: ${accentHex}; --surface: ${surfaceHex}; --ink: #1C1917; --mid: #78716C; --border: #E7E5E4; }
html { background: var(--surface); color-scheme: light; }
body { font-family: '${bodyFont}', system-ui, sans-serif; background: var(--surface); color: var(--ink); font-size: 15px; line-height: 1.65; }

.hero { background: var(--primary); color: #FAFAF9; padding: 48px 56px 40px; }
.hero-tag { font-family: '${monoFont}',monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.55; margin-bottom: 12px; }
.hero-name { font-family: '${displayFont}',serif; font-size: 52px; font-weight: 700; line-height: 1.05; letter-spacing: -1px; margin-bottom: 8px; }
.hero-direction { font-size: 14px; opacity: 0.65; font-family: '${monoFont}',monospace; margin-bottom: 14px; }
.hero-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.badge { font-family: '${monoFont}',monospace; font-size: 11px; padding: 4px 12px; border-radius: 20px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.14); }
.badge.pass { background: rgba(22,163,74,0.3); color: #4ade80; border-color: rgba(22,163,74,0.35); }

.wrap { max-width: 900px; margin: 0 auto; padding: 48px 56px 80px; }
.section { margin-bottom: 52px; }
.section-label { font-family: '${monoFont}',monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--mid); margin-bottom: 18px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

p { margin-bottom: 10px; color: #374151; }
strong { font-weight: 600; color: var(--ink); }
code { font-family: '${monoFont}',monospace; font-size: 12px; background: rgba(0,0,0,0.06); border-radius: 4px; padding: 1px 5px; }

.problem-text { font-size: 16px; line-height: 1.75; color: var(--ink); }

.target-item { display: flex; gap: 8px; font-size: 13.5px; color: #374151; padding: 4px 0; }
.target-item::before { content: "→"; color: var(--accent); font-weight: 600; flex-shrink: 0; }

.solution-box { background: var(--primary); color: #FAFAF9; border-radius: 12px; padding: 22px 26px; margin-top: 6px; }
.solution-box .label { font-family: '${monoFont}',monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.5; margin-bottom: 8px; }
.solution-box .text { font-family: '${displayFont}',serif; font-size: 18px; line-height: 1.55; font-style: italic; opacity: 0.95; }

.pain-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0ece6; }
.pain-source { font-family: '${monoFont}',monospace; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); min-width: 140px; flex-shrink: 0; padding-top: 1px; }
.pain-sig { font-size: 13px; color: #374151; }

.kill-item { display: flex; gap: 8px; padding: 6px 0; font-size: 13px; color: #374151; }
.kill-icon { flex-shrink: 0; margin-top: 1px; }
.verdict-pill { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px; padding: 9px 18px; border-radius: 8px; background: rgba(22,163,74,0.08); border: 1px solid rgba(22,163,74,0.25); font-family: '${monoFont}',monospace; font-size: 12px; font-weight: 600; color: #16A34A; letter-spacing: 0.06em; }

.feature-grid { display: flex; flex-direction: column; gap: 10px; }
.feature-item { display: flex; gap: 12px; align-items: flex-start; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.feature-num { width: 22px; height: 22px; border-radius: 50%; background: var(--primary); color: #FAFAF9; font-family: '${monoFont}',monospace; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.feature-text { font-size: 13.5px; color: #374151; }
.feature-text strong { color: var(--ink); }

.design-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.design-card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
.design-card-label { font-family: '${monoFont}',monospace; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mid); margin-bottom: 12px; }
.concept-box { background: var(--primary); color: #FAFAF9; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
.concept-box .tag { font-family: '${monoFont}',monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.5; margin-bottom: 6px; }
.concept-box .name { font-family: '${displayFont}',serif; font-size: 22px; font-weight: 600; }

@media (max-width: 640px) { .design-grid { grid-template-columns: 1fr; } .wrap { padding: 28px 20px 60px; } .hero { padding: 32px 20px 28px; } .hero-name { font-size: 36px; } }
</style>
</head>
<body>

<!-- Hero -->
<div class="hero">
  <div class="hero-tag">SaaS Design Review · ${esc(slug)}</div>
  <div class="hero-name">${esc(appName)}</div>
  ${direction ? `<div class="hero-direction">${esc(direction.slice(0, 120))}…</div>` : ""}
  <div class="hero-badges">
    <span class="badge">B2B SaaS</span>
    ${score ? `<span class="badge">Score ${esc(score)}/100</span>` : ""}
    ${verdict ? `<span class="badge${verdict.toUpperCase() === "PAINKILLER" ? " pass" : ""}">${esc(verdict)}</span>` : ""}
    ${qgScore != null ? `<span class="badge pass">QG ${qgScore}/100</span>` : ""}
  </div>
</div>

<div class="wrap">

  <!-- 01 Problem + Target + Solution -->
  <div class="section">
    <div class="section-label">01 — Executive Summary</div>

    ${problem ? `
    <div style="margin-bottom:20px">
      <div style="font-family:'${monoFont}',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--mid);margin-bottom:8px">The Problem</div>
      <p class="problem-text">${inline(problem.split("\n\n")[0])}</p>
    </div>` : ""}

    ${targetItems.length > 0 ? `
    <div style="margin-bottom:20px">
      <div style="font-family:'${monoFont}',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--mid);margin-bottom:8px">Target User</div>
      ${targetItems.map((t) => `<div class="target-item">${inline(t)}</div>`).join("")}
    </div>` : ""}

    ${solutionPitch || thesisCore ? `
    <div class="solution-box">
      <div class="label">The Solution</div>
      <div class="text">${esc(solutionPitch || thesisCore)}</div>
    </div>` : ""}
  </div>

  <!-- 02 Pain Evidence -->
  ${painRows.length > 0 ? `
  <div class="section">
    <div class="section-label">02 — Pain Evidence</div>
    ${painRows.map(([src, sig]) => `
      <div class="pain-item">
        <div class="pain-source">${esc(src)}</div>
        <div class="pain-sig">${inline(sig)}</div>
      </div>`).join("")}
  </div>` : ""}

  <!-- 03 Painkiller Test -->
  ${killItems.length > 0 ? `
  <div class="section">
    <div class="section-label">03 — Painkiller Test</div>
    ${killItems.map((k) => `
      <div class="kill-item">
        <span class="kill-icon">${k.checked ? "✅" : "⬜"}</span>
        <span>${inline(k.text)}</span>
      </div>`).join("")}
    ${verdict ? `<div class="verdict-pill">Verdict: ${esc(verdict)}</div>` : ""}
  </div>` : ""}

  <!-- 04 Core Features -->
  ${features.length > 0 ? `
  <div class="section">
    <div class="section-label">04 — Core Features</div>
    <div class="feature-grid">
      ${features.map((f, i) => {
        const parts = f.match(/^(.+?)\s*[—–]\s*(.+)$/);
        return `<div class="feature-item">
          <div class="feature-num">${i + 1}</div>
          <div class="feature-text">${parts
            ? `<strong>${esc(parts[1])}</strong> — ${inline(parts[2])}`
            : inline(f)}
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>` : ""}

  <!-- 05 Architecture & Stack -->
  ${archSectionHtml}

  <!-- 06 Stitch Screen Mockups -->
  ${mockupsHtml}

  <!-- 07 Competitor Landscape -->
  <div class="section">
    <div class="section-label">07 — Competitor Landscape</div>
    ${compRows.length > 0 ? `
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:rgba(0,0,0,0.03)">
          ${["Competitor","Pricing","Weakness"].map((h) => `<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--mid);border-bottom:1px solid var(--border)">${h}</th>`).join("")}
        </tr></thead>
        <tbody>${compRows.map(([c, p, w]) => `
          <tr style="border-bottom:1px solid rgba(0,0,0,0.04)">
            <td style="padding:9px 14px;font-weight:600;color:var(--ink)">${esc(c)}</td>
            <td style="padding:9px 14px;color:var(--mid);font-family:'${monoFont}',monospace;font-size:12px">${esc(p)}</td>
            <td style="padding:9px 14px;color:#374151">${inline(w)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${whiteSpace ? `<div style="margin-top:14px;padding:12px 16px;background:rgba(22,163,74,0.06);border:1px solid rgba(22,163,74,0.2);border-radius:8px;font-size:13.5px;color:#166534">💡 ${inline(whiteSpace)}</div>` : ""}` : ""}
  </div>

  <!-- 08 Design Direction -->
  <div class="section">
    <div class="section-label">08 — Design Direction</div>
    ${concept ? `<div class="concept-box"><div class="tag">Aesthetic Concept</div><div class="name">"${esc(concept)}"</div></div>` : ""}
    <div class="design-grid">
      <div class="design-card">
        <div class="design-card-label">Color Palette</div>
        ${swatchesHtml}
        <div style="margin-top:14px">
          <div class="design-card-label" style="margin-bottom:8px">Escalation Tiers</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${tiersHtml}</div>
        </div>
      </div>
      <div class="design-card">
        <div class="design-card-label">Typography</div>
        <div style="font-family:'${displayFont}',serif;font-size:30px;font-weight:700;color:var(--ink);line-height:1.1;margin-bottom:4px">${esc(appName)}</div>
        <div style="font-family:'${monoFont}',monospace;font-size:11px;color:var(--mid)">Display · ${esc(displayFont)}</div>
        <div style="font-family:'${bodyFont}',sans-serif;font-size:14px;color:#374151;margin-top:10px">Body text in ${esc(bodyFont)}</div>
        <div style="font-family:'${monoFont}',monospace;font-size:12px;color:#374151;margin-top:6px">94% · Mono labels in ${esc(monoFont)}</div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div class="design-card-label" style="margin-bottom:6px">No Mascot</div>
          <div style="font-size:12px;color:var(--mid)">B2B product. Warmth comes from typography and copy voice.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 08 Test Layers -->
  ${testLayersHtml}

</div>
</body>
</html>`;
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const dir = join(SAAS_FACTORY, slug);

  async function read(file: string) {
    try { return await readFile(join(dir, file), "utf-8"); } catch { return ""; }
  }

  const [opMd, dbMd, caMd, msMd, ptMd, tokensRaw, stateRaw] = await Promise.all([
    read("one-pager.md"),
    read("design-brief.md"),
    read("competitor-analysis.md"),
    read("market-signal.md"),
    read("product-thesis.md"),
    read("design-tokens.json"),
    read("state.json"),
  ]);

  let tokens: Record<string, unknown> = {};
  let state: Record<string, unknown> = {};
  try { tokens = JSON.parse(tokensRaw); } catch { /* ok */ }
  try { state = JSON.parse(stateRaw); } catch { /* ok */ }

  if (!dbMd && !opMd) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:48px;background:#FAFAF9;color:#1c1917"><h2>No design brief found for <strong>${slug}</strong></h2></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const mockups = loadMockups(join(dir, "mockups"));
  const html = buildPitchHtml(slug, { "one-pager": opMd, "design-brief": dbMd, "competitor-analysis": caMd, "market-signal": msMd, "product-thesis": ptMd }, tokens, state, mockups);

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
