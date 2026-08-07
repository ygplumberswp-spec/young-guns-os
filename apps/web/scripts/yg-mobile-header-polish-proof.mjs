#!/usr/bin/env node
/**
 * Mobile TITAN header polish proof — real SVG wordmark at 360/390/430 + desktop check.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/tmp/overflow-probe/package.json');
const puppeteer = require('puppeteer-core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '../..');
const widths = [360, 390, 430, 1366];

const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const layoutCss = readFileSync(join(webRoot, 'src/styles/layout-grid.css'), 'utf8');
const uxCss = readFileSync(join(webRoot, 'src/components/ux/ux.css'), 'utf8');
const uiCss = readFileSync(join(webRoot, '../..', 'packages/ui/src/styles.css'), 'utf8');
const wordmarkSvg = readFileSync(join(webRoot, 'public/brand/titan-wordmark.svg'), 'utf8');
const wordmarkInline = wordmarkSvg
  .replace(/<\?xml[^>]*>/, '')
  .replace(
    '<svg',
    '<svg class="titan-wordmark titan-wordmark--compact app-header__wordmark"',
  );

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
:root {
  --titan-bg: #0f1419;
  --titan-bg-elevated: #161c24;
  --titan-surface: #1b2330;
  --titan-surface-raised: #222b38;
  --titan-surface-muted: #151b24;
  --titan-surface-hover: rgba(255,255,255,0.06);
  --titan-text: #f3f6fb;
  --titan-text-secondary: #c2cad6;
  --titan-text-muted: #8b95a5;
  --titan-border: #2c3646;
  --titan-border-subtle: #243040;
  --titan-border-strong: #3a4658;
  --titan-accent: #3db88a;
  --titan-accent-rgb: 61, 184, 138;
  --titan-accent-soft: rgba(61,184,138,0.14);
  --titan-danger: #f04438;
  --titan-warning: #f79009;
  --titan-radius-lg: 0.75rem;
  --titan-radius-md: 0.5rem;
  --titan-radius-sm: 0.375rem;
  --titan-radius-full: 999px;
  --titan-shadow-sm: 0 1px 2px rgba(0,0,0,0.35);
  --titan-font-display: "Montserrat", system-ui, sans-serif;
  --titan-font-ui: "Inter", system-ui, sans-serif;
  --titan-page-pad-x: 1rem;
  --titan-page-pad-y: 0.75rem;
  --titan-touch-target-min: 2.75rem;
  --titan-space-2: 0.5rem;
  --titan-space-3: 0.75rem;
  --titan-space-6: 1.5rem;
  --titan-space-8: 2rem;
  --titan-motion-base: 120ms;
  --titan-motion-slow: 200ms;
  --titan-ease: ease;
  --titan-focus-ring: 0 0 0 2px #161c24, 0 0 0 4px var(--titan-accent);
  --titan-chrome-mid: #c9d2de;
}
html, body { margin: 0; padding: 0; font-family: var(--titan-font-ui); background: var(--titan-bg); color: var(--titan-text); }
.titan-btn { display:inline-flex; align-items:center; justify-content:center; min-height:2.25rem; padding:0.35rem 0.75rem; border:1px solid var(--titan-border); border-radius:var(--titan-radius-sm); background:var(--titan-surface); color:var(--titan-text); font-size:0.8125rem; cursor:pointer; }
${uiCss}
${layoutCss}
${indexCss}
${uxCss}
</style>
</head>
<body>
<div class="titan-shell owner-shell">
  <header class="titan-shell__header">
    <div class="app-header">
      <div class="app-header__start">
        <button type="button" class="app-header__menu-toggle" style="display:inline-flex">
          <span class="app-header__menu-glyph">☰</span>
          <span class="app-header__menu-label">Menu</span>
        </button>
        <div class="app-header__brand">
          ${wordmarkInline}
          <div class="app-header__brand-meta">
            <span class="staging-badge" role="status">STAGING</span>
            <span class="brand-sub">Powered by <span class="brand-sub__accent">AURA</span></span>
          </div>
          <span class="brand-credit"><span class="brand-credit__by">Built by</span> <span class="brand-credit__org">Young Guns Plumbing</span></span>
        </div>
      </div>
      <div class="app-header__search">
        <button type="button" class="header-search-trigger" aria-label="Search">
          <span class="header-search-trigger__icon" aria-hidden="true">⌕</span>
          <span class="header-search-trigger__label">Search</span>
          <kbd class="header-search-trigger__kbd">⌘K</kbd>
        </button>
      </div>
      <div class="app-header__user">
        <a class="app-header__identity" href="#" title="Alex Owner — Young Guns Plumbing — Company Owner">
          <span class="app-header__identity-mark">YG</span>
          <span class="app-header__meta">
            <span class="app-header__name">Alex Owner</span>
            <span class="app-header__tenant">Young Guns Plumbing</span>
            <span class="app-header__role">Company Owner</span>
          </span>
        </a>
        <button type="button" class="titan-btn app-header__signout">
          <span class="app-header__signout-full">Sign Out</span>
          <span class="app-header__signout-short" aria-hidden="true">Out</span>
        </button>
      </div>
    </div>
  </header>
  <div class="titan-shell__body">
    <aside class="titan-shell__sidebar" id="owner-mobile-nav">
      <div class="app-sidebar">
        <div class="app-sidebar__profile" aria-label="Signed-in profile">
          <span class="app-sidebar__profile-mark">YG</span>
          <span class="app-sidebar__profile-meta">
            <span class="app-sidebar__profile-name">Alex Owner</span>
            <span class="app-sidebar__profile-tenant">Young Guns Plumbing</span>
            <span class="app-sidebar__profile-role">Company Owner</span>
          </span>
        </div>
        <nav class="app-nav" aria-label="Main Navigation"><a class="app-nav__link" href="#">Dashboard</a></nav>
      </div>
    </aside>
    <main class="titan-shell__main">
      <div class="app-content-container app-content-container--wide">
        <p style="padding:1rem;color:var(--titan-text-muted)">Header polish proof surface</p>
      </div>
    </main>
  </div>
</div>
</body>
</html>`;

const outDir = join(repoRoot, 'diagnostic-output');
const shotDir = join(outDir, 'screenshots');
const artifactShotDir = '/opt/cursor/artifacts/screenshots';
mkdirSync(shotDir, { recursive: true });
mkdirSync(artifactShotDir, { recursive: true });
const fixturePath = join(outDir, 'yg-mobile-header-polish-fixture.html');
writeFileSync(fixturePath, html);

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const results = [];
let failed = false;

for (const width of widths) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 200, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'networkidle0' });
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const header = document.querySelector('.titan-shell__header');
    const wordmark = document.querySelector('.app-header__wordmark');
    const staging = document.querySelector('.staging-badge');
    const brandSub = document.querySelector('.brand-sub');
    const credit = document.querySelector('.brand-credit');
    const name = document.querySelector('.app-header__name');
    const tenant = document.querySelector('.app-header__tenant');
    const role = document.querySelector('.app-header__role');
    const mark = document.querySelector('.app-header__identity-mark');
    const menuLabel = document.querySelector('.app-header__menu-label');
    const brand = document.querySelector('.app-header__brand');
    const search = document.querySelector('.app-header__search');
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const overlaps = (a, b) => {
      if (!a || !b) return false;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.left < br.right - 1 && ar.right > br.left + 1 && ar.top < br.bottom - 1 && ar.bottom > br.top + 1;
    };
    const wmRect = wordmark?.getBoundingClientRect();
    const stagingRect = staging?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const menu = document.querySelector('.app-header__menu-toggle');
    const menuRect = menu?.getBoundingClientRect();
    const brandRect = brand?.getBoundingClientRect();
    return {
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      clientWidth: doc.clientWidth,
      headerHeight: headerRect?.height ?? 0,
      wordmarkWidth: wmRect?.width ?? 0,
      wordmarkHeight: wmRect?.height ?? 0,
      wordmarkIsSvg: wordmark?.tagName === 'svg',
      stagingVisible: isVisible(staging),
      stagingFullyInView: stagingRect
        ? stagingRect.left >= -0.5 && stagingRect.right <= window.innerWidth + 0.5
        : false,
      brandSubVisible: isVisible(brandSub),
      creditVisible: isVisible(credit),
      nameVisible: isVisible(name),
      tenantVisible: isVisible(tenant),
      roleVisible: isVisible(role),
      identityMarkVisible: isVisible(mark),
      menuLabelVisible: isVisible(menuLabel),
      stagingOverlapsSearch: overlaps(staging, search),
      brandOverlapsSearch: overlaps(brand, search),
      verticalAlignDelta:
        menuRect && brandRect
          ? Math.abs(menuRect.top + menuRect.height / 2 - (brandRect.top + brandRect.height / 2))
          : null,
    };
  });

  const overflow = metrics.scrollWidth > metrics.clientWidth + 1;
  const phone = width <= 430;
  const checks = {
    noOverflow: !overflow,
    svgWordmark: metrics.wordmarkIsSvg,
    readableLogo: metrics.wordmarkWidth >= (width <= 360 ? 96 : 100),
    stagingClean: phone
      ? metrics.stagingVisible && metrics.stagingFullyInView && !metrics.stagingOverlapsSearch
      : true,
    noBrandSearchOverlap: phone ? !metrics.brandOverlapsSearch : true,
    poweredBySecondary: phone ? metrics.brandSubVisible && !metrics.creditVisible : true,
    nameKept: phone ? metrics.nameVisible : true,
    metadataHiddenFirst: phone ? !metrics.tenantVisible && !metrics.roleVisible : true,
    compactHeader: metrics.headerHeight <= (phone ? 88 : 72),
    aligned: metrics.verticalAlignDelta == null || metrics.verticalAlignDelta <= 14,
  };
  if (phone) {
    checks.menuIconOnly = !metrics.menuLabelVisible;
    if (width <= 430) checks.ygMarkDeferred = !metrics.identityMarkVisible;
  } else {
    // Desktop regression: keep full identity chrome and do not force phone-only hides
    checks.desktopIdentity = metrics.nameVisible && metrics.identityMarkVisible;
    checks.desktopWordmark = metrics.wordmarkWidth >= 100;
  }

  const pass = Object.values(checks).every(Boolean);
  if (!pass) failed = true;

  const fileBase = `yg-mobile-header-${width}`;
  const shotPath = join(shotDir, `${fileBase}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  copyFileSync(shotPath, join(artifactShotDir, `${fileBase}.png`));

  results.push({ width, overflow, checks, metrics, screenshot: shotPath, pass });
  await page.close();
}

await browser.close();

const report = {
  label: 'YG-mobile-header-polish-proof',
  fixture: fixturePath,
  logoAsset: 'apps/web/public/brand/titan-wordmark.svg (inline twin of TitanWordmark.tsx)',
  runtimeSource: 'apps/web/src/brand/TitanWordmark.tsx → AppLayout compact wordmark',
  results,
  pass: !failed,
};
writeFileSync(join(outDir, 'yg-mobile-header-polish-proof.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
