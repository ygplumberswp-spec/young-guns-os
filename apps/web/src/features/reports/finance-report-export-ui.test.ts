import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiPath = join(process.cwd(), 'src/lib/finance-report-export-api.ts');
const actionsPath = join(process.cwd(), 'src/features/reports/FinanceReportExportActions.tsx');

test('finance report export API registers staff and portal paths', () => {
  const source = readFileSync(apiPath, 'utf8');
  assert.match(source, /\/report-exports\/finance\/aggregate\/pdf/);
  assert.match(source, /\/report-exports\/finance\/cashflow\/pdf/);
  assert.match(source, /\/report-exports\/finance\/receivables\/pdf/);
  assert.match(source, /\/portal\/report-exports\/customer\/history\/pdf/);
});

test('FinanceReportExportActions exposes accessible period controls', () => {
  const source = readFileSync(actionsPath, 'utf8');
  assert.match(source, /finance-report-export-actions/);
  assert.match(source, /Period start/);
  assert.match(source, /Preview/);
  assert.match(source, /FinanceDocumentPreviewModal/);
  assert.match(source, /showSnapshotDate/);
});
