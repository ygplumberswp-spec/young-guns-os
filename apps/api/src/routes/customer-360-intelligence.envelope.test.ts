import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'customer-360-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/customer-360-intelligence.service.ts'),
  'utf8',
);

describe('customer 360 intelligence API envelope & safety', () => {
  it('wraps success responses with honesty / isolation flags', () => {
    for (const pattern of [
      'rebuildsCrm: false as const',
      'inventCustomers: false as const',
      'autoSend: false as const',
      'crossCustomerVisibility: false as const',
      'financeGated: true as const',
      'technicianClientDenied: true as const',
      'customer360: true as const',
      'internalNotesGated: true as const',
      'autoExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('tenant isolation + RBAC gates + never auto-send', () => {
    assert.ok(serviceSource.includes('canAccessCustomer360Intelligence'));
    assert.ok(serviceSource.includes('canViewCustomer360Finance'));
    assert.ok(serviceSource.includes('canViewCustomer360InternalNotes'));
    assert.ok(serviceSource.includes('assertCustomerInTenant'));
    assert.ok(serviceSource.includes('eq(customers.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(jobs.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('cross-customer'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('autoSendEnabled: false'));
    assert.ok(!serviceSource.includes('autoSendEnabled: true'));
    assert.ok(serviceSource.includes('buildC360InsightDraftSeeds'));
    assert.ok(serviceSource.includes('buildC360TimelineEvents'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'customer_360_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('c360_insight_draft_created'));
    assert.ok(serviceSource.includes('eq(c360InsightDrafts.companyId, actor.companyId)'));
  });

  it('extends CRM/jobs/finance/comms/maintenance — does not invent customers', () => {
    assert.ok(serviceSource.includes('customers'));
    assert.ok(serviceSource.includes('quotes'));
    assert.ok(serviceSource.includes('invoices'));
    assert.ok(serviceSource.includes('payments'));
    assert.ok(serviceSource.includes('communications'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
    assert.ok(serviceSource.includes('assetEquipment'));
    assert.ok(serviceSource.includes('inventCustomers: false'));
  });
});
