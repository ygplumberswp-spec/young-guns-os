import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'compliance-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/compliance-intelligence.service.ts'),
  'utf8',
);

describe('compliance intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoCertification: false as const',
      'inventComplianceRecords: false as const',
      'fakeComplianceRecords: false as const',
      'autoExecuted: false as const',
      'ownerControlled: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + legal_compliance/documents permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('legal_compliance:read'));
    assert.ok(routeSource.includes('documents:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-certifies or invents compliance records', () => {
    assert.ok(!routeSource.includes('autoCertification: true'));
    assert.ok(!routeSource.includes('inventComplianceRecords: true'));
    assert.ok(serviceSource.includes('autoCertificationEnabled: false'));
    assert.ok(serviceSource.includes('inventComplianceRecordsEnabled: false'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('certificationDecision: false'));
    assert.ok(serviceSource.includes('autoCertified: false'));
  });

  it('Owner approval required for recommendation drafts and issued COC status', () => {
    assert.ok(serviceSource.includes('canApproveComplianceIntelligenceDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
    assert.ok(serviceSource.includes("input.status === 'issued'"));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'compliance_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('cmi_recommendation_draft_created'));
    assert.ok(serviceSource.includes('eq(cmiRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(cmiSettings.companyId, actor.companyId)'));
  });

  it('extends documents, DI, legal compliance, properties, jobs, equipment', () => {
    assert.ok(serviceSource.includes('documents'));
    assert.ok(serviceSource.includes('diDocumentProfiles'));
    assert.ok(serviceSource.includes('lcComplianceRecords'));
    assert.ok(serviceSource.includes('lcInsurancePolicies'));
    assert.ok(serviceSource.includes('cxCustomerProperties'));
    assert.ok(serviceSource.includes('assetEquipment'));
    assert.ok(serviceSource.includes('buildCmiExpiryAlertDraft'));
    assert.ok(serviceSource.includes('buildCmiMissingDocDraft'));
    assert.ok(serviceSource.includes('buildCmiComplianceRiskDraft'));
    assert.ok(serviceSource.includes('jobs'));
  });

  it('exposes SANS, COC, checks, expiry, audit, and recommendation routes', () => {
    assert.ok(routeSource.includes("'/sans-standards'"));
    assert.ok(routeSource.includes("'/coc-workflows'"));
    assert.ok(routeSource.includes("'/coc-workflows/:id/status'"));
    assert.ok(routeSource.includes("'/checks/run'"));
    assert.ok(routeSource.includes("'/recommendations/refresh'"));
    assert.ok(routeSource.includes("'/recommendations/:id/decide'"));
    assert.ok(routeSource.includes("'/expiry/:id/acknowledge'"));
    assert.ok(routeSource.includes("'/audit-packs'"));
  });
});
