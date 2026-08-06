/**
 * 217 — Cartrack staging auto-map + sync verification (staging only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'));
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/217-cartrack-staging-verify.json');

const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const API_ORIGIN = 'https://young-guns-os-staging.up.railway.app';
const WEB_ORIGIN = 'https://comfortable-determination-staging.up.railway.app';
const TARGET_REGS = ['CF172047', 'CF77263'];

function normalizeReg(reg) {
  if (!reg) return null;
  return String(reg).trim().toLowerCase().replace(/[\s\-_/]/g, '');
}

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!match) return null;
  const url = match[1].trim().replace(/^["']|["']$/g, '');
  if (url.includes(FORBIDDEN_PROD_REF)) throw new Error('Refusing production DATABASE_URL');
  if (!url.includes(STAGING_REF)) throw new Error('DATABASE_URL is not staging ref');
  return url;
}

function shortId(id) {
  return id ? `${String(id).slice(0, 8)}…` : null;
}

async function fetchJson(pathname) {
  const res = await fetch(`${API_ORIGIN}${pathname}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    label: '217-cartrack-staging-verify',
    branch: 'cursor/integration-lock-auto-sync',
    stagingApi: API_ORIGIN,
    stagingWeb: WEB_ORIGIN,
    hosts: {
      web: 'comfortable-determination-staging (titan-staging-web)',
      api: 'young-guns-os-staging (integration-lock API)',
    },
    deploy: {},
    health: {},
    cartrack: {},
    registrations: {},
    gps: {},
    backgroundSync: {},
    duplicates: {},
    auditComplete: { yes: false, blockers: [] },
  };

  const ready = await fetchJson('/api/v1/health/ready');
  report.health.ready = { httpStatus: ready.status, body: ready.json?.data ?? ready.json };

  const live = await fetchJson('/api/v1/health/live');
  report.health.live = { httpStatus: live.status };

  report.deploy.apiHealthReady = ready.status === 200 ? 'finished' : 'unknown';
  report.deploy.schedulersEnabled = ready.json?.data?.schedulersEnabled === true;

  let sql;
  try {
    const url = loadStagingDatabaseUrl();
    if (!url) {
      report.cartrack.status = 'pending_connect';
      report.cartrack.detail = 'apps/api/.env.staging.local DATABASE_URL missing';
      report.auditComplete.blockers.push('staging DATABASE_URL unavailable for DB verify');
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }

    sql = postgres(url, { max: 1, onnotice: () => {} });

    const connections = await sql`
      SELECT id, company_id, status, connected_at, last_sync_at, updated_at, last_error,
        (credentials_encrypted IS NOT NULL) AS has_credentials,
        config->>'baseUrl' AS base_url
      FROM integration_connections
      WHERE provider = 'cartrack'
      ORDER BY updated_at DESC
    `;

    report.cartrack.connectionRows = connections.length;
    const connected = connections.filter((c) => c.status === 'connected');

    if (connected.length === 0) {
      const best = connections[0];
      report.cartrack.status = connections.length === 0 ? 'pending_connect' : `not_connected:${best?.status ?? 'unknown'}`;
      report.cartrack.hasCredentialsAny = connections.some((c) => c.has_credentials);
      report.auditComplete.blockers.push('Cartrack not connected on staging');
      if (best) {
        report.cartrack.sample = {
          companyIdPrefix: shortId(best.company_id),
          status: best.status,
          lastError: best.last_error,
          hasCredentials: best.has_credentials === true,
        };
      }
    } else {
      const row = connected[0];
      const companyId = row.company_id;
      const connectionId = row.id;

      report.cartrack.status = 'connected';
      report.cartrack.companyIdPrefix = shortId(companyId);
      report.cartrack.connectedAt = row.connected_at ? new Date(row.connected_at).toISOString() : null;
      report.cartrack.lastSyncAt = row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null;
      report.cartrack.lastError = row.last_error;
      report.cartrack.hasCredentials = row.has_credentials === true;
      report.cartrack.syncHealth = row.last_error ? 'error' : row.last_sync_at ? 'healthy' : 'never_synced';

      const mappings = await sql`
        SELECT m.id, m.status, m.external_vehicle_id, m.external_registration, m.vehicle_id,
               v.name AS vehicle_name, v.license_plate
        FROM integration_vehicle_mappings m
        LEFT JOIN vehicles v ON v.id = m.vehicle_id
        WHERE m.company_id = ${companyId}
          AND m.integration_connection_id = ${connectionId}
        ORDER BY m.updated_at DESC
      `;

      const mapped = mappings.filter((m) => m.status === 'mapped' && m.vehicle_id);
      report.cartrack.mappedCount = mapped.length;
      report.cartrack.totalMappingRows = mappings.length;
      report.cartrack.unmappedCount = mappings.filter((m) => m.status !== 'mapped' || !m.vehicle_id).length;

      for (const target of TARGET_REGS) {
        const norm = normalizeReg(target);
        const match = mappings.find((m) => normalizeReg(m.external_registration) === norm || normalizeReg(m.license_plate) === norm);
        report.registrations[target] = match
          ? {
              status: match.status === 'mapped' && match.vehicle_id ? 'auto_matched' : 'unmapped_or_pending',
              mappingIdPrefix: shortId(match.id),
              vehicleIdPrefix: shortId(match.vehicle_id),
              vehicleName: match.vehicle_name,
              licensePlate: match.license_plate,
              externalRegistration: match.external_registration,
            }
          : { status: 'not_found' };
      }

      const dupVehicleIds = await sql`
        SELECT vehicle_id, count(*)::int AS c
        FROM integration_vehicle_mappings
        WHERE company_id = ${companyId}
          AND integration_connection_id = ${connectionId}
          AND vehicle_id IS NOT NULL
        GROUP BY vehicle_id HAVING count(*) > 1
      `;
      const dupExternal = await sql`
        SELECT external_vehicle_id, count(*)::int AS c
        FROM integration_vehicle_mappings
        WHERE company_id = ${companyId}
          AND integration_connection_id = ${connectionId}
        GROUP BY external_vehicle_id HAVING count(*) > 1
      `;
      report.duplicates = {
        vehicleIdCollisions: dupVehicleIds.length,
        externalIdCollisions: dupExternal.length,
        pass: dupVehicleIds.length === 0 && dupExternal.length === 0,
      };

      const gpsCount = await sql`
        SELECT count(*)::int AS c FROM gps_positions WHERE company_id = ${companyId}
      `;
      const latestGps = await sql`
        SELECT gp.recorded_at, gp.latitude, gp.longitude, gp.external_vehicle_id,
               v.license_plate, v.name
        FROM gps_positions gp
        LEFT JOIN vehicles v ON v.id = gp.vehicle_id
        WHERE gp.company_id = ${companyId}
        ORDER BY gp.recorded_at DESC NULLS LAST
        LIMIT 5
      `;
      report.gps = {
        positionCount: gpsCount[0]?.c ?? 0,
        latest: latestGps.map((g) => ({
          recordedAt: g.recorded_at ? new Date(g.recorded_at).toISOString() : null,
          licensePlate: g.license_plate,
          vehicleName: g.name,
          externalVehicleId: g.external_vehicle_id,
          hasCoordinates: g.latitude != null && g.longitude != null,
        })),
      };

      const jobs = await sql`
        SELECT id, job_type, status, sync_scope, started_at, completed_at, error_message, result_summary
        FROM integration_sync_jobs
        WHERE company_id = ${companyId}
          AND (sync_scope ILIKE '%cartrack%' OR result_summary::text ILIKE '%cartrack%' OR job_type IN ('manual','scheduled'))
        ORDER BY started_at DESC NULLS LAST
        LIMIT 10
      `;
      const cartrackJobs = jobs.filter(
        (j) => String(j.sync_scope ?? '').toLowerCase().includes('cartrack') || JSON.stringify(j.result_summary ?? {}).includes('autoMapped'),
      );
      const schedules = await sql`
        SELECT connector_key, status, config->'autoSync' AS auto_sync, updated_at
        FROM integration_connectors
        WHERE company_id = ${companyId} AND connector_key = 'cartrack'
        LIMIT 3
      `;
      const audit = await sql`
        SELECT action, occurred_at FROM security_audit_logs
        WHERE company_id = ${companyId}
          AND action ILIKE '%cartrack%'
        ORDER BY occurred_at DESC LIMIT 10
      `;

      report.backgroundSync = {
        lastSyncAt: report.cartrack.lastSyncAt,
        recentJobs: (cartrackJobs.length ? cartrackJobs : jobs).slice(0, 5).map((j) => ({
          jobType: j.job_type,
          status: j.status,
          syncScope: j.sync_scope,
          startedAt: j.started_at ? new Date(j.started_at).toISOString() : null,
          completedAt: j.completed_at ? new Date(j.completed_at).toISOString() : null,
          errorPrefix: j.error_message ? String(j.error_message).slice(0, 120) : null,
          autoMappedCount: j.result_summary?.autoMappedCount ?? null,
          positionsStored: j.result_summary?.positionsStored ?? null,
        })),
        connector: schedules[0]
          ? {
              status: schedules[0].status,
              autoSync: schedules[0].auto_sync,
              updatedAt: schedules[0].updated_at ? new Date(schedules[0].updated_at).toISOString() : null,
            }
          : null,
        auditActions: audit.map((a) => a.action),
      };

      const regPass = TARGET_REGS.every(
        (t) => report.registrations[t]?.status === 'auto_matched' && report.registrations[t]?.vehicleIdPrefix,
      );
      const mappedPass = report.cartrack.mappedCount === 2;
      const dupPass = report.duplicates.pass;
      report.cartrack.liveAutoMapProof = regPass && mappedPass && dupPass;

      if (!mappedPass) report.auditComplete.blockers.push(`mappedCount=${report.cartrack.mappedCount}, expected 2`);
      if (!regPass) report.auditComplete.blockers.push('CF172047/CF77263 not both auto-mapped to unique vehicles');
      if (!dupPass) report.auditComplete.blockers.push('duplicate vehicle or mapping detected');
      if (!row.last_sync_at) report.auditComplete.blockers.push('last_sync_at not populated');
    }
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }

  const token = process.env.OWNER_ACCESS_TOKEN?.trim();
  report.apiProbe = { ownerTokenUsed: Boolean(token) };
  if (token) {
    const res = await fetch(`${API_ORIGIN}/api/v1/integrations/cartrack`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    report.apiProbe.cartrackConnectionHttpStatus = res.status;
    if (json?.data?.connection) {
      const c = json.data.connection;
      report.apiProbe.mappedVehicleCount = c.mappedVehicleCount;
      report.apiProbe.positionCount = c.positionCount;
      report.apiProbe.lastSyncAt = c.lastSyncAt;
      report.apiProbe.status = c.status;
    }
  }

  report.auditComplete.yes =
    report.cartrack.liveAutoMapProof === true &&
    report.cartrack.status === 'connected' &&
    report.health.ready?.httpStatus === 200 &&
    report.auditComplete.blockers.length === 0;

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.auditComplete.yes ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
