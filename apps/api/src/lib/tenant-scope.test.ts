import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPANY_OWNER_ROLE_NAME,
  PLATFORM_CROSS_TENANT_PERMISSION,
  PLATFORM_OWNER_ROLE_NAME,
} from '@titan/auth';
import { assertTenantScope, resolveScopedCompanyId, TenantScopeError } from './tenant-scope.js';

describe('tenant scope isolation', () => {
  it('allows Company Owner only inside their tenant', () => {
    const identity = {
      roleName: COMPANY_OWNER_ROLE_NAME,
      permissions: ['*'],
      companyId: 'company-a',
    };
    assert.doesNotThrow(() => assertTenantScope(identity, 'company-a'));
    assert.throws(
      () => assertTenantScope(identity, 'company-b'),
      (error: unknown) => error instanceof TenantScopeError,
    );
    assert.equal(resolveScopedCompanyId(identity, null), 'company-a');
    assert.throws(
      () => resolveScopedCompanyId(identity, 'company-b'),
      (error: unknown) => error instanceof TenantScopeError,
    );
  });

  it('allows Platform Owner cross-tenant access', () => {
    const identity = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', PLATFORM_CROSS_TENANT_PERMISSION],
      companyId: 'platform-tenant',
    };
    assert.doesNotThrow(() => assertTenantScope(identity, 'company-b'));
    assert.equal(resolveScopedCompanyId(identity, 'company-b'), 'company-b');
  });

  it('blocks ID substitution for non-platform staff', () => {
    const dispatcher = {
      roleName: 'Dispatcher',
      permissions: ['jobs:read'],
      companyId: 'company-a',
    };
    assert.throws(
      () => assertTenantScope(dispatcher, 'company-other'),
      (error: unknown) => error instanceof TenantScopeError && error.code === 'CROSS_TENANT_DENIED',
    );
  });
});
