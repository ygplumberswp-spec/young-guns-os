/**
 * TITAN AURA V1 — Browser UX audit (read-only inspection).
 * Run: node scripts/ux-audit.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:5174';
const API_URL = process.env.AUDIT_API_URL || 'http://localhost:3000';
const OUT_DIR = join(process.cwd(), 'audit-output');
const SHOT_DIR = join(OUT_DIR, 'screenshots');

const ts = Date.now();
const ownerEmail = `audit-owner-${ts}@audit.titan.local`;
const ownerPassword = 'AuditTest123!';
const techEmail = `audit-tech-${ts}@audit.titan.local`;
const techPassword = 'AuditTest456!';

const PLACEHOLDER_PATTERNS = [
  /coming soon/i,
  /under construction/i,
  /not implemented/i,
  /lorem ipsum/i,
  /demo data/i,
  /fake data/i,
  /TODO/i,
  /placeholder page/i,
];

const OWNER_ROUTES = [
  { path: '/', name: 'Dashboard', menu: 'Sidebar: Dashboard' },
  { path: '/crm', name: 'Customers', menu: 'Sidebar: Customers' },
  { path: '/crm/new', name: 'Customer Create', menu: 'Customers → Add' },
  { path: '/leads', name: 'Leads', menu: 'Sidebar: Leads' },
  { path: '/jobs', name: 'Jobs', menu: 'Sidebar: Jobs' },
  { path: '/jobs/new', name: 'Job Create', menu: 'Jobs → New' },
  { path: '/scheduling', name: 'Scheduling', menu: 'Sidebar: Scheduling' },
  { path: '/finance/quotes', name: 'Quotes', menu: 'Sidebar: Quotes' },
  { path: '/finance/quotes/new', name: 'Quote Create', menu: 'Finance → New Quote' },
  { path: '/finance/invoices', name: 'Invoices', menu: 'Sidebar: Invoices' },
  { path: '/finance/invoices/new', name: 'Invoice Create', menu: 'Finance → New Invoice' },
  { path: '/finance/payments', name: 'Payments', menu: 'Sidebar: Payments' },
  { path: '/finance/payments/new', name: 'Payment Create', menu: 'Finance → New Payment' },
  { path: '/inventory/products', name: 'Products', menu: 'Sidebar: Inventory' },
  { path: '/inventory/products/new', name: 'Product Create', menu: 'Inventory → New' },
  { path: '/inventory/stock', name: 'Stock Overview', menu: 'Inventory sub' },
  { path: '/fleet', name: 'Fleet', menu: 'Sidebar: Fleet' },
  { path: '/fleet/new', name: 'Vehicle Create', menu: 'Fleet → New' },
  { path: '/communications/messages', name: 'Messages', menu: 'Sidebar: Communications' },
  { path: '/communications/messages/new', name: 'Message Create', menu: 'Communications → New' },
  { path: '/communications/templates', name: 'Templates', menu: 'Communications sub' },
  { path: '/communications/templates/new', name: 'Template Create', menu: 'Communications sub' },
  { path: '/documents', name: 'Documents', menu: 'Sidebar: Documents' },
  { path: '/documents/new', name: 'Document Create', menu: 'Documents → New' },
  { path: '/documents/categories', name: 'Document Categories', menu: 'Documents sub' },
  { path: '/documents/categories/new', name: 'Category Create', menu: 'Documents sub' },
  { path: '/analytics', name: 'Analytics', menu: 'Sidebar: Analytics' },
  { path: '/marketing-intelligence', name: 'Marketing Intelligence', menu: 'Orphan (no nav)' },
  { path: '/aura/agents', name: 'AI Agents', menu: 'Sidebar: AI Agents' },
  { path: '/aura/agents/new', name: 'Agent Create', menu: 'Agents → New' },
  { path: '/aura/agents/executions', name: 'Agent Executions', menu: 'Agents sub' },
  { path: '/aura', name: 'Owner AI Chat', menu: 'Sidebar: Owner AI Chat' },
  { path: '/automation', name: 'Automations', menu: 'Sidebar: Automations' },
  { path: '/automation/new', name: 'Workflow Create', menu: 'Automations → New' },
  { path: '/automation/executions', name: 'Automation Executions', menu: 'Automations sub' },
  { path: '/automation-studio', name: 'Automation Studio', menu: 'Orphan' },
  { path: '/mission-control', name: 'Mission Control', menu: 'Sidebar: Mission Control' },
  { path: '/integrations', name: 'Integrations', menu: 'Sidebar: Integrations' },
  { path: '/integrations/xero', name: 'Xero Settings', menu: 'Integrations sub' },
  { path: '/integrations/email', name: 'Email Settings', menu: 'Integrations sub' },
  { path: '/integrations/yoco', name: 'Yoco Settings', menu: 'Integrations sub' },
  { path: '/integrations/whatsapp', name: 'WhatsApp Settings', menu: 'Integrations sub' },
  { path: '/integrations/cartrack', name: 'Cartrack Settings', menu: 'Integrations sub' },
  { path: '/integrations/sync-jobs', name: 'Sync Jobs', menu: 'Integrations sub' },
  { path: '/integrations/webhooks', name: 'Webhooks', menu: 'Integrations sub' },
  { path: '/security', name: 'Security', menu: 'Sidebar: Security' },
  { path: '/platform-health', name: 'Platform Health', menu: 'Sidebar: Platform Health' },
  { path: '/release-center', name: 'Release Center', menu: 'Sidebar: Release Center' },
  { path: '/saas-management', name: 'SaaS Management', menu: 'Sidebar: SaaS Management' },
  { path: '/settings/company', name: 'Company Settings', menu: 'Sidebar: Settings' },
  { path: '/settings/team', name: 'Team Settings', menu: 'Settings sub' },
  { path: '/settings/portal', name: 'Portal Settings', menu: 'Settings sub' },
  { path: '/settings/billing', name: 'Owner Billing', menu: 'Settings sub' },
  { path: '/settings/cartrack', name: 'Cartrack Settings (dup)', menu: 'Settings sub' },
  { path: '/recruiting', name: 'Recruiting', menu: 'Orphan' },
  { path: '/quality', name: 'Quality', menu: 'Orphan' },
  { path: '/communications-intelligence', name: 'Communications Intelligence', menu: 'Orphan' },
  { path: '/asset-equipment', name: 'Asset Equipment', menu: 'Orphan' },
  { path: '/ai-orchestration', name: 'AI Orchestration', menu: 'Orphan' },
  { path: '/dispatch-intelligence', name: 'Dispatch Intelligence', menu: 'Orphan' },
  { path: '/fleet-intelligence', name: 'Fleet Intelligence', menu: 'Orphan' },
  { path: '/personal-communications-intelligence', name: 'Personal Comms Intelligence', menu: 'Orphan' },
  { path: '/platform', name: 'Platform', menu: 'Orphan' },
  { path: '/operations', name: 'Operations', menu: 'Orphan' },
  { path: '/mobile-platform', name: 'Mobile Platform', menu: 'Orphan' },
  { path: '/mobile-platform/dispatcher', name: 'Mobile Dispatcher', menu: 'Orphan' },
  { path: '/communications-hub', name: 'Communications Hub', menu: 'Orphan' },
  { path: '/customer-experience', name: 'Customer Experience', menu: 'Orphan' },
  { path: '/asset-intelligence', name: 'Asset Intelligence', menu: 'Orphan' },
  { path: '/workforce-intelligence', name: 'Workforce Intelligence', menu: 'Orphan' },
  { path: '/workforce/manager', name: 'Manager Workspace', menu: 'Orphan' },
  { path: '/workforce/self-service', name: 'Self Service', menu: 'Orphan' },
  { path: '/legal-compliance', name: 'Legal Compliance', menu: 'Orphan' },
  { path: '/financial-planning', name: 'Financial Planning', menu: 'Orphan' },
  { path: '/sales-intelligence', name: 'Sales Intelligence', menu: 'Orphan' },
  { path: '/service-delivery', name: 'Service Delivery', menu: 'Orphan' },
  { path: '/it-operations', name: 'IT Operations', menu: 'Orphan' },
  { path: '/business-evolution', name: 'Business Evolution', menu: 'Orphan' },
  { path: '/app-builder', name: 'App Builder', menu: 'Orphan' },
  { path: '/industry-packs', name: 'Industry Packs', menu: 'Orphan' },
  { path: '/developers', name: 'Developers', menu: 'Orphan' },
  { path: '/developer', name: 'Developer Portal', menu: 'Orphan' },
  { path: '/voice-reception', name: 'Voice Reception', menu: 'Orphan' },
  { path: '/document-ai', name: 'Document AI', menu: 'Orphan' },
  { path: '/business-continuity', name: 'Business Continuity', menu: 'Orphan' },
  { path: '/global-search', name: 'Global Search', menu: 'Orphan' },
  { path: '/data-migration', name: 'Data Migration', menu: 'Orphan' },
  { path: '/notifications', name: 'Notifications', menu: 'Orphan' },
  { path: '/launch-center', name: 'Launch Center', menu: 'Orphan' },
  { path: '/go-live', name: 'Go Live', menu: 'Orphan' },
  { path: '/release', name: 'Release', menu: 'Orphan' },
  { path: '/evolution', name: 'Evolution', menu: 'Orphan' },
  { path: '/knowledge', name: 'Knowledge Graph', menu: 'Orphan' },
  { path: '/digital-twin', name: 'Digital Twin', menu: 'Orphan' },
];

const TECH_ROUTES = [
  { path: '/mobile', name: 'Mobile Today', menu: 'Mobile nav: Today' },
  { path: '/mobile/jobs', name: 'Mobile Jobs', menu: 'Mobile nav: My Jobs' },
  { path: '/mobile/route', name: 'Mobile Route', menu: 'Mobile nav: Navigation' },
  { path: '/mobile/inventory', name: 'Mobile Inventory', menu: 'Mobile nav: Parts Used' },
  { path: '/mobile/time', name: 'Mobile Time', menu: 'Mobile nav: Timesheets' },
  { path: '/mobile/notifications', name: 'Mobile Notifications', menu: 'Mobile nav: Messages' },
  { path: '/mobile/sync', name: 'Mobile Sync', menu: 'Mobile nav: Offline Sync' },
];

const TECH_FORBIDDEN = ['/', '/crm', '/finance/quotes', '/scheduling', '/aura', '/integrations', '/settings/company', '/jobs'];

const PORTAL_ROUTES = [
  { path: '/portal/login', name: 'Portal Login', menu: 'Public' },
  { path: '/portal', name: 'Portal Dashboard', menu: 'Portal nav' },
  { path: '/portal/jobs', name: 'Portal Jobs', menu: 'Portal nav' },
  { path: '/portal/quotes', name: 'Portal Quotes', menu: 'Portal nav' },
  { path: '/portal/finance', name: 'Portal Finance', menu: 'Portal nav' },
  { path: '/portal/appointments', name: 'Portal Appointments', menu: 'Portal nav' },
  { path: '/portal/communications', name: 'Portal Communications', menu: 'Portal nav' },
  { path: '/portal/documents', name: 'Portal Documents', menu: 'Portal nav' },
  { path: '/portal/assets', name: 'Portal Assets', menu: 'Portal nav' },
  { path: '/portal/profile', name: 'Portal Profile', menu: 'Portal nav' },
  { path: '/portal/knowledge', name: 'Portal Knowledge', menu: 'Orphan route' },
  { path: '/portal/notifications', name: 'Portal Notifications', menu: 'Orphan route' },
  { path: '/portal/feedback', name: 'Portal Feedback', menu: 'Orphan route' },
  { path: '/portal/loyalty', name: 'Portal Loyalty', menu: 'Orphan route' },
];

const AUTH_ROUTES = [
  { path: '/auth/login', name: 'Staff Login', menu: 'Public' },
  { path: '/auth/signup', name: 'Staff Signup', menu: 'Public' },
  { path: '/auth/accept-invite', name: 'Accept Invite', menu: 'Public' },
];

async function apiSignup(email, password, companyName) {
  const res = await fetch(`${API_URL}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      companyName,
      firstName: 'Audit',
      lastName: 'Owner',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Signup failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function getRoles(accessToken) {
  const res = await fetch(`${API_URL}/api/v1/team/roles`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  return body.data.roles;
}

async function createInvite(accessToken, email, roleId) {
  const res = await fetch(`${API_URL}/api/v1/team/invites`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, roleId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Invite failed: ${JSON.stringify(body)}`);
  return body.data;
}

function parseInviteToken(inviteUrl) {
  if (!inviteUrl) return null;
  try {
    const url = new URL(inviteUrl);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

function slug(path) {
  return path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

async function inspectPage(page, route, role, screenshotPrefix) {
  const result = {
    route: route.path,
    name: route.name,
    menu: route.menu,
    role,
    status: 'PASS',
    reasons: [],
    consoleErrors: [],
    failedRequests: [],
    hasHeader: false,
    bodyTextLength: 0,
    placeholders: [],
    redirectedTo: null,
  };

  const consoleErrors = [];
  const failedRequests = [];

  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('/portal/auth/refresh')) return;
      consoleErrors.push(text);
    }
  };
  const onRequestFailed = (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'failed'}`);
  };
  const onResponse = (res) => {
    const url = res.url();
    if (
      url.includes('/api/') &&
      res.status() >= 400 &&
      !url.includes('/portal/auth/refresh') &&
      !(url.includes('/aura') && res.status() === 503)
    ) {
      failedRequests.push(`${res.request().method()} ${url} — HTTP ${res.status()}`);
    }
  };

  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  const startUrl = page.url();
  await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
    result.status = 'FAIL';
    result.reasons.push(`Navigation timeout/error: ${e.message}`);
  });

  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .waitForSelector(
      '.app-nav, .portal-nav, .dashboard, .crm-page, .page-header, h1, .portal-auth-page, .auth-card, form',
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1200);

  result.redirectedTo = page.url() !== `${BASE_URL}${route.path}` ? page.url() : null;
  const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? '';
  result.bodyTextLength = bodyText.trim().length;

  result.hasHeader =
    (await page.locator('h1, h2, .page-header, .portal-brand, .brand, [class*="PageHeader"]').count()) > 0;

  const isLoadingOnly = /^loading\.?\.?\.?$/i.test(bodyText.trim());
  if (result.bodyTextLength < 20 || isLoadingOnly) {
    result.status = 'FAIL';
    result.reasons.push(
      isLoadingOnly
        ? 'Page stuck on loading state after auth bootstrap'
        : 'Blank or near-blank page (< 20 chars visible text)',
    );
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(bodyText)) {
      result.placeholders.push(pattern.source);
      if (result.status === 'PASS') result.status = 'WARNING';
      result.reasons.push(`Placeholder/unfinished content matched: ${pattern.source}`);
    }
  }

  if (consoleErrors.length) {
    if (result.status === 'PASS') result.status = 'WARNING';
    result.reasons.push(`${consoleErrors.length} console error(s)`);
  }

  const apiFailures = failedRequests.filter((r) => !r.includes('/aura') && !r.includes('503'));
  if (apiFailures.length) {
    result.status = result.status === 'FAIL' ? 'FAIL' : 'WARNING';
    result.reasons.push(`${apiFailures.length} failed API request(s)`);
  }

  result.consoleErrors = consoleErrors.slice(0, 5);
  result.failedRequests = failedRequests.slice(0, 8);

  const shotName = `${screenshotPrefix}_${slug(route.path)}.png`;
  await page.screenshot({ path: join(SHOT_DIR, shotName), fullPage: true }).catch(() => {});

  page.off('console', onConsole);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);

  if (result.reasons.length === 0) result.reasons.push('Loaded with content, no critical issues detected');

  return result;
}

async function loginViaBrowser(page, email, password) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 15000 });
  await page.waitForSelector('.app-nav, .portal-nav, .dashboard', { timeout: 15000 });
}

async function acceptInviteViaBrowser(page, token, password) {
  await page.goto(`${BASE_URL}/auth/accept-invite?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle',
  });
  await page.fill('input[name="firstName"], input[label="First name"], input:first-of-type', 'Audit').catch(async () => {
    const inputs = page.locator('input');
    await inputs.nth(0).fill('Audit');
  });
  const textInputs = page.locator('input');
  const count = await textInputs.count();
  if (count >= 4) {
    await textInputs.nth(0).fill('Audit');
    await textInputs.nth(1).fill('Tech');
    await textInputs.nth(2).fill(password);
    await textInputs.nth(3).fill(password);
  }
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function collectSidebarLinks(page) {
  return page.locator('.app-nav__link, .portal-nav__link').allTextContents();
}

async function runWorkflowTests(page, accessToken, results) {
  const workflows = [];

  // Login already tested
  workflows.push({ name: 'Login', status: 'PASS', note: 'Owner login via browser succeeded' });

  // Create customer
  try {
    await page.goto(`${BASE_URL}/crm/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const nameInput = page.locator('input').first();
    await nameInput.fill(`Audit Customer ${ts}`);
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count()) {
      await emailInput.fill(`customer-${ts}@audit.local`);
    }
    const submit = page.locator('button[type="submit"]');
    if (await submit.count()) {
      await submit.click();
      await page.waitForTimeout(2000);
      const url = page.url();
      workflows.push({
        name: 'Create customer',
        status: url.includes('/crm/') && !url.includes('/new') ? 'PASS' : 'WARNING',
        note: url.includes('/crm/') ? `Redirected to ${url}` : 'Form submitted but no detail redirect',
      });
    } else {
      workflows.push({ name: 'Create customer', status: 'FAIL', note: 'Submit button not found' });
    }
  } catch (e) {
    workflows.push({ name: 'Create customer', status: 'FAIL', note: e.message });
  }

  // Create job (needs customer - try anyway)
  try {
    await page.goto(`${BASE_URL}/jobs/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    workflows.push({
      name: 'Create job (form open)',
      status: (await page.locator('button[type="submit"]').count()) > 0 ? 'PASS' : 'WARNING',
      note: 'Job create form inspected; full E2E requires customer selection',
    });
  } catch (e) {
    workflows.push({ name: 'Create job', status: 'FAIL', note: e.message });
  }

  // AURA chat
  try {
    await page.goto(`${BASE_URL}/aura`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const hasChat = (await page.locator('textarea, input[type="text"]').count()) > 0;
    workflows.push({
      name: 'AURA chat (page load)',
      status: hasChat ? 'PASS' : 'WARNING',
      note: hasChat ? 'Chat input present' : 'Chat UI not clearly visible',
    });
  } catch (e) {
    workflows.push({ name: 'AURA chat', status: 'FAIL', note: e.message });
  }

  // Integration settings
  try {
    await page.goto(`${BASE_URL}/integrations/xero`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    workflows.push({
      name: 'Integration settings (Xero)',
      status: (await page.locator('body').innerText()).length > 50 ? 'PASS' : 'WARNING',
      note: 'Xero settings page loaded',
    });
  } catch (e) {
    workflows.push({ name: 'Integration settings', status: 'FAIL', note: e.message });
  }

  workflows.push({
    name: 'Convert lead / quote approval / dispatch / signature / payment / portal ETA',
    status: 'NOT TESTED',
    note: 'Full cross-module E2E not completed in automated pass — requires seeded business data chain',
  });

  results.workflows = workflows;
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });

  const report = {
    auditedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    accounts: { ownerEmail, techEmail },
    ownerPages: [],
    techPages: [],
    portalPages: [],
    authPages: [],
    roleViolations: [],
    sidebarOwner: [],
    sidebarTech: [],
    sidebarPortal: [],
    workflows: [],
    viewports: [],
  };

  console.log('Creating audit owner account...');
  const ownerAuth = await apiSignup(ownerEmail, ownerPassword, `Audit Co ${ts}`);
  const ownerToken = ownerAuth.session.accessToken;

  console.log('Creating technician invite...');
  const roles = await getRoles(ownerToken);
  const techRole = roles.find((r) => r.name === 'Technician');
  let inviteToken = null;
  if (techRole) {
    const inviteData = await createInvite(ownerToken, techEmail, techRole.id);
    inviteToken = parseInviteToken(inviteData.inviteUrl);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Auth pages (guest)
  for (const route of AUTH_ROUTES) {
    report.authPages.push(await inspectPage(page, route, 'Guest', 'auth'));
  }

  // Owner crawl
  console.log('Logging in as owner...');
  await loginViaBrowser(page, ownerEmail, ownerPassword);
  report.sidebarOwner = await collectSidebarLinks(page);

  for (const route of OWNER_ROUTES) {
    process.stdout.write(`Owner: ${route.path}\r`);
    report.ownerPages.push(await inspectPage(page, route, 'Platform Owner', 'owner'));
  }

  await runWorkflowTests(page, ownerToken, report);

  // Technician setup
  if (inviteToken) {
    await page.context().clearCookies();
    await acceptInviteViaBrowser(page, inviteToken, techPassword);
  } else {
    console.warn('No invite token — skipping technician browser login');
  }

  const techPage = await browser.newPage();
  if (inviteToken) {
    await loginViaBrowser(techPage, techEmail, techPassword);
    report.sidebarTech = await collectSidebarLinks(techPage);

    for (const route of TECH_ROUTES) {
      report.techPages.push(await inspectPage(techPage, route, 'Technician', 'tech'));
    }

    for (const path of TECH_FORBIDDEN) {
      await techPage.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await techPage.waitForTimeout(1000);
      const url = techPage.url();
      const body = await techPage.locator('body').innerText();
      const leaked =
        (path === '/crm' && /customer/i.test(body) && !/do not have permission/i.test(body)) ||
        (path === '/' && url.endsWith('/') && !url.includes('/mobile') && body.length > 100);
      report.roleViolations.push({
        role: 'Technician',
        attempted: path,
        landedOn: url,
        status: leaked ? 'FAIL' : url.includes('/mobile') || body.length < 30 ? 'PASS' : 'WARNING',
        note: leaked ? 'Owner content visible to technician' : `Redirect/block observed`,
      });
      await techPage.screenshot({ path: join(SHOT_DIR, `tech_forbidden_${slug(path)}.png`), fullPage: true });
    }
  }

  // Portal (unauthenticated + direct URL attempts)
  const portalPage = await browser.newPage();
  for (const route of PORTAL_ROUTES) {
    report.portalPages.push(await inspectPage(portalPage, route, 'Client (unauthenticated)', 'portal'));
  }

  // Responsive snapshots (owner dashboard)
  const desktopPage = await browser.newPage();
  await loginViaBrowser(desktopPage, ownerEmail, ownerPassword);
  await desktopPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: join(SHOT_DIR, 'viewport_desktop_dashboard.png'), fullPage: true });

  const tablet = await browser.newContext({ ...devices['iPad Mini'] });
  const tabletPage = await tablet.newPage();
  await loginViaBrowser(tabletPage, ownerEmail, ownerPassword);
  await tabletPage.goto(`${BASE_URL}/crm`, { waitUntil: 'networkidle' });
  await tabletPage.screenshot({ path: join(SHOT_DIR, 'viewport_tablet_crm.png'), fullPage: true });
  report.viewports.push({ device: 'iPad Mini', route: '/crm', screenshot: 'viewport_tablet_crm.png' });

  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mobilePage = await mobile.newPage();
  await loginViaBrowser(mobilePage, ownerEmail, ownerPassword);
  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: join(SHOT_DIR, 'viewport_mobile_dashboard.png'), fullPage: true });
  report.viewports.push({ device: 'iPhone 13', route: '/', screenshot: 'viewport_mobile_dashboard.png' });

  await browser.close();

  // Score
  const allPages = [...report.ownerPages, ...report.techPages, ...report.portalPages, ...report.authPages];
  const pass = allPages.filter((p) => p.status === 'PASS').length;
  const warn = allPages.filter((p) => p.status === 'WARNING').length;
  const fail = allPages.filter((p) => p.status === 'FAIL').length;
  report.scores = {
    pageReadiness: Math.round((pass + warn * 0.5) / allPages.length * 100),
    pass,
    warning: warn,
    fail,
    total: allPages.length,
    overallProductionReadiness: 66,
    updatedOverallProductionReadiness: null,
  };
  report.scores.updatedOverallProductionReadiness = Math.round(
    report.scores.overallProductionReadiness * 0.7 + report.scores.pageReadiness * 0.3,
  );

  await writeFile(join(OUT_DIR, 'ux-audit-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nAudit complete. ${pass} PASS, ${warn} WARNING, ${fail} FAIL`);
  console.log(`Report: ${join(OUT_DIR, 'ux-audit-report.json')}`);
  console.log(`Screenshots: ${SHOT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
