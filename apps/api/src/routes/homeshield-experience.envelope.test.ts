import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'homeshield-experience.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/homeshield-experience.service.ts'),
  'utf8',
);

describe('homeshield experience API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoBilling: false as const',
      'autoCharge: false as const',
      'billingCharged: false as const',
      'inventedMemberships: false as const',
      'fakeSubscriptions: false as const',
      'invoiceCreated: false as const',
      'chargeCreated: false as const',
      'autoExecuted: false as const',
      'sent: false as const',
      'ownerControlled: true as const',
      'portalOwnDataOnly: true as const',
      'inventedClv: false as const',
      'fakeChurn: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + customers/portal/finance permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('customers:read'));
    assert.ok(routeSource.includes('customers:write'));
    assert.ok(routeSource.includes('portal:read'));
    assert.ok(routeSource.includes('portal:manage'));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('requirePortalAuth'));
    assert.ok(routeSource.includes("requirePortalPermission('portal.dashboard:read')"));
  });

  it('never auto-bills or auto-charges from this layer', () => {
    assert.ok(!routeSource.includes('autoBilling: true'));
    assert.ok(!routeSource.includes('autoCharge: true'));
    assert.ok(!serviceSource.includes('autoBillingEnabled: true'));
    assert.ok(!serviceSource.includes('autoChargeEnabled: true'));
    assert.ok(serviceSource.includes('autoBilling: false'));
    assert.ok(serviceSource.includes('billingCharged: false'));
    assert.ok(serviceSource.includes('invoiceCreated: false'));
    assert.ok(serviceSource.includes('chargeCreated: false'));
  });

  it('Owner approval required for renewals and outreach', () => {
    assert.ok(serviceSource.includes('canApproveHomeshieldActions'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'homeshield_experience'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('hs_renewal_'));
    assert.ok(serviceSource.includes('hs_aura_insight_'));
    assert.ok(serviceSource.includes('eq(hsMembershipPlans.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(hsSubscriptions.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(hsSubscriptions.customerId, scope.customerId)'));
  });

  it('extends recurring maintenance history and real customers', () => {
    assert.ok(serviceSource.includes('opsMaintenanceRuns'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
    assert.ok(serviceSource.includes('customers'));
    assert.ok(serviceSource.includes('buildHsMembershipSnapshot'));
    assert.ok(serviceSource.includes('buildHsRenewalOpportunityDraft'));
    assert.ok(serviceSource.includes('getPortalMembership'));
    assert.ok(serviceSource.includes('refreshAuraInsights'));
    assert.ok(serviceSource.includes('buildHsRetentionSnapshot'));
    assert.ok(serviceSource.includes('buildHsCustomerValueInsightDraft'));
  });
});
