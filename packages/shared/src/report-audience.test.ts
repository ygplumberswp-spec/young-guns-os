import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertReportHtmlFreeOfSensitiveFields,
  parseRequestedReportAudience,
  ReportAudienceError,
  resolvePortalReportAudience,
  resolveStaffReportAudience,
} from './report-audience.js';
import { buildOperationalJobReportHtml } from './operational-report-html.js';
import type { OperationalJobReportContext } from './operational-report.js';

const baseCtx: OperationalJobReportContext = {
  reportReference: 'JOB-1001',
  jobNumber: 'YG-1001',
  jobTitle: 'Geyser replacement',
  jobType: 'plumbing',
  jobStatus: 'completed',
  priority: 'normal',
  scheduledAt: null,
  completedAt: null,
  customerName: 'Acme',
  customerContact: null,
  customerEmail: null,
  customerPhone: null,
  propertyName: null,
  siteAddress: '1 Main Rd',
  addressLines: [],
  mapPlaceUrl: null,
  mapNote: null,
  technicianName: 'Sam',
  jobDescription: 'Replace geyser',
  diagnosis: 'Failed element',
  workCompleted: 'Replaced geyser',
  internalNotes: 'Margin review pending — confidential',
  materials: [{ description: 'Geyser', quantity: '1', unit: 'ea', status: 'used' }],
  photosBefore: [],
  photosDuring: [],
  photosAfter: [],
  supportingPhotos: [],
  attachments: [],
  signatures: [],
  recommendedMaintenance: null,
  warrantyNotes: null,
  cocState: 'not_attached',
  cocReference: null,
  completionStatus: 'Completed',
  quoteLabel: 'Quote 1',
  invoiceLabel: 'Invoice 1',
};

test('parseRequestedReportAudience accepts canonical values case-insensitively', () => {
  assert.equal(parseRequestedReportAudience('internal'), 'internal');
  assert.equal(parseRequestedReportAudience('CLIENT'), 'client');
  assert.equal(parseRequestedReportAudience(['Technician']), 'technician');
  assert.equal(parseRequestedReportAudience('bogus'), null);
});

test('technician with jobs:read cannot receive internal audience even when requested', () => {
  const decision = resolveStaffReportAudience({
    companyId: 'tenant-a',
    userId: 'tech-1',
    roleName: 'Technician',
    permissions: ['jobs:read'],
    requestedAudience: 'internal',
    jobAssignedUserId: 'tech-1',
    isAssignedToJob: true,
  });
  assert.equal(decision.effectiveAudience, 'technician');
  assert.equal(decision.audienceEscalationAttempt, true);
});

test('unassigned technician is denied', () => {
  assert.throws(
    () =>
      resolveStaffReportAudience({
        companyId: 'tenant-a',
        userId: 'tech-1',
        roleName: 'Technician',
        permissions: ['jobs:read'],
        requestedAudience: 'technician',
        jobAssignedUserId: 'other',
        isAssignedToJob: false,
      }),
    (error: unknown) => error instanceof ReportAudienceError && error.code === 'FORBIDDEN',
  );
});

test('technician with jobs:read alone cannot access internal via office path', () => {
  assert.throws(
    () =>
      resolveStaffReportAudience({
        companyId: 'tenant-a',
        userId: 'tech-1',
        roleName: 'Technician',
        permissions: ['jobs:read'],
        requestedAudience: 'internal',
        jobAssignedUserId: null,
        isAssignedToJob: false,
      }),
    (error: unknown) => error instanceof ReportAudienceError,
  );
});

test('office with documents:read may request internal audience', () => {
  const decision = resolveStaffReportAudience({
    companyId: 'tenant-a',
    userId: 'office-1',
    roleName: 'Office Staff',
    permissions: ['documents:read', 'jobs:read'],
    requestedAudience: 'internal',
    jobAssignedUserId: null,
    isAssignedToJob: false,
  });
  assert.equal(decision.effectiveAudience, 'internal');
});

test('office without documents:read cannot request internal audience', () => {
  assert.throws(
    () =>
      resolveStaffReportAudience({
        companyId: 'tenant-a',
        userId: 'office-1',
        roleName: 'Office Staff',
        permissions: ['jobs:read'],
        requestedAudience: 'internal',
        jobAssignedUserId: null,
        isAssignedToJob: false,
      }),
    (error: unknown) => error instanceof ReportAudienceError,
  );
});

test('portal actor always receives client audience regardless of query hint', () => {
  const decision = resolvePortalReportAudience({
    companyId: 'tenant-a',
    customerId: 'cust-1',
    permissions: ['portal.jobs:read'],
    resourceCustomerId: 'cust-1',
    requestedAudience: 'internal',
  });
  assert.equal(decision.effectiveAudience, 'client');
  assert.equal(decision.audienceEscalationAttempt, true);
});

test('portal cross-customer resource is denied', () => {
  assert.throws(
    () =>
      resolvePortalReportAudience({
        companyId: 'tenant-a',
        customerId: 'cust-1',
        permissions: ['portal.jobs:read'],
        resourceCustomerId: 'cust-2',
        requestedAudience: 'client',
      }),
    (error: unknown) => error instanceof ReportAudienceError,
  );
});

test('client-safe job HTML excludes internal notes', () => {
  const html = buildOperationalJobReportHtml({
    kind: 'job',
    audience: 'client',
    ctx: baseCtx,
    generatedAt: '2026-08-05T12:00:00.000Z',
  });
  assert.doesNotMatch(html, /Margin review pending/);
  assert.doesNotMatch(html, /Internal notes/);
  assertReportHtmlFreeOfSensitiveFields(html, 'client');
});

test('technician-safe job HTML excludes invoice labels', () => {
  const html = buildOperationalJobReportHtml({
    kind: 'job',
    audience: 'technician',
    ctx: baseCtx,
    generatedAt: '2026-08-05T12:00:00.000Z',
  });
  assert.doesNotMatch(html, /Invoice 1/);
  assert.doesNotMatch(html, /Quote 1/);
  assertReportHtmlFreeOfSensitiveFields(html, 'technician');
});
