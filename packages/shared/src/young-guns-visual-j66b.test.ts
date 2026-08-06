import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompletionReportHtml } from './completion-report.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const tokensCss = readFileSync(join(repoRoot, 'packages/ui/src/tokens.css'), 'utf8');
const stylesCss = readFileSync(join(repoRoot, 'packages/ui/src/styles.css'), 'utf8');
const utilitiesCss = readFileSync(join(repoRoot, 'apps/web/src/styles/young-guns-utilities.css'), 'utf8');
const previewCss = readFileSync(join(repoRoot, 'apps/web/src/styles/finance-document-preview.css'), 'utf8');
const fleetMapCss = readFileSync(join(repoRoot, 'apps/web/src/features/fleet/fleet-live-map.css'), 'utf8');
const layoutSource = readFileSync(join(repoRoot, 'packages/ui/src/layout.tsx'), 'utf8');

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walkTsx(full, out);
    } else if (full.endsWith('.tsx') && !full.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

test('tokens expose map, banner, preview and overlay roles', () => {
  assert.match(tokensCss, /--yg-map-marker-fill:\s*#1f7aec/);
  assert.match(tokensCss, /--yg-live-banner-bg:/);
  assert.match(tokensCss, /--yg-preview-backdrop:/);
  assert.match(tokensCss, /--yg-info-badge-bg:/);
});

test('primary button uses Young Guns blue — no teal gradient', () => {
  assert.match(stylesCss, /\.titan-btn--primary[\s\S]*background:\s*var\(--yg-blue-primary\)/);
  assert.doesNotMatch(stylesCss, /#164e63/i);
  assert.doesNotMatch(stylesCss, /linear-gradient\(180deg,\s*#164e63/i);
});

test('shared utilities define yg-link and command-centre classes', () => {
  assert.match(utilitiesCss, /\.yg-link/);
  assert.match(utilitiesCss, /\.command-centre-page/);
  assert.match(utilitiesCss, /\.skip-to-content/);
});

test('finance preview modal consumes canonical CSS variables', () => {
  assert.match(previewCss, /var\(--yg-preview-backdrop/);
  assert.match(previewCss, /var\(--yg-preview-surface/);
  assert.match(previewCss, /var\(--yg-text-primary\)/);
});

test('fleet map selection accent uses map marker token', () => {
  assert.match(fleetMapCss, /var\(--yg-map-marker-fill/);
  assert.doesNotMatch(fleetMapCss, /#0ea5e9/i);
});

test('AppShell exposes keyboard-accessible skip-to-content', () => {
  assert.match(layoutSource, /skip-to-content/);
  assert.match(layoutSource, /id="main-content"/);
});

test('completion report HTML uses Young Guns report shell', () => {
  const html = buildCompletionReportHtml({
    title: 'Completion — Test Job',
    reportNumber: 'CR-0002',
    generatedAt: '2026-08-05T12:00:00.000Z',
    includedSections: ['customer_details'],
    payload: {
      customer: { name: 'Acme', email: null, phone: null, contactPerson: null },
    },
  });
  assert.match(html, /Young Guns Plumbing/);
  assert.match(html, /class="yg-report"/);
  assert.doesNotMatch(html, /Georgia/i);
});

test('intelligence and command pages contain no legacy cyan Tailwind utilities', () => {
  const pagesRoot = join(repoRoot, 'apps/web/src/pages');
  const files = walkTsx(pagesRoot);
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (/text-cyan-|bg-cyan-|border-cyan-|from-teal-|to-cyan-/.test(source)) {
      offenders.push(file.replace(`${repoRoot}/`, ''));
    }
  }
  assert.deepEqual(offenders, []);
});

test('command centre pages share command-centre-page wrapper', () => {
  const ec = readFileSync(
    join(repoRoot, 'apps/web/src/pages/executive-command-centre/ExecutiveCommandCentrePage.tsx'),
    'utf8',
  );
  const aura = readFileSync(
    join(repoRoot, 'apps/web/src/pages/aura/AuraCommandCentrePage.tsx'),
    'utf8',
  );
  assert.match(ec, /command-centre-page/);
  assert.match(aura, /command-centre-page/);
  assert.match(aura, /command-centre-page__tab--active/);
});
