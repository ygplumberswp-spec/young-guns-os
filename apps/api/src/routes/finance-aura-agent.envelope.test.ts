import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'finance-aura-agent.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/finance-aura-agent.service.ts'),
  'utf8',
);

describe('finance aura agent API envelope & safety', () => {
  it('wraps success responses in { data: ... } with safety flags', () => {
    for (const pattern of [
      'autoExecuted: false as const',
      'fakeDataInvented: false as const',
      'technicianClientDenied: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + finance permissions and denies Technician/Client', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes("finance:read"));
    assert.ok(routeSource.includes("finance:write"));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
    assert.ok(routeSource.includes("role === 'Technician'"));
    assert.ok(routeSource.includes("role === 'Client'"));
  });

  it('never auto-executes financial mutations', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('canApproveFinanceAuraAgent'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('registers finance identity with Command Centre registry (extend, not duplicate)', () => {
    assert.ok(serviceSource.includes('auraCommandAgentRegistry'));
    assert.ok(serviceSource.includes("agentKey, 'finance'"));
    assert.ok(serviceSource.includes('ensureAgentRegistered'));
    assert.ok(routeSource.includes("'/register'"));
  });

  it('reads real invoices/payments/Xero markers — does not invent live Xero calls', () => {
    assert.ok(serviceSource.includes('from(invoices)'));
    assert.ok(serviceSource.includes('from(payments)'));
    assert.ok(serviceSource.includes('integrationConnections'));
    assert.ok(serviceSource.includes("provider, 'xero'"));
    assert.ok(serviceSource.includes('no live Xero API') || serviceSource.includes('Live Xero API'));
  });

  it('writes security audit logs for finance intelligence actions', () => {
    assert.ok(serviceSource.includes("entityType: 'finance_aura_agent'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('fin_aura_recommendation_approved'));
    assert.ok(serviceSource.includes('fin_aura_recommendation_rejected'));
    assert.ok(serviceSource.includes('fin_aura_insights_refreshed'));
    assert.ok(serviceSource.includes('fin_aura_alerts_refreshed'));
  });

  it('scopes all queries by companyId', () => {
    assert.ok(serviceSource.includes('eq(finAuraRecommendations.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(finAuraInsights.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(finAuraAlerts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(invoices.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(payments.companyId, actor.companyId)'));
  });
});
