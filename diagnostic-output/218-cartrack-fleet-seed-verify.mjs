/**
 * 218 — Seed staging TITAN fleet (CF172047, CF77263) and verify Cartrack auto-map.
 * Staging only (cpkuwtaipjxeipvbssvn). Never production (rshuiaghmtrvvilhqpwm).
 *
 * Usage:
 *   node diagnostic-output/218-cartrack-fleet-seed-verify.mjs
 *   node diagnostic-output/218-cartrack-fleet-seed-verify.mjs --sync-via-railway
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/218-cartrack-fleet-seed-verify.json');

const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const API_ORIGIN = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const TARGET_VEHICLES = [
  { licensePlate: 'CF172047', name: 'CF172047' },
  { licensePlate: 'CF77263', name: 'CF77263' },
];

function normalizeReg(reg) {
  if (!reg) return null;
  return String(reg).trim().toLowerCase().replace(/[\s\-_/]/g, '');
}

function loadStagingDatabaseUrl() {
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (!fs.existsSync(envPath)) return process.env.DATABASE_URL || null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^DATABASE_URL=(.+)$/m);
  const url = match?.[1]?.trim().replace(/^["']|["']$/g, '') || process.env.DATABASE_URL || null;
  assertStagingUrl(url);
  return url;
}

function assertStagingUrl(url) {
  if (!url) throw new Error('No DATABASE_URL');
  if (url.includes(FORBIDDEN_PROD_REF)) throw new Error('Refusing production DATABASE_URL');
  if (!url.includes(STAGING_REF)) throw new Error('DATABASE_URL is not staging ref');
}

async function seedFleet(sql, companyId) {
  const seeded = [];
  const skipped = [];

  for (const target of TARGET_VEHICLES) {
    const existing = await sql`
      SELECT id, name, license_plate FROM vehicles
      WHERE company_id = ${companyId}::uuid
        AND lower(replace(replace(replace(trim(license_plate), '-', ''), ' ', ''), '_', ''))
          = ${normalizeReg(target.licensePlate)}
      LIMIT 1
    `;

    if (existing.length > 0) {
      skipped.push({
        licensePlate: target.licensePlate,
        id: existing[0].id,
        action: 'already_present',
      });
      continue;
    }

    const [inserted] = await sql`
      INSERT INTO vehicles (company_id, name, license_plate, status)
      VALUES (${companyId}::uuid, ${target.name}, ${target.licensePlate}, 'available')
      RETURNING id, name, license_plate
    `;
    seeded.push({
      licensePlate: inserted.license_plate,
      id: inserted.id,
      action: 'inserted',
    });
  }

  return { seeded, skipped };
}

async function reconcileAutoMap(sql, companyId, connectionId) {
  const { matchVehicleByRegistration } = await import(
    pathToFileURL(path.resolve(repoRoot, 'packages/shared/dist/vehicle-registration.js')).href
  );
  const vehicles = await sql`
    SELECT id, license_plate FROM vehicles WHERE company_id = ${companyId}::uuid
  `;
  const fleet = vehicles.map((v) => ({ id: v.id, licensePlate: v.license_plate }));
  const mappings = await sql`
    SELECT id, external_registration, vehicle_id, status
    FROM integration_vehicle_mappings
    WHERE company_id = ${companyId}::uuid
      AND integration_connection_id = ${connectionId}
  `;
  let updated = 0;
  for (const m of mappings) {
    if (m.vehicle_id || m.status !== 'unmapped') continue;
    const match = matchVehicleByRegistration(fleet, m.external_registration);
    if (match.kind !== 'unique') continue;
    await sql`
      UPDATE integration_vehicle_mappings
      SET vehicle_id = ${match.vehicleId}::uuid, status = 'mapped', updated_at = now()
      WHERE id = ${m.id}::uuid
    `;
    updated += 1;
  }
  return { updated };
}

async function readMappingState(sql, companyId, connectionId) {
  const mappings = await sql`
    SELECT m.id, m.status, m.external_vehicle_id, m.external_registration, m.vehicle_id,
           v.license_plate AS titan_license_plate, v.name AS titan_name
    FROM integration_vehicle_mappings m
    LEFT JOIN vehicles v ON v.id = m.vehicle_id
    WHERE m.company_id = ${companyId}::uuid
      AND m.integration_connection_id = ${connectionId}
    ORDER BY m.external_registration
  `;

  const mapped = mappings.filter((m) => m.status === 'mapped' && m.vehicle_id);
  const byReg = {};
  for (const target of TARGET_VEHICLES) {
    const norm = normalizeReg(target.licensePlate);
    const row = mappings.find((m) => normalizeReg(m.external_registration) === norm);
    byReg[target.licensePlate] = row
      ? {
          status:
            row.status === 'mapped' && row.vehicle_id ? 'auto_matched' : row.status || 'unmapped',
          mappingId: row.id,
          vehicleId: row.vehicle_id,
          titanLicensePlate: row.titan_license_plate,
          externalRegistration: row.external_registration,
          externalVehicleId: row.external_vehicle_id,
        }
      : { status: 'not_found' };
  }

  return { mappings, mappedCount: mapped.length, byReg };
}

async function runCartrackSyncViaRailway(companyId) {
  const runnerPath = path.resolve(repoRoot, 'diagnostic-output/218-cartrack-sync-runner.mjs');
  const result = spawnSync(
    'railway',
    ['run', '--environment', 'staging', '--service', 'young-guns-os', 'node', runnerPath, companyId],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' },
    },
  );

  return {
    exitCode: result.status,
    stdout: (result.stdout || '').trim().slice(0, 4000),
    stderr: (result.stderr || '').trim().slice(0, 2000),
  };
}

async function main() {
  const syncViaRailway = process.argv.includes('--sync-via-railway');
  const report = {
    generatedAt: new Date().toISOString(),
    label: '218-cartrack-fleet-seed-verify',
    branch: 'cursor/integration-lock-auto-sync',
    stagingRef: STAGING_REF,
    companyId: YGP_COMPANY_ID,
    stagingApi: API_ORIGIN,
    seed: { performed: false, seeded: [], skipped: [], vehicleIds: [] },
    sync: { attempted: false, method: null, result: null, error: null },
    verify: { mappedCount: null, registrations: {}, fleetVehicleCount: null },
    blockers: [],
    pass: false,
  };

  const databaseUrl = loadStagingDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const [conn] = await sql`
      SELECT id, status, last_sync_at, last_error
      FROM integration_connections
      WHERE company_id = ${YGP_COMPANY_ID}::uuid AND provider = 'cartrack'
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (!conn || conn.status !== 'connected') {
      report.blockers.push(`Cartrack connection not connected (status=${conn?.status ?? 'missing'})`);
    }

    const fleetBefore = await sql`
      SELECT count(*)::int AS c FROM vehicles WHERE company_id = ${YGP_COMPANY_ID}::uuid
    `;
    report.verify.fleetVehicleCountBefore = fleetBefore[0]?.c ?? 0;

    const seedResult = await seedFleet(sql, YGP_COMPANY_ID);
    report.seed.performed = true;
    report.seed.seeded = seedResult.seeded;
    report.seed.skipped = seedResult.skipped;
    report.seed.vehicleIds = [...seedResult.seeded, ...seedResult.skipped].map((v) => ({
      licensePlate: v.licensePlate,
      id: v.id,
    }));

    const fleetAfter = await sql`
      SELECT count(*)::int AS c FROM vehicles WHERE company_id = ${YGP_COMPANY_ID}::uuid
    `;
    report.verify.fleetVehicleCount = fleetAfter[0]?.c ?? 0;

    if (conn?.id) {
      let state = await readMappingState(sql, YGP_COMPANY_ID, conn.id);
      report.verify.registrationsBeforeSync = state.byReg;
      report.verify.mappedCountBeforeSync = state.mappedCount;

      const needsSync = state.mappedCount < 2 || TARGET_VEHICLES.some(
        (t) => state.byReg[t.licensePlate]?.status !== 'auto_matched',
      );

      if (needsSync) {
        const reconcile = await reconcileAutoMap(sql, YGP_COMPANY_ID, conn.id);
        report.sync.reconcileAutoMap = reconcile;

        report.sync.attempted = true;
        if (syncViaRailway || process.env.RUN_CARTRACK_SYNC === '1') {
          report.sync.method = 'railway_run_syncCartrack';
          const syncOut = await runCartrackSyncViaRailway(YGP_COMPANY_ID);
          report.sync.railway = syncOut;
          if (syncOut.exitCode !== 0) {
            report.sync.error = 'railway sync runner failed';
            report.blockers.push('Cartrack sync via railway run failed');
          } else {
            try {
              report.sync.result = JSON.parse(syncOut.stdout.split('\n').filter(Boolean).pop() || '{}');
            } catch {
              report.sync.result = { rawStdoutTail: syncOut.stdout.slice(-500) };
            }
          }
        } else {
          report.sync.method = 'deferred';
          report.blockers.push(
            'Re-run with --sync-via-railway to invoke live syncCartrack (requires Cartrack API + stored credentials)',
          );
        }
      }

      state = await readMappingState(sql, YGP_COMPANY_ID, conn.id);
      report.verify.mappedCount = state.mappedCount;
      report.verify.registrations = state.byReg;

      const ready = await fetch(`${API_ORIGIN}/api/v1/health/ready`, {
        headers: { Accept: 'application/json' },
      });
      report.healthReady = ready.status;

      const regPass = TARGET_VEHICLES.every(
        (t) => report.verify.registrations[t.licensePlate]?.status === 'auto_matched',
      );
      const mappedPass = report.verify.mappedCount === 2;

      if (!mappedPass) report.blockers.push(`mappedCount=${report.verify.mappedCount}, expected 2`);
      if (!regPass) report.blockers.push('CF172047/CF77263 not both auto_matched');

      report.pass = regPass && mappedPass && conn?.status === 'connected' && report.blockers.length === 0;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
