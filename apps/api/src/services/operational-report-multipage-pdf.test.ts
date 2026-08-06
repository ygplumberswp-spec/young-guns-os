import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMaintenanceReportHtml,
  buildOperationalJobReportHtml,
  countPdfPages,
  isValidPdfBuffer,
  type OperationalJobReportContext,
} from '@titan/shared';
import { probeChromiumPdfAvailability, renderHtmlToPdf } from './chromium-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function longJobContext(lineCount: number): OperationalJobReportContext {
  return {
    reportReference: 'JOB-LONG',
    jobNumber: 'YG-LONG-001',
    jobTitle: 'Extended maintenance visit with long customer name (Pty) Ltd',
    jobType: 'service',
    jobStatus: 'completed',
    priority: 'high',
    scheduledAt: '2026-08-01T08:00:00.000Z',
    completedAt: '2026-08-01T17:00:00.000Z',
    customerName: 'Very Long Customer Name Extension Body Corporate',
    customerContact: 'Building manager',
    customerEmail: 'manager@example.com',
    customerPhone: '+27210000000',
    propertyName: 'Tower Block C',
    siteAddress: '123 Very Long Street Name Extension, Industrial Business Park West',
    addressLines: ['Cape Town', '7441'],
    mapPlaceUrl: null,
    mapNote: null,
    technicianName: 'Lead Technician',
    jobDescription: 'Annual service with extended diagnostic notes and follow-up recommendations.',
    diagnosis: 'Multiple findings across hot water system and pressure valves.',
    workCompleted: 'Serviced geyser, replaced PRV, tested pressure relief path.',
    internalNotes: Array.from({ length: 30 }, (_, i) => `Checklist row ${i + 1}`).join('\n'),
    materials: Array.from({ length: lineCount }, (_, i) => ({
      description: `Material or task line ${i + 1}`,
      quantity: '1',
      unit: 'ea',
      status: 'used',
    })),
    photosBefore: [],
    photosDuring: [],
    photosAfter: [],
    supportingPhotos: [],
    attachments: [{ title: 'Service checklist', mimeType: 'application/pdf' }],
    signatures: [
      { role: 'customer', signedBy: 'Customer Rep', present: true, dataUrl: null },
      { role: 'technician', signedBy: 'Lead Technician', present: true, dataUrl: null },
    ],
    recommendedMaintenance: Array.from({ length: 5 }, (_, i) => `Recommendation ${i + 1}`).join('; '),
    warrantyNotes: 'Manufacturer warranty on replaced PRV',
    cocState: 'not_attached',
    cocReference: null,
    completionStatus: 'Completed',
    quoteLabel: null,
    invoiceLabel: null,
  };
}

test('genuine Puppeteer PDF renders multi-page operational reports when Chromium is available', async (t) => {
  const probe = await probeChromiumPdfAvailability();
  if (!probe.available) {
    t.skip(`Chromium unavailable (${probe.source})`);
    return;
  }

  const artifactDir = join(repoRoot, 'test-results', 'j67a');
  mkdirSync(artifactDir, { recursive: true });

  const scenarios = [
    {
      name: 'job-minimal',
      html: buildOperationalJobReportHtml({
        kind: 'job',
        audience: 'internal',
        ctx: { ...longJobContext(1), materials: [], internalNotes: null },
        generatedAt: '2026-08-04T12:00:00.000Z',
      }),
      minPages: 1,
    },
    {
      name: 'job-long',
      html: buildOperationalJobReportHtml({
        kind: 'job',
        audience: 'internal',
        ctx: longJobContext(100),
        generatedAt: '2026-08-04T12:00:00.000Z',
      }),
      minPages: 2,
    },
    {
      name: 'maintenance-long',
      html: buildMaintenanceReportHtml({
        ctx: {
          reportReference: 'MR-LONG',
          planName: 'Quarterly plumbing inspection plan',
          planStatus: 'active',
          visitDate: '2026-08-01T10:00:00.000Z',
          runStatus: 'completed',
          customerName: 'Long Customer',
          propertyAddress: '456 Site Access Road, Table View',
          technicianName: 'Sam Technician',
          tasksCompleted: Array.from({ length: 30 }, (_, i) => `Task completed ${i + 1}`),
          tasksNotCompleted: ['Replace anode — parts pending'],
          findings: 'System operating within normal parameters with minor wear noted on sacrificial anode.',
          materials: Array.from({ length: 20 }, (_, i) => ({
            description: `Part ${i + 1}`,
            quantity: '1',
            unit: 'ea',
            status: 'used',
          })),
          photos: [],
          riskItems: ['Monitor anode condition within 90 days'],
          recommendedNext: 'Schedule follow-up inspection',
          nextDueAt: '2027-02-01T10:00:00.000Z',
          notes: 'Customer acknowledged findings.',
          signatures: [{ role: 'customer', signedBy: 'Jane', present: true, dataUrl: null }],
        },
        generatedAt: '2026-08-04T12:00:00.000Z',
      }),
      minPages: 2,
    },
  ] as const;

  for (const scenario of scenarios) {
    const pdf = await renderHtmlToPdf(scenario.html);
    assert.ok(isValidPdfBuffer(pdf), `${scenario.name}: valid %PDF signature`);
    const pages = countPdfPages(pdf);
    assert.ok(
      pages >= scenario.minPages,
      `${scenario.name}: expected >= ${scenario.minPages} pages, got ${pages}`,
    );
    writeFileSync(join(artifactDir, `${scenario.name}.pdf`), pdf);
  }
});
