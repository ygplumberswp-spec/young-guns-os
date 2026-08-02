type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEFAULT_TTL_MS = 30_000;
const STATS_TTL_MS = 30_000;
const DASHBOARD_TTL_MS = 45_000;
/** Short TTL for unfiltered authenticated list pages (CRM/Jobs/Finance). */
const LIST_TTL_MS = 20_000;

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
  list: LIST_TTL_MS,
} as const;

export function invalidateCrmListCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:crm/list`);
  apiReadCache.invalidatePrefix(`${companyId}:crm/stats`);
}

export function invalidateJobsListCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:jobs/list`);
  apiReadCache.invalidatePrefix(`${companyId}:jobs/stats`);
}

export function invalidateFinanceListCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:finance/list`);
  apiReadCache.invalidatePrefix(`${companyId}:finance/stats`);
}

/** Clears integration hub and platform read caches for a tenant. */
export function invalidateIntegrationReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:integration-hub`);
  apiReadCache.invalidatePrefix(`${companyId}:integration-platform`);
}

/** Clears background work status read caches for a tenant. */
export function invalidateBackgroundWorkReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:background-work`);
}

/** Clears mission control read caches for a tenant. */
export function invalidateMissionControlReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:mission-control`);
}

/** Clears customer value classification read caches for a tenant. */
export function invalidateCustomerValueReadCaches(companyId: string) {
  apiReadCache.invalidatePrefix(`${companyId}:customers/value-metrics`);
  apiReadCache.invalidatePrefix(`${companyId}:customers`);
}
