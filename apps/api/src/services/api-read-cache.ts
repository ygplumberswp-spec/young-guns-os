type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEFAULT_TTL_MS = 30_000;
const STATS_TTL_MS = 30_000;
const DASHBOARD_TTL_MS = 45_000;

class ApiReadCacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidateTenant(companyId: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${companyId}:`)) {
        this.entries.delete(key);
      }
    }
  }

  invalidatePrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  invalidateAll() {
    this.entries.clear();
  }
}

export const apiReadCache = new ApiReadCacheStore();

export function buildTenantCacheKey(
  companyId: string,
  namespace: string,
  suffix = 'default',
): string {
  return `${companyId}:${namespace}:${suffix}`;
}

export async function cachedTenantRead<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = apiReadCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const value = await loader();
  apiReadCache.set(key, value, ttlMs);
  return value;
}

export const CACHE_TTLS = {
  stats: STATS_TTL_MS,
  dashboard: DASHBOARD_TTL_MS,
} as const;

/** Clears integration hub and platform read caches for a tenant. */
export function invalidateIntegrationReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:integration-hub`);
  apiReadCache.invalidatePrefix(`${companyId}:integration-platform`);
}

/** Clears mission control read caches for a tenant. */
export function invalidateMissionControlReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:mission-control`);
}
