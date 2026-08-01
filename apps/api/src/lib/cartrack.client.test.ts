import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVehicleRecords,
  parseVehicleStatusRecords,
} from '../lib/cartrack.client.js';

test('parseVehicleRecords prefers vehicle_id over registration', () => {
  const records = parseVehicleRecords({
    data: [
      {
        vehicle_id: '991122',
        registration: 'CF172047',
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.externalVehicleId, '991122');
  assert.equal(records[0]?.externalRegistration, 'CF172047');
});

test('parseVehicleStatusRecords reads nested location and registration fallback id', () => {
  const records = parseVehicleStatusRecords({
    status: [
      {
        registration: 'CF77263',
        location: {
          Latitude: -26.107,
          Longitude: 28.056,
        },
        speed: 42,
        ignition_on: true,
        updated_location_ts: '2026-08-01T18:00:00.000Z',
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.externalVehicleId, 'CF77263');
  assert.equal(records[0]?.externalRegistration, 'CF77263');
  assert.equal(records[0]?.latitude, -26.107);
  assert.equal(records[0]?.longitude, 28.056);
  assert.equal(records[0]?.speedKmh, 42);
  assert.equal(records[0]?.ignitionOn, true);
});

test('parseVehicleStatusRecords matches Cartrack vehicle_id keyed status rows', () => {
  const records = parseVehicleStatusRecords({
    vehicles: [
      {
        vehicle_id: '445566',
        registration: 'CF172047',
        latitude: -25.99,
        longitude: 28.12,
        speed_kmh: 0,
        ignitionOn: false,
        timestamp: '2026-08-01T18:05:00.000Z',
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.externalVehicleId, '445566');
  assert.equal(records[0]?.externalRegistration, 'CF172047');
});
