#!/usr/bin/env node
/**
 * YG-CUTOVER-001B — static overflow probe at required breakpoints.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const require = createRequire('/tmp/overflow-probe/package.json');
const puppeteer = require('puppeteer-core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const widths = [360, 390, 430, 768, 1024, 1366, 1920];

const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const layoutCss = readFileSync(join(webRoot, 'src/styles/layout-grid.css'), 'utf8');
const uxCss = readFileSync(join(webRoot, 'src/components/ux/ux.css'), 'utf8');
const uiCss = readFileSync(join(webRoot, '../..', 'packages/ui/src/styles.css'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
:root {
  --titan-bg: #f4f6f8;
  --titan-bg-elevated: #fff;
  --titan-surface: #fff;
  --titan-surface-raised: #fafbfc;
  --titan-surface-muted: #f1f4f8;
  --titan-text: #111827;
  --titan-text-secondary: #4b5563;
  --titan-text-muted: #6b7280;
  --titan-border: #d7e0ef;
  --titan-border-subtle: #e5eaf2;
  --titan-border-strong: #c5d0e0;
  --titan-accent: #0f6b4d;
  --titan-accent-rgb: 15, 107, 77;
  --titan-accent-soft: rgba(15,107,77,0.1);
  --titan-danger: #b42318;
  --titan-warning: #b54708;
  --titan-radius-lg: 0.75rem;
  --titan-radius-md: 0.5rem;
  --titan-radius-sm: 0.375rem;
  --titan-radius-full: 999px;
  --titan-shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --titan-font-display: Georgia, serif;
  --titan-page-pad-x: 1rem;
  --titan-page-pad-y: 0.75rem;
  --titan-touch-target-min: 2.75rem;
  --titan-space-2: 0.5rem;
  --titan-space-6: 1.5rem;
  --titan-space-8: 2rem;
  --titan-motion-base: 120ms;
  --titan-motion-slow: 200ms;
  --titan-ease: ease;
  --titan-focus-ring: 0 0 0 2px #fff, 0 0 0 4px var(--titan-accent);
}
html, body { margin: 0; padding: 0; }
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
        <div class="app-header__brand"><strong>TITAN</strong><span class="brand-sub">Powered by AURA</span></div>
      </div>
      <div class="app-header__user">
        <a class="app-header__identity" href="#"><span class="app-header__identity-mark">YG</span><span>Manager Smoke</span></a>
        <button type="button" class="titan-btn">Sign out</button>
      </div>
    </div>
  </header>
  <div class="titan-shell__body">
    <aside class="titan-shell__sidebar" id="owner-mobile-nav">Nav</aside>
    <main class="titan-shell__main">
      <div class="app-content-container app-content-container--wide">
        <nav class="module-toolbar" aria-label="Dashboard sections">
          <a class="module-toolbar__link module-toolbar__link--active" href="#">Dashboard</a>
          <a class="module-toolbar__link" href="#">Mission Control</a>
          <a class="module-toolbar__link" href="#">Live Dispatch</a>
        </nav>
        <div class="exec-dashboard-page exec-dashboard-page--owner001">
          <div class="exec-dashboard exec-dashboard--owner001">
            <section class="exec-dashboard-region exec-dashboard-region--attention">
              <section class="titan-panel">
                <div class="titan-panel__header">
                  <div class="titan-panel__heading">
                    <h2 class="titan-panel__title">Attention Required</h2>
                    <p class="titan-panel__description">3 critical · 5 need attention · 2 opportunities</p>
                  </div>
                  <div class="titan-panel__action"><a href="#">View finance</a></div>
                </div>
                <div class="titan-panel__body">
                  <ul class="exec-attention__list">
                    <li class="exec-attention__row">
                      <a class="exec-attention__link" href="#">
                        <span class="exec-attention__main">
                          <strong>INV-10042 — Super Long Customer Name Plumbing Services Pty Ltd</strong>
                          <em>Overdue invoice needs collection follow-up today</em>
                          <span class="exec-attention__reason">Balance outstanding beyond terms</span>
                        </span>
                        <span class="exec-attention__meta">
                          <span class="exec-attention__priority is-critical">Critical</span>
                          <span class="exec-attention__amount">R 12,450.00</span>
                        </span>
                      </a>
                    </li>
                  </ul>
                </div>
              </section>
            </section>
            <section class="exec-dashboard-region exec-dashboard-region--finance">
              <section class="titan-panel">
                <div class="titan-panel__header">
                  <div class="titan-panel__heading">
                    <h2 class="titan-panel__title">Outstanding Invoices</h2>
                    <p class="titan-panel__description">Open AR sample for overflow probe</p>
                  </div>
                </div>
                <div class="titan-panel__body">
                  <div class="exec-outstanding__table-wrap">
                    <table class="exec-outstanding__table">
                      <tbody>
                        <tr class="exec-outstanding__row">
                          <td data-label="Invoice" class="exec-outstanding__col--number">INV-77821-LONG-REFERENCE</td>
                          <td data-label="Customer"><a class="exec-outstanding__customer" href="#">Young Guns Test Customer With Very Long Trading Name</a></td>
                          <td data-label="Balance" class="exec-outstanding__col--num">R 9,999.99</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </section>
            <section class="exec-dashboard-region exec-dashboard-region--ops">
              <div class="exec-live-ops-map" style="background:#dbe7f3;display:grid;place-items:center">Live Fleet Map</div>
            </section>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
</body>
</html>`;

const outDir = join(webRoot, '../../diagnostic-output');
mkdirSync(outDir, { recursive: true });
const fixturePath = join(outDir, 'yg-cutover-001b-overflow-fixture.html');
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
  await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'networkidle0' });
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const main = document.querySelector('.titan-shell__main');
    const title = document.querySelector('.titan-panel__title');
    const titleRect = title?.getBoundingClientRect();
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      mainPadLeft: main ? getComputedStyle(main).paddingLeft : null,
      titleLeft: titleRect?.left ?? null,
      titleVisible: titleRect
        ? titleRect.left >= -0.5 && titleRect.right <= window.innerWidth + 0.5
        : false,
    };
  });
  const overflow = metrics.scrollWidth > metrics.clientWidth + 1;
  const leftClip = typeof metrics.titleLeft === 'number' && metrics.titleLeft < -0.5;
  if (overflow || leftClip || !metrics.titleVisible) failed = true;
  results.push({ width, overflow, leftClip, ...metrics });
  await page.close();
}

await browser.close();

const report = {
  label: 'YG-CUTOVER-001B-overflow-check',
  fixture: fixturePath,
  results,
  pass: !failed,
};
writeFileSync(join(outDir, 'yg-cutover-001b-overflow-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
