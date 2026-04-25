/**
 * GET  /api/eir/knowledge?table=insights|benefits
 *   Returns rows with is_published=false (pending approval queue)
 *
 * PATCH /api/eir/knowledge
 *   Body: { id: string, table: 'insights'|'benefits', action: 'approve'|'reject' }
 *   approve → is_published = true
 *   reject  → delete row (wiki file remains as source of truth)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const VALID_TABLES = { insights: 'cp_insights', benefits: 'cp_benefits' } as const;
type TableKey = keyof typeof VALID_TABLES;

function sb(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:        SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=representation',
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tableKey = searchParams.get('table') as TableKey | null;

  if (!tableKey || !(tableKey in VALID_TABLES)) {
    return NextResponse.json({ error: 'table must be insights or benefits' }, { status: 400 });
  }

  const table = VALID_TABLES[tableKey];
  const select = tableKey === 'insights'
    ? 'id,title,tldr,gmfcs_levels,country_code,updated_at,is_published'
    : 'id,title,category,difficulty,gmfcs_relevance,municipality_discretion,law_ref,country_code,updated_at,is_published';

  const res = await sb(
    `${table}?is_published=eq.false&order=updated_at.desc&select=${select}`,
  );

  if (!res.ok) {
    console.error(`[eir/knowledge GET] ${table}:`, await res.text());
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }

  const rows = await res.json();
  return NextResponse.json({ rows, table: tableKey });
}

export async function PATCH(req: NextRequest) {
  let body: { id: string; table: TableKey; action: 'approve' | 'reject' };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { id, table: tableKey, action } = body;

  if (!id || !tableKey || !action) {
    return NextResponse.json({ error: 'id, table, action are required' }, { status: 400 });
  }
  if (!(tableKey in VALID_TABLES)) {
    return NextResponse.json({ error: 'table must be insights or benefits' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const table = VALID_TABLES[tableKey];

  if (action === 'approve') {
    const res = await sb(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: true }),
    });
    if (!res.ok) {
      console.error(`[eir/knowledge PATCH approve] ${id}:`, await res.text());
      return NextResponse.json({ error: 'approve_failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, action: 'approved', id });
  }

  // reject = delete (wiki file remains as source of truth)
  const res = await sb(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    console.error(`[eir/knowledge PATCH reject] ${id}:`, await res.text());
    return NextResponse.json({ error: 'reject_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, action: 'rejected', id });
}
