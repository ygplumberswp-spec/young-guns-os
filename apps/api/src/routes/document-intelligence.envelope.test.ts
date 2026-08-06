import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'document-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/document-intelligence.service.ts'),
  'utf8',
);

describe('document intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoSendReminders: false as const',
      'inventDocuments: false as const',
      'fakeDocuments: false as const',
      'autoExecuted: false as const',
      'ownerControlled: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + documents permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('documents:read'));
    assert.ok(routeSource.includes('documents:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-sends reminders or invents documents from this layer', () => {
    assert.ok(!routeSource.includes('autoSendReminders: true'));
    assert.ok(!routeSource.includes('inventDocuments: true'));
    assert.ok(!serviceSource.includes('autoSendRemindersEnabled: true'));
    assert.ok(!serviceSource.includes('inventDocumentsEnabled: true'));
    assert.ok(serviceSource.includes('autoSendRemindersEnabled: false'));
    assert.ok(serviceSource.includes('inventDocumentsEnabled: false'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
  });

  it('Owner approval required for recommendation drafts', () => {
    assert.ok(serviceSource.includes('canApproveDocumentIntelligenceDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'document_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('di_recommendation_draft_created'));
    assert.ok(serviceSource.includes('eq(diRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(diSettings.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(documents.companyId, companyId)'));
  });

  it('extends real documents with search, versions, expiry, and FK links', () => {
    assert.ok(serviceSource.includes('documents'));
    assert.ok(serviceSource.includes('diDocumentProfiles'));
    assert.ok(serviceSource.includes('diDocumentVersions'));
    assert.ok(serviceSource.includes('diExpiryReminders'));
    assert.ok(serviceSource.includes('cxCustomerProperties'));
    assert.ok(serviceSource.includes('buildDocIExpiryAlertDraft'));
    assert.ok(serviceSource.includes('buildDocIMissingDocDraft'));
    // Customer/job links come off the real `documents` relations, not a rebuilt join.
    assert.ok(serviceSource.includes('customer: true'));
    assert.ok(serviceSource.includes('job: true'));
    assert.ok(serviceSource.includes('customerId: doc.customerId'));
    assert.ok(serviceSource.includes('jobId: doc.jobId'));
  });

  it('exposes search, versions, recommendations, and reminders routes', () => {
    assert.ok(routeSource.includes("'/search'"));
    assert.ok(routeSource.includes("'/documents/:id/versions'"));
    assert.ok(routeSource.includes("'/versions'"));
    assert.ok(routeSource.includes("'/recommendations/refresh'"));
    assert.ok(routeSource.includes("'/recommendations/:id/decide'"));
    assert.ok(routeSource.includes("'/reminders/:id/acknowledge'"));
  });
});
