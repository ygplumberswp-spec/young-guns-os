import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaintenanceReportHtml,
  buildOperationalJobReportHtml,
  buildServiceReportHtml,
} from './operational-report-html.js';
import {
  resolveJobContextForAudience,
  type OperationalJobReportContext,
} from './operational-report.js';

const baseCtx: OperationalJobReportContext = {
  reportReference: 'JOB-1001',
  jobNumber: 'YG-1001',
  jobTitle: 'Geyser replacement',
  jobType: 'plumbing',
  jobStatus: 'completed',
  priority: 'normal',
  scheduledAt: '2026-08-01T09:00:00.000Z',
  completedAt: '2026-08-01T14:00:00.000Z',
  customerName: 'Sea Point Body Corporate',
  customerContact: 'Caretaker',
  customerEmail: 'office@example.com',
  customerPhone: '+27210000000',
  propertyName: 'Block A',
  siteAddress: '1 Main Rd, Sea Point',
  addressLines: ['Sea Point', 'Cape Town'],
  mapPlaceUrl: null,
  mapNote: null,
  technicianName: 'Sam Technician',
  jobDescription: 'Replace failed geyser',
  diagnosis: 'Element failure confirmed',
  workCompleted: 'Installed new 200L geyser',
  internalNotes: 'Margin review pending',
  materials: [{ description: '200L geyser', quantity: '1', unit: 'ea', status: 'used' }],
  photosBefore: [],
  photosDuring: [],
  photosAfter: [],
  supportingPhotos: [],
  attachments: [],
  signatures: [{ role: 'customer', signedBy: 'Jane Client', present: true, dataUrl: null }],
  recommendedMaintenance: 'Annual inspection',
  warrantyNotes: '90 day workmanship',
  cocState: 'not_attached',
  cocReference: null,
  completionStatus: 'Completed',
  quoteLabel: 'Quote YGP-001',
  invoiceLabel: 'Invoice YGP-INV-001',
};

test('client-safe job context strips internal notes and finance labels', () => {
  const safe = resolveJobContextForAudience(baseCtx, 'client');
  assert.equal(safe.internalNotes, null);
  assert.equal(safe.invoiceLabel, 'Invoice YGP-INV-001');
  const tech = resolveJobContextForAudience(baseCtx, 'technician');
  assert.equal(tech.internalNotes, null);
  assert.equal(tech.invoiceLabel, null);
  assert.equal(tech.quoteLabel, null);
});

test('operational job report HTML uses Young Guns shell and omits internal notes for client', () => {
  const internalHtml = buildOperationalJobReportHtml({
    kind: 'job',
    audience: 'internal',
    ctx: baseCtx,
    generatedAt: '2026-08-04T12:00:00.000Z',
  });
  assert.match(internalHtml, /Job Report/);
  assert.match(internalHtml, /Internal notes/);
  assert.match(internalHtml, /Margin review pending/);
  assert.doesNotMatch(internalHtml, /11111111-1111/);

  const clientHtml = buildOperationalJobReportHtml({
    kind: 'job',
    audience: 'client',
    ctx: baseCtx,
    generatedAt: '2026-08-04T12:00:00.000Z',
  });
  assert.doesNotMatch(clientHtml, /Internal notes/);
  assert.doesNotMatch(clientHtml, /Margin review pending/);
});

test('service and maintenance report HTML include status text and honest empty states', () => {
  const serviceHtml = buildServiceReportHtml({
    ctx: baseCtx,
    audience: 'internal',
    generatedAt: '2026-08-04T12:00:00.000Z',
  });
  assert.match(serviceHtml, /Service Report/);
  assert.match(serviceHtml, /Status: completed/);
  assert.match(serviceHtml, /No photos attached/);

  const maintenanceHtml = buildMaintenanceReportHtml({
    ctx: {
      reportReference: 'MR-ABC12345',
      planName: 'Annual geyser service',
      planStatus: 'active',
      visitDate: '2026-08-01T10:00:00.000Z',
      runStatus: 'completed',
      customerName: 'Sea Point Body Corporate',
      propertyAddress: '1 Main Rd',
      technicianName: 'Sam Technician',
      tasksCompleted: ['Inspect PRV'],
      tasksNotCompleted: [],
      findings: 'PRV operating normally',
      materials: [],
      photos: [],
      riskItems: [],
      recommendedNext: null,
      nextDueAt: '2027-08-01T10:00:00.000Z',
      notes: null,
      signatures: [],
    },
    generatedAt: '2026-08-04T12:00:00.000Z',
  });
  assert.match(maintenanceHtml, /Maintenance Report/);
  assert.match(maintenanceHtml, /Tasks completed/);
  assert.match(maintenanceHtml, /Inspect PRV/);
});

test('long job notes produce multi-section HTML suitable for pagination', () => {
  const longNotes = Array.from({ length: 30 }, (_, i) => `Checklist item ${i + 1}`).join('\n');
  const html = buildOperationalJobReportHtml({
    kind: 'job',
    audience: 'internal',
    ctx: {
      ...baseCtx,
      internalNotes: longNotes,
      materials: Array.from({ length: 100 }, (_, i) => ({
        description: `Material line ${i + 1}`,
        quantity: '1',
        unit: 'ea',
        status: 'used',
      })),
    },
    generatedAt: '2026-08-04T12:00:00.000Z',
  });
  assert.ok(html.length > 8000, 'long report HTML should be substantial for multi-page PDF');
  assert.match(html, /Materials \/ parts used/);
});
