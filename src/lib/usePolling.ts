import { useCallback, useEffect, useRef, useState } from "react";

const memoryCache = new Map<string, unknown>();

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 30_000,
  cacheKey?: string
) {
  const cached = cacheKey ? (memoryCache.get(cacheKey) as T | undefined) ?? null : null;
  const [data, setData] = useState<T | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(async () => {
    try {
      const result = await fetcher();
      if (cacheKey) memoryCache.set(cacheKey, result);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fetcher, cacheKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    timerRef.current = setInterval(() => void run(), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [run, intervalMs]);

  return { data, error, loading, refresh: run };
}