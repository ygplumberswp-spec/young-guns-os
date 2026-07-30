import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  buildQueryKey,
  clearAllQueryCache,
  clearQueryCacheForScope,
  fetchQueryCache,
  primeQueryCacheEntry,
  readQueryCache,
} from './query-cache.js';

const scope = {
  tenantId: 'company-1',
  actorId: 'user-1',
  actorKind: 'staff' as const,
  roleName: 'Owner',
};

describe('query cache', () => {
  beforeEach(() => {
    clearAllQueryCache();
  });

  it('dedupes in-flight reads', async () => {
    const key = buildQueryKey('token', 'crm/customers', scope);
    let fetchCount = 0;

    const fetcher = async () => {
      fetchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return [{ id: '1' }];
    };

    const [a, b] = await Promise.all([
      fetchQueryCache(key, fetcher, { staleTimeMs: 60_000 }),
      fetchQueryCache(key, fetcher, { staleTimeMs: 60_000 }),
    ]);

    assert.deepEqual(a, b);
    assert.equal(fetchCount, 1);
  });

  it('returns stale data while revalidating in background', async () => {
    const key = buildQueryKey('token', 'jobs/list', scope);
    primeQueryCacheEntry(key, [{ id: 'job-1' }]);

    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount += 1;
      return [{ id: 'job-2' }];
    };

    const first = await fetchQueryCache(key, fetcher, { staleTimeMs: 0 });
    assert.deepEqual(first, [{ id: 'job-1' }]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fetchCount, 1);
    assert.deepEqual(readQueryCache(key), [{ id: 'job-2' }]);
  });

  it('clears tenant-scoped entries without touching other actors', async () => {
    const otherScope = { ...scope, actorId: 'user-2' };
    const keyA = buildQueryKey('token', 'crm/customers', scope);
    const keyB = buildQueryKey('token', 'crm/customers', otherScope);

    await fetchQueryCache(keyA, async () => ['a'], { staleTimeMs: 60_000 });
    await fetchQueryCache(keyB, async () => ['b'], { staleTimeMs: 60_000 });

    clearQueryCacheForScope(scope);

    assert.equal(readQueryCache(keyA), undefined);
    assert.deepEqual(readQueryCache(keyB), ['b']);
  });
});
