import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { resolveFactoryDir } from "@/app/lib/factory-paths";

// ── Visual-spec discovery ─────────────────────────────────────────────────────

type Screen = { file: string; title: string };

async function loadVisualSpecScreens(specDir: string): Promise<Screen[]> {
  let entries: string[];
  try {
    entries = await readdir(specDir);
  } catch {
    return [];
  }

  // Try to read index.html and parse ordering from screen-card hrefs
  let ordered: string[] = [];
  try {
    const idx = await readFile(join(specDir, "index.html"), "utf-8");
    const re = /class="screen-card"\s+href="([^"]+\.html)"/g;
    for (const m of idx.matchAll(re)) ordered.push(m[1]);
  } catch { /* no index */ }

  const candidates = entries.filter(
    (f) => f.endsWith(".html") && f !== "index.html",
  );

  // Use index ordering when available; otherwise alphabetical
  const final = (ordered.length ? ordered.filter((f) => candidates.includes(f)) : candidates.sort());

  const screens: Screen[] = [];
  for (const file of final) {
    let title = file.replace(/\.html$/, "").replace(/[-_]/g, " ");
    try {
      const html = await readFile(join(specDir, file), "utf-8");
      const t = html.match(/<title>([^<]+)<\/title>/i)?.[1];
      if (t) {
        // Strip a leading "AppName — " prefix if present
        title = t.replace(/^[^—–-]+[—–-]\s*/, "").replace(/&amp;/g, "&").trim();
      }
    } catch { /* keep filename-derived title */ }
    screens.push({ file, title });
  }
  return screens;
}

function buildScreensSection(slug: string, screens: Screen[]): string {
  if (!screens.length) return "";
  const tiles = screens.map((s) => `
    <a class="screen-tile" href="/api/factory/${slug}/visual-spec/${s.file}" target="_blank" rel="noopener">
      <div class="screen-frame">
        <iframe
          src="/api/factory/${slug}/visual-spec/${s.file}"
          loading="lazy"
          scrolling="no"
          title="${s.title}"
        ></iframe>
      </div>
      <div class="screen-meta">
        <div class="screen-title">${s.title}</div>
        <div class="screen-file">${s.file} ↗</div>
      </div>
    </a>`).join("");

  return `
<div class="screens-block">
  <div class="block-eyebrow">Screen Prototypes — actual mockups</div>
  <div class="screens-grid">
    ${tiles}
  </div>
  <p class="screens-hint">Tiles render the live HTML mockups. Click any tile to open it full-size.</p>
</div>`;
}

// ── Token extraction ──────────────────────────────────────────────────────────

function col(md: string, token: string): string | null {
  // Match both bare hex (#XXXXXX) and backtick-wrapped hex (`#XXXXXX`)
  return md.match(new RegExp("`" + token + "`\\s*\\|\\s*`?(#[0-9A-Fa-f]{6})`?", "i"))?.[1] ?? null;
}

function extractTokens(md: string) {
  return {
    primary:     col(md, "primary")          ?? "#555555",
    accent:      col(md, "accent")           ?? null,
    surface:     col(md, "surface")          ?? "#FAFAF9",
    surfaceEl:   col(md, "surfaceElevated")  ?? "#FFFFFF",
    ink:         col(md, "text")             ?? "#111111",
    mid:         col(md, "textSecondary")    ?? "#888888",
    border:      col(md, "border")           ?? "#E0E0E0",
    success:     col(md, "success")          ?? "#22C55E",
  };
}

function extractFonts(md: string) {
  const display = md.match(/\|\s*Display\s*\|\s*([A-Za-z][A-Za-z ]*?)\s*\|/)?.[1]?.trim() ?? "DM Sans";
  const body    = md.match(/\|\s*Body\s*\|\s*([A-Za-z][A-Za-z ]*?)\s*\|/)?.[1]?.trim()    ?? "DM Sans";
  return { display, body };
}

function extractPalette(md: string): Array<{ token: string; hex: string; usage: string }> {
  const re = /\|\s*`([^`]+)`\s*\|\s*`?(#[0-9A-Fa-f]{6})`?\s*\|\s*([^|\n]*)/gi;
  const out: Array<{ token: string; hex: string; usage: string }> = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    const token = m[1];
    if (/dark/i.test(token)) continue;
    out.push({ token, hex: m[2], usage: m[3].trim() });
    if (out.length >= 10) break;
  }
  return out;
}

function extractTabs(md: string): string[] {
  const nav = md.match(/### Navigation[\s\S]*?(?=\n###|\n##|$)/)?.[0] ?? "";
  const inline = nav.match(/\d+ tabs[^—–\n]*[—–]\s*([^\n]+)/i)?.[1] ?? "";
  const names = [...inline.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (names.length >= 2) return names.slice(0, 4);
  return ["Home", "Search", "Activity", "Profile"];
}

function sampleItems(md: string, appName: string) {
  const cat = (md.match(/\*\*Category\*\*:\s*([^\n(]+)/)?.[1] ?? "").toLowerCase();
  if (cat.includes("productiv") || cat.includes("task") || cat.includes("list")) {
    return { title: "My Lists", rows: [
      { label: "Grocery run",     sub: "4 items · Today",       done: false },
      { label: "Weekend chores",  sub: "7 items · Saturday",    done: false },
      { label: "Work errands",    sub: "2 items · Done",        done: true  },
    ]};
  }
  if (cat.includes("health") || cat.includes("fitness") || cat.includes("food") || cat.includes("nutrition") || cat.includes("diet")) {
    return { title: "Today", rows: [
      { label: "Morning run",   sub: "5.2 km · 28 min",    done: true  },
      { label: "Log breakfast", sub: "Add meal · Pending", done: false },
      { label: "Water intake",  sub: "6 / 8 glasses",      done: false },
    ]};
  }
  if (cat.includes("habit") || cat.includes("track") || cat.includes("routine") || cat.includes("streak")) {
    return { title: "Today's Habits", rows: [
      { label: "Morning meditation", sub: "10 min · Streak: 8",  done: true  },
      { label: "Read 20 pages",      sub: "Reading · Pending",   done: false },
      { label: "Evening walk",       sub: "20 min · Not done",   done: false },
    ]};
  }
  if (cat.includes("finance") || cat.includes("budget") || cat.includes("money") || cat.includes("expense")) {
    return { title: "Overview", rows: [
      { label: "Monthly budget",  sub: "$1,240 remaining", done: false },
      { label: "Groceries",       sub: "$180 spent",       done: false },
      { label: "Transport",       sub: "$95 · on track",   done: true  },
    ]};
  }
  if (cat.includes("learn") || cat.includes("study") || cat.includes("code") || cat.includes("skill")) {
    return { title: "Learning", rows: [
      { label: "Intro module",    sub: "Module 2 · 45%",   done: false },
      { label: "Core concepts",   sub: "Completed",        done: true  },
      { label: "Practice project",sub: "Upcoming",         done: false },
    ]};
  }
  // Generic fallback
  return { title: "Home", rows: [
    { label: appName,             sub: "Getting started",   done: false },
    { label: "Your first item",   sub: "Tap to edit",       done: false },
    { label: "Welcome",           sub: "Setup complete",    done: true  },
  ]};
}

// ── Impression HTML ───────────────────────────────────────────────────────────

function buildImpression(appName: string, md: string): string {
  const t      = extractTokens(md);
  const fonts  = extractFonts(md);
  const pal    = extractPalette(md);
  const tabs   = extractTabs(md);
  const screen = sampleItems(md, appName);
  const fab    = t.accent ?? t.primary;

  const hasMascot  = /\*\*Decision\*\*:\s*YES/i.test(md);
  const mascotName = md.match(/- \*\*Name\*\*:\s*(\w+)/)?.[1] ?? "";
  const mascotSpec = md.match(/- \*\*Species\/form\*\*:\s*([^\n]+)/)?.[1]?.trim() ?? "";

  const checkSvg = `<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const rowsHtml = screen.rows.map((r) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(0,0,0,0.05)">
      <div style="width:16px;height:16px;border-radius:50%;flex-shrink:0;border:1.5px solid ${r.done ? t.success : t.border};background:${r.done ? t.success : "transparent"};display:flex;align-items:center;justify-content:center">
        ${r.done ? checkSvg : ""}
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;overflow:hidden">
        <span style="font-family:'${fonts.display}',sans-serif;font-size:11px;font-weight:600;color:${r.done ? t.mid : t.ink};${r.done ? "text-decoration:line-through" : ""};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.label}</span>
        <span style="font-size:9px;color:${t.mid};font-family:'${fonts.body}',sans-serif">${r.sub}</span>
      </div>
    </div>`).join("");

  const tabsHtml = tabs.map((tab, i) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:7px;font-weight:${i === 0 ? 600 : 400};color:${i === 0 ? t.primary : t.mid};font-family:'${fonts.body}',sans-serif">
      <div style="width:18px;height:3px;border-radius:2px;background:${i === 0 ? t.primary : "transparent"}"></div>
      ${tab}
    </div>`).join("");

  const swatchesHtml = pal.map((p) => `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:20px;height:20px;border-radius:5px;background:${p.hex};border:1px solid rgba(0,0,0,0.08);flex-shrink:0"></div>
      <div style="display:flex;flex-direction:column;gap:0px;overflow:hidden">
        <span style="font-family:'DM Mono',monospace;font-size:10.5px;color:#1C1917;white-space:nowrap">${p.token}</span>
        <span style="font-family:'DM Mono',monospace;font-size:9.5px;color:#78716C">${p.hex}</span>
      </div>
    </div>`).join("");

  return `
<div style="background:#FFFFFF;border:1px solid #E8DDD5;border-radius:12px;padding:24px 28px;margin-bottom:40px">
  <div style="font-family:'DM Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#78716C;margin-bottom:20px">
    Visual Impression — generated from design tokens
  </div>
  <div style="display:flex;gap:36px;align-items:flex-start;flex-wrap:wrap">

    <!-- Phone frame -->
    <div style="flex-shrink:0">
      <div style="width:200px;height:400px;border-radius:30px;border:2px solid rgba(0,0,0,0.14);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.14);position:relative;background:${t.surface}">
        <!-- Status bar -->
        <div style="background:${t.primary};height:24px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;flex-shrink:0">
          <span style="font-size:8px;color:rgba(255,255,255,0.9);font-family:'DM Mono',monospace;font-weight:500">9:41</span>
          <span style="font-size:7px;color:rgba(255,255,255,0.7)">●●● ▬</span>
        </div>
        <!-- App header -->
        <div style="background:${t.primary};padding:8px 14px 12px;flex-shrink:0">
          <div style="font-family:'${fonts.display}',sans-serif;font-size:16px;font-weight:700;color:white;letter-spacing:-0.3px">${screen.title}</div>
        </div>
        <!-- Content rows -->
        <div style="flex:1;overflow:hidden;background:${t.surface};position:relative">
          ${rowsHtml}
        </div>
        <!-- FAB -->
        <div style="position:absolute;bottom:58px;right:14px;width:30px;height:30px;border-radius:50%;background:${fab};color:white;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:300;box-shadow:0 3px 10px rgba(0,0,0,0.22);line-height:1">+</div>
        <!-- Tab bar -->
        <div style="height:52px;display:flex;background:${t.surfaceEl};border-top:1px solid ${t.border};flex-shrink:0">
          ${tabsHtml}
        </div>
      </div>
    </div>

    <!-- Right panel -->
    <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:22px">

      <!-- Color palette -->
      <div>
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#78716C;margin-bottom:10px;font-family:'DM Mono',monospace">Color Palette</div>
        <div style="display:flex;flex-direction:column;gap:7px">
          ${swatchesHtml}
        </div>
      </div>

      <!-- Typography -->
      <div>
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#78716C;margin-bottom:10px;font-family:'DM Mono',monospace">Typography</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-family:'${fonts.display}',sans-serif;font-size:22px;font-weight:700;color:${t.ink};letter-spacing:-0.5px;line-height:1.2">${appName}</div>
          <div style="font-size:11px;color:${t.mid};font-family:'DM Mono',monospace">Display · ${fonts.display}</div>
          <div style="font-family:'${fonts.body}',sans-serif;font-size:13px;color:${t.mid};margin-top:2px">Body text — ${fonts.body}</div>
        </div>
      </div>

      ${hasMascot && mascotName ? `
      <!-- Mascot -->
      <div>
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#78716C;margin-bottom:8px;font-family:'DM Mono',monospace">Mascot</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${t.primary};display:flex;align-items:center;justify-content:center;font-size:14px">🐦</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:${t.ink};font-family:'${fonts.display}',sans-serif">${mascotName}</div>
            ${mascotSpec ? `<div style="font-size:11px;color:${t.mid};font-family:'DM Sans',sans-serif">${mascotSpec.slice(0, 60)}${mascotSpec.length > 60 ? "…" : ""}</div>` : ""}
          </div>
        </div>
      </div>
      ` : ""}

    </div>
  </div>
</div>`;
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let inList = false;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (s: string) =>
    escape(s)
      .replace(/#([0-9A-Fa-f]{6})\b/g, (_, hex) =>
        `<span class="hex"><span class="swatch" style="background:#${hex}"></span>#${hex}</span>`
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableHeaders = [];
        out.push('<div class="table-wrap"><table>');
      }
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^[-: ]+$/.test(c))) continue;
      if (tableHeaders.length === 0) {
        tableHeaders = cells;
        out.push("<thead><tr>" + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
      } else {
        out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      }
      continue;
    } else if (inTable) {
      inTable = false;
      out.push("</tbody></table></div>");
    }

    if (/^\s*[-*] /.test(line)) {
      if (!inList) { inList = true; out.push("<ul>"); }
      out.push(`<li>${inline(line.replace(/^\s*[-*] /, ""))}</li>`);
      continue;
    } else if (inList) {
      inList = false;
      out.push("</ul>");
    }

    if (/^\s*\d+\. /.test(line)) {
      out.push(`<li class="num">${inline(line.replace(/^\s*\d+\. /, ""))}</li>`);
      continue;
    }

    if (line.startsWith("# "))   { out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith("## "))  { out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("### ")) { out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("> "))   { out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    if (/^---+$/.test(line))     { out.push("<hr>"); continue; }
    if (!line.trim())             { out.push("<br>"); continue; }

    out.push(`<p>${inline(line)}</p>`);
  }

  if (inTable) out.push("</tbody></table></div>");
  if (inList)  out.push("</ul>");

  return out.join("\n");
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildHtmlPage(
  slug: string,
  markdown: string,
  primaryColor: string,
  screensSection: string = "",
): string {
  const appName = markdown.match(/^#\s+Design Brief\s*[—–-]\s*(.+)/m)?.[1]?.trim() ?? slug;
  const fonts   = extractFonts(markdown);

  // Build extra font families to load (beyond the page defaults)
  const extraFonts = [...new Set([fonts.display, fonts.body])]
    .filter((f) => !["DM Sans", "DM Mono", "Cormorant Garamond", "system-ui", "sans-serif", "serif", "monospace"].includes(f));
  const extraFontsLink = extraFonts.length
    ? `<link href="https://fonts.googleapis.com/css2?family=${extraFonts.map((f) => encodeURIComponent(f) + ":wght@400;600;700").join("&family=")}&display=swap" rel="stylesheet">`
    : "";

  // When real screen prototypes exist, drop the misleading synthetic phone scaffold —
  // the screens-section IS the visual impression.
  const impression = screensSection ? "" : buildImpression(appName, markdown);
  const body = mdToHtml(markdown);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>${appName} — Design Brief</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
${extraFontsLink}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { color-scheme: light; --primary: ${primaryColor}; --surface: #FAF6EE; --ink: #1C1917; --mid: #78716C; --border: #E8DDD5; }
  html { background: #FAF6EE; }
  body { font-family: 'DM Sans', system-ui, sans-serif; background: #FAF6EE; color: #1C1917; font-size: 15px; line-height: 1.65; }

  .hero { background: var(--primary); color: #fff; padding: 40px 48px 32px; }
  .hero h1 { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 700; line-height: 1.1; margin-bottom: 6px; }
  .hero .sub { font-size: 13px; opacity: 0.75; font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }

  .content { max-width: 860px; margin: 0 auto; padding: 40px 48px 80px; }

  h1 { font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 700; margin: 36px 0 12px; color: var(--ink); }
  h2 { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 700; color: var(--primary); margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  h3 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; }
  p { margin-bottom: 12px; color: #374151; }
  strong { font-weight: 600; color: var(--ink); }
  em { font-style: italic; }
  code { font-family: 'DM Mono', monospace; font-size: 12.5px; background: rgba(0,0,0,0.06); border-radius: 4px; padding: 1px 5px; color: var(--primary); }
  blockquote { border-left: 3px solid var(--primary); padding: 8px 16px; color: var(--mid); font-style: italic; margin: 12px 0; background: rgba(0,0,0,0.02); border-radius: 0 6px 6px 0; }
  hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
  br { display: block; height: 4px; }
  ul { padding-left: 20px; margin-bottom: 12px; }
  li { margin-bottom: 6px; color: #374151; }
  li.num { list-style: decimal; margin-left: 20px; color: #374151; margin-bottom: 6px; }

  .table-wrap { overflow-x: auto; margin: 16px 0; border-radius: 10px; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead { background: rgba(0,0,0,0.04); }
  th { padding: 10px 14px; text-align: left; font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mid); border-bottom: 1px solid var(--border); }
  td { padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(0,0,0,0.015); }

  .hex { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Mono', monospace; font-size: 12.5px; }
  .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.12); flex-shrink: 0; }

  /* ── Screen prototypes ── */
  .screens-block { margin: 8px 0 32px; }
  .block-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mid); margin-bottom: 16px; }
  .screens-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
  .screen-tile { display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: inherit; background: #FFFFFF; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .screen-tile:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.10); }
  .screen-frame { position: relative; width: 100%; aspect-ratio: 390 / 600; overflow: hidden; background: #EFE8E4; pointer-events: none; }
  .screen-frame iframe { position: absolute; top: 0; left: 0; width: 390px; height: 600px; border: none; transform-origin: top left; transform: scale(calc(var(--tile-w, 220) / 390)); }
  /* Use container query for accurate scaling */
  @supports (container-type: inline-size) {
    .screen-frame { container-type: inline-size; }
    .screen-frame iframe { transform: scale(0.56); width: 390px; height: 600px; }
  }
  .screen-meta { padding: 10px 14px 14px; }
  .screen-title { font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 2px; }
  .screen-file { font-family: 'DM Mono', monospace; font-size: 10.5px; color: var(--mid); }
  .screens-hint { margin-top: 14px; font-size: 12.5px; color: var(--mid); font-style: italic; }
</style>
</head>
<body>
<div class="hero">
  <div class="sub">Design Brief · ${slug}</div>
  <h1>${appName}</h1>
</div>
<div class="content">
${impression}
${screensSection}
${body}
</div>
</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const FACTORY = await resolveFactoryDir(slug);
  const htmlPath  = join(FACTORY, slug, "design-preview.html");
  const briefPath = join(FACTORY, slug, "design-brief.md");
  const specDir   = join(FACTORY, slug, "visual-spec");

  // Primary: the baked combined approval deck (design-preview.html) generated by
  // tools/factory-design-preview.sh — combines one-pager (problem, target user,
  // features, monetization), product-thesis, competitor-analysis, market-signal,
  // visual-spec screens, and the full design brief into one end-to-end pitch deck.
  try {
    const html = await readFile(htmlPath, "utf-8");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch { /* no baked deck — fall through to brief-only render */ }

  // Fallback: render design brief alone with synthetic scaffold + visual-spec embeds.
  try {
    const md = await readFile(briefPath, "utf-8");
    const screens = await loadVisualSpecScreens(specDir);
    const screensSection = buildScreensSection(slug, screens);
    const colorMatch = md.match(/`primary`\s*\|\s*(#[0-9A-Fa-f]{6})/i);
    const primary = colorMatch?.[1] ?? "#3A7D6E";
    const html = buildHtmlPage(slug, md, primary, screensSection);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch { /* no brief either */ }

  return new Response(
    `<html><body style="font-family:sans-serif;padding:48px;background:#f5f2ec;color:#1c1917"><h2>No design brief found for <strong>${slug}</strong></h2><p>Design phase has not run yet.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
