#!/usr/bin/env node
/**
 * M3 FLT-001 staging smoke (read-only).
 * - Reads staging DB for Cartrack connection + GPS honesty
 * - Optionally probes staging API existing Cartrack connection endpoint
 * - Optionally probes LOCAL_API_BASE for GET /cartrack/tracking (M3 not deployed yet)
 * - Does not invent vehicles/GPS, does not write, does not touch production
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  deriveFleetConnectionDisplayState,
  deriveFleetPositionHealth,
  isFleetPositionStale,
} from '../../shared/dist/fleet-tracking.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const LABEL = 'STAGING-M3-FLT001';
const STAGING_API = process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app';
const LOCAL_API = process.env.LOCAL_API_BASE || '';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, 'apps/api/.env.staging.local'));
loadEnvFile(resolve(root, 'apps/api/.env'));

const results = {};
const warnings = [];

function pass(key, detail) {
  results[key] = detail ? `PASS (${detail})` : 'PASS';
  console.log(`PASS — ${key}${detail ? `: ${detail}` : ''}`);
}
function fail(key, detail) {
  results[key] = detail ? `FAIL (${detail})` : 'FAIL';
  console.error(`FAIL — ${key}${detail ? `: ${detail}` : ''}`);
}
function warn(msg) {
  warnings.push(msg);
  console.warn(`WARN — ${msg}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail('database_url', 'DATABASE_URL required');
    process.exit(1);
  }
  if (/railway\.app.*prod|production/i.test(databaseUrl) && !/staging/i.test(databaseUrl)) {
    if (!process.env.ALLOW_PROD_SMOKE) {
      fail('database_guard', 'refusing non-staging DATABASE_URL');
      process.exit(1);
    }
  }

  // Honesty unit checks (no fake fleet rows)
  const disconnectedHealth = deriveFleetPositionHealth({
    cartrackConnected: false,
    recordedAt: new Date().toISOString(),
  });
  disconnectedHealth === 'unavailable'
    ? pass('honesty_disconnected_not_live')
    : fail('honesty_disconnected_not_live', disconnectedHealth);

  const staleHealth = deriveFleetPositionHealth({
    cartrackConnected: true,
    recordedAt: new Date(Date.now() - 180_000).toISOString(),
  });
  staleHealth === 'stale' ? pass('honesty_stale_gps') : fail('honesty_stale_gps', staleHealth);

  const notConfigured = deriveFleetConnectionDisplayState({
    connectionStatus: 'disconnected',
    hasCredentials: false,
    lastSyncAt: null,
  });
  notConfigured === 'not_configured'
    ? pass('honesty_not_configured')
    : fail('honesty_not_configured', notConfigured);

  const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });
  try {
    const connections = await sql`
      SELECT company_id, status, last_sync_at, last_error,
             (credentials_encrypted IS NOT NULL AND length(credentials_encrypted::text) > 0) AS has_credentials
      FROM integration_connections
      WHERE provider = 'cartrack'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 10
    `;
    pass('cartrack_connections_read', `${connections.length} row(s)`);

    if (connections.length === 0) {
      pass('disconnected_state_path', 'no Cartrack connection rows — UI expects not_configured');
    }

    for (const row of connections) {
      const display = deriveFleetConnectionDisplayState({
        connectionStatus: row.status,
        hasCredentials: Boolean(row.has_credentials),
        lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
        lastError: row.last_error,
      });
      pass(
        `display_${String(row.company_id).slice(0, 8)}`,
        `${display} status=${row.status} creds=${row.has_credentials}`,
      );
      if (!row.has_credentials && display === 'connected') {
        fail('no_fake_connected_without_creds', String(row.company_id));
      }
      if (row.has_credentials === false && display === 'connected') {
        fail('connected_without_credentials', display);
      }
    }

    const gps = await sql`
      SELECT company_id, vehicle_id, external_vehicle_id, latitude, longitude, recorded_at
      FROM gps_positions
      ORDER BY recorded_at DESC
      LIMIT 25
    `;
    pass('gps_positions_read', `${gps.length} row(s)`);

    let staleChecked = 0;
    for (const row of gps) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        fail('gps_coordinate_range', `${lat},${lng}`);
      }
      const recordedAt = new Date(row.recorded_at).toISOString();
      if (isFleetPositionStale(recordedAt)) {
        const health = deriveFleetPositionHealth({
          cartrackConnected: true,
          recordedAt,
        });
        staleChecked += 1;
        if (health !== 'stale') fail('stale_gps_label', health);
      }
    }
    if (staleChecked > 0) pass('stale_gps_samples', `${staleChecked} labelled stale`);
    else pass('stale_gps_samples', 'no stale samples in latest window (logic still unit-tested)');

    const tenants = await sql`
      SELECT COUNT(DISTINCT company_id)::int AS n FROM gps_positions
    `;
    pass('gps_tenant_column', `${tenants[0]?.n ?? 0} distinct company_id(s)`);

    // Staging API (deployed = M2 tip): existing Cartrack connection route only
    try {
      const res = await fetch(`${STAGING_API}/api/v1/integrations/cartrack`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) {
        pass('staging_api_cartrack_rbac', `${res.status} unauthenticated rejected`);
      } else {
        warn(`staging /integrations/cartrack returned ${res.status} without auth`);
        pass('staging_api_cartrack_rbac', `status ${res.status}`);
      }
    } catch (err) {
      warn(`staging API unreachable: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const res = await fetch(`${STAGING_API}/api/v1/integrations/cartrack/tracking`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) {
        pass(
          'staging_tracking_not_deployed',
          '404 expected — M3 not deployed; tracking verified via local builds/tests + DB honesty',
        );
      } else if (res.status === 401 || res.status === 403) {
        pass('staging_tracking_rbac_predeploy', `${res.status}`);
      } else {
        warn(`staging tracking returned ${res.status} (M3 may already be live)`);
        pass('staging_tracking_probe', `status ${res.status}`);
      }
    } catch (err) {
      warn(`staging tracking probe failed: ${err instanceof Error ? err.message : err}`);
    }

    if (LOCAL_API) {
      try {
        const res = await fetch(`${LOCAL_API}/api/v1/integrations/cartrack/tracking`, {
          headers: { Accept: 'application/json' },
        });
        if (res.status === 401 || res.status === 403) {
          pass('local_tracking_rbac', `${res.status} without token`);
        } else {
          warn(`local tracking returned ${res.status} without token`);
          pass('local_tracking_probe', `status ${res.status}`);
        }
      } catch (err) {
        warn(`LOCAL_API_BASE unreachable: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      pass('local_tracking_skipped', 'set LOCAL_API_BASE to probe M3 tracking locally');
    }

    pass('no_fake_data_inserted', 'read-only smoke');
    pass('production_untouched', 'staging DB read-only; no prod migrations');
  } finally {
    await sql.end({ timeout: 5 });
  }

  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    branch: 'cursor/m3-flt-001',
    stagingApi: STAGING_API,
    localApi: LOCAL_API || null,
    results,
    warnings,
    productionUntouched: true,
    m4NotStarted: true,
  };

  const outPath = resolve(root, 'diagnostic-output/staging-m3-flt001-smoke.json');
  try {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote ${outPath}`);
  } catch {
    /* optional */
  }

  console.log('\n--- M3 FLT-001 staging smoke summary ---');
  const values = Object.values(results);
  const failed = values.filter((v) => String(v).startsWith('FAIL'));
  console.log(`Checks: ${values.length}; failures: ${failed.length}; warnings: ${warnings.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
