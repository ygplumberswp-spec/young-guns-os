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

test('Young Guns theme tokens are wired into the global stylesheet stack', () => {
  assert.match(tokensCss, /--yg-blue-primary/);
  assert.match(tokensCss, /--titan-accent-rgb/);
  assert.match(css, /@import '@titan\/ui\/styles\.css'/);
});

test('legacy cyan hex is not hardcoded in app shell stylesheets', () => {
  assert.doesNotMatch(tokensCss, /#22d3ee/i);
  assert.doesNotMatch(stylesCss, /#22d3ee/i);
  assert.doesNotMatch(css, /#22d3ee/i);
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

test('finance preview modal styles remain present after theme rollout', () => {
  const previewCss = readFileSync(join(webRoot, 'src/styles/finance-document-preview.css'), 'utf8');
  assert.match(previewCss, /finance-document-preview|preview-modal/i);
});

test('TitanWordmark uses Young Guns blue edge gradient', () => {
  const wordmark = readFileSync(join(webRoot, 'src/brand/TitanWordmark.tsx'), 'utf8');
  assert.match(wordmark, /#1f7aec/i);
  assert.doesNotMatch(wordmark, /#22d3ee/i);
});
