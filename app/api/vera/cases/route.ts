/**
 * GET /api/vera/cases
 *
 * Lists cases for the operator queue.
 *
 * Query params:
 *   status   — open|resolved (default: open)
 *   tier     — T1|T2|T3 (optional filter)
 *   limit    — max results (default: 50)
 *   offset   — pagination offset
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sb(path: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";
  const tier = searchParams.get("tier");
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  let query = `cases?workspace_id=eq.00000000-0000-0000-0000-000000000001&status=eq.${status}&order=created_at.desc&limit=${limit}&offset=${offset}&select=id,subject,body,status,tier,confidence_score,is_repeat_contact,customer_email,customer_name,created_at,updated_at`;

  if (tier) {
    query += `&tier=eq.${tier}`;
  }

  const res = await sb(query);
  if (!res.ok) {
    console.error("[vera/cases] fetch failed:", await res.text());
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  const cases = await res.json();
  return NextResponse.json({ cases });
}
