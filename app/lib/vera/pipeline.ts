/**
 * Vera resolution pipeline — classify → KB retrieval → draft → confidence gate
 *
 * Uses claude CLI (-p mode, Max plan session) for inference — no API costs.
 * Uses qmd CLI for KB retrieval.
 *
 * Called after any intake (email, Discord, widget) creates a case.
 *
 * Tier routing:
 *   T1 — high-confidence, non-excluded → auto-resolvable (Week 5: send reply)
 *   T2 — medium confidence or auto-resolve excluded → operator review with draft
 *   T3 — low confidence, complex, or escalation keyword → human escalation
 *
 * Confidence formula:
 *   (QMD_best_score × 0.5) + (claude_certainty × 0.3) + (classification_quality × 0.2)
 *   classification_quality: T1=1.0, T2=0.7, T3=0.4
 *
 * T1 auto-resolve exclusions (always escalate to T2):
 *   billing_dispute, cancellation_request, data_loss, legal, security_incident,
 *   repeated_contact_48h, account_deletion, gdpr_request, password_reset
 */

import { execFileSync } from "child_process";

// ── Constants ─────────────────────────────────────────────────────────────────

const QMD_BIN = "/Users/baldurclaw/.bun/bin/qmd";
const CLAUDE_BIN = "/Users/baldurclaw/.local/bin/claude";

const T1_EXCLUSIONS = new Set([
  "billing_dispute",
  "cancellation_request",
  "data_loss",
  "legal",
  "security_incident",
  "repeated_contact_48h",
  "account_deletion",
  "gdpr_request",
  "password_reset",
]);

const TIER_CONFIDENCE_QUALITY: Record<string, number> = {
  T1: 1.0,
  T2: 0.7,
  T3: 0.4,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineResult {
  tier: "T1" | "T2" | "T3";
  confidence: number;
  category: string;
  draft: string;
  kb_hits: number;
  excluded: boolean; // true if T1 exclusion forced upgrade to T2
  reasoning: string;
}

interface KbHit {
  file: string;
  score: number;
  snippet: string;
}

interface ClaudeClassification {
  category: string;
  tier: "T1" | "T2" | "T3";
  certainty: number; // 0-1
  draft: string;
  reasoning: string;
}

// ── QMD retrieval ─────────────────────────────────────────────────────────────
//
// Uses `qmd search` (BM25, no LLM expansion) for fast intake-time retrieval.
// Parses the text output format:
//   qmd://collection/path:line #color
//   Title: ...
//   Score:  XX%
//   @@ ... @@
//   <snippet>

function parseQmdOutput(output: string): KbHit[] {
  const hits: KbHit[] = [];
  const blocks = output.split(/\nqmd:\/\//).map((b, i) => (i === 0 ? b : "qmd://" + b));

  for (const block of blocks) {
    if (!block.startsWith("qmd://")) continue;
    const lines = block.split("\n");
    const pathLine = lines[0] ?? "";
    const filePart = pathLine.split(" ")[0] ?? "";
    const file = filePart.replace(/^qmd:\/\//, "").replace(/:\d+$/, "");

    const scoreLine = lines.find((l) => l.startsWith("Score:")) ?? "";
    const scoreMatch = scoreLine.match(/(\d+)%/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) / 100 : 0;

    const snippetStart = lines.findIndex((l) => l.startsWith("@@"));
    const snippet = snippetStart >= 0
      ? lines.slice(snippetStart + 1).join("\n").trim().slice(0, 400)
      : "";

    if (file) {
      hits.push({ file, score, snippet });
    }
    if (hits.length >= 5) break;
  }

  return hits;
}

function queryKB(query: string): KbHit[] {
  try {
    const truncated = query.slice(0, 300).replace(/\n/g, " ");
    const output = execFileSync(
      QMD_BIN,
      ["search", truncated],
      { encoding: "utf8", timeout: 8_000 }
    );
    return parseQmdOutput(output);
  } catch {
    return [];
  }
}

// ── Claude classification + draft (via claude -p, Max plan session) ───────────

function classifyAndDraft(
  subject: string,
  body: string,
  kbHits: KbHit[],
  isRepeat: boolean
): ClaudeClassification {
  const kbContext =
    kbHits.length > 0
      ? kbHits.map((h, i) => `[KB ${i + 1}] ${h.file}\n${h.snippet}`).join("\n\n")
      : "No relevant KB articles found.";

  const prompt = `You are Vera, an AI support agent for Verto Studios apps (SafeBite, HyTrack, GatherSafe, etc.).

Classify this support case and draft a reply.

TIER DEFINITIONS:
- T1: Standard, answerable from KB. High confidence. Safe to auto-resolve.
- T2: Needs operator review. Medium confidence or nuanced.
- T3: Complex, sensitive, or requires engineering/legal. Escalate.

VALID CATEGORIES: bug_report, feature_request, account_access, billing_dispute, password_reset, data_loss, cancellation_request, legal, security_incident, general_inquiry, gdpr_request, account_deletion

CASE:
Subject: ${subject}
Body: ${body.slice(0, 2000)}
Repeat contact (48h): ${isRepeat ? "yes" : "no"}

RELEVANT KB ARTICLES:
${kbContext}

DRAFT GUIDELINES:
- Warm, concise, professional
- Use [name] placeholder for customer name
- If T1 and answerable from KB: write the complete reply
- If T2/T3: write a holding reply acknowledging the issue
- Max 200 words

Respond with ONLY valid JSON (no markdown, no explanation):
{"category":"...","tier":"T1|T2|T3","certainty":0.85,"draft":"...","reasoning":"one sentence"}`;

  try {
    const output = execFileSync(
      CLAUDE_BIN,
      ["-p"],
      {
        input: prompt,
        encoding: "utf8",
        timeout: 45_000,
        env: {
          ...process.env,
          HOME: "/Users/baldurclaw",
          PATH: "/Users/baldurclaw/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        },
      }
    );

    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: String(parsed.category ?? "general_inquiry"),
      tier: (["T1", "T2", "T3"].includes(parsed.tier) ? parsed.tier : "T2") as "T1" | "T2" | "T3",
      certainty: Math.min(1, Math.max(0, Number(parsed.certainty) || 0.5)),
      draft: String(parsed.draft ?? ""),
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch (err) {
    console.error("[vera/pipeline] claude classify error:", err);
    // Fallback: T2 with no draft
    return {
      category: "general_inquiry",
      tier: "T2",
      certainty: 0.4,
      draft: `Hi [name],\n\nThank you for reaching out. Our team has received your message and will get back to you as soon as possible.\n\nBest,\nVerto Support`,
      reasoning: "Pipeline fallback — Claude classification failed",
    };
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runResolutionPipeline(
  subject: string,
  body: string,
  isRepeat: boolean
): Promise<PipelineResult> {
  // Step 1: QMD retrieval
  const kbHits = queryKB(`${subject} ${body}`);
  const bestKbScore = kbHits.length > 0 ? kbHits[0].score : 0;

  // Step 2: Claude classify + draft (sync — claude CLI)
  const classification = classifyAndDraft(subject, body, kbHits, isRepeat);

  // Step 3: T1 exclusion check
  const excluded = T1_EXCLUSIONS.has(classification.category) || isRepeat;
  const effectiveTier: "T1" | "T2" | "T3" =
    excluded && classification.tier === "T1" ? "T2" : classification.tier;

  // Step 4: Confidence score
  const classQuality = TIER_CONFIDENCE_QUALITY[classification.tier] ?? 0.5;
  const confidence = Math.min(
    1,
    bestKbScore * 0.5 + classification.certainty * 0.3 + classQuality * 0.2
  );

  // Step 5: Downgrade T1 → T2 if confidence < 0.65
  const finalTier: "T1" | "T2" | "T3" =
    effectiveTier === "T1" && confidence < 0.65 ? "T2" : effectiveTier;

  return {
    tier: finalTier,
    confidence: Math.round(confidence * 100) / 100,
    category: classification.category,
    draft: classification.draft,
    kb_hits: kbHits.length,
    excluded,
    reasoning: classification.reasoning,
  };
}
