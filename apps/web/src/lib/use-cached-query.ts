import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from './api-client';
import {
  buildQueryKey,
  fetchQueryCache,
  readQueryCache,
  writeQueryCache,
} from './query-cache';

export type UseCachedQueryOptions<T> = {
  queryKey: string;
  accessToken: string | null;
  enabled?: boolean;
  staleTimeMs?: number;
  keepPreviousData?: boolean;
  fetcher: (signal: AbortSignal) => Promise<T>;
};

export type UseCachedQueryResult<T> = {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
};

export function useCachedQuery<T>({
  queryKey,
  accessToken,
  enabled = true,
  staleTimeMs = 30_000,
  keepPreviousData = true,
  fetcher,
}: UseCachedQueryOptions<T>): UseCachedQueryResult<T> {
  const fullKey = buildQueryKey(accessToken, queryKey);
  const cached = enabled ? readQueryCache<T>(fullKey) : undefined;
  const [data, setData] = useState<T | undefined>(() => cached);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(() => enabled && cached === undefined);
  const [isFetching, setIsFetching] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (force = false) => {
      if (!enabled || !accessToken) {
        setIsLoading(false);
        setIsFetching(false);
        return;
      }

      const existing = readQueryCache<T>(fullKey);
      if (existing === undefined) {
        setIsLoading(true);
      } else {
        setIsFetching(true);
        if (!keepPreviousData) {
          setData(undefined);
        }
      }

      setError(null);

      try {
        const next = await fetchQueryCache(
          fullKey,
          (signal) => fetcherRef.current(signal),
          { staleTimeMs, force },
        );
        setData(next);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        const message = err instanceof ApiClientError ? err.message : 'Unable to load data';
        const fallback = readQueryCache<T>(fullKey);
        if (fallback !== undefined) {
          setData(fallback);
        } else {
          setError(message);
        }
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    },
    [accessToken, enabled, fullKey, keepPreviousData, staleTimeMs],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!enabled || !accessToken) {
        if (!cancelled) {
          setIsLoading(false);
          setIsFetching(false);
        }
        return;
      }

      const existing = readQueryCache<T>(fullKey);
      if (!cancelled) {
        if (existing === undefined) {
          setIsLoading(true);
        } else {
          setIsFetching(true);
          if (!keepPreviousData) {
            setData(undefined);
          }
        }
        setError(null);
      }

      try {
        const next = await fetchQueryCache(
          fullKey,
          (signal) => fetcherRef.current(signal),
          { staleTimeMs, force: false },
        );
        if (!cancelled) {
          setData(next);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }

        const message = err instanceof ApiClientError ? err.message : 'Unable to load data';
        const fallback = readQueryCache<T>(fullKey);
        if (!cancelled) {
          if (fallback !== undefined) {
            setData(fallback);
          } else {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, fullKey, keepPreviousData, staleTimeMs]);

  const refetch = useCallback(async () => {
    await load(true);
  }, [load]);

  return { data, error, isLoading, isFetching, refetch };
}

export function primeQueryCache<T>(
  accessToken: string | null,
  queryKey: string,
  data: T,
): void {
  writeQueryCache(buildQueryKey(accessToken, queryKey), data);
}
