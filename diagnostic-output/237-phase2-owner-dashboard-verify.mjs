#!/usr/bin/env node
/**
 * 237 — Phase 2 Owner Dashboard staging verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase2-owner-dashboard-staging');
const OUT_JSON = path.resolve(__dirname, '237-phase2-owner-dashboard-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '1280', width: 1280, height: 900 },
  { id: '1024', width: 1024, height: 768 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

async function mintOwnerToken() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-session-237-owner.mjs');
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
if (!user) throw new Error('no owner');
const permissions = Array.isArray(user.permissions) ? user.permissions : [];
const sessionId = crypto.randomUUID();
const refresh = generateRefreshToken();
const refreshHash = hashRefreshToken(refresh);
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '237-phase2-dashboard', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(token);
await sql.end();
`,
  );
  const token = execSync(`railway run node ${scriptPath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  fs.unlinkSync(scriptPath);
  if (!token || token.length < 40) throw new Error('Failed to mint owner session');
  return token;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const token = await mintOwnerToken();

  const apiRes = await fetch(`${API}/api/v1/dashboard/executive-summary`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const apiJson = apiRes.ok ? await apiRes.json() : null;
  const summary = apiJson?.data ?? null;

  const report = {
    schemaVersion: 'phase2-owner-dashboard-v1',
    label: '237-phase2-owner-dashboard-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: 'railway_programmatic_session', secretsInOutput: false },
    api: {
      status: apiRes.status,
      hasSummary: Boolean(summary),
      hasActionQueue: Array.isArray(summary?.priorities?.actionQueue),
      actionQueueCount: summary?.priorities?.actionQueue?.length ?? 0,
      hasExtendedMoney: summary?.todayAtAGlance?.money?.overdueCents != null,
      hasExtendedJobs: summary?.todayAtAGlance?.jobs?.unassigned != null,
    },
    ui: { viewports: [] },
    blockers: [],
    verdict: 'HOLD',
  };

  if (!apiRes.ok || !summary) {
    report.blockers.push(`API executive-summary HTTP ${apiRes.status}`);
  }
  if (!summary?.priorities?.actionQueue) {
    report.blockers.push('Missing priorities.actionQueue in API response');
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.addInitScript((t) => localStorage.setItem('titan_access_token', t), token);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(1500);

    const bodyText = await page.locator('body').innerText();
    const checks = {
      hasGreeting: /Good (morning|afternoon|evening)/i.test(bodyText),
      hasGlance: /Today at a glance/i.test(bodyText),
      hasActionCentre: /Owner action centre/i.test(bodyText),
      hasLiveOps: /Live operations/i.test(bodyText),
      hasTeamToday: /Team today/i.test(bodyText),
      falseZeroMoneyDash: /\bR0\b/.test(bodyText) && /Money Today[\s\S]{0,80}R0/.test(bodyText),
    };

    const shot = path.join(OUT_DIR, `owner-dashboard-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    report.ui.viewports.push({ ...vp, checks, screenshot: path.relative(repoRoot, shot) });
    if (!checks.hasGlance) report.blockers.push(`Missing glance section @ ${vp.id}`);
    if (!checks.hasActionCentre) report.blockers.push(`Missing action centre @ ${vp.id}`);
  }

  await browser.close();

  report.verdict =
    report.blockers.length === 0 && report.api.status === 200 && report.api.hasActionQueue
      ? 'GO'
      : 'HOLD';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, out: OUT_JSON }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
