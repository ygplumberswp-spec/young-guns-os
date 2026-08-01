#!/usr/bin/env node
/**
 * 228 — Owner fleet live map visual verification (staging).
 * Uses Young Guns programmatic session (226 pattern). No secrets in output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, 'fleet-live-map-staging');
const OUT_JSON = path.resolve(__dirname, '228-fleet-live-map-owner-visual-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET_REGS = ['CF172047', 'CF77263'];

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900 },
  { id: '768', width: 768, height: 1024 },
  { id: '375', width: 375, height: 812 },
];

async function mintOwnerSession() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) {
    return { accessToken: existing, refreshToken: null, method: 'OWNER_ACCESS_TOKEN' };
  }

  const scriptPath = path.join(repoRoot, '.tmp-mint-owner-session-228.mjs');
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
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '228-fleet-live-map-verify', '127.0.0.1')\`;
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

async function fetchLiveMap(token) {
  const res = await fetch(`${API}/api/v1/fleet/live-map`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = res.ok ? await res.json() : null;
  return {
    status: res.status,
    vehicleCount: json?.data?.vehicles?.length ?? 0,
    registrations: (json?.data?.vehicles ?? []).map((v) => v.registration).filter(Boolean),
  };
}

async function fetchAuthPayload(token) {
  const res = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  const json = await res.json();
  return {
    user: json.data.user,
    session: { accessToken: token, expiresIn: 3600 },
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    label: '228-fleet-live-map-owner-visual-verify',
    branch: 'cursor/titan-final-product-consolidation',
    commitSha: '45b41ca',
    stagingApi: API,
    stagingWeb: WEB,
    companyId: YGP_COMPANY_ID,
    auth: { method: 'staging_programmatic_session', secretsInOutput: false },
    api: {},
    map: {},
    markers: {},
    screenshots: [],
    consoleErrors: [],
    verdict: 'HOLD',
    blockers: [],
  };

  const ready = await fetch(`${API}/api/v1/health/ready`);
  if (!ready.ok) {
    report.blockers.push('Staging API health/ready not OK');
  }

  const session = await mintOwnerSession();
  const authPayload = await fetchAuthPayload(session.accessToken);
  report.auth = { method: session.method, secretsInOutput: false, userIdPrefix: authPayload.user?.id?.slice(0, 8) ?? null };
  report.api = await fetchLiveMap(session.accessToken);

  if (report.api.status !== 200) {
    report.blockers.push('Authenticated /fleet/live-map API not 200');
  }
  for (const reg of TARGET_REGS) {
    if (!report.api.registrations?.includes(reg)) {
      report.blockers.push(`API missing vehicle ${reg}`);
    }
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
  page.on('pageerror', (err) => {
    const text = String(err.message || err);
    if (!/token|bearer|password|jwt/i.test(text)) {
      consoleErrors.push(text.slice(0, 300));
    }
  });

  await page.goto(`${WEB}/fleet/live-map`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page
    .waitForSelector(
      '.fleet-live-map-maplibre-host .maplibregl-map, .fleet-live-map-leaflet-host .leaflet-container, .fleet-live-map-fallback, .fleet-live-map-shell--fallback, .fleet-live-map-marker-pin',
      { timeout: 60_000 },
    )
    .catch(() => {});
  await page.waitForSelector('.maplibregl-canvas, .leaflet-tile-loaded, .fleet-live-map-marker-pin', {
    timeout: 60_000,
  }).catch(() => {});
  await page.waitForTimeout(3000);

  const bodyText = await page.locator('body').innerText();
  report.map.hasNotImplementedCopy = /NOT IMPLEMENTED|Today's dispatch board/i.test(bodyText);
  if (report.map.hasNotImplementedCopy) {
    report.blockers.push('Legacy NOT IMPLEMENTED copy visible');
  }

  const mapReady = await page.locator('[data-map-ready="true"]').count();
  const maplibreCanvas = await page.locator('.maplibregl-canvas').count();
  const leafletTiles = await page.locator('.leaflet-tile-loaded').count();
  const tileCount = maplibreCanvas || leafletTiles;
  const markerPins = await page.locator('.fleet-live-map-marker-pin').count();
  const mapHeight = await page
    .locator('.fleet-live-map-maplibre-host, .fleet-live-map-leaflet-host, .fleet-live-map-shell')
    .first()
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
    .catch(() => ({ width: 0, height: 0 }));

  report.map = {
    ...report.map,
    mapReadyAttr: mapReady > 0,
    maplibreCanvasCount: maplibreCanvas,
    leafletTileCount: leafletTiles,
    tileCount,
    markerPinCount: markerPins,
    containerHeightPx: Math.round(mapHeight.height),
    containerWidthPx: Math.round(mapHeight.width),
    maplibreMounted: (await page.locator('.maplibregl-map').count()) > 0,
    leafletMounted: (await page.locator('.leaflet-container').count()) > 0,
    pageTitle: await page.locator('h1, .page-header__title').first().textContent().catch(() => null),
  };

  if (mapHeight.height < 120) {
    report.blockers.push('Map container height collapsed');
  }
  if (tileCount < 1) {
    report.blockers.push('No MapLibre canvas rendered');
  }
  if (markerPins < 2) {
    report.blockers.push(`Expected 2 marker pins, saw ${markerPins}`);
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(600);
    const mapLocator = page.locator('.fleet-live-map-maplibre-host .maplibregl-map').first();
    if ((await mapLocator.count()) > 0) {
      await mapLocator.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
    await page.waitForTimeout(400);
    const shotPath = path.join(OUT, `fleet-live-map-owner-${viewport.id}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    report.screenshots.push({
      viewport: viewport.id,
      path: `diagnostic-output/fleet-live-map-staging/fleet-live-map-owner-${viewport.id}.png`,
      markerPinCount: await page.locator('.fleet-live-map-marker-pin').count(),
      tileCount: await page.locator('.maplibregl-canvas').count(),
    });
  }

  const markerDetails = {};
  for (const reg of TARGET_REGS) {
    const pin = page.locator('.fleet-live-map-marker-pin', { hasText: reg.slice(-3) }).first();
    if ((await pin.count()) === 0) {
      markerDetails[reg] = { clicked: false, panelVisible: false };
      report.blockers.push(`Marker pin for ${reg} not found`);
      continue;
    }
    await pin.click();
    await page.waitForTimeout(800);
    const panelText = await page.locator('.fleet-live-map-mobile-drawer, .fleet-live-map-vehicle-card.is-selected').innerText();
    markerDetails[reg] = {
      clicked: true,
      panelVisible: panelText.includes(reg),
      panelShowsRegistration: panelText.includes('Registration') && panelText.includes(reg),
    };
    if (!markerDetails[reg].panelVisible) {
      report.blockers.push(`Side panel did not open for ${reg}`);
    }
  }
  report.markers = markerDetails;

  report.consoleErrors = [...new Set(consoleErrors)].slice(0, 20);
  if (report.consoleErrors.some((line) => /maplibre|tile|map could not/i.test(line))) {
    report.blockers.push('Map-related console errors captured');
  }

  report.verdict = report.blockers.length === 0 ? 'GO' : 'HOLD';

  await browser.close();
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  const report = {
    generatedAt: new Date().toISOString(),
    label: '228-fleet-live-map-owner-visual-verify',
    verdict: 'HOLD',
    blockers: [String(err.message || err)],
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.error(String(err.message || err));
  process.exit(1);
});
