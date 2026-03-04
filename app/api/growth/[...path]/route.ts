import { NextRequest, NextResponse } from "next/server";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${GROWTHOPS_URL}/api/${path.join("/")}`;
  const url = new URL(target);

  // Forward query params
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    const contentType = req.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(10_000),
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = await req.text();
    }

    const res = await fetch(url.toString(), fetchOpts);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ offline: true, error: "Growth-Ops backend unreachable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
