import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLIANCE_COC_LEGAL_NOTICE,
  resolveCocAttachmentState,
  resolveFleetStoredFreshness,
} from './extended-report-source-policy.js';
import { isJobInspectionEligible } from './extended-report.js';

test('COC attachment requires genuine link — not filename alone', () => {
  const resolution = resolveCocAttachmentState({
    cocDocumentationId: null,
    diCocProfileLinked: false,
    workflowStatus: 'issued',
    completionCertificateNumber: 'COC-123',
    completionCertificateIssuedAt: '2026-01-15',
    cocRequiredRecorded: null,
    complianceWorkComplete: true,
  });
  assert.match(resolution.attachmentState, /not linked|not attached/i);
});

test('COC attached when documentation id linked', () => {
  const resolution = resolveCocAttachmentState({
    cocDocumentationId: 'doc-uuid',
    diCocProfileLinked: false,
    workflowStatus: 'review',
    completionCertificateNumber: null,
    completionCertificateIssuedAt: null,
    cocRequiredRecorded: true,
    complianceWorkComplete: null,
  });
  assert.equal(resolution.statusLabel, 'coc_attached');
});

test('fleet freshness never_synced when no sync timestamp', () => {
  assert.equal(resolveFleetStoredFreshness(null), 'never_synced');
});

test('inspection eligibility requires evidence or inspection job type', () => {
  assert.equal(
    isJobInspectionEligible({
      jobType: 'General service',
      hasSdInspection: false,
      hasInspectionDocument: false,
      hasInspectionForm: false,
    }),
    false,
  );
  assert.equal(
    isJobInspectionEligible({
      jobType: 'Annual inspection',
      hasSdInspection: false,
      hasInspectionDocument: false,
      hasInspectionForm: false,
    }),
    true,
  );
});

test('legal notice states support-only role', () => {
  assert.match(COMPLIANCE_COC_LEGAL_NOTICE, /does not replace/i);
});
