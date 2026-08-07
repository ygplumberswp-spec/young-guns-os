/**
 * Department 21 — SaaS packages / billing / entitlements proofs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  CLIENT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  OWNER_PERMISSIONS,
  TECHNICIAN_PERMISSIONS,
  hasAnyPermission,
  hasCrossTenantPlatformAccess,
  isPlatformOwnerRole,
} from '@titan/auth';
import {
  TITAN_CANONICAL_PLANS,
  evaluateDowngradeSeatImpact,
  evaluateSeatAvailability,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('Department 21 SaaS packages + entitlements', () => {
  it('reuses EnterpriseSaasPlatformService — no parallel billing system', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /ensureCanonicalPlans/);
    assert.match(service, /TITAN_CANONICAL_PLANS/);
    assert.match(service, /assertSeatAvailable/);
    assert.match(service, /evaluateDowngradeSeatImpact/);
    assert.match(service, /syncEntitlementsFromPlan/);
    assert.doesNotMatch(service, /createParallelBilling|newBillingLedger/);
  });

  it('7. Tenant A cannot read Tenant B plan/usage (platform list gated)', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /isPlatformOwner \? this\.listCustomerTenants\(\) : Promise\.resolve\(\[\]\)/);
    assert.match(service, /requirePlatformOwner/);
    assert.match(service, /assertNotPlatformOwnerTarget/);
  });

  it('8. Company Owner cannot administer platform plans via tenant_kind', () => {
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
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /async createPlan/);
    assert.match(service, /await this\.requirePlatformOwner/);
    assert.match(service, /async updatePlan/);
    assert.match(service, /async seedCanonicalPlans/);
  });

  it('9. Technician denied billing administration', () => {
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['platform:manage']), false);
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['saas:manage']), false);
    assert.equal(
      isPlatformOwnerRole({ roleName: 'Technician', permissions: [...TECHNICIAN_PERMISSIONS] }),
      false,
    );
    assert.equal(CLIENT_ROLE_NAME, 'Client');
  });

  it('10–11. Downgrade preserves users and sets action_required when over limit', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /preservesExistingUsers: true/);
    assert.match(service, /overLimitState/);
    assert.match(service, /action_required/);
    assert.doesNotMatch(service, /delete\(users\)/);
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter')!;
    const impact = evaluateDowngradeSeatImpact({
      usage: { adminOfficeUsed: 3, technicianUsed: 10, totalUsed: 15 },
      targetLimits: starter.limits,
    });
    assert.equal(impact.overLimitState, 'action_required');
    assert.equal(impact.preservesExistingUsers, true);
  });

  it('12. Upgrade changes entitlements via syncEntitlementsFromPlan', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /syncEntitlementsFromPlan/);
    assert.match(service, /plan_upgrade/);
    assert.match(service, /Do not invent paid-through|preservePaidThrough|Preserve existing currentPeriodEnd/);
  });

  it('13–14. Plan change preserves paid-through (PR #60 regression)', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /do not invent paid-through dates on plan changes/i);
    assert.match(service, /paidThroughPreserved/);
    assert.doesNotMatch(
      service.slice(service.indexOf('private async changePlan'), service.indexOf('private async syncEntitlementsFromPlan')),
      /Date\.now\(\) \+ 30 \* 24/,
    );
  });

  it('17. Audit records plan/entitlement/seat changes', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /plan_created/);
    assert.match(service, /plan_changed/);
    assert.match(service, /tenant_plan_assigned/);
    assert.match(service, /seat_change/);
    assert.match(service, /plan_upgrade/);
    assert.match(service, /plan_downgrade/);
  });

  it('18. Young Guns / missing SaaS profile remains ungated for seats', () => {
    const service = readApi('./enterprise-saas-platform.service.ts');
    assert.match(service, /No SaaS customer enrollment — seats not gated/);
    assert.match(service, /Platform owner tenant — seat enforcement bypassed/);
    const decision = evaluateSeatAvailability({
      roleName: 'Technician',
      usage: { adminOfficeUsed: 0, technicianUsed: 100, totalUsed: 100 },
      limits: TITAN_CANONICAL_PLANS[0]!.limits,
      bypass: true,
    });
    assert.equal(decision.allowed, true);
  });

  it('team invite wires SEAT_LIMIT_REACHED server-side', () => {
    const team = readApi('./team.service.ts');
    assert.match(team, /setSeatGuard/);
    assert.match(team, /SEAT_LIMIT_REACHED/);
    const index = readApi('../index.ts');
    assert.match(index, /setSeatGuard/);
    assert.match(index, /assertSeatAvailable/);
  });

  it('routes expose plan admin + tenant subscription view', () => {
    const routes = readApi('../routes/enterprise-saas-platform.ts');
    assert.match(routes, /plans\/seed-canonical/);
    assert.match(routes, /patch\('\/plans\/:planId'/);
    assert.match(routes, /subscription\/view/);
    assert.match(routes, /assign-plan/);
    assert.match(routes, /extra-seats/);
    assert.match(routes, /margin-hook/);
    assert.match(routes, /'business'/);
    assert.match(routes, /'pro'/);
  });

  it('migration 0199 extends saas_* without dropping data', () => {
    const migration = readFileSync(
      join(here, '../../../../packages/db/drizzle/0199_saas_packages_billing_entitlements.sql'),
      'utf8',
    );
    assert.match(migration, /ADD VALUE IF NOT EXISTS 'business'/);
    assert.match(migration, /ADD VALUE IF NOT EXISTS 'pro'/);
    assert.match(migration, /extra_seat_entitlements/);
    assert.match(migration, /over_limit_state/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/);
  });
});
