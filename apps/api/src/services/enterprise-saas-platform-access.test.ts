/**
 * Department 21 — Platform Owner SaaS access control proofs (staging/feature branch).
 * Source + RBAC matrix checks — no production mutation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  CLIENT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  MANAGER_PERMISSIONS,
  MANAGER_ROLE_NAME,
  OWNER_PERMISSIONS,
  PLATFORM_OWNER_ROLE_NAME,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
  hasAnyPermission,
  hasCrossTenantPlatformAccess,
  isPlatformOwnerRole,
} from '@titan/auth';
import {
  evaluateSaasTenantAccess,
  saasAccessStatusChip,
} from '@titan/shared';
import { isSaasAccessAllowlistedPath } from '../middleware/saas-tenant-access-gate.js';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

const now = new Date('2026-08-26T12:00:00.000Z');

describe('Department 21 SaaS Platform Owner access control', () => {
  it('1. active paid tenant → access allowed', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-08-31T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(saasAccessStatusChip(decision), 'ACTIVE');
  });

  it('2. renewal failed but paid-through still future → access remains allowed', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-31T23:59:59.000Z',
      lastPaymentFailedAt: '2026-08-25T10:00:00.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.paymentFailed, true);
    assert.equal(saasAccessStatusChip(decision), 'PAYMENT FAILED');
  });

  it('3. paid-through expired + no renewal → access suspended', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-20T23:59:59.000Z',
      lastPaymentFailedAt: '2026-08-15T10:00:00.000Z',
      now,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.shouldAutoSuspend, true);
    assert.equal(saasAccessStatusChip(decision), 'EXPIRED');
  });

  it('4. successful valid renewal → access restored', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-30T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.paymentFailed, false);
  });

  it('5. manual Platform Owner suspension → access blocked', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'suspended',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-30T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.blockReason, 'manual_suspension');
  });

  it('6. Platform Owner reactivation restores access when entitlement allows', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /async reactivateTenant/);
    assert.match(service, /manual_reactivate/);
    assert.match(service, /Reactivation requires a valid paid-through entitlement/);
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-30T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
  });

  it('7. suspension preserves business data (access-only, no purge)', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /Do not erase paid-through/);
    assert.match(service, /suspension is access-only/);
    assert.doesNotMatch(service, /delete\(companies\)/);
    assert.doesNotMatch(service, /hardDeleteTenant|purgeTenant|DROP TABLE/);
    const migration = readFileSync(
      join(here, '../../../../packages/db/drizzle/0198_saas_tenant_access_control.sql'),
      'utf8',
    );
    assert.match(migration, /suspension_reason/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/);
  });

  it('8–11. Company Owner / Manager / Technician / Client cannot use Platform Owner controls via tenant_kind', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /requirePlatformOwner/);
    assert.match(service, /tenantKind === 'platform_owner'/);
    assert.match(service, /Platform owner access required/);

    // Company Owner wildcard is in-tenant only — not cross-tenant platform.
    assert.equal(
      hasCrossTenantPlatformAccess({
        roleName: COMPANY_OWNER_ROLE_NAME,
        permissions: [...OWNER_PERMISSIONS],
      }),
      false,
    );
    assert.equal(
      isPlatformOwnerRole({
        roleName: COMPANY_OWNER_ROLE_NAME,
        permissions: [...OWNER_PERMISSIONS],
      }),
      false,
    );
    assert.equal(
      hasAnyPermission([...MANAGER_PERMISSIONS], ['platform:manage']),
      false,
    );
    assert.equal(
      hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['platform:manage']),
      false,
    );
    assert.equal(CLIENT_ROLE_NAME, 'Client');
    assert.equal(
      isPlatformOwnerRole({ roleName: CLIENT_ROLE_NAME, permissions: [] }),
      false,
    );
    assert.equal(
      isPlatformOwnerRole({
        roleName: PLATFORM_OWNER_ROLE_NAME,
        permissions: ['*', 'platform:cross_tenant'],
      }),
      true,
    );

    const routes = readApi('../routes/enterprise-saas-platform.ts');
    assert.match(routes, /requirePlatformManage/);
    assert.match(routes, /suspendTenant/);
    assert.match(routes, /reactivateTenant/);
    assert.match(routes, /cancelTenantAccess/);
    assert.match(routes, /recordPaymentFailure/);
    assert.match(routes, /recordSuccessfulPayment/);
  });

  it('12. Tenant A cannot query/control Tenant B (platform list only for platform_owner company)', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /isPlatformOwner \? this\.listCustomerTenants\(\) : Promise\.resolve\(\[\]\)/);
    assert.match(service, /assertNotPlatformOwnerTarget/);
    assert.match(service, /Only the platform owner can provision tenants/);
  });

  it('13. audit trail records suspend/reactivate/cancel with actor and before/after', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /tenant_suspended/);
    assert.match(service, /tenant_reactivated/);
    assert.match(service, /tenant_access_cancelled/);
    assert.match(service, /beforeAccess/);
    assert.match(service, /afterAccess/);
    assert.match(service, /performedByUserId: scope\.userId/);
    assert.match(service, /companyId: scope\.companyId/);
  });

  it('14. repeated payment/provider events are idempotent', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /paymentProviderRef === providerRef/);
    assert.match(service, /Idempotent on paymentProviderRef|idempotent/i);
  });

  it('15. reactivation does not create a second tenant', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    const reactivateBlock = service.slice(
      service.indexOf('async reactivateTenant'),
      service.indexOf('async cancelTenantAccess'),
    );
    assert.doesNotMatch(reactivateBlock, /insert\(companies\)/);
    assert.doesNotMatch(reactivateBlock, /insert\(saasTenantProfiles\)/);
    assert.match(reactivateBlock, /updateTenantLifecycle/);
  });

  it('16. Young Guns / platform_owner staff lifecycle is unaffected by subscription gate', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'platform_owner',
      lifecycleStatus: 'suspended',
      subscriptionStatus: 'cancelled',
      currentPeriodEnd: null,
      now,
    });
    assert.equal(decision.allowed, true);

    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /Do NOT ensure\/create profiles here/);
    assert.match(service, /missing profile means not a SaaS customer/);
    assert.match(service, /assertNotPlatformOwnerTarget/);

    const gate = readApi('../middleware/saas-tenant-access-gate.ts');
    assert.match(gate, /Platform-owner \(Young Guns\) tenants are never blocked/);
    assert.match(gate, /Fail open on evaluator/);
  });

  it('access-status + auth paths are allowlisted; operational paths are not', () => {
    assert.equal(isSaasAccessAllowlistedPath('/api/v1/auth/me'), true);
    assert.equal(isSaasAccessAllowlistedPath('/api/v1/auth/login'), true);
    assert.equal(isSaasAccessAllowlistedPath('/api/v1/platform/access-status'), true);
    assert.equal(isSaasAccessAllowlistedPath('/api/v1/jobs'), false);
    assert.equal(isSaasAccessAllowlistedPath('/api/v1/crm/customers'), false);
  });

  it('auth middleware wires SaaS entitlement gate after authentication', () => {
    const auth = readApi('../middleware/auth.ts');
    assert.match(auth, /enforceSaasTenantAccessGate/);
    const index = readApi('../index.ts');
    assert.match(index, /configureSaasTenantAccessGate/);
  });

  it('routes expose access-status for customer locked experience', () => {
    const routes = readApi('../routes/enterprise-saas-platform.ts');
    assert.match(routes, /\/access-status/);
    assert.match(routes, /getCustomerAccessStatus/);
    assert.match(routes, /TITAN subscription requires attention|customerMessage/);
  });
});
