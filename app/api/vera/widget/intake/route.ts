/**
 * POST /api/vera/widget/intake
 *
 * Receives a case package from the widget, redacts credentials,
 * creates a case + initial message in Supabase, and returns the case_id.
 *
 * Resolution pipeline (classify → QMD → Claude → T1/T2/T3) is wired in Week 4.
 * For Week 2: cases created with status='open', tier=null.
 */

import { NextRequest, NextResponse } from "next/server";
import { redactCasePackage, CasePackage } from "../../../../lib/vera/sanitize";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function supabase(path: string, init: RequestInit) {
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
  // ── Parse ──────────────────────────────────────────────────────────────────
  let raw: CasePackage;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { workspace_id, customer_email, description, consent_given } = raw;

  if (!workspace_id || !customer_email || !description) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 }
    );
  }

  // ── Validate workspace ─────────────────────────────────────────────────────
  const wsRes = await supabase(
    `workspaces?id=eq.${encodeURIComponent(workspace_id)}&select=id&limit=1`,
    { method: "GET" }
  );
  if (!wsRes.ok) {
    return NextResponse.json({ error: "supabase_error" }, { status: 502 });
  }
  const wsRows = await wsRes.json();
  if (!wsRows.length) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }

  // ── Redact ─────────────────────────────────────────────────────────────────
  // If consent not given: strip all telemetry (keep only user-typed fields)
  const pkg = consent_given
    ? redactCasePackage(raw)
    : {
        ...raw,
        console_errors: undefined,
        network_failures: undefined,
        recent_actions: undefined,
      };

  // ── Repeat contact check (48h lookback) ────────────────────────────────────
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const repeatRes = await supabase(
    `cases?workspace_id=eq.${workspace_id}&customer_email=eq.${encodeURIComponent(customer_email)}&created_at=gte.${cutoff}&status=eq.open&select=id&limit=1`,
    { method: "GET" }
  );
  const isRepeat =
    repeatRes.ok ? (await repeatRes.json()).length > 0 : false;

  // ── Create case ────────────────────────────────────────────────────────────
  const casePayload = {
    workspace_id,
    customer_email: pkg.customer_email,
    customer_name: pkg.customer_name ?? null,
    subject: pkg.description.slice(0, 120),
    body: pkg.description,
    status: "open",
    tier: null,
    confidence_score: null,
    is_repeat_contact: isRepeat,
    // Store full case package in a JSONB-compatible metadata approach:
    // We embed it in the case body until a dedicated metadata column is added.
  };

  const caseRes = await supabase("cases", {
    method: "POST",
    body: JSON.stringify(casePayload),
    headers: { Prefer: "return=representation" },
  });

  if (!caseRes.ok) {
    const err = await caseRes.text();
    console.error("[vera/widget/intake] case insert failed:", err);
    return NextResponse.json({ error: "case_insert_failed" }, { status: 502 });
  }

  const [createdCase] = await caseRes.json();
  const case_id: string = createdCase.id;

  // ── Create initial message ─────────────────────────────────────────────────
  const msgPayload = {
    workspace_id,
    case_id,
    role: "customer",
    content: pkg.description,
    metadata: {
      channel: "widget",
      page_url: pkg.page_url,
      page_title: pkg.page_title,
      user_agent: pkg.user_agent,
      referrer: pkg.referrer ?? null,
      viewport: pkg.viewport ?? null,
      consent_given: pkg.consent_given,
      console_errors: pkg.console_errors ?? null,
      network_failures: pkg.network_failures ?? null,
      recent_actions: pkg.recent_actions ?? null,
      captured_at: pkg.captured_at,
    },
  };

  const msgRes = await supabase("case_messages", {
    method: "POST",
    body: JSON.stringify(msgPayload),
  });

  if (!msgRes.ok) {
    console.error("[vera/widget/intake] message insert failed:", await msgRes.text());
    // Case is created — don't fail the whole request, just log
  }

  return NextResponse.json(
    { case_id, session_token: raw.session_token },
    { status: 201 }
  );
}
