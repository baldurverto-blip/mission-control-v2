/**
 * POST /api/vera/pipeline/process
 *
 * Triggers the Vera resolution pipeline for a given case.
 * Called after email/Discord intake creates a case.
 *
 * Body: { case_id: string }
 *
 * Pipeline:
 *   1. Fetch case + messages from Supabase
 *   2. QMD retrieval (KB articles)
 *   3. Claude Sonnet: classify category + tier + draft reply
 *   4. Confidence score: (QMD × 0.5) + (Claude certainty × 0.3) + (classification_quality × 0.2)
 *   5. T1 exclusion check (billing, legal, data loss, etc.)
 *   6. Write result: update case tier + confidence_score, insert vera_draft message
 *
 * Returns: { case_id, tier, confidence, category, kb_hits, excluded }
 */

import { NextRequest, NextResponse } from "next/server";
import { runResolutionPipeline } from "../../../../lib/vera/pipeline";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers as Record<string, string>),
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { case_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { case_id } = body;
  if (!case_id) {
    return NextResponse.json({ error: "case_id required" }, { status: 400 });
  }

  // Fetch the case
  const caseRes = await sb(
    `cases?id=eq.${case_id}&select=id,subject,body,is_repeat_contact,status,tier&limit=1`
  );
  if (!caseRes.ok) {
    return NextResponse.json({ error: "case_fetch_failed" }, { status: 502 });
  }
  const cases = await caseRes.json();
  if (!cases.length) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }
  const theCase = cases[0];

  // Skip if already processed
  if (theCase.tier !== null && theCase.tier !== undefined) {
    return NextResponse.json({
      ok: true,
      case_id,
      tier: theCase.tier,
      skipped: "already_processed",
    });
  }

  // Run the pipeline
  let result;
  try {
    result = await runResolutionPipeline(
      theCase.subject ?? "",
      theCase.body ?? "",
      theCase.is_repeat_contact ?? false
    );
  } catch (err) {
    console.error("[vera/pipeline] pipeline error:", err);
    return NextResponse.json({ error: "pipeline_failed" }, { status: 500 });
  }

  // Update case: tier + confidence_score
  const updateRes = await sb(`cases?id=eq.${case_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      tier: result.tier,
      confidence_score: result.confidence,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!updateRes.ok) {
    console.error("[vera/pipeline] case update failed:", await updateRes.text());
  }

  // Insert vera_draft message
  if (result.draft) {
    const msgRes = await sb("case_messages", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: "00000000-0000-0000-0000-000000000001",
        case_id,
        role: "vera_draft",
        content: result.draft,
        metadata: {
          category: result.category,
          tier: result.tier,
          confidence: result.confidence,
          kb_hits: result.kb_hits,
          excluded: result.excluded,
          reasoning: result.reasoning,
        },
      }),
    });
    if (!msgRes.ok) {
      console.error("[vera/pipeline] draft insert failed:", await msgRes.text());
    }
  }

  // Audit
  await sb("actions_audit", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: "00000000-0000-0000-0000-000000000001",
      case_id,
      action_type: "pipeline_classify",
      actor: "vera",
      target: case_id,
      payload: {
        category: result.category,
        tier: result.tier,
        confidence: result.confidence,
        kb_hits: result.kb_hits,
        excluded: result.excluded,
      },
      outcome: "success",
    }),
  });

  return NextResponse.json({
    ok: true,
    case_id,
    tier: result.tier,
    confidence: result.confidence,
    category: result.category,
    kb_hits: result.kb_hits,
    excluded: result.excluded,
  });
}
