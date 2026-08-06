import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'property-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/property-intelligence.service.ts'),
  'utf8',
);

describe('property intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoSend: false as const',
      'inventedProperty: false as const',
      'inventCoordinates: false as const',
      'fakeProperties: false as const',
      'autoComms: false as const',
      'autoSent: false as const',
      'invented: false as const',
      'ownerControlled: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + customers/jobs/documents/ops permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('customers:read'));
    assert.ok(routeSource.includes('customers:write'));
    assert.ok(routeSource.includes('jobs:read'));
    assert.ok(routeSource.includes('documents:read'));
    assert.ok(routeSource.includes('ops:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-sends or invents properties from this layer', () => {
    assert.ok(!routeSource.includes('autoSend: true'));
    assert.ok(!routeSource.includes('inventedProperty: true'));
    assert.ok(!serviceSource.includes('autoSendEnabled: true'));
    assert.ok(!serviceSource.includes('inventPropertiesEnabled: true'));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('inventedProperty: false'));
  });

  it('Owner approval required for insight drafts', () => {
    assert.ok(serviceSource.includes('canApprovePropertyIntelligenceDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'property_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('pri_insight_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('pri_insight_draft_created'));
    assert.ok(serviceSource.includes('eq(priInsightDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(priSettings.companyId, actor.companyId)'));
  });

  it('extends real properties, customers, jobs, documents, maintenance, and Maps', () => {
    assert.ok(serviceSource.includes('cxCustomerProperties'));
    assert.ok(serviceSource.includes('customers'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('completionReports'));
    assert.ok(serviceSource.includes('jobDocumentPackItems'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
    assert.ok(serviceSource.includes('alAssetRegistryProfiles'));
    assert.ok(serviceSource.includes('integrationConnections'));
    assert.ok(serviceSource.includes("provider, 'google_maps'"));
    assert.ok(serviceSource.includes('buildPriMapsSnapshot'));
    assert.ok(serviceSource.includes('buildPriInsightDraft'));
  });
});
