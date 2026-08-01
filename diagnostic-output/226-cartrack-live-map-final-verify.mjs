/**
 * 226 — Cartrack live map final verification (staging).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/226-cartrack-live-map-final-verify.json');

const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const STAGING_WEB = 'https://comfortable-determination-staging.up.railway.app';
const TARGET_REGS = ['CF172047', 'CF77263'];

async function fetchJson(pathname) {
  const res = await fetch(`${STAGING_API}${pathname}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function fetchWeb(pathname) {
  const res = await fetch(`${STAGING_WEB}${pathname}`, { method: 'GET', redirect: 'manual' });
  return { status: res.status };
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    label: '226-cartrack-live-map-final-verify',
    branch: 'cursor/cartrack-live-map-final',
    stagingApi: STAGING_API,
    stagingWeb: STAGING_WEB,
    rootCause: {
      summary:
        'GPS import returned positionsStored=0 because /vehicles/status vehicle_id values did not match mapping external_vehicle_id keys and parser missed nested/PascalCase coordinates.',
      endpoint: 'GET /vehicles/status (fallback GET /positions)',
      fix:
        'Registration fallback mapping, improved Cartrack status parser, deduped fresh-only GPS inserts, /fleet/live-map route + 3s client poll.',
    },
    health: {},
    cartrack: {},
    gps: {},
    liveMap: {},
    polling: {},
    permissions: {},
    deploy: {},
    verdict: 'HOLD',
    blockers: [],
  };

  const ready = await fetchJson('/api/v1/health/ready');
  report.health.ready = { httpStatus: ready.status, body: ready.json?.data ?? ready.json };

  const webRoot = await fetchWeb('/');
  const webLiveMap = await fetchWeb('/fleet/live-map');

  report.liveMap = {
    route: '/fleet/live-map',
    webRootHttpStatus: webRoot.status,
    webLiveMapHttpStatus: webLiveMap.status,
    apiEndpoint: '/api/v1/fleet/live-map',
    clientPollMsVisible: 3000,
    clientPollMsHidden: 60000,
    dedupeUnchangedPayload: true,
    inflightGuard: true,
  };

  report.polling = {
    liveDispatchHook: 'useCartrackLivePositions (3s visible / 60s hidden)',
    fleetLiveMapHook: 'useFleetLiveMap (3s visible / 60s hidden)',
    pageVisibilityApi: true,
  };

  const token = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (token) {
    const tracking = await fetch(`${STAGING_API}/api/v1/integrations/cartrack/tracking`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const trackingJson = tracking.ok ? await tracking.json() : null;
    report.cartrack.trackingHttpStatus = tracking.status;
    if (trackingJson?.data?.tracking) {
      report.gps.positionCount = trackingJson.data.tracking.positionCount;
      report.gps.mappedVehicleCount = trackingJson.data.tracking.mappedVehicleCount;
      report.gps.lastSyncAt = trackingJson.data.tracking.lastSyncAt;
      report.gps.latestPositions = trackingJson.data.tracking.latestPositions?.map((p) => ({
        licensePlate: p.licensePlate,
        recordedAt: p.recordedAt,
        latitude: p.latitude,
        longitude: p.longitude,
      }));
    }

    const liveMap = await fetch(`${STAGING_API}/api/v1/fleet/live-map`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    report.liveMap.apiHttpStatus = liveMap.status;
    if (liveMap.ok) {
      const liveMapJson = await liveMap.json();
      report.liveMap.vehicleCount = liveMapJson?.data?.vehicles?.length ?? 0;
      report.liveMap.generatedAt = liveMapJson?.data?.generatedAt ?? null;
    }

    const perms = await fetch(`${STAGING_API}/api/v1/integrations/cartrack/permissions`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (perms.ok) {
      report.permissions.probes = (await perms.json())?.data?.probes ?? [];
    }
  } else {
    report.blockers.push('OWNER_ACCESS_TOKEN not set — authenticated GPS proof skipped');
  }

  const regPositions = (report.gps.latestPositions ?? []).map((p) => p.licensePlate);
  for (const reg of TARGET_REGS) {
    report.cartrack[reg] = {
      hasLatestPosition: regPositions.includes(reg),
    };
  }

  const bothGps =
    report.gps.positionCount >= 2 &&
    TARGET_REGS.every((reg) => report.cartrack[reg]?.hasLatestPosition);

  if (!bothGps) {
    report.blockers.push('Both CF172047 and CF77263 must have stored GPS positions after deploy');
  }

  if (report.health.ready?.httpStatus !== 200) {
    report.blockers.push('Staging API health/ready not 200');
  }

  report.verdict = report.blockers.length === 0 ? 'GO' : 'HOLD';

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'GO' ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
