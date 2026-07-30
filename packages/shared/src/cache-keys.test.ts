import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildScopedCacheKey, cacheKeyMatchesScope } from './cache-keys.js';

describe('cache keys', () => {
  it('builds tenant-scoped keys with role and filters', () => {
    const key = buildScopedCacheKey(
      {
        tenantId: 'company-1',
        actorId: 'user-1',
        actorKind: 'staff',
        roleName: 'Owner',
      },
      'crm/customers',
    );

    assert.match(key, /staff:t:company-1:a:user-1:r:Owner:q:crm\/customers/);
  });

  it('includes portal customer scope', () => {
    const key = buildScopedCacheKey(
      {
        tenantId: 'company-1',
        actorId: 'portal-1',
        actorKind: 'portal',
        customerId: 'customer-9',
      },
      'portal/jobs',
    );

    assert.match(key, /portal:t:company-1:a:portal-1:cust:customer-9:q:portal\/jobs/);
  });

  it('falls back to legacy token key when scope is missing', () => {
    assert.equal(buildScopedCacheKey(null, 'jobs/list', 'token-abc'), 'legacy:token-abc:jobs/list');
  });

  it('matches scope prefixes for invalidation', () => {
    const scope = {
      tenantId: 'company-1',
      actorId: 'user-1',
      actorKind: 'staff' as const,
    };
    const key = buildScopedCacheKey(scope, 'finance/invoices');
    assert.equal(cacheKeyMatchesScope(key, scope), true);
    assert.equal(
      cacheKeyMatchesScope(buildScopedCacheKey({ ...scope, actorId: 'user-2' }, 'x'), scope),
      false,
    );
  });
});
