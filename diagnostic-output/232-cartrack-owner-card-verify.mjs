/**
 * Renders the Owner's Fleet Overview row and expanded vehicle card for every mapped
 * Cartrack vehicle on staging, using the real shared code paths against the real stored
 * provider payloads. Read-only: it opens no write transaction and touches no Xero table.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  buildFleetOverviewRow,
  buildVehicleCardDetailRows,
  buildVehicleCardModel,
  buildVehicleTrail,
  cartrackNativeAddressResult,
  describeFollowMode,
  describeVehicleTrail,
  followModeReducer,
  initialFollowModeState,
  parseCartrackStatusPayload,
  readingValue,
  unresolvedVehicleAddress,
} from '../packages/shared/dist/index.js';

function stagingDatabaseUrl() {
  const env = readFileSync(new URL('../apps/api/.env.staging.local', import.meta.url), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in .env.staging.local');
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}

const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const postgres = require('postgres');
const sql = postgres(stagingDatabaseUrl(), { ssl: 'require', max: 1 });

const report = { generatedAt: new Date().toISOString(), vehicles: [] };

const mapped = await sql`
  SELECT m.company_id, m.vehicle_id, m.external_vehicle_id, v.license_plate, v.name,
         v.assigned_user_id
  FROM integration_vehicle_mappings m
  JOIN integration_connections c ON c.id = m.integration_connection_id
  LEFT JOIN vehicles v ON v.id = m.vehicle_id
  WHERE c.provider = 'cartrack' AND m.status = 'mapped' AND m.vehicle_id IS NOT NULL
  ORDER BY v.license_plate
`;

for (const vehicle of mapped) {
  const latest = await sql`
    SELECT latitude, longitude, speed_kmh, heading, recorded_at, raw_payload
      FROM gps_positions
     WHERE company_id = ${vehicle.company_id} AND vehicle_id = ${vehicle.vehicle_id}
     ORDER BY recorded_at DESC
     LIMIT 1
  `;

  if (latest.length === 0) {
    report.vehicles.push({ plate: vehicle.license_plate, error: 'no stored positions' });
    continue;
  }

  const row = latest[0];
  const telemetry = parseCartrackStatusPayload(row.raw_payload);
  const recordedAt = new Date(row.recorded_at).toISOString();

  // Exactly the resolution order the API uses.
  const address =
    cartrackNativeAddressResult({
      positionDescription: readingValue(telemetry.positionDescription),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      recordedAt,
    }) ?? unresolvedVehicleAddress('not_attempted');

  const assignedJobRows = await sql`
    SELECT j.id, j.job_number, j.title
      FROM job_vehicle_assignments a
      JOIN jobs j ON j.id = a.job_id
     WHERE a.company_id = ${vehicle.company_id} AND a.vehicle_id = ${vehicle.vehicle_id}
       AND a.unassigned_at IS NULL
       AND j.status NOT IN ('completed','cancelled')
     ORDER BY a.assigned_at DESC LIMIT 1
  `;

  let assignedUserName = null;
  if (vehicle.assigned_user_id) {
    const userRows = await sql`SELECT full_name FROM users WHERE id = ${vehicle.assigned_user_id}`;
    assignedUserName = userRows[0]?.full_name ?? null;
  }

  const model = buildVehicleCardModel({
    licensePlate: vehicle.license_plate,
    vehicleName: vehicle.name,
    externalVehicleId: vehicle.external_vehicle_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    recordedAt,
    cartrackConnected: true,
    address,
    telemetry,
    assignedUserName,
    assignedJob: assignedJobRows[0]
      ? {
          id: assignedJobRows[0].id,
          reference:
            [assignedJobRows[0].job_number, assignedJobRows[0].title]
              .filter(Boolean)
              .join(' · ') || assignedJobRows[0].id,
        }
      : null,
  });

  const history = await sql`
    SELECT latitude, longitude, recorded_at, speed_kmh
      FROM gps_positions
     WHERE company_id = ${vehicle.company_id} AND vehicle_id = ${vehicle.vehicle_id}
     ORDER BY recorded_at DESC LIMIT 500
  `;
  const trail = buildVehicleTrail(
    history.map((h) => ({
      latitude: Number(h.latitude),
      longitude: Number(h.longitude),
      recordedAt: new Date(h.recorded_at).toISOString(),
      speedKmh: h.speed_kmh,
    })),
  );

  const followed = followModeReducer(initialFollowModeState, {
    type: 'follow',
    vehicleId: vehicle.vehicle_id,
    label: vehicle.license_plate,
  });
  const followStatus = describeFollowMode({
    state: followed,
    vehicleId: vehicle.vehicle_id,
    recordedAt,
    cartrackConnected: true,
    uiRefreshIntervalMs: 15_000,
    lastSuccessfulRefreshAt: new Date().toISOString(),
  });
  const pausedStatus = describeFollowMode({
    state: followModeReducer(followed, { type: 'manual_map_move' }),
    vehicleId: vehicle.vehicle_id,
    recordedAt,
    cartrackConnected: true,
  });

  const overview = buildFleetOverviewRow(model);

  report.vehicles.push({
    plate: model.plate,
    storedRowCount: history.length,
    distinctTrailPoints: trail.length,
    ownerOverviewRow: [
      `[${model.statusTone}] ${overview.plate}`,
      overview.driverLine,
      overview.statusLine,
      overview.speedLine,
      overview.locationLine,
      overview.updatedLine,
    ].filter(Boolean),
    ownerExpandedCard: [
      `[${model.statusTone}] ${model.plate}`,
      '',
      model.statusLabel,
      model.location.line,
      model.locationArea,
      '',
      ...buildVehicleCardDetailRows(model).map((d) => `${d.label}: ${d.value}`),
      '',
      `Driver: ${model.driverLabel}`,
      `Assigned Job: ${model.assignedJob ? model.assignedJob.reference : 'None'}`,
    ],
    honesty: {
      freshness: model.freshnessLabel,
      addressState: model.location.state,
      addressSource: address.status === 'resolved' ? address.address.source : null,
      addressNote: model.location.note,
      coordinatesSecondary: model.coordinates,
      holdingLastKnownPosition: model.holdingLastKnownPosition,
      updatedAgo: model.updatedAgoLabel,
    },
    followMode: {
      whileFollowing: followStatus.cameraNote,
      refreshNote: followStatus.refreshNote,
      afterManualDrag: pausedStatus.cameraNote,
      trail: describeVehicleTrail(trail),
    },
    omittedBecauseProviderDidNotSupply: Object.entries({
      roadSpeed: model.roadSpeedValue,
      ignition: model.ignitionValue,
      odometer: model.odometerValue,
      speed: model.speedValue,
    })
      .filter(([, value]) => value === null)
      .map(([key]) => key),
  });
}

await sql.end();
console.log(JSON.stringify(report, null, 2));
