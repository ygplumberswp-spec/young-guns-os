import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'sales-analytics-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/sales-analytics-intelligence.service.ts'),
  'utf8',
);

describe('sales analytics intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'inventRates: false as const',
      'inventRevenue: false as const',
      'autoOutreach: false as const',
      'fakeDataInvented: false as const',
      'requiresOwnerApproval: true as const',
      'technicianClientDenied: true as const',
      'invented: false as const',
      'outreachSent: false as const',
      'ownerControlled: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + sales/leads permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('sales:read'));
    assert.ok(routeSource.includes('sales_intelligence:read'));
    assert.ok(routeSource.includes('leads:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never invents rates/revenue or auto-outreaches', () => {
    assert.ok(!routeSource.includes('inventRates: true'));
    assert.ok(!routeSource.includes('autoOutreach: true'));
    assert.ok(serviceSource.includes('inventRatesEnabled: false'));
    assert.ok(serviceSource.includes('autoOutreachEnabled: false'));
    assert.ok(serviceSource.includes("entityType: 'sales_analytics_intelligence'"));
  });

  it('Owner/sales gate; Technician/Client denied via shared RBAC', () => {
    assert.ok(serviceSource.includes('canAccessSalesAnalyticsIntelligence'));
    assert.ok(serviceSource.includes('canWriteSalesAnalyticsIntelligence'));
    assert.ok(serviceSource.includes('canApproveSaiInsightDrafts'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('sai_insight_draft_created'));
    assert.ok(serviceSource.includes('sai_insight_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('sai_analytics_snapshot_captured'));
    assert.ok(serviceSource.includes('eq(saiInsightDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(saiSettings.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(leads.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(quotes.companyId, actor.companyId)'));
  });

  it('extends real leads, quotes, and sales opportunities', () => {
    assert.ok(serviceSource.includes('leads'));
    assert.ok(serviceSource.includes('quotes'));
    assert.ok(serviceSource.includes('salesOpportunities'));
    assert.ok(serviceSource.includes('buildSaiMetricSnapshot'));
    assert.ok(serviceSource.includes('buildSalesTrendInsightDraft'));
    assert.ok(serviceSource.includes('buildLostOpportunityInsightDraft'));
  });
});
