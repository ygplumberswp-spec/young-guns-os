#!/usr/bin/env node
/** Regenerate 235 verify JSON with correct post-patch counts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(resolve(repoRoot, 'TITAN_FINAL_ROUTE_AND_GAP_MATRIX.md'), 'utf8');

function countSection(start, end) {
  const section = md.split(start)[1]?.split(end)[0] ?? '';
  const counts = { GO: 0, HOLD: 0, 'NO-GO': 0 };
  for (const m of section.matchAll(/\*\*(GO|HOLD|NO-GO)\*\*/g)) counts[m[1]]++;
  return counts;
}

function countStaffRows() {
  const section = md.split('## Staff route matrix')[1]?.split('## Auth routes')[0] ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.includes('---') && !line.startsWith('| Page')).length;
}

const staff = countSection('## Staff route matrix', '## Auth routes');
const auth = countSection('## Auth routes', '## Mobile routes');
const mobile = countSection('## Mobile routes', '## Customer portal routes');
const portal = countSection('## Customer portal routes', '## Phase');

const staffRoutes = countStaffRows();
const totals = {
  staffRoutes,
  mobileRoutes: 9,
  portalRoutes: 9,
  authRoutes: 7,
  totalInventoried: staffRoutes + 9 + 9 + 7,
  go: staff.GO + auth.GO + mobile.GO + portal.GO,
  hold: staff.HOLD + auth.HOLD + mobile.HOLD + portal.HOLD,
  noGo: staff['NO-GO'] + auth['NO-GO'] + mobile['NO-GO'] + portal['NO-GO'],
};
totals.classifiedSum = totals.go + totals.hold + totals.noGo;

const report = JSON.parse(
  readFileSync(resolve(repoRoot, 'diagnostic-output/235-phase0-route-reconciliation-verify.json'), 'utf8'),
);
report.generatedAt = new Date().toISOString();
report.verdict = totals.classifiedSum === totals.totalInventoried ? 'PASS' : 'FAIL';
report.phase0Gate.reconciliation.correctedTotals = { ...totals, sidebarLinkedStaff: 22 };
report.phase0Gate.reconciliation.arithmeticCheck = `${totals.totalInventoried} = ${totals.go} + ${totals.hold} + ${totals.noGo}`;

writeFileSync(
  resolve(repoRoot, 'diagnostic-output/235-phase0-route-reconciliation-verify.json'),
  JSON.stringify(report, null, 2),
);
console.log(totals, report.verdict);
