import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const brandDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(brandDir, '../..');
const repoRoot = join(webRoot, '../..');
const css = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const tokensCss = readFileSync(join(repoRoot, 'packages/ui/src/tokens.css'), 'utf8');
const stylesCss = readFileSync(join(repoRoot, 'packages/ui/src/styles.css'), 'utf8');
const utilitiesCss = readFileSync(join(webRoot, 'src/styles/young-guns-utilities.css'), 'utf8');
const wordmarkSvg = readFileSync(join(webRoot, 'public/brand/titan-wordmark.svg'), 'utf8');

test('Young Guns theme tokens are wired into the global stylesheet stack', () => {
  assert.match(tokensCss, /--yg-blue-primary/);
  assert.match(tokensCss, /--titan-accent-rgb/);
  assert.match(css, /@import '@titan\/ui\/styles\.css'/);
  assert.match(css, /young-guns-utilities\.css/);
});

test('legacy cyan hex is not hardcoded in app shell stylesheets', () => {
  assert.doesNotMatch(tokensCss, /#22d3ee/i);
  assert.doesNotMatch(stylesCss, /#22d3ee/i);
  assert.doesNotMatch(css, /#22d3ee/i);
  assert.doesNotMatch(wordmarkSvg, /#22d3ee/i);
});

test('legacy teal hex is not hardcoded in shared button styles', () => {
  assert.doesNotMatch(stylesCss, /#0f766e/i);
  assert.doesNotMatch(stylesCss, /#164e63/i);
});

test('app shell uses accent rgb variable for rgba borders', () => {
  assert.match(css, /rgba\(var\(--titan-accent-rgb\)/);
  assert.match(stylesCss, /rgba\(var\(--titan-accent-rgb\)/);
});

test('owner shell and sidebar active states remain defined', () => {
  assert.match(css, /\.app-nav__link--active/);
  assert.match(css, /\.owner-shell/);
  assert.match(css, /\.app-header/);
});

test('finance preview modal styles use canonical tokens', () => {
  const previewCss = readFileSync(join(webRoot, 'src/styles/finance-document-preview.css'), 'utf8');
  assert.match(previewCss, /var\(--yg-preview-backdrop/);
  assert.match(previewCss, /var\(--yg-text-primary\)/);
});

test('TitanWordmark uses Young Guns blue edge gradient', () => {
  const wordmark = readFileSync(join(webRoot, 'src/brand/TitanWordmark.tsx'), 'utf8');
  assert.match(wordmark, /#1f7aec/i);
  assert.doesNotMatch(wordmark, /#22d3ee/i);
});

test('static wordmark SVG uses Young Guns blue accent', () => {
  assert.match(wordmarkSvg, /#1f7aec/i);
});

test('live update banner uses token variables', () => {
  assert.match(css, /\.live-updates-banner[\s\S]*var\(--yg-live-banner-bg\)/);
});

test('skip-to-content and reduced-motion utilities are present', () => {
  assert.match(utilitiesCss, /\.skip-to-content:focus/);
  assert.match(stylesCss, /prefers-reduced-motion/);
});

test('command-centre shared tab classes are defined', () => {
  assert.match(utilitiesCss, /\.command-centre-page__tab--active/);
});
