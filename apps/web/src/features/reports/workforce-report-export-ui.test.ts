import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiPath = join(process.cwd(), 'src/lib/workforce-report-export-api.ts');
const actionsPath = join(process.cwd(), 'src/features/reports/WorkforceReportExportActions.tsx');
const mobilePath = join(process.cwd(), 'src/pages/mobile/MobilePerformancePage.tsx');
const tiPath = join(process.cwd(), 'src/pages/technician-intelligence/TechnicianIntelligencePage.tsx');

test('workforce report API defines me routes without technician id parameter', () => {
  const source = readFileSync(apiPath, 'utf8');
  assert.match(source, /workforce\/me\/activity\/pdf/);
  assert.match(source, /workforce\/me\/timesheet\/pdf/);
  assert.match(source, /workforce\/me\/productivity\/pdf/);
  assert.match(source, /workforce\/summary\/pdf/);
});

test('WorkforceReportExportActions exposes accessible period controls', () => {
  const source = readFileSync(actionsPath, 'utf8');
  assert.match(source, /type="date"/);
  assert.match(source, /Preview/);
  assert.match(source, /Download PDF/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /audience/i);
});

test('mobile performance page wires technician self-service exports', () => {
  const source = readFileSync(mobilePath, 'utf8');
  assert.match(source, /WorkforceReportExportActions/);
  assert.match(source, /scope: 'me'/);
  assert.match(source, /technician_activity/);
  assert.match(source, /technician_timesheet/);
  assert.match(source, /technician_productivity/);
});

test('technician intelligence page exposes workforce summary export for authorized staff', () => {
  const source = readFileSync(tiPath, 'utf8');
  assert.match(source, /workforce_operations/);
  assert.match(source, /workforce_summary/);
});
