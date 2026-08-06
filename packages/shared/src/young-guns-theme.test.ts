import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOCUMENT_COLOR_TOKENS,
  contrastRatio,
} from './document-engine.js';
import {
  YOUNG_GUNS_APP_COLORS,
  YOUNG_GUNS_BLUE_RGB,
  YOUNG_GUNS_SLOGAN,
  documentStatusColor,
  documentStatusTone,
  meetsWcagAaLargeText,
} from './young-guns-theme.js';
import { REPORT_EXPORT_STATUS, buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const tokensCss = readFileSync(join(repoRoot, 'packages/ui/src/tokens.css'), 'utf8');

test('Young Guns app tokens map to document palette', () => {
  assert.equal(YOUNG_GUNS_APP_COLORS.bgApp, DOCUMENT_COLOR_TOKENS.pageBackground);
  assert.equal(YOUNG_GUNS_APP_COLORS.bluePrimary, DOCUMENT_COLOR_TOKENS.brandBlue);
  assert.equal(YOUNG_GUNS_BLUE_RGB, '31, 122, 236');
});

test('tokens.css exposes Young Guns variables and titan aliases', () => {
  assert.match(tokensCss, /--yg-bg-app:\s*#04070d/);
  assert.match(tokensCss, /--yg-blue-primary:\s*#1f7aec/);
  assert.match(tokensCss, /--titan-accent:\s*var\(--yg-blue-primary\)/);
  assert.match(tokensCss, /--titan-accent-rgb:\s*31,\s*122,\s*236/);
});

test('primary text and label blue meet WCAG AA on app background', () => {
  assert.ok(meetsWcagAaLargeText(YOUNG_GUNS_APP_COLORS.textPrimary, YOUNG_GUNS_APP_COLORS.bgApp));
  assert.ok(meetsWcagAaLargeText(DOCUMENT_COLOR_TOKENS.labelBlue, DOCUMENT_COLOR_TOKENS.pageBackground));
  assert.ok(contrastRatio(YOUNG_GUNS_APP_COLORS.textMuted, YOUNG_GUNS_APP_COLORS.bgSurface) >= 4.5);
});

test('document status tones resolve to distinct colours', () => {
  assert.equal(documentStatusTone('paid'), 'paid');
  assert.equal(documentStatusColor('paid'), YOUNG_GUNS_APP_COLORS.success);
  assert.equal(documentStatusColor('overdue'), YOUNG_GUNS_APP_COLORS.danger);
  assert.notEqual(documentStatusColor('draft'), documentStatusColor('sent'));
});

test('report shell renders branded header without fake data', () => {
  const html = buildYoungGunsReportShellHtml({
    reportKind: 'service',
    reportTitle: 'Weekly Service Summary',
    periodLabel: 'Aug 2026',
    generatedAt: '4 Aug 2026',
    bodyHtml: '<p>No jobs matched the selected filters.</p>',
  });
  assert.match(html, /Young Guns Plumbing/);
  assert.match(html, /Service Report/);
  assert.match(html, /Weekly Service Summary/);
  assert.match(html, new RegExp(YOUNG_GUNS_SLOGAN.replace('#', '\\#')));
});

test('future report families are marked not yet implemented where appropriate', () => {
  assert.equal(REPORT_EXPORT_STATUS.finance, 'not_yet_implemented');
  assert.equal(REPORT_EXPORT_STATUS.service, 'implemented');
});
