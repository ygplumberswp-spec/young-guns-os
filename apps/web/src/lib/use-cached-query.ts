import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryCacheScope } from '@titan/shared';
import { ApiClientError } from './api-client';
import {
  abortQueryCache,
  buildQueryKey,
  fetchQueryCache,
  isQueryCacheRefreshing,
  isQueryCacheStale,
  readQueryCache,
  subscribeQueryCache,
  writeQueryCache,
} from './query-cache';
import { staleTimeForQueryKey } from './cache-policies';

export type UseCachedQueryOptions<T> = {
  queryKey: string;
  accessToken: string | null;
  scope?: QueryCacheScope | null;
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
  isStale: boolean;
  refetch: () => Promise<void>;
};

export function useCachedQuery<T>({
  queryKey,
  accessToken,
  scope = null,
  enabled = true,
  staleTimeMs,
  keepPreviousData = true,
  fetcher,
}: UseCachedQueryOptions<T>): UseCachedQueryResult<T> {
  const resolvedStaleTimeMs = staleTimeMs ?? staleTimeForQueryKey(queryKey);
  const fullKey = buildQueryKey(accessToken, queryKey, scope);
  const cached = enabled ? readQueryCache<T>(fullKey) : undefined;
  const [data, setData] = useState<T | undefined>(() => cached);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(() => enabled && cached === undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [isStale, setIsStale] = useState(() =>
    cached !== undefined ? isQueryCacheStale(fullKey, resolvedStaleTimeMs) : false,
  );
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribeQueryCache<T>(fullKey, (next) => {
      setData(next);
      setIsStale(isQueryCacheStale(fullKey, resolvedStaleTimeMs));
      setIsFetching(isQueryCacheRefreshing(fullKey));
    });
  }, [enabled, fullKey, resolvedStaleTimeMs]);

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
        const next = await fetchQueryCache(fullKey, (signal) => fetcherRef.current(signal), {
          staleTimeMs: resolvedStaleTimeMs,
          force,
        });
        setData(next);
        setIsStale(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Cancelled by effect cleanup / query-cache abort — do not surface as page error.
          return;
        }

        const message = err instanceof ApiClientError ? err.message : 'Unable to load data';
        const fallback = readQueryCache<T>(fullKey);
        if (fallback !== undefined) {
          setData(fallback);
          setIsStale(true);
          setError(message);
        } else {
          setError(message);
        }
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    },
    [accessToken, enabled, fullKey, keepPreviousData, resolvedStaleTimeMs],
  );

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    let cancelled = false;

    async function run() {
      if (!enabled || !accessToken) {
        if (!cancelled && requestGenerationRef.current === generation) {
          setIsLoading(false);
          setIsFetching(false);
        }
        return;
      }

      const existing = readQueryCache<T>(fullKey);
      if (!cancelled && requestGenerationRef.current === generation) {
        if (existing === undefined) {
          setIsLoading(true);
        } else {
          setData(existing);
          setIsFetching(isQueryCacheRefreshing(fullKey));
          setIsStale(isQueryCacheStale(fullKey, resolvedStaleTimeMs));
        }
        setError(null);
      }

      try {
        const next = await fetchQueryCache(fullKey, (signal) => fetcherRef.current(signal), {
          staleTimeMs: resolvedStaleTimeMs,
          force: false,
        });
        if (!cancelled && requestGenerationRef.current === generation) {
          setData(next);
          setIsStale(isQueryCacheStale(fullKey, resolvedStaleTimeMs));
        }
      } catch (err) {
        if (cancelled || requestGenerationRef.current !== generation) {
          return;
        }

        if (err instanceof Error && err.name === 'AbortError') {
          // Cancelled by effect cleanup / query-cache abort — do not surface as page error.
          return;
        }

        const message = err instanceof ApiClientError ? err.message : 'Unable to load data';
        const fallback = readQueryCache<T>(fullKey);
        if (fallback !== undefined) {
          setData(fallback);
          setIsStale(true);
          setError(message);
        } else {
          setError(message);
        }
      } finally {
        if (!cancelled && requestGenerationRef.current === generation) {
          setIsLoading(false);
          setIsFetching(isQueryCacheRefreshing(fullKey));
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      abortQueryCache(fullKey);
      if (requestGenerationRef.current === generation) {
        setIsLoading(false);
        setIsFetching(false);
      }
    };
  }, [accessToken, enabled, fullKey, keepPreviousData, resolvedStaleTimeMs]);

  const refetch = useCallback(async () => {
    await load(true);
  }, [load]);

  return { data, error, isLoading, isFetching, isStale, refetch };
}

export function primeQueryCache<T>(
  accessToken: string | null,
  queryKey: string,
  data: T,
  scope?: QueryCacheScope | null,
): void {
  writeQueryCache(buildQueryKey(accessToken, queryKey, scope), data);
}
