import { NextRequest, NextResponse } from "next/server";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

/** POST /api/factory/propose — generate App Factory ideas from discovery signals */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${GROWTHOPS_URL}/api/discovery/propose-ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Timeout or unreachable",
      },
      { status: 503 },
    );
  }
}
