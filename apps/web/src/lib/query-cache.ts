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

export function buildQueryKey(accessToken: string | null, key: string): string {
  return `${accessToken ?? 'anon'}:${key}`;
}

export function readQueryCache<T>(queryKey: string): T | undefined {
  const entry = cache.get(queryKey);
  return entry?.data as T | undefined;
}

export function writeQueryCache<T>(queryKey: string, data: T): void {
  cache.set(queryKey, { data, fetchedAt: Date.now() });
}

export function getQueryCacheAgeMs(queryKey: string): number | null {
  const entry = cache.get(queryKey);
  if (!entry) {
    return null;
  }

  return Date.now() - entry.fetchedAt;
}

export function invalidateQueryCache(queryKey?: string): void {
  if (!queryKey) {
    cache.clear();
    for (const [key, request] of inflight.entries()) {
      request.controller.abort();
      inflight.delete(key);
    }
    return;
  }

  cache.delete(queryKey);
  const pending = inflight.get(queryKey);
  if (pending) {
    pending.controller.abort();
    inflight.delete(queryKey);
  }
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
  }
}

export async function fetchQueryCache<T>(
  queryKey: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { staleTimeMs?: number; force?: boolean },
): Promise<T> {
  const staleTimeMs = options?.staleTimeMs ?? 30_000;
  const cached = cache.get(queryKey);
  const ageMs = cached ? Date.now() - cached.fetchedAt : null;

  if (!options?.force && cached && ageMs !== null && ageMs < staleTimeMs) {
    return cached.data as T;
  }

  const pending = inflight.get(queryKey);
  if (pending && !options?.force) {
    return pending.promise as Promise<T>;
  }

  if (pending) {
    pending.controller.abort();
    inflight.delete(queryKey);
  }

  const controller = new AbortController();
  const promise = fetcher(controller.signal)
    .then((data) => {
      writeQueryCache(queryKey, data);
      inflight.delete(queryKey);
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
      throw error;
    });

  inflight.set(queryKey, { promise: promise as Promise<unknown>, controller });
  return promise;
}
