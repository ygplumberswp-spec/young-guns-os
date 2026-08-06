/**
 * Renders the Facebook Business page in a real browser to prove the UI gap is
 * closed: the route resolves, the page paints, every tab renders, and the
 * sidebar exposes the entry. Screenshots land in diagnostic-output/fb-ui-shots.
 */
import fs from 'node:fs';
import path from 'node:path';
// pnpm keeps playwright out of the root node_modules, so resolve it explicitly.
const { chromium } = await import(
  new URL('../node_modules/.pnpm/playwright@1.51.1/node_modules/playwright/index.mjs', import.meta.url)
    .href
);

const UI = process.env.FB_UI_BASE ?? 'http://127.0.0.1:4180';
const SHOTS = path.join(import.meta.dirname, 'fb-ui-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const suffix = Date.now().toString(36);
const consoleErrors = [];
const failedRequests = [];
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('requestfailed', (req) => {
  failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

// Sign up through the API so the browser carries a real authenticated session.
const signupResponse = await page.request.post(`${UI}/api/v1/auth/signup`, {
  data: {
    companyName: `FB Browser Verify ${suffix}`,
    firstName: 'FB',
    lastName: 'Verify',
    email: `fb.browser.${suffix}@staging-fb-verify.test`,
    password: 'FbVerifyStaging1!',
  },
});
record('signup isolated tenant', signupResponse.status() === 201, `HTTP ${signupResponse.status()}`);
const session = await signupResponse.json();
const accessToken = session?.data?.session?.accessToken;

// The app reads its access token from memory after restore; seed it the same
// way the login screen would by driving the real form instead of faking state.
await page.goto(`${UI}/auth/login`, { waitUntil: 'networkidle' });
await page.fill('#email', `fb.browser.${suffix}@staging-fb-verify.test`);
await page.fill('#password', 'FbVerifyStaging1!');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 }).catch(() => {});
record('signed in through the login form', !page.url().includes('/auth/'), `at ${page.url()}`);

// Drop the pre-login session-restore 401s; only errors on the page itself count.
consoleErrors.length = 0;
failedRequests.length = 0;

await page.goto(`${UI}/facebook-business`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(SHOTS, '01-connection.png'), fullPage: true });

const heading = await page.locator('h1').first().textContent().catch(() => null);
record('page renders its heading', heading?.includes('Facebook Business') === true, `h1="${heading}"`);
record('route did not fall through to Not Found', !(await page.getByText(/not found/i).count()));

const bodyText = await page.locator('body').innerText();
record(
  'connection state is reported honestly',
  /Meta app not configured|configuration|Not configured/i.test(bodyText),
  bodyText.match(/Meta app not configured[^\n]*/)?.[0] ?? 'no configuration wording found',
);
record(
  'no Connect button is offered while unconfigured',
  await page.getByRole('button', { name: 'Connect Facebook' }).isDisabled().catch(() => true),
);

const TABS = [
  'Connection',
  'Content & Approvals',
  'Comments',
  'Leads',
  'Performance',
  'Sync & Alerts',
];
let index = 1;
for (const label of TABS) {
  const button = page.getByRole('button', { name: label, exact: true }).first();
  const visible = await button.isVisible().catch(() => false);
  if (!visible) {
    record(`tab "${label}" present`, false, 'button not found');
    continue;
  }
  await button.click();
  await page.waitForTimeout(900);
  index += 1;
  const file = path.join(SHOTS, `0${index}-${label.replace(/[^a-z]/gi, '-').toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const text = await page.locator('body').innerText();
  // A tab that painted nothing but the shell means the panel threw.
  record(`tab "${label}" renders content`, text.length > 400, `${text.length} chars`);
}

const navLink = page.locator('a[href="/facebook-business"]').first();
record('sidebar exposes a Facebook Business link', (await navLink.count()) > 0);

record('no console errors on the page', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
record(
  'no failed network requests',
  failedRequests.length === 0,
  failedRequests.slice(0, 3).join(' | '),
);

await page.screenshot({ path: path.join(SHOTS, '99-final.png'), fullPage: true });
await browser.close();

const failed = results.filter((entry) => !entry.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${SHOTS}`);
if (accessToken) console.log('(session established)');
process.exit(failed.length === 0 ? 0 : 1);
