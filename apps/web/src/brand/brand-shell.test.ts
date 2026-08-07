import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..');
const css = readFileSync(join(webRoot, 'index.css'), 'utf8');

const AUTH_SURFACES = [
  'pages/auth/LoginPage.tsx',
  'pages/auth/SignupPage.tsx',
  'pages/auth/AcceptInvitePage.tsx',
  'pages/auth/AuthStatusPages.tsx',
  'pages/portal/PortalLoginPage.tsx',
  'pages/portal/PortalAcceptInvitePage.tsx',
];

test('Phase 3 — auth surfaces use branded AuthLayout shell', () => {
  for (const relativePath of AUTH_SURFACES) {
    const source = readFileSync(join(webRoot, relativePath), 'utf8');
    assert.match(source, /AuthLayout/, `${relativePath} must use AuthLayout`);
  }

  const authLayout = readFileSync(join(webRoot, 'layouts/AuthLayout.tsx'), 'utf8');
  assert.match(authLayout, /TitanWordmark/);
  assert.match(authLayout, /Powered by/);
});

test('Phase 3 — owner and portal app shells use compact TitanWordmark', () => {
  for (const relativePath of ['layouts/AppLayout.tsx', 'layouts/PortalLayout.tsx']) {
    const source = readFileSync(join(webRoot, relativePath), 'utf8');
    assert.match(source, /TitanWordmark variant="compact"/, `${relativePath} must use compact wordmark`);
  }

  const appLayout = readFileSync(join(webRoot, 'layouts/AppLayout.tsx'), 'utf8');
  assert.match(appLayout, /owner-shell--mobile-nav-open/);
  assert.match(appLayout, /app-header__menu-toggle/);
  assert.match(appLayout, /app-header__menu-glyph/);
});

test('Phase 3 — responsive auth and owner shell CSS contracts', () => {
  assert.match(css, /\.auth-stage[\s\S]*min-height:\s*100dvh/);
  assert.match(css, /\.auth-stage[\s\S]*overflow-x:\s*hidden/);
  assert.match(css, /\.auth-stage__wordmark[\s\S]*min\(100%/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.app-header__menu-toggle/);
  assert.match(css, /\.owner-shell--mobile-nav-open \.titan-shell__sidebar/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*Brand Foundation — mobile shells[\s\S]*\.auth-stage/);
});
