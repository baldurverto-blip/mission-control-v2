/**
 * GET  /api/vera/cases/[id]  — fetch case + messages
 * PATCH /api/vera/cases/[id] — update case (status, tier)
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [caseRes, msgRes] = await Promise.all([
    sb(`cases?id=eq.${id}&select=*&limit=1`),
    sb(`case_messages?case_id=eq.${id}&order=created_at.asc&select=*`),
  ]);

  if (!caseRes.ok) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  const cases = await caseRes.json();
  if (!cases.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const messages = msgRes.ok ? await msgRes.json() : [];

  return NextResponse.json({ case: cases[0], messages });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Whitelist updatable fields
  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) allowed.status = body.status;
  if (body.tier !== undefined) allowed.tier = body.tier;
  allowed.updated_at = new Date().toISOString();

  const res = await sb(`cases?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(allowed),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "update_failed" }, { status: 502 });
  }

  const updated = await res.json();
  return NextResponse.json({ case: updated[0] ?? null });
}
