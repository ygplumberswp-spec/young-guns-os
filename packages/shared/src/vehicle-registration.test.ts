import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMappingReviewCategory,
  matchVehicleByRegistration,
  normalizeVehicleRegistration,
} from './vehicle-registration.js';

test('normalizeVehicleRegistration trims, lowercases, and strips separators', () => {
  assert.equal(normalizeVehicleRegistration(' CF172047 '), 'cf172047');
  assert.equal(normalizeVehicleRegistration('CF-172-047'), 'cf172047');
  assert.equal(normalizeVehicleRegistration('cf77263'), 'cf77263');
});

test('matchVehicleByRegistration returns unique match for CF172047 and CF77263', () => {
  const vehicles = [
    { id: 'v1', licensePlate: 'CF172047' },
    { id: 'v2', licensePlate: 'CF77263' },
  ];

  const match172047 = matchVehicleByRegistration(vehicles, 'cf-172-047');
  assert.equal(match172047.kind, 'unique');
  if (match172047.kind === 'unique') {
    assert.equal(match172047.vehicleId, 'v1');
  }

  const match77263 = matchVehicleByRegistration(vehicles, 'CF77263');
  assert.equal(match77263.kind, 'unique');
  if (match77263.kind === 'unique') {
    assert.equal(match77263.vehicleId, 'v2');
  }
});

test('matchVehicleByRegistration returns ambiguous for duplicate normalised plates', () => {
  const vehicles = [
    { id: 'v1', licensePlate: 'CF172047' },
    { id: 'v2', licensePlate: 'CF-172-047' },
  ];

  const match = matchVehicleByRegistration(vehicles, 'CF172047');
  assert.equal(match.kind, 'ambiguous');
});

test('matchVehicleByRegistration returns none when no plate matches', () => {
  const vehicles = [{ id: 'v1', licensePlate: 'ABC123' }];
  assert.equal(matchVehicleByRegistration(vehicles, 'CF172047').kind, 'none');
});

test('deriveMappingReviewCategory labels auto mapped and ambiguous rows', () => {
  assert.equal(
    deriveMappingReviewCategory({
      status: 'mapped',
      vehicleId: 'v1',
      match: { kind: 'unique', vehicleId: 'v1' },
    }),
    'auto_matched',
  );

  assert.equal(
    deriveMappingReviewCategory({
      status: 'unmapped',
      vehicleId: null,
      match: { kind: 'ambiguous', vehicleIds: ['v1', 'v2'] },
    }),
    'ambiguous_match',
  );

  assert.equal(
    deriveMappingReviewCategory({
      status: 'unmapped',
      vehicleId: null,
      match: { kind: 'none' },
    }),
    'no_titan_vehicle',
  );
});
