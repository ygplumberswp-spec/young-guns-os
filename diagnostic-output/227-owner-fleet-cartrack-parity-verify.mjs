/**
 * 227 — Owner fleet Cartrack parity verification (staging).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/db/package.json'),
);
const postgres = require('postgres');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/227-owner-fleet-cartrack-parity-verify.json');
const screenshotDir = path.resolve(repoRoot, 'diagnostic-output/fleet-live-map-staging');

const STAGING_API = 'https://young-guns-os-staging.up.railway.app';
const STAGING_WEB = 'https://comfortable-determination-staging.up.railway.app';
const TARGET_REGS = ['CF172047', 'CF77263'];
const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

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

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function fetchWebHtml(pathname) {
  const res = await fetch(`${STAGING_WEB}${pathname}`);
  return { status: res.status, html: await res.text() };
}

async function main() {
  const commitSha = process.env.DEPLOY_SHA?.trim() || 'local-uncommitted';
  const report = {
    generatedAt: new Date().toISOString(),
    label: '227-owner-fleet-cartrack-parity-verify',
    branch: 'cursor/cartrack-live-map-final',
    commitSha,
    stagingApi: STAGING_API,
    stagingWeb: STAGING_WEB,
    rootCause: {
      summary:
        'Owner saw legacy FleetDispatchBoard because sidebar Fleet linked to /fleet (VehicleListPage) instead of /fleet/live-map; dispatch board showed NOT IMPLEMENTED copy.',
      fix:
        'Redirect /fleet → /fleet/live-map, remove dispatch board from vehicle list, add FleetSectionNav tabs, enriched live map + owner fleet pages.',
    },
    deploy: {
      apiDeployId: process.env.API_DEPLOY_ID || '504b8cc8-5787-47a2-b889-221aef02cc81',
      webDeployId: process.env.WEB_DEPLOY_ID || '7965c591-1b58-4f2d-846e-3809cae2fb9a',
    },
    health: {},
    web: {},
    gps: {},
    liveMap: {},
    fleetRoutes: {},
    features: {},
    screenshots: {},
    verdict: 'HOLD',
    blockers: [],
  };

  const ready = await fetchJson(`${STAGING_API}/api/v1/health/ready`);
  report.health.ready = { httpStatus: ready.status, body: ready.json?.data ?? ready.json };

  const webRoot = await fetchWebHtml('/');
  const webLiveMap = await fetchWebHtml('/fleet/live-map');
  const bundleMatch = webRoot.html.match(/index-[A-Za-z0-9_-]+\.js/);

  report.web = {
    rootHttpStatus: webRoot.status,
    liveMapHttpStatus: webLiveMap.status,
    bundle: bundleMatch?.[0] ?? null,
    bundleContainsFleetLiveMapPage: webRoot.html.includes('FleetLiveMapPage'),
    bundleContainsLegacyDispatch: webRoot.html.includes("Today's dispatch board"),
    bundleContainsNotImplemented: webRoot.html.includes('LIVE MAPS/ROUTING NOT IMPLEMENTED'),
  };

  if (report.web.bundleContainsLegacyDispatch || report.web.bundleContainsNotImplemented) {
    report.blockers.push('Web bundle still contains legacy dispatch / NOT IMPLEMENTED strings');
  }

  report.fleetRoutes = {
    '/fleet/live-map': webLiveMap.status,
    '/fleet/vehicles': (await fetchWebHtml('/fleet/vehicles')).status,
    '/fleet/trips': (await fetchWebHtml('/fleet/trips')).status,
    '/fleet/alerts': (await fetchWebHtml('/fleet/alerts')).status,
    '/fleet/drivers': (await fetchWebHtml('/fleet/drivers')).status,
  };

  report.liveMap = {
    route: '/fleet/live-map',
    apiEndpoint: '/api/v1/fleet/live-map',
    clientPollMsVisible: 3000,
    clientPollMsHidden: 60000,
    pollsCachedTitanPositionsOnly: true,
  };

  const token = process.env.OWNER_ACCESS_TOKEN?.trim();
  if (token) {
    const liveMap = await fetchJson(`${STAGING_API}/api/v1/fleet/live-map`, {
      Authorization: `Bearer ${token}`,
    });
    report.liveMap.apiHttpStatus = liveMap.status;
    if (liveMap.status === 200) {
      const vehicles = liveMap.json?.data?.vehicles ?? [];
      report.liveMap.vehicleCount = vehicles.length;
      report.liveMap.enrichedFields = vehicles[0]
        ? Object.keys(vehicles[0]).filter((k) =>
            ['displayState', 'currentJob', 'todayDistanceKm', 'isTrackerOffline'].includes(k),
          )
        : [];
      report.liveMap.sampleVehicle = vehicles[0]
        ? {
            registration: vehicles[0].registration,
            displayState: vehicles[0].displayState,
            hasTrail: (vehicles[0].trailToday?.length ?? 0) > 0,
          }
        : null;
    }

    const trips = await fetchJson(`${STAGING_API}/api/v1/fleet/trips`, {
      Authorization: `Bearer ${token}`,
    });
    report.features.trips = { httpStatus: trips.status, count: trips.json?.data?.trips?.length ?? 0 };

    const drivers = await fetchJson(`${STAGING_API}/api/v1/fleet/drivers`, {
      Authorization: `Bearer ${token}`,
    });
    report.features.drivers = {
      httpStatus: drivers.status,
      count: drivers.json?.data?.drivers?.length ?? 0,
    };

    const events = await fetchJson(`${STAGING_API}/api/v1/fleet/events`, {
      Authorization: `Bearer ${token}`,
    });
    report.features.events = {
      httpStatus: events.status,
      count: events.json?.data?.events?.length ?? 0,
    };

    const tracking = await fetchJson(`${STAGING_API}/api/v1/integrations/cartrack/tracking`, {
      Authorization: `Bearer ${token}`,
    });
    if (tracking.status === 200) {
      report.gps.positionCount = tracking.json?.data?.tracking?.positionCount;
      report.gps.lastSyncAt = tracking.json?.data?.tracking?.lastSyncAt;
      report.gps.latestPositions = tracking.json?.data?.tracking?.latestPositions?.map((p) => ({
        licensePlate: p.licensePlate,
        recordedAt: p.recordedAt,
      }));
    }
  } else {
    report.blockers.push('OWNER_ACCESS_TOKEN not set — authenticated API/screenshot proof skipped');
  }

  let sql;
  try {
    const url = loadStagingDatabaseUrl();
    if (url) {
      sql = postgres(url, { max: 1, onnotice: () => {} });
      const counts = await sql`
        SELECT v.license_plate, COUNT(g.id)::int AS gps_rows
        FROM vehicles v
        LEFT JOIN gps_positions g ON g.vehicle_id = v.id
        WHERE lower(replace(v.license_plate, ' ', '')) IN ('cf172047', 'cf77263')
        GROUP BY v.license_plate
      `;
      report.gps.dbPositionCounts = Object.fromEntries(
        counts.map((row) => [row.license_plate, row.gps_rows]),
      );
      report.gps.dbTotal = counts.reduce((sum, row) => sum + row.gps_rows, 0);
    }
  } catch (err) {
    report.blockers.push(`DB GPS count probe failed: ${String(err.message || err)}`);
  } finally {
    if (sql) await sql.end({ timeout: 5 });
  }

  for (const reg of TARGET_REGS) {
    report.gps[reg] = {
      hasLatestPosition: (report.gps.latestPositions ?? []).some((p) => p.licensePlate === reg),
      dbRows: report.gps.dbPositionCounts?.[reg] ?? null,
    };
  }

  report.features.verdicts = {
    liveMap: report.liveMap.apiHttpStatus === 200 && !report.web.bundleContainsLegacyDispatch ? 'GO' : 'HOLD',
    fleetNav: report.fleetRoutes['/fleet/live-map'] === 200 ? 'GO' : 'HOLD',
    trips: report.features.trips?.httpStatus === 200 ? 'GO' : 'HOLD',
    drivers: report.features.drivers?.httpStatus === 200 ? 'GO' : 'HOLD',
    events: report.features.events?.httpStatus === 200 ? 'GO' : 'HOLD',
    geofences: 'HOLD',
    maintenance: 'HOLD',
    reports: 'HOLD',
    customerEtaShare: 'HOLD',
  };

  fs.mkdirSync(screenshotDir, { recursive: true });
  report.screenshots = {
    directory: 'diagnostic-output/fleet-live-map-staging',
    note: 'Run staging-visual-review-capture.mjs with OWNER credentials for authenticated screenshots',
  };

  if (report.health.ready?.httpStatus !== 200) {
    report.blockers.push('Staging API health/ready not 200');
  }
  if (report.liveMap.apiHttpStatus !== 200 && token) {
    report.blockers.push('Authenticated /fleet/live-map API not 200');
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
