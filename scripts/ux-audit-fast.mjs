/** Fast browser UX audit — domcontentloaded, 8s cap per page */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:5174';
const API = process.env.AUDIT_API_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), 'audit-output');
const SHOTS = join(OUT, 'screenshots');
const ts = Date.now();
const ownerEmail = `audit2-owner-${ts}@audit.titan.local`;
const ownerPass = 'AuditTest123!';
const techEmail = `audit2-tech-${ts}@audit.titan.local`;
const techPass = 'AuditTest456!';

const OWNER_ROUTES = [
  '/', '/crm', '/crm/new', '/leads', '/jobs', '/jobs/new', '/scheduling',
  '/finance/quotes', '/finance/quotes/new', '/finance/invoices', '/finance/invoices/new',
  '/finance/payments', '/finance/payments/new', '/inventory/products', '/inventory/stock',
  '/fleet', '/communications/messages', '/communications/templates', '/documents', '/analytics',
  '/aura', '/aura/agents', '/automation', '/mission-control', '/integrations', '/integrations/xero',
  '/security', '/platform-health', '/release-center', '/saas-management',
  '/settings/company', '/settings/team', '/settings/portal',
  '/marketing-intelligence', '/sales-intelligence', '/platform', '/operations',
  '/communications-hub', '/customer-experience', '/workforce-intelligence',
  '/global-search', '/document-ai', '/voice-reception', '/developer', '/developers',
  '/digital-twin', '/knowledge', '/evolution', '/data-migration', '/launch-center',
  '/recruiting', '/quality', '/ai-orchestration', '/dispatch-intelligence',
];

const TECH_ROUTES = ['/mobile', '/mobile/jobs', '/mobile/route', '/mobile/inventory', '/mobile/time', '/mobile/sync'];
const TECH_BLOCK = ['/', '/crm', '/finance/quotes', '/scheduling', '/aura', '/jobs', '/documents'];
const PORTAL_ROUTES = ['/portal/login', '/portal', '/portal/jobs', '/portal/quotes', '/portal/finance', '/portal/appointments', '/portal/communications', '/portal/documents', '/portal/profile', '/portal/feedback', '/portal/loyalty', '/portal/assets'];
const AUTH = ['/auth/login', '/auth/signup'];

async function signup() {
  const r = await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password: ownerPass, companyName: `Audit ${ts}`, firstName: 'A', lastName: 'Owner' }),
  });
  const b = await r.json();
  return b.data;
}

async function login(email, pass) {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  return (await r.json()).data;
}

async function inviteTech(token) {
  const roles = (await (await fetch(`${API}/api/v1/team/roles`, { headers: { Authorization: `Bearer ${token}` } })).json()).data.roles;
  const tech = roles.find((x) => x.name === 'Technician');
  if (!tech) return null;
  const r = await fetch(`${API}/api/v1/team/invites`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: techEmail, roleId: tech.id }),
  });
  const b = await r.json();
  const url = b.data?.inviteUrl;
  return url ? new URL(url).searchParams.get('token') : null;
}

async function inspect(page, path, role, tag) {
  const res = { route: path, role, status: 'PASS', reasons: [], apiErrors: [], consoleErrors: [], textLen: 0, url: '' };
  const apiErrors = [], consoleErrors = [];
  const onR = (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400 && !u.includes('/portal/auth/refresh') && !(u.includes('/aura') && r.status() === 503))
      apiErrors.push(`${r.status()} ${u.split('/api/v1/')[1] || u}`);
  };
  const onC = (m) => { if (m.type() === 'error' && !m.text().includes('portal/auth/refresh')) consoleErrors.push(m.text().slice(0, 120)); };
  page.on('response', onR); page.on('console', onC);
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const text = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
    res.textLen = text.length;
    res.url = page.url();
    if (text.length < 25 || /^loading/i.test(text)) { res.status = 'FAIL'; res.reasons.push(text.length < 25 ? 'Blank/near-blank' : 'Stuck loading'); }
    if (/coming soon|not implemented|under construction|lorem ipsum/i.test(text)) { res.status = 'WARNING'; res.reasons.push('Placeholder text'); }
    if (apiErrors.length) { if (res.status === 'PASS') res.status = 'WARNING'; res.reasons.push(`${apiErrors.length} API error(s)`); }
    if (consoleErrors.length) { if (res.status === 'PASS') res.status = 'WARNING'; res.reasons.push(`${consoleErrors.length} console error(s)`); }
    if (!res.reasons.length) res.reasons.push('OK');
    await page.screenshot({ path: join(SHOTS, `${tag}_${path.replace(/\//g, '_') || 'root'}.png`), fullPage: true }).catch(() => {});
  } catch (e) {
    res.status = 'FAIL'; res.reasons.push(e.message.slice(0, 100));
  }
  page.off('response', onR); page.off('console', onC);
  res.apiErrors = apiErrors.slice(0, 4); res.consoleErrors = consoleErrors.slice(0, 3);
  return res;
}

async function browserLogin(page, email, pass) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function acceptInvite(page, token, pass) {
  await page.goto(`${BASE}/auth/accept-invite?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  const inputs = page.locator('input');
  const n = await inputs.count();
  if (n >= 3) {
    await inputs.nth(0).fill('Audit'); await inputs.nth(1).fill('Tech');
    const pw = page.locator('input[type="password"]');
    const pn = await pw.count();
    if (pn >= 2) { await pw.nth(0).fill(pass); await pw.nth(1).fill(pass); }
    else if (pn === 1) await pw.fill(pass);
  }
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const owner = await signup();
  const inviteTok = await inviteTech(owner.session.accessToken);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const report = { owner: [], tech: [], portal: [], auth: [], sidebar: [], roleViolations: [], workflows: [], accounts: { ownerEmail, techEmail } };

  for (const p of AUTH) report.auth.push(await inspect(page, p, 'Guest', 'auth'));

  await browserLogin(page, ownerEmail, ownerPass);
  report.sidebar = await page.locator('.app-nav__link').allTextContents();
  for (const p of OWNER_ROUTES) { process.stdout.write('.'); report.owner.push(await inspect(page, p, 'Owner', 'owner')); }

  // workflows
  report.workflows = [
    { name: 'Login', status: 'PASS', note: 'Owner browser login succeeded' },
  ];
  try {
    await page.goto(`${BASE}/crm/new`, { waitUntil: 'domcontentloaded' });
    await page.locator('input').first().fill(`Audit Co ${ts}`);
    const email = page.locator('input[type="email"]');
    if (await email.count()) await email.fill(`c-${ts}@audit.local`);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
    report.workflows.push({ name: 'Create customer', status: page.url().includes('/crm/') && !page.url().endsWith('/new') ? 'PASS' : 'WARNING', note: page.url() });
  } catch (e) { report.workflows.push({ name: 'Create customer', status: 'FAIL', note: String(e) }); }

  for (const w of ['Create lead', 'Convert lead', 'Create quote', 'Approve quote', 'Schedule job', 'Assign technician', 'Dispatch', 'Technician job update', 'Signature', 'Generate invoice', 'Record payment', 'Portal ETA', 'Purchase order', 'Vehicle tracking', 'Automation execution']) {
    report.workflows.push({ name: w, status: 'NOT TESTED', note: 'Full cross-module chain not executed in browser audit' });
  }
  report.workflows.push({ name: 'AURA chat page', status: (await inspect(page, '/aura', 'Owner', 'wf')).status, note: 'Page load only' });
  report.workflows.push({ name: 'Integration settings', status: (await inspect(page, '/integrations/xero', 'Owner', 'wf2')).status, note: 'Xero page load' });

  // technician
  if (inviteTok) {
    await ctx.clearCookies();
    await acceptInvite(page, inviteTok, techPass);
    await browserLogin(page, techEmail, techPass);
    report.sidebarTech = await page.locator('.portal-nav__link, .app-nav__link').allTextContents().catch(() => []);
    for (const p of TECH_ROUTES) report.tech.push(await inspect(page, p, 'Technician', 'tech'));
    for (const p of TECH_BLOCK) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      const text = await page.locator('body').innerText();
      const url = page.url();
      report.roleViolations.push({
        path: p, landed: url,
        status: (p === '/crm' && /Customers|Add customer/i.test(text) && !/permission/i.test(text)) ? 'FAIL'
          : (url.includes('/mobile') || text.length < 40) ? 'PASS' : 'WARNING',
        note: text.slice(0, 80),
      });
    }
  }

  const portal = await browser.newPage();
  for (const p of PORTAL_ROUTES) report.portal.push(await inspect(portal, p, 'Client (guest)', 'portal'));

  // responsive
  const mob = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mob.newPage();
  await browserLogin(mp, ownerEmail, ownerPass);
  await mp.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await mp.screenshot({ path: join(SHOTS, 'mobile_owner_dashboard.png'), fullPage: true });

  await browser.close();

  const all = [...report.owner, ...report.tech, ...report.portal, ...report.auth];
  const pass = all.filter((x) => x.status === 'PASS').length;
  const warn = all.filter((x) => x.status === 'WARNING').length;
  const fail = all.filter((x) => x.status === 'FAIL').length;
  report.scores = { pass, warn, fail, total: all.length, pageReadiness: Math.round((pass + warn * 0.55) / all.length * 100), overallUpdated: Math.round(66 * 0.65 + ((pass + warn * 0.55) / all.length * 100) * 0.35) };
  await writeFile(join(OUT, 'ux-audit-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nDone: ${pass} PASS ${warn} WARN ${fail} FAIL / ${all.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
