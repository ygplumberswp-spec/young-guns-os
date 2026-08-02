#!/usr/bin/env node
/**
 * 246 — Phase 14 AURA Operations Manager staging verification.
 * Authenticated owner session via railway run (245 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase14-aura-operations-staging');
const OUT_JSON = path.resolve(__dirname, '246-aura-operations-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 1000 },
  { id: '768', width: 768, height: 1024 },
];

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-session-246-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '246-phase14-aura-ops', '127.0.0.1')\`;
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
    const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
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

async function fetchAuthPayload(token) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return { user: json.data.user, session: { accessToken: token, expiresIn: 3600 } };
}

async function seedSession(context, page, token) {
  const authPayload = await fetchAuthPayload(token);
  await context.addCookies([
    {
      name: 'titan_refresh_token',
      value: '246-phase14-staging-verify',
      domain: 'comfortable-determination-staging.up.railway.app',
      path: '/api/v1/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: authPayload }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: authPayload.user } }),
    });
  });
}

function hasRecommendationContract(rec) {
  return (
    rec &&
    typeof rec.reason === 'string' &&
    Array.isArray(rec.sourceRecords) &&
    typeof rec.impact === 'string' &&
    typeof rec.proposedAction === 'string' &&
    typeof rec.approvalRequired === 'boolean'
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const session = await mintOwnerSession();
  const token = session.accessToken;

  let commitSha = '';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    commitSha = 'unknown';
  }

  const apiRes = await fetch(`${API}/api/v1/intelligence/operations-summary`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const apiJson = apiRes.ok ? await apiRes.json() : null;
  const summary = apiJson?.data?.summary ?? null;

  const report = {
    schemaVersion: 'phase14-aura-operations-v1',
    label: '246-aura-operations-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    auth: { method: session.method, secretsInOutput: false },
    api: {
      status: apiRes.status,
      hasSummary: Boolean(summary),
      hasMorning: Boolean(summary?.morning),
      hasEndOfDay: Boolean(summary?.endOfDay),
      hasRecommendations: Array.isArray(summary?.recommendations),
      recommendationCount: summary?.recommendations?.length ?? 0,
      dataSources: summary?.dataSources ?? [],
      morningJobsToday: summary?.morning?.jobsToday ?? null,
      morningUnassigned: summary?.morning?.unassignedWork ?? null,
      endOfDayCompleted: summary?.endOfDay?.jobsCompleted ?? null,
      recommendationContractValid:
        Array.isArray(summary?.recommendations) &&
        (summary.recommendations.length === 0 ||
          summary.recommendations.every(hasRecommendationContract)),
    },
    ui: { viewports: [] },
    blockers: [],
    verdict: 'HOLD',
  };

  if (!apiRes.ok || !summary) {
    report.blockers.push(`API operations-summary HTTP ${apiRes.status}`);
  }
  if (!summary?.morning || !summary?.endOfDay) {
    report.blockers.push('Missing morning or end-of-day summary sections');
  }
  if (!Array.isArray(summary?.dataSources) || summary.dataSources.length < 5) {
    report.blockers.push('Insufficient dataSources — expected aggregates from multiple APIs');
  }
  if (
    summary?.recommendations?.length > 0 &&
    !summary.recommendations.every(hasRecommendationContract)
  ) {
    report.blockers.push('Recommendation contract incomplete on one or more items');
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token);

  for (const route of ['/aura/operations', '/aura']) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      const checks = {
        hasOperationsManager: /Operations Manager/i.test(bodyText),
        hasMorningSummary: /Morning summary/i.test(bodyText),
        hasEndOfDaySummary: /End-of-day summary/i.test(bodyText),
        hasRecommendationsOrEmpty:
          /Recommendations/i.test(bodyText) || summary?.recommendations?.length === 0,
        noFakeZeroDash: !/Jobs today[\s\S]{0,40}0[\s\S]{0,10}Unassigned[\s\S]{0,40}0/.test(
          bodyText.replace(/\s+/g, ' '),
        ),
      };

      const slug = route.replace(/\//g, '-').replace(/^-/, '') || 'root';
      const shot = path.join(OUT_DIR, `phase14-${slug}-${vp.id}.png`);
      await page.screenshot({ path: shot, fullPage: true });

      report.ui.viewports.push({
        route,
        ...vp,
        checks,
        screenshot: path.relative(repoRoot, shot),
      });

      if (route === '/aura/operations') {
        if (!checks.hasMorningSummary) {
          report.blockers.push(`Missing morning summary UI @ ${route} ${vp.id}`);
        }
        if (!checks.hasEndOfDaySummary) {
          report.blockers.push(`Missing end-of-day summary UI @ ${route} ${vp.id}`);
        }
      }
    }
  }

  await browser.close();

  report.verdict =
    report.blockers.length === 0 && report.api.status === 200 && report.api.hasSummary
      ? 'GO'
      : 'HOLD';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ verdict: report.verdict, blockers: report.blockers, out: OUT_JSON }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
