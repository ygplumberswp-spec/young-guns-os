import test from 'node:test';
import assert from 'node:assert/strict';
import { apiReadCache, buildTenantCacheKey, cachedTenantRead, invalidateIntegrationReadCaches } from './api-read-cache.js';

test('cachedTenantRead stores and returns values until invalidated', async () => {
  apiReadCache.invalidateAll();
  let loads = 0;

  const first = await cachedTenantRead(
    buildTenantCacheKey('tenant-a', 'crm/stats'),
    async () => {
      loads += 1;
      return { customerCount: 3 };
    },
    30_000,
  );

  const second = await cachedTenantRead(
    buildTenantCacheKey('tenant-a', 'crm/stats'),
    async () => {
      loads += 1;
      return { customerCount: 99 };
    },
    30_000,
  );

  assert.deepEqual(first, { customerCount: 3 });
  assert.deepEqual(second, { customerCount: 3 });
  assert.equal(loads, 1);
});

test('invalidateTenant clears tenant-scoped cache entries', async () => {
  apiReadCache.invalidateAll();
  let tenantALoads = 0;

  await cachedTenantRead(buildTenantCacheKey('tenant-a', 'jobs/stats'), async () => {
    tenantALoads += 1;
    return { totalCount: 1, activeCount: 1 };
  });
  await cachedTenantRead(buildTenantCacheKey('tenant-b', 'jobs/stats'), async () => ({
    totalCount: 2,
    activeCount: 1,
  }));

  apiReadCache.invalidateTenant('tenant-a');

  await cachedTenantRead(buildTenantCacheKey('tenant-a', 'jobs/stats'), async () => {
    tenantALoads += 1;
    return { totalCount: 5, activeCount: 2 };
  });

  assert.equal(tenantALoads, 2);
});

test('invalidateIntegrationReadCaches clears integration namespaces only for tenant', async () => {
  apiReadCache.invalidateAll();
  let hubLoads = 0;

  await cachedTenantRead(buildTenantCacheKey('tenant-a', 'integration-hub/dashboard', 'simple'), async () => {
    hubLoads += 1;
    return { ok: true };
  });
  await cachedTenantRead(buildTenantCacheKey('tenant-a', 'crm/stats'), async () => ({ customers: 1 }));
  await cachedTenantRead(buildTenantCacheKey('tenant-b', 'integration-hub/dashboard', 'simple'), async () => ({
    ok: true,
  }));

  invalidateIntegrationReadCaches('tenant-a');

  await cachedTenantRead(buildTenantCacheKey('tenant-a', 'integration-hub/dashboard', 'simple'), async () => {
    hubLoads += 1;
    return { ok: true };
  });

  const crmCached = apiReadCache.get(buildTenantCacheKey('tenant-a', 'crm/stats'));
  const tenantBHubCached = apiReadCache.get(
    buildTenantCacheKey('tenant-b', 'integration-hub/dashboard', 'simple'),
  );

  assert.equal(hubLoads, 2);
  assert.deepEqual(crmCached, { customers: 1 });
  assert.deepEqual(tenantBHubCached, { ok: true });
});
