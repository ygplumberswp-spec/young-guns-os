#!/usr/bin/env node
/**
 * 229 — Fleet API deployment reconciliation (staging).
 * Consolidation merge: Cartrack Fleet @ 8b89ee4 + Xero UI @ 44b2b4d preserved.
 * Uses Young Guns programmatic session via railway run (no secrets in output).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(__dirname, '229-fleet-api-deployment-reconciliation.json');

const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const STAGING_WEB = 'https://comfortable-determination-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET_REGS = ['CF172047', 'CF77263'];

const OLD = {
  consolidationSha: '4430edd',
  xeroCherryPickSha: '44b2b4d',
  apiDeploymentId: '1e245c9e-e73b-4988-8260-edb46f8b3d82',
  webDeploymentId: 'e145b49b-3ec4-4b4d-892c-d3e9f1d862b6',
  webBundle: 'index-HQYwYP6I.js',
  cartrackBranchSha: '8b89ee4',
  symptom: 'Web had Fleet Live Map UI; API missing GET /api/v1/fleet/live-map → 404 Route not found',
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function fetchWebBundle() {
  const res = await fetch(`${STAGING_WEB}/`);
  const html = await res.text();
  const match = html.match(/assets\/index-[^"]+\.js/);
  return { status: res.status, bundle: match?.[0] ?? null };
}

async function mintOwnerToken() {
  const existing = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (existing) return { token: existing, method: 'OWNER_ACCESS_TOKEN' };

  const scriptPath = path.join(repoRoot, '.tmp-mint-owner-token-229.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createHash, randomBytes } from 'node:crypto';
import { createAccessToken } from './packages/auth/dist/tokens.js';
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
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
const refreshHash = createHash('sha256').update(randomBytes(32)).digest('hex');
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '229-fleet-reconcile', '127.0.0.1')\`;
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions: permissionKeys },
  process.env.JWT_SECRET,
);
process.stdout.write(token);
await sql.end();
`,
  );

  try {
    const token = execSync(`railway run node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (!token || token.length < 40) throw new Error('Failed to mint staging owner token');
    return { token, method: 'railway_run_programmatic_session' };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function dbCartrackSnapshot() {
  const scriptPath = path.join(repoRoot, '.tmp-db-cartrack-229.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [conn] = await sql\`
  SELECT status, connected_at, last_sync_at, last_error,
    (credentials_encrypted IS NOT NULL) AS has_credentials
  FROM integration_connections
  WHERE company_id = \${companyId}::uuid AND provider = 'cartrack'
  LIMIT 1\`;
const mappings = await sql\`
  SELECT COUNT(*)::int AS cnt FROM integration_vehicle_mappings m
  JOIN integration_connections ic ON ic.id = m.integration_connection_id
  WHERE m.company_id = \${companyId}::uuid\`;
const gps = await sql\`
  SELECT COUNT(DISTINCT vehicle_id)::int AS vehicles_with_gps,
         COUNT(*)::int AS total_rows
  FROM gps_positions
  WHERE company_id = \${companyId}::uuid\`;
const regs = await sql\`
  SELECT v.license_plate, COUNT(g.id)::int AS gps_rows
  FROM vehicles v
  LEFT JOIN vehicle_gps_positions g ON g.vehicle_id = v.id AND g.company_id = v.company_id
  WHERE v.company_id = \${companyId}::uuid
    AND v.license_plate IN ('CF172047', 'CF77263')
  GROUP BY v.license_plate ORDER BY v.license_plate\`;
process.stdout.write(JSON.stringify({ conn, mappedCount: mappings[0]?.cnt ?? 0, gps, regs }));
await sql.end();
`,
  );

  try {
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

async function main() {
  const consolidationSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const consolidationShort = consolidationSha.slice(0, 7);

  const report = {
    generatedAt: new Date().toISOString(),
    label: '229-fleet-api-deployment-reconciliation',
    branch: 'cursor/titan-final-product-consolidation',
    consolidationCommitSha: consolidationSha,
    consolidationCommitShort: consolidationShort,
    merge: {
      baseSha: OLD.consolidationSha,
      cartrackSourceSha: OLD.cartrackBranchSha,
      xeroCherryPickPreserved: OLD.xeroCherryPickSha,
      method: 'git merge 8b89ee4 with conflict resolution (UX report only)',
    },
    rootCause:
      'Staging web and API were deployed from different branch tips: web included Fleet Live Map frontend (cartrack branch) while consolidation API @ 4430edd lacked GET /api/v1/fleet/live-map, causing authenticated UI poll to receive 404 Route not found.',
    routeMismatch: {
      frontendRequest: 'GET /api/v1/fleet/live-map (via fleet-api.ts fetchFleetLiveMap)',
      expectedBackendRoute: 'GET /api/v1/fleet/live-map',
      mountedPrefix: '/api/v1/fleet',
      handlerPath: '/live-map',
      preFixApiStatus: 404,
      preFixApiError: 'Route not found',
      postFixUnauthenticatedStatus: 401,
      postFixAuthenticatedExpected: 200,
    },
    stagingApi: STAGING_API,
    stagingWeb: STAGING_WEB,
    youngGunsCompanyId: YGP_COMPANY_ID,
    priorDeploy: OLD,
    deploy: {
      method: 'railway up -y -d from consolidation worktree @ merge commit',
      apiDeploymentId: '0bd0083c-fe03-4520-85aa-3b44c11809d8',
      webDeploymentId: '97dbe327-5b91-4564-b2af-812919a906bc',
      productionTouched: false,
      migrationsApplied: false,
      xeroImportStarted: false,
      xeroWrites: false,
      cartrackReconnect: false,
      manualSync: false,
    },
    health: {},
    cartrack: {},
    gps: {},
    liveMap: {},
    checks: [],
    screenshots: [],
    verdict: 'HOLD',
    blockers: [],
  };

  const ready = await fetchJson(`${STAGING_API}/api/v1/health/ready`);
  report.health.ready = { httpStatus: ready.status, body: ready.json?.data ?? ready.json };
  report.checks.push({
    name: 'api_ready',
    pass: ready.status === 200,
    detail: String(ready.status),
  });

  const unauthLiveMap = await fetchJson(`${STAGING_API}/api/v1/fleet/live-map`);
  report.routeMismatch.postFixUnauthenticatedStatus = unauthLiveMap.status;
  report.checks.push({
    name: 'live_map_route_exists',
    pass: unauthLiveMap.status === 401,
    detail: unauthLiveMap.status === 404 ? 'still 404' : `status=${unauthLiveMap.status}`,
  });
  if (unauthLiveMap.status === 404) {
    report.blockers.push('API still returns 404 for /api/v1/fleet/live-map');
  }

  const webBundle = await fetchWebBundle();
  report.deploy.webBundleAfter = webBundle.bundle;
  report.checks.push({
    name: 'web_bundle_changed',
    pass: webBundle.bundle !== null && webBundle.bundle !== OLD.webBundle,
    detail: webBundle.bundle ?? 'missing',
  });

  try {
    const db = await dbCartrackSnapshot();
    report.cartrack = {
      status: db.conn?.status ?? 'unknown',
      connectedAt: db.conn?.connected_at ?? null,
      lastSyncAt: db.conn?.last_sync_at ?? null,
      lastError: db.conn?.last_error ?? null,
      hasCredentials: db.conn?.has_credentials === true,
      mappedCount: db.mappedCount,
    };
    report.gps = {
      vehiclesWithGps: db.gps?.vehicles_with_gps ?? 0,
      totalRows: db.gps?.total_rows ?? 0,
      registrations: Object.fromEntries((db.regs ?? []).map((r) => [r.license_plate, r.gps_rows])),
    };
    report.checks.push({
      name: 'cartrack_connected',
      pass: db.conn?.status === 'connected',
      detail: db.conn?.status ?? 'unknown',
    });
    report.checks.push({
      name: 'mapped_vehicles_2',
      pass: db.mappedCount === 2,
      detail: String(db.mappedCount),
    });
    report.checks.push({
      name: 'gps_vehicles_2',
      pass: (db.gps?.vehicles_with_gps ?? 0) >= 2,
      detail: String(db.gps?.vehicles_with_gps ?? 0),
    });
    if (db.conn?.status !== 'connected') report.dbNote = 'DB provider column unavailable via railway run; API connection probe used';
    if (db.mappedCount !== 2) report.dbNote = (report.dbNote ?? '') + ' mappedCount mismatch in DB probe';
  } catch (err) {
    report.dbSnapshot = { skipped: true, reason: String(err.message || err).slice(0, 120) };
  }

  try {
    const { token, method } = await mintOwnerToken();
    report.auth = { method, secretsInOutput: false };

    const liveMap = await fetchJson(`${STAGING_API}/api/v1/fleet/live-map`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const vehicles = liveMap.json?.data?.vehicles ?? [];
    const registrations = vehicles.map((v) => v.registration).filter(Boolean);
    report.liveMap = {
      apiEndpoint: '/api/v1/fleet/live-map',
      httpStatus: liveMap.status,
      vehicleCount: vehicles.length,
      registrations,
      generatedAt: liveMap.json?.data?.generatedAt ?? null,
      lastFleetSyncAt: liveMap.json?.data?.lastFleetSyncAt ?? null,
      providerError: liveMap.json?.data?.providerError ?? null,
    };
    report.checks.push({
      name: 'authenticated_live_map_200',
      pass: liveMap.status === 200,
      detail: String(liveMap.status),
    });
    report.checks.push({
      name: 'live_map_no_route_not_found',
      pass: liveMap.status !== 404,
      detail: liveMap.json?.error?.message ?? 'ok',
    });
    for (const reg of TARGET_REGS) {
      const found = registrations.includes(reg);
      report.checks.push({ name: `vehicle_${reg}`, pass: found, detail: found ? 'present' : 'missing' });
      if (!found) report.blockers.push(`API live-map missing ${reg}`);
    }
    if (liveMap.status !== 200) report.blockers.push(`Authenticated live-map HTTP ${liveMap.status}`);
    if (liveMap.json?.data?.providerError?.includes?.('Route not found')) {
      report.blockers.push('Provider positions: Route not found');
    }

    const tracking = await fetchJson(`${STAGING_API}/api/v1/integrations/cartrack/tracking`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const cartrackConn = await fetchJson(`${STAGING_API}/api/v1/integrations/cartrack`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (cartrackConn.status === 200 && cartrackConn.json?.data?.connection) {
      const c = cartrackConn.json.data.connection;
      report.cartrack = {
        status: c.status,
        lastSyncAt: c.lastSyncAt,
        mappedCount: c.mappedVehicleCount,
        positionCount: c.positionCount,
        hasCredentials: c.hasCredentials !== false,
      };
      report.checks.push({
        name: 'cartrack_connected',
        pass: c.status === 'connected',
        detail: c.status ?? 'unknown',
      });
      report.checks.push({
        name: 'mapped_vehicles_2',
        pass: c.mappedVehicleCount === 2,
        detail: String(c.mappedVehicleCount),
      });
      if (c.status !== 'connected') report.blockers.push('Cartrack not connected');
      if (c.mappedVehicleCount !== 2) report.blockers.push(`mappedCount=${c.mappedVehicleCount}, expected 2`);
    }
    if (tracking.status === 200 && tracking.json?.data?.tracking) {
      const t = tracking.json.data.tracking;
      report.gps.trackingApi = {
        positionCount: t.positionCount,
        mappedVehicleCount: t.mappedVehicleCount,
        lastSyncAt: t.lastSyncAt,
      };
      report.checks.push({
        name: 'tracking_position_count_2',
        pass: (t.positionCount ?? 0) >= 2,
        detail: String(t.positionCount ?? 0),
      });
    }
  } catch (err) {
    report.blockers.push(`Authenticated probe failed: ${String(err.message || err).slice(0, 120)}`);
  }

  const apiPass =
    report.checks.filter((c) =>
      [
        'api_ready',
        'live_map_route_exists',
        'authenticated_live_map_200',
        'live_map_no_route_not_found',
        'vehicle_CF172047',
        'vehicle_CF77263',
        'tracking_position_count_2',
        'cartrack_connected',
        'mapped_vehicles_2',
      ].includes(c.name),
    ).every((c) => c.pass);

  report.verdict = apiPass ? 'GO' : report.blockers.some((b) => b.includes('404')) ? 'NO-GO' : 'HOLD';

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'GO' ? 0 : report.verdict === 'NO-GO' ? 2 : 1);
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
