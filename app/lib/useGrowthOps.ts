"use client";

import { useState, useEffect, useCallback } from "react";

interface UseGrowthOpsResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  isOffline: boolean;
  refetch: () => Promise<void>;
}

export function useGrowthOps<T>(
  endpoint: string,
  options?: { pollInterval?: number; enabled?: boolean }
): UseGrowthOpsResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const pollInterval = options?.pollInterval ?? 30_000;
  const enabled = options?.enabled ?? true;

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/growth/${endpoint}`);
      const json = await res.json();
      if (json.offline) {
        setIsOffline(true);
        setData(null);
        setError("Backend offline");
      } else {
        setIsOffline(false);
        setData(json);
        setError(null);
      }
    } catch (e) {
      setIsOffline(true);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    fetchData();
    if (pollInterval > 0) {
      const iv = setInterval(fetchData, pollInterval);
      return () => clearInterval(iv);
    }
  }, [fetchData, pollInterval]);

  return { data, error, loading, isOffline, refetch: fetchData };
}
