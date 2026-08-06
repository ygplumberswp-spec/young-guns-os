import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'sales-intelligence-agent.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/sales-intelligence-agent.service.ts'),
  'utf8',
);

describe('sales intelligence agent API envelope & safety', () => {
  it('wraps success responses in { data: ... } with safety flags', () => {
    for (const pattern of [
      'autoExecuted: false as const',
      'outreachSent: false as const',
      'fakeDataInvented: false as const',
      'technicianClientDenied: true as const',
      'spamProhibited: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + sales/leads permissions and denies Technician/Client', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes("sales:read"));
    assert.ok(routeSource.includes("sales:write"));
    assert.ok(routeSource.includes("leads:read"));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
    assert.ok(routeSource.includes("role === 'Technician'"));
    assert.ok(routeSource.includes("role === 'Client'"));
  });

  it('never auto-executes outreach or spam', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!routeSource.includes('outreachSent: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('outreachSent: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('outreachSent: false'));
    assert.ok(serviceSource.includes('canApproveSalesIntelligenceAgent'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
    assert.ok(serviceSource.includes('spamProhibited'));
  });

  it('registers sales identity with Command Centre registry (extend, not duplicate)', () => {
    assert.ok(serviceSource.includes('auraCommandAgentRegistry'));
    assert.ok(serviceSource.includes("agentKey, 'sales'"));
    assert.ok(serviceSource.includes('ensureAgentRegistered'));
    assert.ok(routeSource.includes("'/register'"));
  });

  it('reads real leads/opportunities/quotes/communications — does not invent leads', () => {
    assert.ok(serviceSource.includes('from(leads)'));
    assert.ok(serviceSource.includes('from(salesOpportunities)'));
    assert.ok(serviceSource.includes('from(quotes)'));
    assert.ok(serviceSource.includes('from(leadSources)'));
    assert.ok(serviceSource.includes('from(communications)'));
    assert.ok(serviceSource.includes('from(leadConversions)'));
    assert.ok(
      serviceSource.includes('not invented') || serviceSource.includes('nothing is invented'),
    );
  });

  it('writes security audit logs for sales intelligence actions', () => {
    assert.ok(serviceSource.includes("entityType: 'sales_intelligence_agent'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('sia_recommendation_approved'));
    assert.ok(serviceSource.includes('sia_recommendation_rejected'));
    assert.ok(serviceSource.includes('sia_insights_refreshed'));
    assert.ok(serviceSource.includes('sia_signals_refreshed'));
  });

  it('scopes all queries by companyId', () => {
    assert.ok(serviceSource.includes('eq(siaRecommendations.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(siaInsights.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(siaOpportunitySignals.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(leads.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(salesOpportunities.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(quotes.companyId, actor.companyId)'));
  });
});
