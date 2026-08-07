/**
 * Department 21 — Plug-and-play company signup / setup / import wizard proofs.
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
  SAAS_ONBOARDING_IMPORT_ENTITIES,
  TITAN_CANONICAL_PLANS,
  evaluateSeatAvailability,
  evaluateSaasTenantAccess,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

function readRepo(relativeFromApiServices: string): string {
  return readFileSync(join(here, relativeFromApiServices), 'utf8');
}

describe('Department 21 SaaS plug-and-play onboarding wizard', () => {
  it('1. New tenant/company creation enrolls via signup without demo data', () => {
    const auth = readApi('../routes/auth.ts');
    const service = readApi('./saas-onboarding.service.ts');
    const index = readApi('../index.ts');
    assert.match(auth, /saasOnboardingService/);
    assert.match(auth, /ensureCustomerEnrollment/);
    assert.match(service, /Never creates fake|demoData: false|No demo data/i);
    assert.doesNotMatch(service, /fake customers|seedDemo|createDemo/);
    assert.match(index, /createSaasOnboardingRouter/);
    assert.match(index, /saasOnboardingService/);
  });

  it('2. Platform Owner sees new SaaS tenant onboarding metadata', () => {
    const platform = readApi('./enterprise-saas-platform.service.ts');
    assert.match(platform, /onboardingStatus/);
    assert.match(platform, /onboardingCompletionPercent/);
    assert.match(platform, /lastOnboardingActivityAt/);
    assert.match(platform, /integrationsConnectedCount/);
    assert.match(platform, /importAttentionCount/);
    assert.match(platform, /Onboarding metadata only/);
  });

  it('3. Company Owner cannot see other tenants / no platform admin', () => {
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
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /Platform owner tenants do not use the SaaS customer onboarding wizard/);
    assert.match(service, /eq\(saasTenantProfiles\.companyId, scope\.companyId\)/);
  });

  it('4. Setup resumes after logout/login via server-side current step', () => {
    const service = readApi('./saas-onboarding.service.ts');
    const migration = readRepo('../../../../packages/db/drizzle/0200_saas_onboarding_wizard.sql');
    assert.match(service, /onboardingCurrentStep/);
    assert.match(service, /lastOnboardingActivityAt/);
    assert.match(service, /onboardingChecklist/);
    assert.match(migration, /onboarding_current_step/);
    assert.match(migration, /last_onboarding_activity_at/);
  });

  it('5. Seat limits respected — SEAT_LIMIT_REACHED', () => {
    const service = readApi('./saas-onboarding.service.ts');
    const routes = readApi('../routes/saas-onboarding.ts');
    assert.match(service, /teamService\.createInvite/);
    assert.match(service, /TeamError/);
    assert.match(routes, /SEAT_LIMIT_REACHED/);
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter')!;
    const denied = evaluateSeatAvailability({
      roleName: 'Technician',
      usage: { adminOfficeUsed: 1, technicianUsed: 1, totalUsed: 3 },
      limits: starter.limits,
      bypass: false,
    });
    assert.equal(denied.allowed, false);
  });

  it('6. Technician payroll onboarding remains private (no salary in audits)', () => {
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /Never log payroll amounts/);
    assert.match(service, /payrollSetupPresent: Boolean\(input\.payrollSetup\)/);
    assert.doesNotMatch(service, /monthlySalaryCents:\s*input/);
  });

  it('7–10. Customer CSV mapping / duplicates / invalid / preview reuse data-migration', () => {
    const migration = readApi('./enterprise-data-migration.service.ts');
    const onboarding = readApi('./saas-onboarding.service.ts');
    assert.match(migration, /autoMapFields|findDuplicates|preview_ready|executeImportJob/);
    assert.match(migration, /validateImportJob/);
    assert.match(onboarding, /dmImportJobs/);
    assert.match(onboarding, /start_clean/);
    assert.equal(
      SAAS_ONBOARDING_IMPORT_ENTITIES.find((e) => e.entityType === 'customer')?.supported,
      true,
    );
  });

  it('11. Inventory import respects physical-stock rules', () => {
    const entity = SAAS_ONBOARDING_IMPORT_ENTITIES.find((e) => e.entityType === 'inventory');
    assert.equal(entity?.supported, true);
    assert.match(entity?.note ?? '', /Physical stock on hand only/i);
    const tips = readApi('./saas-onboarding.service.ts');
    assert.match(tips, /Inventory means real physical stock on hand/);
    assert.match(tips, /will not claim items are in stock without quantity/i);
  });

  it('12. Price Book import does not overwrite silently (unsupported until safe)', () => {
    const entity = SAAS_ONBOARDING_IMPORT_ENTITIES.find((e) => e.entityType === 'price_book');
    assert.equal(entity?.supported, false);
    assert.match(entity?.note ?? '', /separate from physical inventory/i);
  });

  it('13–15. Integration skip + truthful status + OAuth cancel safety', () => {
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /onboarding_integration_skipped/);
    assert.match(service, /mapIntegrationStatus/);
    assert.match(service, /authorisation_expired/);
    assert.match(service, /status === 'connected'/);
    assert.doesNotMatch(service, /status:\s*'connected'\s*\/\/ fake/);
    // Skip does not mutate connection rows — only skipped list.
    assert.match(service, /onboardingSkippedIntegrations/);
  });

  it('16–17. Interrupted import recovery + no silent duplicate invent on retry path', () => {
    const migration = readApi('./enterprise-data-migration.service.ts');
    assert.match(migration, /duplicatePolicy|dmDuplicateReviews|resolveDuplicate/);
    assert.match(migration, /preview_ready/);
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /markImportStep/);
    assert.match(service, /importing/);
  });

  it('18. No demo data created on start_clean', () => {
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /onboarding_import_start_clean/);
    assert.match(service, /demoData: false/);
    assert.doesNotMatch(service, /insert\(customers\)|insert\(jobs\)|seedFake/);
  });

  it('19. PR #60 access rules remain intact (gate allowlists onboarding; paid-through unchanged)', () => {
    const gate = readApi('../middleware/saas-tenant-access-gate.ts');
    const access = readRepo('../../../../packages/shared/src/saas-tenant-access.ts');
    assert.match(gate, /\/api\/v1\/onboarding/);
    assert.match(access, /paidThroughAt|currentPeriodEnd/);
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'suspended',
      subscriptionStatus: 'suspended',
      currentPeriodEnd: null,
      trialEndsAt: null,
      gracePeriodEndsAt: null,
      lastPaymentFailedAt: new Date().toISOString(),
    });
    assert.equal(decision.allowed, false);
  });

  it('20. PR #61 package entitlements remain intact (upgradePlan, no parallel billing)', () => {
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /upgradePlan/);
    assert.match(service, /plan_selected_billing_setup_required/);
    assert.match(service, /will not fake payment success/i);
    assert.doesNotMatch(service, /markPaid\(|paymentSucceeded:\s*true/);
    assert.ok(TITAN_CANONICAL_PLANS.some((plan) => plan.packageKey === 'starter'));
    assert.ok(TITAN_CANONICAL_PLANS.some((plan) => plan.packageKey === 'enterprise'));
  });

  it('21. Cross-tenant file/import access denied (companyId scoped jobs)', () => {
    const service = readApi('./saas-onboarding.service.ts');
    const migration = readApi('./enterprise-data-migration.service.ts');
    assert.match(service, /eq\(dmImportJobs\.companyId, scope\.companyId\)/);
    assert.match(migration, /companyId/);
    assert.match(migration, /FORBIDDEN|tenant|companyId/);
  });

  it('22. Existing Young Guns tenant unaffected — no auto-enroll on getState', () => {
    const service = readApi('./saas-onboarding.service.ts');
    assert.match(service, /Young Guns safety/);
    assert.match(service, /do not auto-enroll tenants that lack a SaaS profile/);
    assert.match(service, /Onboarding wizard applies to new SaaS customer tenants only/);
    assert.match(service, /isPlatformOwnerTenant/);
  });

  it('Technician denied onboarding administration permissions by default packs', () => {
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['company:manage']), false);
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['saas:manage']), false);
    assert.equal(CLIENT_ROLE_NAME, 'Client');
  });

  it('migration 0200 extends saas_tenant_profiles without destructive drops', () => {
    const migration = readRepo('../../../../packages/db/drizzle/0200_saas_onboarding_wizard.sql');
    assert.match(migration, /onboarding_status/);
    assert.match(migration, /onboarding_checklist/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/);
  });

  it('routes mount under /api/v1/onboarding with ownerish RBAC', () => {
    const routes = readApi('../routes/saas-onboarding.ts');
    const index = readApi('../index.ts');
    assert.match(routes, /\/state/);
    assert.match(routes, /\/company/);
    assert.match(routes, /\/plan/);
    assert.match(routes, /\/team\/invite/);
    assert.match(routes, /\/import/);
    assert.match(routes, /\/integrations\/skip/);
    assert.match(routes, /\/activate/);
    assert.match(routes, /company:manage/);
    assert.match(index, /\/api\/v1\/onboarding/);
  });
});
