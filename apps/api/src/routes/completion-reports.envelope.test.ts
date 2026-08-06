import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'completion-reports.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../services/completion-report.service.ts'),
  'utf8',
);

describe('completion reports API envelope & safety', () => {
  it('wraps success responses in { data: ... }', () => {
    const patterns = [
      'res.json({ data: { preview } })',
      'res.json({ data: { reports } })',
      'res.json({ data: { report } })',
      'res.status(201).json({ data: { report } })',
      'res.status(201).json({ data: { emailDraft: result } })',
    ];
    for (const pattern of patterns) {
      assert.ok(routeSource.includes(pattern), `missing success envelope: ${pattern}`);
    }
  });

  it('requires documents RBAC and denies technicians', () => {
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    assert.ok(routeSource.includes('createDenyTechnicianFromOwnerModules'));
    assert.ok(routeSource.includes("'documents:read'"));
    assert.ok(routeSource.includes("'documents:write'"));
  });

  it('reuses Email Centre draft → approve → execute and never auto-sends', () => {
    assert.ok(serviceSource.includes('createReplyOrForwardDraft'));
    assert.ok(serviceSource.includes('createTimelineNote'));
    assert.ok(serviceSource.includes("attachmentKind: 'report'"));
    assert.ok(serviceSource.includes('autoSend: false'));
    assert.ok(serviceSource.includes('NOT_CONFIGURED'));
    assert.ok(!serviceSource.includes('autoSend: true'));
  });

  it('never invents map coordinates', () => {
    assert.ok(serviceSource.includes('resolveCompletionReportMapAvailability'));
    assert.ok(serviceSource.includes('snapshotLatitude'));
    assert.ok(serviceSource.includes('map.availability === \'place_url\''));
    assert.ok(!serviceSource.includes('staticmap'));
    assert.ok(!serviceSource.includes('maps.googleapis.com/maps/api/staticmap'));
  });

  it('audits completion report actions under reports category', () => {
    assert.ok(serviceSource.includes("category: 'reports'"));
    assert.ok(serviceSource.includes('completion_report_created'));
    assert.ok(serviceSource.includes('completion_report_generated'));
    assert.ok(serviceSource.includes('completion_report_email_draft_prepared'));
  });

  it('links report to customer, property, job, invoice, and documents', () => {
    assert.ok(serviceSource.includes('customerId:'));
    assert.ok(serviceSource.includes('propertyId:'));
    assert.ok(serviceSource.includes('jobId:'));
    assert.ok(serviceSource.includes('invoiceId:'));
    assert.ok(serviceSource.includes('insert(documents)'));
  });
});
