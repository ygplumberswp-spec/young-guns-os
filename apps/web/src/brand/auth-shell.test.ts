import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const authPagesDir = join(__dirname, '../pages/auth');

test('auth surfaces use AuthLayout for locked TITAN brand shell', () => {
  for (const file of ['LoginPage.tsx', 'AcceptInvitePage.tsx', 'AuthStatusPages.tsx']) {
    const source = readFileSync(join(authPagesDir, file), 'utf8');
    assert.match(source, /AuthLayout/, `${file} must wrap content in AuthLayout`);
  }
});

test('staff and portal shells use SVG TitanWordmark', () => {
  for (const file of ['../layouts/AppLayout.tsx', '../layouts/PortalLayout.tsx']) {
    const source = readFileSync(join(__dirname, file), 'utf8');
    assert.match(source, /TitanWordmark/, `${file} must render TitanWordmark`);
    assert.match(source, /variant="compact"/, `${file} must use compact wordmark variant`);
  }
});
