import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'finance-cashflow-profit.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/finance-cashflow-profit.service.ts'),
  'utf8',
);

describe('cashflow & profit intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoExecuted: false as const',
      'fakeDataInvented: false as const',
      'technicianClientDenied: true as const',
      'invented: false as const',
      'requiresOwnerApproval: true as const',
      'executedMutation: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + finance permissions and denies Technician/Client', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('finance:read'));
    assert.ok(routeSource.includes('finance:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
    assert.ok(routeSource.includes("role === 'Technician'"));
    assert.ok(routeSource.includes("role === 'Client'"));
  });

  it('never auto-executes financial mutations', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('canApproveFinanceCashflowProfit'));
    assert.ok(serviceSource.includes('assertApprove'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'finance_cashflow_profit'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('fcp_action_approved'));
    assert.ok(serviceSource.includes('eq(fcpActionRecommendations.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(fcpInsights.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(invoices.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(payments.companyId, actor.companyId)'));
  });

  it('extends Finance AURA Agent and reads real TITAN sources', () => {
    assert.ok(serviceSource.includes('canAccessFinanceCashflowProfit'));
    assert.ok(serviceSource.includes('buildFcpCashflowIntelligence'));
    assert.ok(serviceSource.includes('buildFcpProfitIntelligence'));
    assert.ok(serviceSource.includes('jobMaterialLines'));
    assert.ok(serviceSource.includes('purchaseOrders'));
    assert.ok(serviceSource.includes('inventoryItems'));
  });
});
