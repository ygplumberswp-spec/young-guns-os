import type { QueryCacheScope } from '@titan/shared';
import { buildScopedCacheKey, cacheKeyMatchesScope } from '@titan/shared';

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type InflightEntry<T> = {
  promise: Promise<T>;
  controller: AbortController;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, InflightEntry<unknown>>();
const subscribers = new Map<string, Set<(data: unknown) => void>>();
const refreshing = new Set<string>();

let consecutiveTimeoutFailures = 0;
const MAX_TIMEOUT_FAILURES_BEFORE_PAUSE = 3;

export function buildQueryKey(
  accessToken: string | null,
  key: string,
  scope?: QueryCacheScope | null,
): string {
  return buildScopedCacheKey(scope, key, accessToken);
}

export function readQueryCache<T>(queryKey: string): T | undefined {
  const entry = cache.get(queryKey);
  return entry?.data as T | undefined;
}

export function writeQueryCache<T>(queryKey: string, data: T): void {
  cache.set(queryKey, { data, fetchedAt: Date.now() });
  notifySubscribers(queryKey, data);
}

export function getQueryCacheAgeMs(queryKey: string): number | null {
  const entry = cache.get(queryKey);
  if (!entry) {
    return null;
  }

  return Date.now() - entry.fetchedAt;
}

export function isQueryCacheStale(queryKey: string, staleTimeMs: number): boolean {
  const ageMs = getQueryCacheAgeMs(queryKey);
  if (ageMs === null) {
    return true;
  }
  return ageMs >= staleTimeMs;
}

export function isQueryCacheRefreshing(queryKey: string): boolean {
  return refreshing.has(queryKey) || inflight.has(queryKey);
}

export function subscribeQueryCache<T>(queryKey: string, listener: (data: T) => void): () => void {
  const set = subscribers.get(queryKey) ?? new Set();
  set.add(listener as (data: unknown) => void);
  subscribers.set(queryKey, set);

  return () => {
    const current = subscribers.get(queryKey);
    if (!current) return;
    current.delete(listener as (data: unknown) => void);
    if (current.size === 0) {
      subscribers.delete(queryKey);
    }
  };
}

function notifySubscribers(queryKey: string, data: unknown): void {
  const set = subscribers.get(queryKey);
  if (!set) return;
  for (const listener of set) {
    listener(data);
  }
}

export function abortQueryCache(queryKey: string): void {
  const pending = inflight.get(queryKey);
  if (pending) {
    pending.controller.abort();
    inflight.delete(queryKey);
  }
  refreshing.delete(queryKey);
}

export function invalidateQueryCache(queryKey?: string): void {
  if (!queryKey) {
    cache.clear();
    for (const [key, request] of inflight.entries()) {
      request.controller.abort();
      inflight.delete(key);
    }
    refreshing.clear();
    subscribers.clear();
    return;
  }

  cache.delete(queryKey);
  const pending = inflight.get(queryKey);
  if (pending) {
    pending.controller.abort();
    inflight.delete(queryKey);
  }
  refreshing.delete(queryKey);
}

export function invalidateQueryCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }

  for (const [key, request] of inflight.entries()) {
    if (key.startsWith(prefix)) {
      request.controller.abort();
      inflight.delete(key);
    }
    if (key.startsWith(prefix)) {
      refreshing.delete(key);
    }
  }
}

export function clearQueryCacheForScope(scope: QueryCacheScope): void {
  for (const key of cache.keys()) {
    if (cacheKeyMatchesScope(key, scope)) {
      cache.delete(key);
    }
  }

  for (const [key, request] of inflight.entries()) {
    if (cacheKeyMatchesScope(key, scope)) {
      request.controller.abort();
      inflight.delete(key);
    }
  }

  for (const key of refreshing) {
    if (cacheKeyMatchesScope(key, scope)) {
      refreshing.delete(key);
    }
  }
}

export function clearAllQueryCache(): void {
  invalidateQueryCache();
  consecutiveTimeoutFailures = 0;
}

export function recordQueryCacheTimeoutFailure(): void {
  consecutiveTimeoutFailures += 1;
}

export function shouldPauseCacheRefresh(): boolean {
  return consecutiveTimeoutFailures >= MAX_TIMEOUT_FAILURES_BEFORE_PAUSE;
}

export function resetQueryCacheHealth(): void {
  consecutiveTimeoutFailures = 0;
}

export async function fetchQueryCache<T>(
  queryKey: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: {
    staleTimeMs?: number;
    force?: boolean;
    background?: boolean;
  },
): Promise<T> {
  const staleTimeMs = options?.staleTimeMs ?? 30_000;
  const cached = cache.get(queryKey);
  const ageMs = cached ? Date.now() - cached.fetchedAt : null;
  const isFresh = cached && ageMs !== null && ageMs < staleTimeMs;

  if (!options?.force && isFresh) {
    return cached.data as T;
  }

  const pending = inflight.get(queryKey);
  if (pending && !options?.force) {
    return pending.promise as Promise<T>;
  }

  if (cached && !options?.force && !options?.background) {
    void revalidateQueryCache(queryKey, fetcher, staleTimeMs);
    return cached.data as T;
  }

  if (pending && options?.force) {
    pending.controller.abort();
    inflight.delete(queryKey);
  }

  return executeQueryFetch(queryKey, fetcher, options?.background ?? false);
}

async function revalidateQueryCache<T>(
  queryKey: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  staleTimeMs: number,
): Promise<void> {
  if (shouldPauseCacheRefresh()) {
    return;
  }

  if (refreshing.has(queryKey) || inflight.has(queryKey)) {
    return;
  }

  refreshing.add(queryKey);
  try {
    await executeQueryFetch(queryKey, fetcher, true);
  } catch {
    // stale data remains; hook surfaces unobtrusive warning via isStale
  } finally {
    refreshing.delete(queryKey);
  }

  void staleTimeMs;
}

async function executeQueryFetch<T>(
  queryKey: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  _background: boolean,
): Promise<T> {
  const controller = new AbortController();
  const promise = fetcher(controller.signal)
    .then((data) => {
      writeQueryCache(queryKey, data);
      inflight.delete(queryKey);
      resetQueryCacheHealth();
      return data;
    })
    .catch((error) => {
      inflight.delete(queryKey);
      if (controller.signal.aborted) {
        const fallback = readQueryCache<T>(queryKey);
        if (fallback !== undefined) {
          return fallback;
        }
      }

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        recordQueryCacheTimeoutFailure();
      }

      throw error;
    });

  inflight.set(queryKey, { promise: promise as Promise<unknown>, controller });
  return promise;
}

export function primeQueryCacheEntry<T>(queryKey: string, data: T): void {
  writeQueryCache(queryKey, data);
}
