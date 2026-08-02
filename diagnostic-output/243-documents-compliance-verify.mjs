#!/usr/bin/env node
/**
 * 243 — Phase 11 Documents & compliance workspace staging verification.
 * Authenticated owner session via railway run (237/242 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase11-documents-compliance-staging');
const OUT_JSON = path.resolve(__dirname, '243-documents-compliance-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const REQUIRED_QUEUES = [
  'missing_coc',
  'missing_signature',
  'missing_photos',
  'missing_slips',
  'missing_quote_invoice_link',
  'coc_awaiting_completion',
  'coc_issued',
  'correction_required',
  'expiring_certificates',
  'vehicle_documents',
  'equipment_documents',
];

const DOC_ROUTES = [
  { href: '/documents/compliance', label: 'Daily compliance workspace', expectQueues: true },
  { href: '/documents', label: 'Document library', expectNav: true },
  { href: '/documents/job-packs', label: 'Job packs', expectNav: true },
];

const TECHNICIAN_PERMISSIONS = ['mobile:read', 'mobile:write', 'jobs:read', 'documents:read'];

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-session-243-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) throw new Error('no owner user');
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '243-phase11-docs', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, refreshToken }));
await sql.end();
`,
  );

  try {
    execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
    const raw = execSync(`railway run node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const parsed = JSON.parse(raw);
    if (!parsed.accessToken || parsed.accessToken.length < 40) {
      throw new Error('Failed to mint staging owner session');
    }
    return { ...parsed, method: 'railway_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function mintTechnicianSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-243-tech.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const permissions = ${JSON.stringify(TECHNICIAN_PERMISSIONS)};
const [techRole] = await sql\`SELECT id, name FROM roles WHERE company_id = \${companyId} AND name ILIKE '%technician%' LIMIT 1\`;
if (!techRole) throw new Error('no technician role');
const [user] = await sql\`
  SELECT u.id FROM users u WHERE u.company_id = \${companyId} AND u.role_id = \${techRole.id} AND u.is_active = true LIMIT 1\`;
if (!user) throw new Error('no technician user');
const sessionId = crypto.randomUUID();
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: techRole.id, roleName: techRole.name, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token }));
await sql.end();
`,
  );

  try {
    execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
    const raw = execSync(`railway run node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function fetchAuthPayload(token) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return { user: json.data.user, session: { accessToken: token, expiresIn: 3600 } };
}

async function fetchComplianceWorkspace(token) {
  const res = await fetch(`${API}/api/v1/documents/compliance/workspace`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = res.ok ? await res.json() : null;
  const data = json?.data ?? null;
  return {
    status: res.status,
    hasQueueSummaries: Array.isArray(data?.queueSummaries),
    queueKeys: data?.queueSummaries?.map((row) => row.queue) ?? [],
    hasItems: Array.isArray(data?.items),
    itemCount: data?.items?.length ?? 0,
    hasDisclaimer: typeof data?.disclaimer === 'string' && data.disclaimer.length > 20,
    documentAuditRecentCount: data?.documentAuditRecentCount ?? null,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* optional */
  }

  const report = {
    generatedAt: new Date().toISOString(),
    label: '243-documents-compliance-verify',
    phase: 11,
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingApi: API,
    stagingWeb: WEB,
    companyId: YGP_COMPANY_ID,
    auth: { method: 'staging_programmatic_session', secretsInOutput: false },
    api: {},
    rbac: {},
    docRoutes: [],
    screenshots: [],
    consoleErrors: [],
    verdict: 'HOLD',
    blockers: [],
    holdItems: [],
  };

  const ready = await fetch(`${API}/api/v1/health/ready`);
  if (!ready.ok) report.blockers.push('Staging API health/ready not OK');

  const session = await mintOwnerSession();
  const authPayload = await fetchAuthPayload(session.accessToken);
  report.auth = {
    method: session.method,
    secretsInOutput: false,
    userIdPrefix: authPayload.user?.id?.slice(0, 8) ?? null,
  };

  report.api = {
    complianceWorkspace: await fetchComplianceWorkspace(session.accessToken),
  };

  const ws = report.api.complianceWorkspace;
  if (ws.status !== 200) report.blockers.push('GET /documents/compliance/workspace not 200');
  if (!ws.hasQueueSummaries) report.blockers.push('Workspace missing queueSummaries array');
  if (!ws.hasItems) report.blockers.push('Workspace missing items array');
  if (!ws.hasDisclaimer) report.blockers.push('Workspace missing professional-responsibility disclaimer');

  for (const queue of REQUIRED_QUEUES) {
    if (!ws.queueKeys.includes(queue)) report.blockers.push(`Missing queue: ${queue}`);
  }

  try {
    const techSession = await mintTechnicianSession();
    const techWorkspace = await fetchComplianceWorkspace(techSession.accessToken);
    report.rbac = {
      technicianWorkspaceStatus: techWorkspace.status,
      technicianItemCount: techWorkspace.itemCount,
      technicianScoped:
        techWorkspace.status === 200 && techWorkspace.itemCount <= ws.itemCount,
    };
    if (techWorkspace.status !== 200) {
      report.holdItems.push('Technician cannot access compliance workspace — verify job-scoped intent');
    }
  } catch (err) {
    report.rbac = { technicianSessionError: String(err.message || err).slice(0, 200) };
    report.holdItems.push('Technician RBAC session mint failed — manual RBAC check required');
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  if (session.refreshToken) {
    await context.addCookies([
      {
        name: 'titan_refresh_token',
        value: session.refreshToken,
        domain: 'comfortable-determination-staging.up.railway.app',
        path: '/api/v1/auth',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
  }
  const page = await context.newPage();

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: authPayload }),
    });
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!/token|bearer|password|jwt/i.test(text)) {
        consoleErrors.push(text.slice(0, 300));
      }
    }
  });

  for (const route of DOC_ROUTES) {
    await page.goto(`${WEB}${route.href}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(500);
    const navVisible = (await page.locator('[aria-label="Documents sections"]').count()) > 0;
    const queueFilterVisible =
      route.expectQueues
        ? (await page.locator('[aria-label="Compliance queue filter"]').count()) > 0
        : null;
    const disclaimerVisible =
      route.expectQueues
        ? (await page.locator('.documents-compliance-disclaimer').count()) > 0
        : null;
    const bodyText = await page.locator('body').innerText();
    const emptyHonest = /No compliance items in this view|No documents yet|No job packs yet/i.test(
      bodyText,
    );
    report.docRoutes.push({
      href: route.href,
      label: route.label,
      navVisible,
      queueFilterVisible,
      disclaimerVisible,
      emptyHonest: route.expectQueues ? emptyHonest : null,
    });
    if (!navVisible) report.blockers.push(`Documents nav missing on ${route.href}`);
    if (route.expectQueues && !queueFilterVisible) {
      report.blockers.push(`Queue filter missing on ${route.href}`);
    }
    if (route.expectQueues && !disclaimerVisible) {
      report.blockers.push(`Disclaimer missing on ${route.href}`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const shot of [
    { href: '/documents/compliance', name: 'documents-compliance-1440.png' },
    { href: '/documents', name: 'documents-library-1440.png' },
  ]) {
    await page.goto(`${WEB}${shot.href}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(800);
    const shotPath = path.join(OUT_DIR, shot.name);
    await page.screenshot({ path: shotPath, fullPage: true });
    report.screenshots.push({
      path: `diagnostic-output/phase11-documents-compliance-staging/${shot.name}`,
      href: shot.href,
    });
  }

  report.consoleErrors = [...new Set(consoleErrors)].slice(0, 20);
  report.verdict = report.blockers.length === 0 ? 'GO' : 'HOLD';

  await browser.close();
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  const report = {
    generatedAt: new Date().toISOString(),
    label: '243-documents-compliance-verify',
    verdict: 'HOLD',
    blockers: [String(err.message || err)],
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.error(String(err.message || err));
  process.exit(1);
});
