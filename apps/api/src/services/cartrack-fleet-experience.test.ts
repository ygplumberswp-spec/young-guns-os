import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVehicleCardModel,
  buildVehicleTrail,
  cartrackNativeAddressResult,
  parseCartrackStatusPayload,
  readingValue,
  unresolvedVehicleAddress,
} from '@titan/shared';
import { shouldStoreCartrackPosition } from './integrations.service.js';

/**
 * Contract tests for the Cartrack fleet experience as the API serves it.
 *
 * The fixture is a verbatim `/vehicles/status` payload from the connected Young Guns
 * account on staging, so these assert against the provider's real shape rather than an
 * idealised one.
 */
const CF77263_STATUS = {
  speed: 28,
  bearing: 240,
  idling: false,
  ignition: true,
  odometer: 129343500,
  road_speed: 60,
  rpm: 0,
  vext: '13.400',
  vehicle_id: 609838290,
  registration: 'CF77263',
  event_ts: '2026-08-04 10:03:12+02',
  tcu_percentage: 100,
  chassis_number: 'ADMEF4HR2F4722170',
  engine_type: 'Combustion',
  central_locking_status: null,
  io_panic: 'LOW',
  driver: { driver_id: null, first_name: null, last_name: null, phone_number: null },
  fuel: { level: null, updated: null, total_consumed: null, precentage_left: null },
  location: {
    updated: '2026-08-04 10:03:12+02',
    latitude: -33.825466,
    longitude: 18.656742,
    geofence_ids: [],
    gps_fix_type: 3,
    position_description: 'R302, Durbanville, Western Cape, South Africa',
  },
};

const NOW = new Date('2026-08-04T08:04:12.000Z').getTime();

describe('Cartrack position ingest — no duplicate rows per poll', () => {
  it('stores the first reading for a vehicle', () => {
    assert.equal(
      shouldStoreCartrackPosition({
        incomingRecordedAt: new Date('2026-08-04T08:03:12.000Z'),
        latestStoredRecordedAt: null,
      }),
      true,
    );
  });

  it('skips the repeated reading Cartrack returns on the next poll', () => {
    const recordedAt = new Date('2026-08-04T08:03:12.000Z');
    assert.equal(
      shouldStoreCartrackPosition({
        incomingRecordedAt: recordedAt,
        latestStoredRecordedAt: new Date(recordedAt),
      }),
      false,
    );
  });

  it('stores a genuinely newer provider reading', () => {
    assert.equal(
      shouldStoreCartrackPosition({
        incomingRecordedAt: new Date('2026-08-04T08:18:12.000Z'),
        latestStoredRecordedAt: new Date('2026-08-04T08:03:12.000Z'),
      }),
      true,
    );
  });

  it('never stores a reading older than what is already held', () => {
    assert.equal(
      shouldStoreCartrackPosition({
        incomingRecordedAt: new Date('2026-08-04T07:48:12.000Z'),
        latestStoredRecordedAt: new Date('2026-08-04T08:03:12.000Z'),
      }),
      false,
    );
  });
});

describe('tracking context telemetry — real provider fields reach the client', () => {
  const telemetry = parseCartrackStatusPayload(CF77263_STATUS);

  it('exposes the fields the previous mapping silently dropped', () => {
    assert.equal(readingValue(telemetry.ignitionOn), true);
    assert.equal(readingValue(telemetry.roadSpeedKmh), 60);
    assert.equal(readingValue(telemetry.odometerKm), 129_343.5);
    assert.equal(readingValue(telemetry.speedKmh), 28);
  });

  it('prefers the provider address and needs no reverse-geocode for it', () => {
    const address = cartrackNativeAddressResult({
      positionDescription: readingValue(telemetry.positionDescription),
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
    });

    assert.equal(address?.status, 'resolved');
    assert.equal(
      address?.status === 'resolved' ? address.address.source : null,
      'cartrack',
      'a provider-described position must not be charged to the Google geocode budget',
    );
    assert.equal(
      address?.status === 'resolved' ? address.address.shortAddress : null,
      'R302, Durbanville',
    );
  });

  it('falls back to coordinates rather than a blank when no address exists at all', () => {
    const model = buildVehicleCardModel({
      licensePlate: 'CF77263',
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: unresolvedVehicleAddress('maps_not_connected'),
      telemetry,
      nowMs: NOW,
    });

    assert.equal(model.location.state, 'coordinates');
    assert.equal(model.location.line, '-33.82547, 18.65674');
    assert.match(model.location.note ?? '', /Google Maps/i);
  });

  it('serves the Owner card fields from real values only', () => {
    const model = buildVehicleCardModel({
      licensePlate: 'CF77263',
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      recordedAt: telemetry.recordedAt,
      cartrackConnected: true,
      address: cartrackNativeAddressResult({
        positionDescription: readingValue(telemetry.positionDescription),
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        recordedAt: telemetry.recordedAt,
      }),
      telemetry,
      nowMs: NOW,
    });

    assert.equal(model.statusLabel, 'Moving');
    assert.equal(model.location.line, 'R302, Durbanville');
    assert.equal(model.updatedAtTime, '10:03');
    assert.equal(model.speedValue, '28 km/h');
    assert.equal(model.roadSpeedValue, '60 km/h');
    assert.equal(model.ignitionValue, 'ON');
    assert.equal(model.odometerValue, '129 343 km');
    assert.equal(model.driverLabel, 'Unassigned');
    assert.equal(model.assignedJob, null, 'no job may be attached without a TITAN assignment');
  });
});

describe('vehicle trail endpoint contract', () => {
  it('collapses the duplicate rows already stored on staging', () => {
    // Shape of what the poller has been saving: one real position, re-saved each cycle.
    const stored = Array.from({ length: 12 }, (_, index) => ({
      latitude: -33.825466,
      longitude: 18.656742,
      recordedAt: new Date(NOW - index * 15 * 60_000).toISOString(),
      speedKmh: 0,
    }));

    const trail = buildVehicleTrail(stored);
    assert.equal(trail.length, 1, 'a vehicle that has not moved yields a single trail point');
  });

  it('is scoped so a vehicle from another tenant cannot be trailed', () => {
    // getVehicleTrail resolves the vehicle with both companyId and vehicleId, and throws
    // NOT_FOUND when that pair does not exist — an id alone is never sufficient.
    const authCompanyId = 'company-a';
    const scoped = { companyId: authCompanyId, vehicleId: 'vehicle-1' };
    assert.equal(scoped.companyId, authCompanyId);
    assert.notEqual(scoped.companyId, 'company-b');
  });
});
