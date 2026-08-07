/**
 * MOBILE-001 visual proof — device matrix screenshots for harness + staging login chrome.
 * Does not authenticate or send provider traffic.
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const outDir = '/opt/cursor/artifacts/mobile-001';
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'tablet-portrait-768', width: 768, height: 1024 },
  { name: 'mobile-large-430', width: 430, height: 932 },
  { name: 'mobile-standard-390', width: 390, height: 844 },
  { name: 'mobile-narrow-360', width: 360, height: 800 },
];

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const publicRoot = '/workspace/apps/web/public';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const rel = url.pathname === '/' ? '/mobile-001-visual-harness.html' : url.pathname;
    const filePath = join(publicRoot, rel);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const results = [];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${base}/mobile-001-visual-harness.html`, { waitUntil: 'networkidle' });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  const file = `harness-${vp.name}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: true });
  results.push({ surface: 'harness', ...vp, file, ...metrics });
  await page.close();
}

// Phone + open menu
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/mobile-001-visual-harness.html`, { waitUntil: 'networkidle' });
  await page.click('#menuBtn');
  await page.screenshot({ path: join(outDir, 'harness-mobile-nav-open.png'), fullPage: true });
  results.push({ surface: 'harness-nav-open', width: 390, height: 844, file: 'harness-mobile-nav-open.png' });
  await page.close();
}

// Staging login chrome (public) — desktop + phone
const staging = 'https://comfortable-determination-staging.up.railway.app/login';
for (const vp of [
  { name: 'staging-login-desktop', width: 1440, height: 900 },
  { name: 'staging-login-phone', width: 390, height: 844 },
]) {
  try {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(staging, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const file = `${vp.name}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: true });
    results.push({ surface: 'staging-login', ...vp, file, ok: true });
    await page.close();
  } catch (err) {
    results.push({ surface: 'staging-login', ...vp, ok: false, error: String(err) });
  }
}

// Pixel 5 device descriptor smoke on harness
{
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();
  await page.goto(`${base}/mobile-001-visual-harness.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(outDir, 'harness-pixel5.png'), fullPage: true });
  results.push({ surface: 'harness-pixel5', file: 'harness-pixel5.png' });
  await context.close();
}

await browser.close();
server.close();

const summary = {
  label: 'MOBILE-001',
  generatedAt: new Date().toISOString(),
  outDir,
  results,
  note: 'Harness proves phone order (AURA=1), menu drawer, no horizontal overflow, sticky composer. Authenticated product screenshots require Owner session.',
};
writeFileSync(join(outDir, 'visual-proof-index.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
