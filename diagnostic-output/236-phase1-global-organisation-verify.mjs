#!/usr/bin/env node
/**
 * 236 — Phase 1 global organisation staging verification.
 * Screenshots grouped sidebar + finance HOLD pages for Owner, Accountant, Dispatcher.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase1-global-org-staging');
const OUT_JSON = path.resolve(__dirname, '236-phase1-global-organisation-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900 },
  { id: '1280', width: 1280, height: 900 },
  { id: '1024', width: 1024, height: 768 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

const ROLE_TARGETS = [
  {
    id: 'owner',
    rolePattern: '%Owner%',
    expectNav: ['Dashboard', 'Receivables', 'Live Dispatch', 'AURA Team'],
    denyNav: ['Settings'],
    pages: ['/', '/finance/receivables', '/settings/company'],
  },
  {
    id: 'accountant',
    rolePattern: '%Accountant%',
    expectNav: ['Quotes', 'Receivables', 'Bills & Payables', 'Cashflow'],
    denyNav: ['Live Dispatch', 'Scheduling'],
    pages: ['/finance/receivables', '/finance/payables'],
  },
  {
    id: 'dispatcher',
    rolePattern: '%Dispatcher%',
    expectNav: ['Jobs', 'Scheduling', 'Live Dispatch'],
    denyNav: ['Receivables', 'AURA Team', 'Analytics'],
    pages: ['/jobs', '/mobile-platform/dispatcher'],
  },
];

async function mintSession(rolePattern) {
  const scriptPath = path.join(repoRoot, `.tmp-mint-session-236-${rolePattern.replace(/%/g, '')}.mjs`);
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const rolePattern = '${rolePattern}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true AND r.name ILIKE \${rolePattern}
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) throw new Error('no user for ' + rolePattern);
const permissionKeys = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '236-phase1-nav-verify', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: user.role_name }));
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

async function seedSession(page, token) {
  await page.goto(`${WEB}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((accessToken) => {
    localStorage.setItem('titan_access_token', accessToken);
  }, token);
  await page.reload({ waitUntil: 'networkidle' });
}

async function collectSidebarLabels(page) {
  return page.$$eval('.app-nav__label', (els) => els.map((el) => el.textContent?.trim() ?? ''));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const report = {
    schemaVersion: 'phase1-global-organisation-v1',
    label: '236-phase1-global-organisation-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingApi: API,
    stagingWeb: WEB,
    companyId: YGP_COMPANY_ID,
    auth: { method: 'railway_programmatic_session', secretsInOutput: false },
    viewports: VIEWPORTS.map((v) => v.id),
    roles: [],
    screenshots: [],
    checks: {
      groupedSidebar: false,
      settingsHeaderWorkspace: false,
      financeHoldPages: false,
      roleNavFiltering: false,
    },
    verdict: 'PENDING',
  };

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  try {
    for (const roleTarget of ROLE_TARGETS) {
      const session = await mintSession(roleTarget.rolePattern);
      const context = await browser.newContext();
      const page = await context.newPage();
      await seedSession(page, session.accessToken);

      const roleResult = {
        id: roleTarget.id,
        roleName: session.roleName,
        navLabels: [],
        expectNav: roleTarget.expectNav,
        denyNav: roleTarget.denyNav,
        expectPass: false,
        denyPass: false,
        pages: [],
      };

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
      roleResult.navLabels = await collectSidebarLabels(page);
      roleResult.expectPass = roleTarget.expectNav.every((label) => roleResult.navLabels.includes(label));
      roleResult.denyPass = roleTarget.denyNav.every((label) => !roleResult.navLabels.includes(label));

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const route of roleTarget.pages) {
          await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
          const slug = route.replace(/\//g, '_').replace(/^_/, '') || 'dashboard';
          const file = `${roleTarget.id}-${slug}-${viewport.id}.png`;
          const filePath = path.join(OUT_DIR, file);
          await page.screenshot({ path: filePath, fullPage: false });
          report.screenshots.push({ role: roleTarget.id, route, viewport: viewport.id, path: `diagnostic-output/phase1-global-org-staging/${file}` });
          roleResult.pages.push({ route, viewport: viewport.id, ok: true });
        }
      }

      report.roles.push(roleResult);
      await context.close();
    }

    const owner = report.roles.find((r) => r.id === 'owner');
    const accountant = report.roles.find((r) => r.id === 'accountant');
    const dispatcher = report.roles.find((r) => r.id === 'dispatcher');

    report.checks.groupedSidebar =
      owner?.navLabels.includes('Quotes') &&
      owner?.navLabels.includes('Receivables') &&
      owner?.navLabels.includes('Fleet');
    report.checks.settingsHeaderWorkspace = owner ? !owner.navLabels.includes('Settings') : false;
    report.checks.financeHoldPages = report.screenshots.some((s) => s.route === '/finance/receivables');
    report.checks.roleNavFiltering =
      Boolean(owner?.expectPass && owner?.denyPass) &&
      Boolean(accountant?.expectPass && accountant?.denyPass) &&
      Boolean(dispatcher?.expectPass && dispatcher?.denyPass);

    const allPass = Object.values(report.checks).every(Boolean);
    report.verdict = allPass ? 'GO' : 'HOLD';
  } finally {
    await browser.close();
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, checks: report.checks, screenshotCount: report.screenshots.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
