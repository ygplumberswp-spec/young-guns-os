import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

test('report export API exposes staff and portal routes without trusting client audience', () => {
  const source = readSource('src/lib/report-export-api.ts');
  assert.match(source, /\/report-exports\/jobs\//);
  assert.match(source, /\/portal\/report-exports\/jobs\//);
  assert.match(source, /channel === 'portal'/);
  assert.match(source, /portalReportExportPath\(kind, id\)/);
  assert.match(source, /staffReportExportPath\(kind, id, options\.audience\)/);
  assert.match(source, /\? portalReportExportPath\(kind, id\)/);
});

test('ReportExportActions does not expose audience selector UI', () => {
  const source = readSource('src/features/reports/ReportExportActions.tsx');
  assert.doesNotMatch(source, /audience.*select|<select/i);
  assert.match(source, /Preview Report/);
});

test('mobile job detail wires technician report export without audience prop', () => {
  const source = readSource('src/pages/mobile/MobileJobDetailPage.tsx');
  assert.match(source, /ReportExportActions/);
  assert.match(source, /kind="job"/);
  assert.doesNotMatch(source, /audience=/);
});

test('portal job detail uses portal report export channel', () => {
  const source = readSource('src/pages/portal/PortalJobDetailPage.tsx');
  assert.match(source, /channel="portal"/);
});

test('staff report export utils derive mode from role not query param', () => {
  const source = readSource('src/features/reports/report-export-utils.ts');
  assert.match(source, /isTechnicianRole/);
  assert.match(source, /resolveStaffReportExportMode/);
});

test('report export routes register portal auth and remove denyTechnician guard', () => {
  const repoRoot = join(webRoot, '../..');
  const routeSource = readFileSync(join(repoRoot, 'apps/api/src/routes/report-exports.ts'), 'utf8');
  assert.match(routeSource, /createPortalReportExportRouter/);
  assert.match(routeSource, /requirePortalAuth/);
  assert.doesNotMatch(routeSource, /denyTechnician/);
  assert.match(routeSource, /parseAudienceQuery/);
});
