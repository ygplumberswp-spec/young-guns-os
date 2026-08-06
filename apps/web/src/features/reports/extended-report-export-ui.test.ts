import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const actionsPath = join(process.cwd(), 'src/features/reports/ExtendedReportExportActions.tsx');

test('ExtendedReportExportActions exposes accessible period controls for fleet/register exports', () => {
  const source = readFileSync(actionsPath, 'utf8');
  assert.match(source, /extended-report-export-actions/);
  assert.match(source, /Period start/);
  assert.match(source, /Period end/);
  assert.match(source, /Preview \$\{reportLabel\}/);
  assert.match(source, /Download PDF/);
  assert.match(source, /ExtendedReportExportActions/);
});
