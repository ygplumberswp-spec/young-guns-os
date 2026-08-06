import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCmiAuditSnapshot,
  buildCmiChecksSnapshot,
  buildCmiCocSnapshot,
  buildCmiComplianceRiskDraft,
  buildCmiExpiryAlertDraft,
  buildCmiExpirySnapshot,
  buildCmiMissingDocDraft,
  buildCmiSansSnapshot,
  canAccessComplianceIntelligence,
  canApproveComplianceIntelligenceDrafts,
  canManageComplianceIntelligenceSettings,
  canWriteComplianceIntelligence,
  CMI_PRODUCT_COPY,
  cmiDaysUntil,
  defaultCmiSettings,
  isCmiCocWorkflowStatus,
  isOpenCocWorkflowStatus,
  listCmiAuraConnections,
} from './compliance-intelligence.js';

describe('compliance intelligence', () => {
  it('RBAC: Technician/Client denied; write needs legal/docs write; Owner approves', () => {
    assert.equal(
      canAccessComplianceIntelligence({
        roleName: 'Manager',
        permissions: ['legal_compliance:read'],
      }),
      true,
    );
    assert.equal(
      canAccessComplianceIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'legal_compliance:write'],
      }),
      false,
    );
    assert.equal(
      canAccessComplianceIntelligence({
        roleName: 'Client',
        permissions: ['documents:read'],
      }),
      false,
    );
    assert.equal(
      canWriteComplianceIntelligence({
        roleName: 'Manager',
        permissions: ['legal_compliance:read'],
      }),
      false,
    );
    assert.equal(
      canWriteComplianceIntelligence({
        roleName: 'Manager',
        permissions: ['documents:write'],
      }),
      true,
    );
    assert.equal(
      canApproveComplianceIntelligenceDrafts({
        roleName: 'Company Owner',
        permissions: ['legal_compliance:write'],
      }),
      true,
    );
    assert.equal(
      canApproveComplianceIntelligenceDrafts({
        roleName: 'Manager',
        permissions: ['legal_compliance:write'],
      }),
      false,
    );
    assert.equal(
      canManageComplianceIntelligenceSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('snapshots stay unavailable without real records — never invent compliance', () => {
    assert.equal(buildCmiSansSnapshot({ trackedCount: 0 }).availability, 'unavailable');
    assert.equal(
      buildCmiCocSnapshot({
        openWorkflowCount: 0,
        issuedCount: 0,
        expiredCount: 0,
        totalCount: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(
      buildCmiChecksSnapshot({
        passCount: 0,
        failCount: 0,
        incompleteCount: 0,
        totalCount: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(
      buildCmiExpirySnapshot({
        openCount: 0,
        expiringSoonCount: 0,
        expiredCount: 0,
        sourceCount: 0,
      }).availability,
      'unavailable',
    );
    assert.equal(buildCmiAuditSnapshot({ packCount: 0, readyCount: 0 }).availability, 'unavailable');
  });

  it('AURA drafts are recommendations only — never auto-certify', () => {
    const risk = buildCmiComplianceRiskDraft({
      title: 'Missing COC on job',
      detail: 'Job has documents but no COC profile.',
      checkKind: 'coc_present',
    });
    assert.equal(risk.kind, 'compliance_risk');
    assert.ok(/Does not auto-certify/i.test(risk.body));
    assert.ok(/Owner approval/i.test(risk.body));

    const missing = buildCmiMissingDocDraft({
      missingLabel: 'COC',
      scope: 'job Boiler install',
    });
    assert.equal(missing.kind, 'missing_doc');
    assert.ok(/Does not invent documents/i.test(missing.body));

    const expiry = buildCmiExpiryAlertDraft({
      title: 'Gas COC Unit 4',
      expiresAt: '2026-09-01T00:00:00.000Z',
      daysUntilExpiry: 12,
      source: 'di_document_profile',
    });
    assert.equal(expiry.kind, 'expiry_alert');
    assert.ok(/Does not auto-renew/i.test(expiry.body));
  });

  it('settings invariants forbid auto-certification + connections + helpers', () => {
    const settings = defaultCmiSettings();
    assert.equal(settings.autoCertificationEnabled, false);
    assert.equal(settings.inventComplianceRecordsEnabled, false);
    assert.equal(settings.autoExecuteActionsEnabled, false);
    assert.ok(CMI_PRODUCT_COPY.thisLayer.includes('No automatic certification'));
    assert.ok(listCmiAuraConnections().some((c) => c.href === '/document-intelligence'));
    assert.ok(listCmiAuraConnections().some((c) => c.href === '/legal-compliance'));
    assert.equal(isCmiCocWorkflowStatus('ready_for_issue'), true);
    assert.equal(isCmiCocWorkflowStatus('certified_auto'), false);
    assert.equal(isOpenCocWorkflowStatus('issued'), false);
    assert.equal(isOpenCocWorkflowStatus('review'), true);
    assert.ok(Number.isFinite(cmiDaysUntil(new Date().toISOString())));
  });
});
