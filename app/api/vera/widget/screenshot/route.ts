/**
 * POST /api/vera/widget/screenshot
 *
 * Receives a base64 JPEG screenshot from the widget and attaches it to the case.
 * Body: { case_id: string, session_token: string, screenshot_data: string }
 *
 * screenshot_data is a data URL: "data:image/jpeg;base64,/9j/..."
 * Max ~2 MB (enforced by Next.js body size limit; 60% quality JPEG is typically <400 KB).
 */

import { NextRequest, NextResponse } from "next/server";

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
  let body: { case_id?: string; session_token?: string; screenshot_data?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { case_id, screenshot_data } = body;

  if (!case_id || !screenshot_data) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Basic sanity — must look like a data URL
  if (!screenshot_data.startsWith("data:image/")) {
    return NextResponse.json({ error: "invalid_screenshot" }, { status: 400 });
  }

  // Cap at ~2 MB (base64 chars ≈ bytes * 1.33)
  if (screenshot_data.length > 2_800_000) {
    return NextResponse.json({ error: "screenshot_too_large" }, { status: 413 });
  }

  const res = await supabase(`cases?id=eq.${encodeURIComponent(case_id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      screenshot_data,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[vera screenshot] supabase patch failed:", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
