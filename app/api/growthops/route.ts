import { NextResponse } from "next/server";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";

export async function GET() {
  try {
    const healthRes = await fetch(`${GROWTHOPS_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) throw new Error(`status ${healthRes.status}`);
    const health = await healthRes.json();

    // Try to get discovery stats
    let discoveryCount = 0;
    let queueCount = 0;
    try {
      const [discRes, queueRes] = await Promise.all([
        fetch(`${GROWTHOPS_URL}/api/discovery/lake?limit=1`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${GROWTHOPS_URL}/api/queue`, { signal: AbortSignal.timeout(3000) }),
      ]);
      if (discRes.ok) {
        const d = await discRes.json();
        discoveryCount = d.total ?? d.signals?.length ?? 0;
      }
      if (queueRes.ok) {
        const q = await queueRes.json();
        queueCount = q.items?.length ?? q.queue?.length ?? 0;
      }
    } catch {
      // Non-critical — discovery/queue stats are optional
    }

    return NextResponse.json({
      status: "online",
      uptime: health.uptime,
      version: health.version,
      discoveryCount,
      queueCount,
    });
  } catch {
    return NextResponse.json({
      status: "offline",
      uptime: 0,
      version: "—",
      discoveryCount: 0,
      queueCount: 0,
    });
  }
}
