#!/usr/bin/env node
/**
 * 248 — Phase 16 Settings, Integrations & Company Setup staging verification.
 * Authenticated owner session via railway run (237/247 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase16-settings-integrations-staging');
const OUT_JSON = path.resolve(__dirname, '248-settings-integrations-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

const VIEWPORTS = [{ id: '1440', width: 1440, height: 1000 }];

const SETTINGS_TABS = [
  'Company',
  'Team & Access',
  'Finance & Pricing',
  'Jobs & Scheduling',
  'Fleet',
  'Inventory',
  'Communications',
  'Integrations',
  'Documents',
  'AURA & Automations',
  'Security',
  'Platform Health',
  'Company Setup',
];

const PHASE16_LABELS = [
  'Connected',
  'Syncing',
  'Connected with attention',
  'Waiting for permission',
  'Provider feature unavailable',
  'Add-on required',
  'Not configured',
  'Temporarily unavailable',
];

const SECRET_FIELD_PATTERN =
  /"(password|secretKey|credentialsEncrypted|refresh_token|access_token)"\s*:\s*"[^"]+"/i;

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-session-248-owner.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '248-phase16-settings', '127.0.0.1')\`;
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
      value: '248-phase16-staging-verify',
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

function checkSecretLeaks(payload) {
  const str = JSON.stringify(payload ?? {});
  return SECRET_FIELD_PATTERN.test(str) ? ['credential-field-with-value'] : [];
}

function summarizeProvider(p) {
  return {
    provider: p.provider,
    capabilityState: p.capabilityState,
    connectionStatus: p.connectionStatus,
    lastSyncAt: p.lastSyncAt,
    hasLastError: Boolean(p.lastError),
  };
}

function summarizeAutoSync(s) {
  return {
    provider: s.provider,
    uiState: s.uiState,
    uiStateLabel: s.uiStateLabel,
    connectionStatus: s.connectionStatus,
    syncInProgress: s.syncInProgress,
    lastSuccessfulSyncAt: s.lastSuccessfulSyncAt,
    nextScheduledSyncAt: s.nextScheduledSyncAt,
    hasCorrectiveAction: Boolean(s.correctiveAction),
  };
}

function validateSyncTruthfulness(autoSyncEntry) {
  const issues = [];
  if (!autoSyncEntry) return issues;
  if (autoSyncEntry.syncInProgress && autoSyncEntry.uiStateLabel === 'Connected') {
    issues.push(`${autoSyncEntry.provider}: syncInProgress but label Connected`);
  }
  if (
    autoSyncEntry.connectionStatus === 'connected' &&
    autoSyncEntry.syncInProgress &&
    autoSyncEntry.uiState !== 'initial_sync_running' &&
    autoSyncEntry.uiState !== 'connecting'
  ) {
    issues.push(`${autoSyncEntry.provider}: syncInProgress with unexpected uiState ${autoSyncEntry.uiState}`);
  }
  return issues;
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

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const [hubRes, autoSyncRes, xeroRes, cartrackRes, whatsappRes, emailRes, companyRes] =
    await Promise.all([
      fetch(`${API}/api/v1/integrations/hub/dashboard?simple=true`, { headers }),
      fetch(`${API}/api/v1/integration-platform/auto-sync`, { headers }),
      fetch(`${API}/api/v1/integrations/xero`, { headers }),
      fetch(`${API}/api/v1/integrations/cartrack`, { headers }),
      fetch(`${API}/api/v1/integrations/whatsapp`, { headers }),
      fetch(`${API}/api/v1/integrations/email`, { headers }),
      fetch(`${API}/api/v1/company/profile`, { headers }),
    ]);

  const hubJson = hubRes.ok ? await hubRes.json() : null;
  const autoSyncJson = autoSyncRes.ok ? await autoSyncRes.json() : null;
  const xeroJson = xeroRes.ok ? await xeroRes.json() : null;
  const cartrackJson = cartrackRes.ok ? await cartrackRes.json() : null;
  const whatsappJson = whatsappRes.ok ? await whatsappRes.json() : null;
  const emailJson = emailRes.ok ? await emailRes.json() : null;
  const companyJson = companyRes.ok ? await companyRes.json() : null;

  const providers = hubJson?.data?.dashboard?.providers ?? [];
  const autoStatuses = autoSyncJson?.data?.statuses ?? [];
  const focusProviders = ['xero', 'cartrack', 'whatsapp', 'email'];

  const report = {
    schemaVersion: 'phase16-settings-integrations-v1',
    label: '248-settings-integrations-verify',
    generatedAt: new Date().toISOString(),
    branch: 'cursor/titan-owner-operating-model-final',
    commitSha,
    stagingWeb: WEB,
    stagingApi: API,
    ygpCompanyId: YGP_COMPANY_ID,
    auth: { method: session.method, secretsInOutput: false },
    api: {
      hub: { status: hubRes.status, providerCount: providers.length },
      autoSync: { status: autoSyncRes.status, count: autoStatuses.length },
      company: {
        status: companyRes.status,
        hasProfile: Boolean(companyJson?.data?.profile?.name),
        companyName: companyJson?.data?.profile?.name ?? null,
      },
      integrations: {
        xero: xeroJson?.data?.connection
          ? {
              status: xeroJson.data.connection.status,
              hasCredentials: xeroJson.data.connection.hasCredentials,
              oauthConfigured: xeroJson.data.connection.oauthConfigured,
              responseKeys: Object.keys(xeroJson.data.connection),
            }
          : null,
        cartrack: cartrackJson?.data?.connection
          ? {
              status: cartrackJson.data.connection.status,
              hasCredentials: cartrackJson.data.connection.hasCredentials,
              mappedVehicleCount: cartrackJson.data.connection.mappedVehicleCount ?? null,
              responseKeys: Object.keys(cartrackJson.data.connection),
            }
          : null,
        whatsapp: whatsappRes.status,
        email: emailRes.status,
      },
      providers: providers
        .filter((p) => focusProviders.includes(p.provider))
        .map(summarizeProvider),
      autoSyncStatuses: autoStatuses
        .filter((s) => focusProviders.includes(s.provider))
        .map(summarizeAutoSync),
      secretLeaks: {
        hub: checkSecretLeaks(hubJson),
        autoSync: checkSecretLeaks(autoSyncJson),
        xero: checkSecretLeaks(xeroJson),
        cartrack: checkSecretLeaks(cartrackJson),
        whatsapp: checkSecretLeaks(whatsappJson),
        email: checkSecretLeaks(emailJson),
      },
    },
    ui: { viewports: [] },
    blockers: [],
    holdItems: [],
    verdict: 'HOLD',
  };

  if (!hubRes.ok) report.blockers.push(`Hub dashboard HTTP ${hubRes.status}`);
  if (!autoSyncRes.ok) report.blockers.push(`Auto-sync HTTP ${autoSyncRes.status}`);
  if (!companyRes.ok || !companyJson?.data?.profile?.name) {
    report.blockers.push('Company profile unavailable');
  }

  for (const leaks of Object.values(report.api.secretLeaks)) {
    if (leaks.length > 0) {
      report.blockers.push(`Credential leak detected: ${leaks.join(', ')}`);
    }
  }

  const xeroAuto = autoStatuses.find((s) => s.provider === 'xero');
  const cartrackAuto = autoStatuses.find((s) => s.provider === 'cartrack');
  const whatsappAuto = autoStatuses.find((s) => s.provider === 'whatsapp');
  const emailAuto = autoStatuses.find((s) => s.provider === 'email');

  report.blockers.push(...validateSyncTruthfulness(xeroAuto));
  report.blockers.push(...validateSyncTruthfulness(cartrackAuto));

  if (xeroJson?.data?.connection?.status === 'connected' && !xeroJson.data.connection.hasCredentials) {
    report.blockers.push('Xero connected without stored credentials');
  }
  if (
    cartrackJson?.data?.connection?.status === 'connected' &&
    !cartrackJson.data.connection.hasCredentials
  ) {
    report.blockers.push('Cartrack connected without stored credentials');
  }

  if (whatsappAuto?.uiStateLabel === 'Connected' && whatsappAuto.connectionStatus !== 'connected') {
    report.blockers.push('WhatsApp falsely marked Connected');
  }
  if (emailAuto?.uiStateLabel === 'Connected' && emailAuto.connectionStatus !== 'connected') {
    report.blockers.push('Email falsely marked Connected');
  }

  if (!whatsappAuto || whatsappAuto.uiStateLabel !== 'Not configured') {
    report.holdItems.push('WhatsApp expected Not configured on staging');
  }
  if (!emailAuto || emailAuto.uiStateLabel !== 'Not configured') {
    report.holdItems.push('Email expected Not configured on staging');
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSession(context, page, token);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await page.goto(`${WEB}/settings/company`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(2000);
    const settingsLinkLabels = await page.locator('[aria-label="Settings"] a').allTextContents();
    const companyText = await page.locator('body').innerText();
    const companyChecks = {
      hasSettingsNav: settingsLinkLabels.length >= 10,
      settingsTabLabels: settingsLinkLabels.map((l) => l.trim()).filter(Boolean),
      hasCompanyForm: /Company profile|Young Guns/i.test(companyText),
    };
    const companyShot = path.join(OUT_DIR, `phase16-settings-company-${vp.id}.png`);
    await page.screenshot({ path: companyShot, fullPage: true });

    await page.goto(`${WEB}/integrations`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(2500);
    const integrationsSettingsLinks = await page.locator('[aria-label="Settings"] a').allTextContents();
    const integrationsText = await page.locator('body').innerText();
    const integrationsChecks = {
      hasSettingsNav: integrationsSettingsLinks.length >= 10,
      settingsTabLabels: integrationsSettingsLinks.map((l) => l.trim()).filter(Boolean),
      hasIntegrationsTitle: /Integrations/i.test(integrationsText),
      hasXero: /Xero/i.test(integrationsText),
      hasCartrack: /Cartrack/i.test(integrationsText),
      hasWhatsApp: /WhatsApp/i.test(integrationsText),
      hasEmail: /Email/i.test(integrationsText),
      hasRecoverySyncLabel: /Sync now \(recovery\)/i.test(integrationsText),
      usesPhase16Labels: PHASE16_LABELS.some((label) => integrationsText.includes(label)),
      noFalseConnectedWhileSyncing:
        !(
          (xeroAuto?.syncInProgress && /\bXero\b[\s\S]{0,120}\bConnected\b/.test(integrationsText)) ||
          (cartrackAuto?.syncInProgress && /\bCartrack\b[\s\S]{0,120}\bConnected\b/.test(integrationsText))
        ),
    };
    const integrationsShot = path.join(OUT_DIR, `phase16-integrations-${vp.id}.png`);
    await page.screenshot({ path: integrationsShot, fullPage: true });

    await page.goto(`${WEB}/settings/about`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(1500);
    const aboutSettingsLinks = await page.locator('[aria-label="Settings"] a').allTextContents();
    const aboutText = await page.locator('body').innerText();
    const aboutChecks = {
      hasSettingsNav: aboutSettingsLinks.length >= 10,
      hasCompanySetup: /About|Company Setup|TITAN/i.test(aboutText),
    };
    const aboutShot = path.join(OUT_DIR, `phase16-company-setup-${vp.id}.png`);
    await page.screenshot({ path: aboutShot, fullPage: true });

    report.ui.viewports.push({
      ...vp,
      company: { checks: companyChecks, screenshot: path.relative(repoRoot, companyShot) },
      integrations: { checks: integrationsChecks, screenshot: path.relative(repoRoot, integrationsShot) },
      companySetup: { checks: aboutChecks, screenshot: path.relative(repoRoot, aboutShot) },
    });

    if (!companyChecks.hasSettingsNav) {
      report.blockers.push(`Settings workspace nav incomplete @ company ${vp.id}`);
    }
    if (!companyChecks.hasCompanyForm) report.blockers.push(`Company setup form missing @ ${vp.id}`);
    if (!integrationsChecks.hasSettingsNav) {
      report.blockers.push(`Settings nav missing on integrations @ ${vp.id}`);
    }
    if (!integrationsChecks.hasRecoverySyncLabel) {
      report.blockers.push(`Manual sync not labeled recovery @ ${vp.id}`);
    }
    if (!integrationsChecks.noFalseConnectedWhileSyncing) {
      report.blockers.push(`UI shows Connected while sync in progress @ ${vp.id}`);
    }
    if (!aboutChecks.hasCompanySetup) report.blockers.push(`Company Setup page incomplete @ ${vp.id}`);
  }

  await browser.close();

  report.verdict = report.blockers.length === 0 ? 'GO' : 'NO-GO';

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        blockers: report.blockers,
        holdItems: report.holdItems,
        integrationStates: report.api.autoSyncStatuses,
        out: OUT_JSON,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
