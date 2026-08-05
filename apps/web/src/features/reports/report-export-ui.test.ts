import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

test('report export API client targets authenticated report-exports routes', () => {
  const source = readSource('src/lib/report-export-api.ts');
  assert.match(source, /\/report-exports\/jobs\//);
  assert.match(source, /\/report-exports\/completion\//);
  assert.match(source, /\/report-exports\/maintenance\/runs\//);
  assert.match(source, /requestBlob/);
  assert.match(source, /application\/pdf/);
});

test('ReportExportActions exposes preview and download without client-side PDF generation', () => {
  const source = readSource('src/features/reports/ReportExportActions.tsx');
  assert.match(source, /Preview Report/);
  assert.match(source, /Download PDF/);
  assert.match(source, /FinanceDocumentPreviewModal/);
  assert.doesNotMatch(source, /html2canvas|jspdf|window\.print/);
});

test('job detail page wires job and service report export actions', () => {
  const source = readSource('src/pages/jobs/JobDetailPage.tsx');
  assert.match(source, /ReportExportActions/);
  assert.match(source, /kind="job"/);
  assert.match(source, /kind="service"/);
});

test('completion report detail page wires completion PDF export', () => {
  const source = readSource('src/pages/documents/CompletionReportDetailPage.tsx');
  assert.match(source, /ReportExportActions/);
  assert.match(source, /kind="completion"/);
});

test('recurring maintenance history wires maintenance report export', () => {
  const source = readSource('src/pages/recurring-maintenance/RecurringMaintenancePage.tsx');
  assert.match(source, /kind="maintenance"/);
});
