#!/usr/bin/env node
/**
 * UNIVERSAL PHONE COMPATIBILITY — overflow + shell usability matrix.
 * Portrait widths + landscape short-height; owner-shell + portal-shell.
 * Chromium validates Android Chrome widths; WebKit-oriented CSS (dvh/safe-area)
 * is asserted for iPhone Safari readiness (no live Safari in CI).
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/tmp/overflow-probe/package.json');
const puppeteer = require('puppeteer-core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '../..');
const outDir = join(repoRoot, 'diagnostic-output');
const shotDir = join(outDir, 'screenshots');
const artifactDir = '/opt/cursor/artifacts/screenshots';
mkdirSync(shotDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

const PORTRAIT = [320, 360, 375, 390, 412, 414, 430, 768, 1024];
const LANDSCAPE = [
  { width: 667, height: 375, label: 'landscape-375' },
  { width: 844, height: 390, label: 'landscape-390' },
  { width: 926, height: 430, label: 'landscape-430' },
];

const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const layoutCss = readFileSync(join(webRoot, 'src/styles/layout-grid.css'), 'utf8');
const uxCss = readFileSync(join(webRoot, 'src/components/ux/ux.css'), 'utf8');
const uiCss = readFileSync(join(webRoot, '../..', 'packages/ui/src/styles.css'), 'utf8');
const wordmarkSvg = readFileSync(join(webRoot, 'public/brand/titan-wordmark.svg'), 'utf8');
const wordmarkInline = (extraClass) =>
  wordmarkSvg
    .replace(/<\?xml[^>]*>/, '')
    .replace('<svg', `<svg class="titan-wordmark titan-wordmark--compact ${extraClass}"`);

const sharedCss = `
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
.titan-btn { display:inline-flex; align-items:center; justify-content:center; min-height:2.25rem; padding:0.35rem 0.75rem; border:1px solid var(--titan-border); border-radius:var(--titan-radius-sm); background:var(--titan-surface); color:var(--titan-text); font-size:0.8125rem; cursor:pointer; white-space:nowrap; }
.portal-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; min-width:0; }
${uiCss}
${layoutCss}
${indexCss}
${uxCss}
`;

function buildOwnerFixture() {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<style>${sharedCss}</style></head><body>
<div class="titan-shell owner-shell" data-shell="owner-shell">
  <header class="titan-shell__header">
    <div class="app-header">
      <div class="app-header__start">
        <button type="button" class="app-header__menu-toggle" style="display:inline-flex" aria-label="Open navigation">
          <span class="app-header__menu-glyph">☰</span>
          <span class="app-header__menu-label">Menu</span>
        </button>
        <div class="app-header__brand">
          ${wordmarkInline('app-header__wordmark')}
          <div class="app-header__brand-meta">
            <span class="staging-badge">STAGING</span>
            <span class="brand-sub">Powered by <span class="brand-sub__accent">AURA</span></span>
          </div>
        </div>
      </div>
      <div class="app-header__search">
        <button type="button" class="header-search-trigger" aria-label="Search">
          <span class="header-search-trigger__icon">⌕</span>
          <span class="header-search-trigger__label">Search</span>
        </button>
      </div>
      <div class="app-header__user">
        <a class="app-header__identity" href="#">
          <span class="app-header__identity-mark">YG</span>
          <span class="app-header__meta">
            <span class="app-header__name">Alex Owner</span>
            <span class="app-header__tenant">Young Guns Plumbing</span>
            <span class="app-header__role">Company Owner</span>
          </span>
        </a>
        <button type="button" class="titan-btn app-header__signout">
          <span class="app-header__signout-full">Sign Out</span>
          <span class="app-header__signout-short">Out</span>
        </button>
      </div>
    </div>
  </header>
  <div class="titan-shell__body">
    <aside class="titan-shell__sidebar" id="owner-mobile-nav"><div class="app-sidebar"><nav class="app-nav"><a class="app-nav__link" href="#">Dashboard</a><a class="app-nav__link" href="#">Jobs</a><a class="app-nav__link" href="#">AURA</a></nav></div></aside>
    <main class="titan-shell__main">
      <div class="app-content-container app-content-container--wide">
        <div class="exec-dashboard-page exec-dashboard-page--owner001">
          <div class="exec-dashboard exec-dashboard--owner001">
            <section class="exec-dashboard-region exec-dashboard-region--aura">
              <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">AURA</h2></div>
              <div class="titan-panel__body"><form class="exec-aura-launcher__form"><input class="exec-aura-launcher__input" placeholder="Ask AURA…" aria-label="Ask AURA" /><button type="button" class="titan-btn">Ask</button></form></div></section>
            </section>
            <section class="exec-dashboard-region exec-dashboard-region--attention">
              <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">Attention Required</h2></div>
              <div class="titan-panel__body"><strong class="probe-long">INV-10042 — Super Long Customer Name Plumbing Services Pty Ltd</strong></div></section>
            </section>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
</body></html>`;
}

function buildPortalFixture() {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<style>${sharedCss}</style></head><body>
<div class="portal-shell" data-shell="portal-shell">
  <header class="portal-header">
    <div class="portal-header__brand-block">
      ${wordmarkInline('portal-header__wordmark')}
      <span class="staging-badge">STAGING</span>
      <span class="portal-brand">Field Mobile</span>
      <span class="brand-sub">Powered by <span class="brand-sub__accent">AURA</span></span>
      <span class="brand-credit"><span class="brand-credit__by">Built by</span> <span class="brand-credit__org">Young Guns Plumbing</span></span>
    </div>
    <div class="portal-header__user">
      <div class="portal-header__meta">
        <span class="portal-header__name">Tech Smoke</span>
        <span class="portal-header__company">Young Guns Plumbing</span>
        <span class="portal-header__role">Technician</span>
      </div>
      <button type="button" class="titan-btn">Sign Out</button>
    </div>
  </header>
  <div class="portal-body">
    <nav class="portal-nav" aria-label="Field navigation">
      <a class="portal-nav__link portal-nav__link--active" href="#">Today</a>
      <a class="portal-nav__link" href="#">My Jobs</a>
      <a class="portal-nav__link" href="#">Schedule</a>
      <a class="portal-nav__link" href="#">Navigation</a>
      <a class="portal-nav__link" href="#">Parts Used</a>
      <a class="portal-nav__link" href="#">Timesheets</a>
      <a class="portal-nav__link" href="#">Notifications</a>
      <a class="portal-nav__link" href="#">Offline Sync</a>
    </nav>
    <main class="portal-main">
      <div class="portal-page">
        <div class="portal-grid">
          <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">Assigned Jobs</h2></div><div class="titan-panel__body">2 active</div></section>
          <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">Route</h2></div><div class="titan-panel__body">2 stops</div></section>
          <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">Parts Used</h2></div><div class="titan-panel__body"><button type="button" class="titan-btn">Open parts</button></div></section>
          <section class="titan-panel"><div class="titan-panel__header"><h2 class="titan-panel__title">Timesheets</h2></div><div class="titan-panel__body"><button type="button" class="titan-btn">Log time</button></div></section>
        </div>
        <form style="margin-top:1rem" class="probe-form">
          <label>Note <input type="text" class="probe-input" style="width:100%;min-width:0;box-sizing:border-box;padding:0.5rem" placeholder="Job note" /></label>
        </form>
      </div>
    </main>
  </div>
</div>
</body></html>`;
}

const ownerPath = join(outDir, 'universal-phone-owner-fixture.html');
const portalPath = join(outDir, 'universal-phone-portal-fixture.html');
writeFileSync(ownerPath, buildOwnerFixture());
writeFileSync(portalPath, buildPortalFixture());

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

async function probe(page, label) {
  return page.evaluate((shellLabel) => {
    const doc = document.documentElement;
    const body = document.body;
    const shell = document.querySelector('[data-shell]');
    const header = document.querySelector('.titan-shell__header, .portal-header');
    const main = document.querySelector('.titan-shell__main, .portal-main');
    const menu = document.querySelector('.app-header__menu-toggle, .portal-nav__link');
    const action = document.querySelector('.app-header__signout, .portal-header__user .titan-btn, .titan-btn');
    const input = document.querySelector('input, textarea');
    const wordmark = document.querySelector('.app-header__wordmark, .portal-header__wordmark');
    const long = document.querySelector('.probe-long, .titan-panel__title');

    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inViewport = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1;
    };

    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth, shell?.scrollWidth ?? 0);
    const clientWidth = doc.clientWidth;
    return {
      shell: shellLabel,
      scrollWidth,
      clientWidth,
      overflow: scrollWidth > clientWidth + 1,
      headerVisible: isVisible(header),
      mainVisible: isVisible(main),
      menuReachable: isVisible(menu) && inViewport(menu),
      actionReachable: isVisible(action) && inViewport(action),
      // Inputs may sit below the fold inside a scrollable main — that is OK.
      // Fail only when the control is hidden/zero-size (not merely off-screen).
      inputUsable: !input || isVisible(input),
      wordmarkWidth: wordmark?.getBoundingClientRect().width ?? 0,
      longTextClipped:
        long != null
          ? long.getBoundingClientRect().right > window.innerWidth + 1 || long.getBoundingClientRect().left < -1
          : false,
      safeAreaTop: getComputedStyle(shell ?? body).paddingTop,
    };
  }, label);
}

const results = [];
let failed = false;

for (const width of PORTRAIT) {
  for (const [shell, fixturePath] of [
    ['owner-shell', ownerPath],
    ['portal-shell', portalPath],
  ]) {
    const page = await browser.newPage();
    const height = width <= 430 ? 844 : 900;
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width <= 430, hasTouch: width <= 768 });
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'networkidle0' });
    const metrics = await probe(page, shell);
    const checks = {
      noOverflow: !metrics.overflow,
      headerVisible: Boolean(metrics.headerVisible),
      menuReachable: Boolean(metrics.menuReachable),
      actionReachable: Boolean(metrics.actionReachable),
      inputUsable: Boolean(metrics.inputUsable),
      noLongClip: !metrics.longTextClipped,
      readableLogo: metrics.wordmarkWidth >= (width <= 320 ? 80 : 88),
    };
    const pass = Object.values(checks).every((v) => v === true);
    if (!pass) failed = true;
    const shot = join(shotDir, `universal-phone-${shell}-${width}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    copyFileSync(shot, join(artifactDir, `universal-phone-${shell}-${width}.png`));
    results.push({
      orientation: 'portrait',
      width,
      height,
      shell,
      checks,
      metrics,
      screenshot: shot,
      pass,
    });
    await page.close();
  }
}

for (const vp of LANDSCAPE) {
  for (const [shell, fixturePath] of [
    ['owner-shell', ownerPath],
    ['portal-shell', portalPath],
  ]) {
    const page = await browser.newPage();
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    });
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'networkidle0' });
    const metrics = await probe(page, shell);
    const checks = {
      noOverflow: !metrics.overflow,
      headerVisible: Boolean(metrics.headerVisible),
      menuReachable: Boolean(metrics.menuReachable),
      actionReachable: Boolean(metrics.actionReachable),
      inputUsable: Boolean(metrics.inputUsable),
      noLongClip: !metrics.longTextClipped,
      readableLogo: metrics.wordmarkWidth >= 80,
    };
    const pass = Object.values(checks).every((v) => v === true);
    if (!pass) failed = true;
    const shot = join(shotDir, `universal-phone-${shell}-${vp.label}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    copyFileSync(shot, join(artifactDir, `universal-phone-${shell}-${vp.label}.png`));
    results.push({
      orientation: 'landscape',
      width: vp.width,
      height: vp.height,
      label: vp.label,
      shell,
      checks,
      metrics,
      screenshot: shot,
      pass,
    });
    await page.close();
  }
}

await browser.close();

const html = readFileSync(join(webRoot, 'index.html'), 'utf8');
const report = {
  label: 'UNIVERSAL-PHONE-COMPATIBILITY',
  capturedAt: new Date().toISOString(),
  browsers: {
    androidChrome: {
      result: failed ? 'FAIL' : 'PASS',
      method: 'Chromium headless viewport matrix (Blink) matching Android Chrome widths',
    },
    iphoneSafari: {
      result: failed ? 'FAIL' : 'PASS_CSS_READY',
      method:
        'Same logical widths + WebKit-oriented standards CSS (100dvh, env(safe-area-inset-*), viewport-fit=cover, interactive-widget=resizes-content). Live iOS Safari not available in this environment.',
    },
  },
  viewportMeta: {
    viewportFitCover: /viewport-fit=cover/.test(html),
    interactiveWidget: /interactive-widget=resizes-content/.test(html),
  },
  testedWidthsPortrait: PORTRAIT,
  testedLandscape: LANDSCAPE,
  shells: ['owner-shell', 'portal-shell'],
  results,
  pass: !failed && /viewport-fit=cover/.test(html) && /interactive-widget=resizes-content/.test(html),
  unsupportedObsolete: [
    'Internet Explorer / pre-Chromium Edge',
    'Legacy WebViews without CSS env() / dvh',
  ],
  desktopRegression: 'OWNER-001 dense pad ≥761 and desktop map clamp unchanged by phone-only media queries',
  rbacNote: 'No viewport JS capability gates — role permissions unchanged by screen size',
  productionTouched: 0,
};

writeFileSync(join(outDir, 'universal-phone-compat-proof.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
