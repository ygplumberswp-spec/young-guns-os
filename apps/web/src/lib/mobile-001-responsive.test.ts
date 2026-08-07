/**
 * MOBILE-001 — responsive contracts for confirmed defects only.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = join(webRoot, '../..');

function read(rel: string): string {
  return readFileSync(join(webRoot, 'src', rel), 'utf8');
}

describe('MOBILE-001 navigation', () => {
  it('owner shell closes mobile nav on route change, Escape, and body scroll lock', () => {
    const layout = read('layouts/AppLayout.tsx');
    assert.match(layout, /setMobileNavOpen\(false\)/);
    assert.match(layout, /Escape/);
    assert.match(layout, /document\.body\.style\.overflow\s*=\s*'hidden'/);
    assert.match(layout, /aria-controls="owner-mobile-nav"/);
    assert.match(layout, /app-header__menu-glyph/);
  });

  it('mobile drawer CSS uses safe-area offsets and scrollable sidebar', () => {
    const css = read('index.css');
    assert.match(css, /safe-area-inset-top/);
    assert.match(
      css,
      /\.owner-shell \.titan-shell__sidebar[\s\S]*overflow-y:\s*auto/,
    );
    assert.match(css, /\.owner-shell__backdrop[\s\S]*safe-area-inset-top/);
  });
});

describe('MOBILE-001 Owner dashboard composition', () => {
  it('preserves OWNER-001 full-bleed desktop shell', () => {
    const page = read('pages/dashboard/DashboardPage.tsx');
    const layoutCss = read('styles/layout-grid.css');
    assert.match(page, /exec-dashboard-page--owner001/);
    assert.match(layoutCss, /--titan-content-max-width:\s*none/);
  });

  it('desktop Live Fleet Map remains substantial (not shrunk for mobile globally)', () => {
    const css = read('index.css');
    assert.match(
      css,
      /\.exec-dashboard--owner001 \.exec-live-ops-map[\s\S]*clamp\(16rem,\s*28vh,\s*22rem\)/,
    );
    // Mobile height override stays inside max-width media, not a global collapse.
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.exec-live-ops-map[\s\S]*height:\s*16rem/);
  });
});

describe('MOBILE-001 AURA chat', () => {
  it('keeps composer sticky inside a dvh-bound chat column on phone', () => {
    const css = read('index.css');
    assert.match(css, /@media \(max-width: 960px\)[\s\S]*\.aura-page[\s\S]*100dvh/);
    assert.match(css, /\.aura-composer[\s\S]*position:\s*sticky/);
    assert.match(css, /\.aura-composer[\s\S]*safe-area-inset-bottom/);
  });
});

describe('MOBILE-001 technician field shell', () => {
  it('exposes Schedule in technician nav registry', () => {
    const role = readFileSync(
      join(repoRoot, 'packages/shared/src/role-experience.ts'),
      'utf8',
    );
    assert.match(role, /href:\s*'\/mobile\/schedule'/);
    assert.match(role, /label:\s*'Schedule'/);
  });

  it('job completion uses shared offline gate helper', () => {
    const page = read('pages/mobile/MobileJobDetailPage.tsx');
    assert.match(page, /evaluateMobileCompletionSubmit/);
    assert.match(page, /from '\.\.\/\.\.\/lib\/mobile-offline-completion'/);
  });
});

describe('MOBILE-001 PWA installability', () => {
  it('manifest declares PNG 192/512 + maskable icons', () => {
    const manifest = JSON.parse(
      readFileSync(join(webRoot, 'public/manifest.webmanifest'), 'utf8'),
    ) as {
      icons: Array<{ src: string; sizes?: string; purpose?: string }>;
    };
    const srcs = manifest.icons.map((i) => i.src);
    assert.ok(srcs.includes('/titan-mobile-icon-192.png'));
    assert.ok(srcs.includes('/titan-mobile-icon-512.png'));
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
    assert.equal(existsSync(join(webRoot, 'public/titan-mobile-icon-192.png')), true);
    assert.equal(existsSync(join(webRoot, 'public/titan-mobile-icon-512.png')), true);
    assert.equal(existsSync(join(webRoot, 'public/apple-touch-icon.png')), true);
  });

  it('html enables viewport-fit cover and apple-touch-icon', () => {
    const html = readFileSync(join(webRoot, 'index.html'), 'utf8');
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-touch-icon\.png/);
  });
});

describe('MOBILE-001 communications / finance / integrations shell honesty', () => {
  it('communications hub remains list/tab architecture (no forced dual-pane squeeze)', () => {
    const panel = read('features/communications-hub/CommunicationsPlatformPanel.tsx');
    assert.match(panel, /data-list/);
    assert.doesNotMatch(panel, /conversation-split|dual-pane|master-detail/);
  });

  it('integrations WhatsApp page keeps Test Connection without exposing secrets', () => {
    const page = read('pages/integrations/WhatsappSettingsPage.tsx');
    assert.match(page, /Test Connection|testConnection|test-connection/i);
    assert.doesNotMatch(page, /accessToken\s*\}\s*\)/);
    assert.doesNotMatch(page, /credentialsEncrypted/);
  });
});
