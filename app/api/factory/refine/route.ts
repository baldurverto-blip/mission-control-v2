import { NextRequest, NextResponse } from "next/server";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

/** POST /api/factory/refine — refine a proposed idea into a specific, scored concept */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.slug) {
      return NextResponse.json(
        { success: false, error: "slug is required" },
        { status: 400 },
      );
    }
    const res = await fetch(`${GROWTHOPS_URL}/api/factory/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000), // refinement takes longer
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
