import type { AiOperationAllowanceSummary } from '@titan/shared';
import type { aiProviderResilienceConfigs } from '@titan/db';

export type TenantRoutingSnapshot = {
  hasTenantProvider: boolean;
  hasRoutingRule: boolean;
  hasFallbackOrder: boolean;
  taskRoutingEnabled: boolean;
  blockedCategories: string[];
  resilienceConfigVersion: string;
};

export type AiAllowancePolicySnapshot = {
  isPlatformOwner: boolean;
  subscriptionUsable: boolean;
  monthlyTokenLimit: number | null;
};

type ResilienceConfigRow = typeof aiProviderResilienceConfigs.$inferSelect;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const ALLOWANCE_TTL_MS = 30_000;
const CONFIG_TTL_MS = 60_000;
const TENANT_SNAPSHOT_TTL_MS = 30_000;
const POLICY_SNAPSHOT_TTL_MS = 60_000;

class AiRoutingCacheStore {
  private readonly allowance = new Map<string, CacheEntry<AiOperationAllowanceSummary>>();
  private readonly config = new Map<string, CacheEntry<ResilienceConfigRow>>();
  private readonly tenantSnapshot = new Map<string, CacheEntry<TenantRoutingSnapshot>>();
  private readonly policySnapshot = new Map<string, CacheEntry<AiAllowancePolicySnapshot>>();

  getAllowance(companyId: string): AiOperationAllowanceSummary | null {
    return this.get(this.allowance, companyId);
  }

  setAllowance(companyId: string, value: AiOperationAllowanceSummary) {
    this.set(this.allowance, companyId, value, ALLOWANCE_TTL_MS);
  }

  getConfig(companyId: string): ResilienceConfigRow | null {
    return this.get(this.config, companyId);
  }

  setConfig(companyId: string, value: ResilienceConfigRow) {
    this.set(this.config, companyId, value, CONFIG_TTL_MS);
  }

  getPolicySnapshot(companyId: string): AiAllowancePolicySnapshot | null {
    return this.get(this.policySnapshot, companyId);
  }

  setPolicySnapshot(companyId: string, value: AiAllowancePolicySnapshot) {
    this.set(this.policySnapshot, companyId, value, POLICY_SNAPSHOT_TTL_MS);
  }

  getTenantSnapshot(cacheKey: string): TenantRoutingSnapshot | null {
    return this.get(this.tenantSnapshot, cacheKey);
  }

  setTenantSnapshot(cacheKey: string, value: TenantRoutingSnapshot) {
    this.set(this.tenantSnapshot, cacheKey, value, TENANT_SNAPSHOT_TTL_MS);
  }

  invalidateTenant(companyId: string) {
    this.allowance.delete(companyId);
    this.config.delete(companyId);
    this.policySnapshot.delete(companyId);

    for (const key of this.tenantSnapshot.keys()) {
      if (key.startsWith(`${companyId}:`)) {
        this.tenantSnapshot.delete(key);
      }
    }
  }

  invalidateAllowance(companyId: string) {
    this.allowance.delete(companyId);
  }

  invalidateAll() {
    this.allowance.clear();
    this.config.clear();
    this.policySnapshot.clear();
    this.tenantSnapshot.clear();
  }

  private get<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  private set<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

export const aiRoutingCache = new AiRoutingCacheStore();

export function buildTenantSnapshotCacheKey(
  companyId: string,
  routingCategory: string | undefined,
): string {
  return `${companyId}:${routingCategory ?? 'none'}`;
}

export function resilienceConfigVersion(row: ResilienceConfigRow): string {
  return `${row.updatedAt.toISOString()}:${row.fallbackOrder.length}:${row.blockedCategories.length}:${row.taskRoutingEnabled}`;
}
