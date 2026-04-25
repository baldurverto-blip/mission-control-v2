import { NextResponse } from "next/server";

const GROWTHOPS_URL = process.env.GROWTHOPS_URL || "http://localhost:3002";
const CACHE_TTL_MS = 30_000;

interface GrowthOpsStatus {
  status: string;
  uptime: number;
  version: string;
  discoveryCount: number;
  queueCount: number;
}

let _cache: { value: GrowthOpsStatus; expiresAt: number } | null = null;
let _inflight: Promise<GrowthOpsStatus> | null = null;

async function fetchGrowthOpsStatus(): Promise<GrowthOpsStatus> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.value;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const healthRes = await fetch(`${GROWTHOPS_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!healthRes.ok) throw new Error(`status ${healthRes.status}`);
      const health = await healthRes.json();

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
      } catch { /* non-critical */ }

      const value: GrowthOpsStatus = { status: "online", uptime: health.uptime, version: health.version, discoveryCount, queueCount };
      _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    } catch {
      const value: GrowthOpsStatus = { status: "offline", uptime: 0, version: "—", discoveryCount: 0, queueCount: 0 };
      _cache = { value, expiresAt: Date.now() + 10_000 }; // cache offline state for 10s only
      return value;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

export async function GET() {
  const data = await fetchGrowthOpsStatus();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "max-age=25, stale-while-revalidate=10" },
  });
}
