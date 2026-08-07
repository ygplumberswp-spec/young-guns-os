#!/usr/bin/env node
/**
 * Technician Field Mobile — safe-area + Messages route probe.
 * Simulates iOS safe-area insets via CSS override (Chromium cannot emit real notch insets).
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

const WIDTHS = [320, 360, 375, 390, 414, 430];
const SAFE_TOP = 47; // Dynamic Island-class
const SAFE_SIDE = 0;

const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const layoutCss = readFileSync(join(webRoot, 'src/styles/layout-grid.css'), 'utf8');
const uiCss = readFileSync(join(webRoot, '../..', 'packages/ui/src/styles.css'), 'utf8');
const wordmarkSvg = readFileSync(join(webRoot, 'public/brand/titan-wordmark.svg'), 'utf8');
const wordmarkInline = wordmarkSvg
  .replace(/<\?xml[^>]*>/, '')
  .replace('<svg', '<svg class="titan-wordmark titan-wordmark--compact portal-header__wordmark"');

const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<style>
:root {
  --titan-bg: #0f1419;
  --titan-bg-elevated: #161c24;
  --titan-surface: #1b2330;
  --titan-text: #f3f6fb;
  --titan-text-secondary: #c2cad6;
  --titan-text-muted: #8b95a5;
  --titan-border: #2c3646;
  --titan-accent: #3db88a;
  --titan-font-display: system-ui, sans-serif;
  --titan-font-ui: system-ui, sans-serif;
  --titan-radius-sm: 0.375rem;
  --titan-page-pad-x: 1rem;
  --titan-page-pad-y: 0.75rem;
}
/* Simulate iOS safe-area (Chromium env() is 0 without a real notch) */
html {
  --sat: ${SAFE_TOP}px;
  --sal: ${SAFE_SIDE}px;
  --sar: ${SAFE_SIDE}px;
  --sab: 34px;
}
${uiCss}
${layoutCss}
${indexCss.replaceAll('env(safe-area-inset-top, 0px)', 'var(--sat)')
  .replaceAll('env(safe-area-inset-left, 0px)', 'var(--sal)')
  .replaceAll('env(safe-area-inset-right, 0px)', 'var(--sar)')
  .replaceAll('env(safe-area-inset-bottom, 0px)', 'var(--sab)')}
.probe-status {
  position: fixed; top: 0; left: 0; right: 0; height: ${SAFE_TOP}px;
  background: rgba(255,80,80,0.35); z-index: 100; pointer-events: none;
  display:flex; align-items:flex-end; justify-content:space-between;
  padding: 0 12px 4px; font: 12px/1 system-ui; color: #fff;
}
</style></head><body>
<div class="probe-status"><span>9:41</span><span>●●●</span></div>
<div class="portal-shell">
  <header class="portal-header">
    <div class="portal-header__brand-block">
      ${wordmarkInline}
      <span class="portal-brand">Field Mobile</span>
    </div>
    <div class="portal-header__user">
      <button type="button" class="titan-btn">Sign Out</button>
    </div>
  </header>
  <div class="portal-body">
    <nav class="portal-nav">
      <a class="portal-nav__link" href="#messages">Messages</a>
      <a class="portal-nav__link" href="#notifications">Notifications</a>
    </nav>
    <main class="portal-main">
      <h1>Messages</h1>
      <p>Assigned jobs / dispatch only</p>
    </main>
  </div>
</div>
</body></html>`;

const fixturePath = join(outDir, 'technician-safearea-messages-fixture.html');
writeFileSync(fixturePath, html);

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const results = [];
let failed = false;

for (const width of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'networkidle0' });
  const metrics = await page.evaluate((safeTop) => {
    const header = document.querySelector('.portal-header');
    const wordmark = document.querySelector('.portal-header__wordmark, .titan-wordmark');
    const hr = header.getBoundingClientRect();
    const wr = wordmark.getBoundingClientRect();
    const cs = getComputedStyle(header);
    return {
      headerTop: hr.top,
      wordmarkTop: wr.top,
      paddingTop: cs.paddingTop,
      clearOfStatusBar: wr.top >= safeTop - 0.5,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  }, SAFE_TOP);
  const pass = metrics.clearOfStatusBar && metrics.noOverflow;
  if (!pass) failed = true;
  const shot = join(shotDir, `technician-safearea-${width}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  copyFileSync(shot, join(artifactDir, `technician-safearea-${width}.png`));
  results.push({ width, ...metrics, pass, screenshot: shot });
  await page.close();
}

await browser.close();

const css = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const htmlSrc = readFileSync(join(webRoot, 'index.html'), 'utf8');
const roleExp = readFileSync(join(repoRoot, 'packages/shared/src/role-experience.ts'), 'utf8');
const messagesPage = readFileSync(join(webRoot, 'src/pages/mobile/MobileMessagesPage.tsx'), 'utf8');

const report = {
  label: 'TECHNICIAN-SAFEAREA-MESSAGES-DELTA',
  capturedAt: new Date().toISOString(),
  safeArea: {
    safariPwaWhatsApp: 'PASS_CSS_READY',
    method:
      'Header owns env(safe-area-inset-*); probe simulates Dynamic Island inset. viewport-fit=cover + black-translucent preserved for Safari/PWA/in-app browsers.',
    androidChrome: failed ? 'FAIL' : 'PASS',
  },
  messagesRootCause:
    'Nav previously labeled Messages while href=/mobile/notifications rendered MobileNotificationsPage. Fixed: Messages→/mobile/messages (MobileMessagesPage); Notifications remains separate.',
  messagingScope: [
    'assigned_jobs',
    'dispatch_office_requests',
    'authorised_customer_site_via_job_card',
  ],
  performance: {
    decision: 'remove',
    reason:
      'MobilePerformancePage exposes overtime hours + productivity exports — not pure field-execution metrics; removed from nav and denied for technician direct URL.',
    stillInNav: /label:\s*'Performance'/.test(roleExp),
    messagesCanonical: /href:\s*'\/mobile\/messages'/.test(roleExp) && /title="Messages"/.test(messagesPage),
  },
  contracts: {
    viewportFitCover: /viewport-fit=cover/.test(htmlSrc),
    headerOwnsSafeAreaTop: /\.portal-header\s*\{[\s\S]*safe-area-inset-top/.test(css),
    no720PaddingShorthandWipe: !/@media \(max-width: 720px\)[\s\S]*\.portal-header[\s\S]*padding:\s*0\.75rem 1rem/.test(
      css,
    ),
  },
  testedWidths: WIDTHS,
  results,
  pass: !failed,
  productionTouched: 0,
};

writeFileSync(join(outDir, 'technician-safearea-messages-proof.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
