import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VEHICLE_ADDRESS_MATERIAL_MOVE_METERS,
  buildSmsShareUrl,
  buildVehiclePositionNavigateUrl,
  buildVehiclePositionShareMessage,
  buildWhatsappShareUrl,
  deriveVehicleAddressPrecision,
  distanceBetweenCoordinatesMeters,
  formatVehicleAddressLine,
  formatVehicleIgnitionLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionFreshness,
  resolveVehicleNavigateWarning,
  resolveVehiclePositionAddressDisplay,
  unresolvedVehicleAddress,
  vehicleAddressCacheKey,
  type VehiclePositionAddress,
  type VehiclePositionAddressResult,
} from './vehicle-position-address.js';

const CAPE_TOWN = { latitude: -33.9249, longitude: 18.4241 };
const NOW = new Date('2026-08-04T10:00:00.000Z').getTime();

function address(overrides: Partial<VehiclePositionAddress> = {}): VehiclePositionAddress {
  return {
    formattedAddress: '2 Durban Road, Bellville, Cape Town, 7530, South Africa',
    shortAddress: '2 Durban Road, Bellville, Cape Town',
    street: '2 Durban Road',
    suburb: 'Bellville',
    city: 'Cape Town',
    placeId: 'place-123',
    precision: 'precise',
    resolvedForLatitude: CAPE_TOWN.latitude,
    resolvedForLongitude: CAPE_TOWN.longitude,
    resolvedAt: new Date(NOW).toISOString(),
    source: 'google_maps',
    ...overrides,
  };
}

function resolved(overrides: Partial<VehiclePositionAddress> = {}): VehiclePositionAddressResult {
  return { status: 'resolved', address: address(overrides) };
}

describe('vehicle address line formatting', () => {
  it('prefers street number + street, suburb, city', () => {
    assert.equal(
      formatVehicleAddressLine({
        street: '2 Durban Road',
        suburb: 'Bellville',
        city: 'Cape Town',
        formattedAddress: '2 Durban Road, Bellville, Cape Town, 7530, South Africa',
      }),
      '2 Durban Road, Bellville, Cape Town',
    );
  });

  it('drops a suburb that duplicates the city', () => {
    assert.equal(
      formatVehicleAddressLine({ street: '5 Long Street', suburb: 'Cape Town', city: 'Cape Town' }),
      '5 Long Street, Cape Town',
    );
  });

  it('falls back to the provider formatted address when components are missing', () => {
    assert.equal(
      formatVehicleAddressLine({ formattedAddress: 'N1 Highway, Western Cape' }),
      'N1 Highway, Western Cape',
    );
    assert.equal(formatVehicleAddressLine({}), null);
  });
});

describe('vehicle address precision', () => {
  it('treats a numbered rooftop match as precise', () => {
    assert.equal(
      deriveVehicleAddressPrecision({ locationType: 'ROOFTOP', street: '2 Durban Road' }),
      'precise',
    );
    assert.equal(
      deriveVehicleAddressPrecision({
        locationType: 'RANGE_INTERPOLATED',
        street: '14 Voortrekker Road',
      }),
      'precise',
    );
  });

  it('never calls an area match or an unnumbered street precise', () => {
    assert.equal(
      deriveVehicleAddressPrecision({ locationType: 'APPROXIMATE', street: '2 Durban Road' }),
      'approximate',
    );
    assert.equal(
      deriveVehicleAddressPrecision({ locationType: 'GEOMETRIC_CENTER', street: 'Durban Road' }),
      'approximate',
    );
    assert.equal(
      deriveVehicleAddressPrecision({ locationType: 'ROOFTOP', street: 'Durban Road' }),
      'approximate',
    );
    assert.equal(deriveVehicleAddressPrecision({ locationType: null, street: null }), 'approximate');
  });
});

describe('vehicle address display honesty', () => {
  const fresh = new Date(NOW - 18_000).toISOString();
  const old = new Date(NOW - 45 * 60_000).toISOString();

  it('shows a precise fresh address plainly', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt: fresh,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(display.state, 'precise');
    assert.equal(display.line, '2 Durban Road, Bellville, Cape Town');
    assert.equal(display.note, null);
    assert.equal(display.isExactAndCurrent, true);
  });

  it('prefixes an approximate match with Near', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved({ precision: 'approximate' }),
      ...CAPE_TOWN,
      recordedAt: fresh,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(display.state, 'approximate');
    assert.match(display.line, /^Near /);
    assert.equal(display.isExactAndCurrent, false);
  });

  it('labels a stale position as last known and never as live', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt: old,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(display.state, 'stale');
    assert.match(display.line, /^Last known address: /);
    assert.match(display.note ?? '', /not a live location/i);
    assert.doesNotMatch(display.line, /\b(live|current|now|real-time|tracking)\b/i);
    assert.equal(display.isExactAndCurrent, false);
  });

  it('treats every position as stale while Cartrack is disconnected', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt: fresh,
      cartrackConnected: false,
      nowMs: NOW,
    });
    assert.equal(display.state, 'stale');
  });

  it('falls back to coordinates with the real reason when geocoding produced nothing', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: unresolvedVehicleAddress('no_result'),
      ...CAPE_TOWN,
      recordedAt: fresh,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(display.state, 'coordinates');
    assert.equal(display.line, '-33.92490, 18.42410');
    assert.match(display.note ?? '', /no address for this coordinate/i);
  });

  it('names Google Maps being disconnected rather than showing a blank', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: unresolvedVehicleAddress('maps_not_connected'),
      ...CAPE_TOWN,
      recordedAt: fresh,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(display.state, 'coordinates');
    assert.match(display.note ?? '', /Google Maps is not connected/i);
  });

  it('reports position unavailable when no usable coordinate exists', () => {
    for (const bad of [
      { latitude: null, longitude: null },
      { latitude: 91, longitude: 18 },
      { latitude: Number.NaN, longitude: 18 },
    ]) {
      const display = resolveVehiclePositionAddressDisplay({
        result: resolved(),
        latitude: bad.latitude,
        longitude: bad.longitude,
        recordedAt: fresh,
        cartrackConnected: true,
        nowMs: NOW,
      });
      assert.equal(display.state, 'unavailable');
      assert.equal(display.line, 'Position unavailable');
    }
  });
});

describe('movement, ignition and freshness labels', () => {
  it('derives movement from real speed only', () => {
    assert.equal(formatVehicleMotionLabel(62), 'Moving · 62 km/h');
    assert.equal(formatVehicleMotionLabel(0), 'Stationary');
    assert.equal(formatVehicleMotionLabel(null), 'Movement unknown');
    assert.equal(formatVehicleMotionLabel(undefined), 'Movement unknown');
  });

  it('never infers ignition from speed', () => {
    assert.equal(formatVehicleIgnitionLabel(true), 'Ignition on');
    assert.equal(formatVehicleIgnitionLabel(false), 'Ignition off');
    assert.equal(formatVehicleIgnitionLabel(null), 'Ignition unknown');
  });

  it('states the age of the provider timestamp', () => {
    assert.equal(formatVehiclePositionFreshness(new Date(NOW - 18_000).toISOString(), NOW), 'Updated 18 seconds ago');
    assert.equal(formatVehiclePositionFreshness(new Date(NOW - 1_000).toISOString(), NOW), 'Updated 1 second ago');
    assert.equal(formatVehiclePositionFreshness(new Date(NOW - 5 * 60_000).toISOString(), NOW), 'Updated 5 minutes ago');
    assert.equal(formatVehiclePositionFreshness(new Date(NOW - 3 * 3_600_000).toISOString(), NOW), 'Updated 3 hours ago');
    assert.equal(formatVehiclePositionFreshness(new Date(NOW - 2 * 86_400_000).toISOString(), NOW), 'Updated 2 days ago');
    assert.equal(formatVehiclePositionFreshness(null, NOW), 'Position time unknown');
  });
});

describe('navigate and share', () => {
  it('builds a directions deep link from real coordinates only', () => {
    assert.equal(
      buildVehiclePositionNavigateUrl(CAPE_TOWN),
      'https://www.google.com/maps/dir/?api=1&destination=-33.9249,18.4241',
    );
    assert.equal(buildVehiclePositionNavigateUrl({ latitude: null, longitude: null }), null);
    assert.equal(buildVehiclePositionNavigateUrl({ latitude: 200, longitude: 18 }), null);
  });

  it('shares the plate, destination, coordinate and age — and nothing else', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt: new Date(NOW - 18_000).toISOString(),
      cartrackConnected: true,
      nowMs: NOW,
    });
    const message = buildVehiclePositionShareMessage({
      licensePlate: 'CA 123-456',
      vehicleName: 'Bakkie 1',
      ...CAPE_TOWN,
      recordedAt: new Date(NOW - 18_000).toISOString(),
      display,
      nowMs: NOW,
    });

    assert.ok(message);
    assert.match(message, /CA 123-456/);
    assert.match(message, /2 Durban Road, Bellville, Cape Town/);
    assert.match(message, /Updated 18 seconds ago/);
    assert.match(message, /destination=-33\.9249,18\.4241/);
    // No customer, job, driver or provider identity leaks into the share text.
    assert.doesNotMatch(message, /driver|customer|job|cartrack|api[_-]?key/i);
  });

  it('carries the stale warning into the shared message', () => {
    const recordedAt = new Date(NOW - 45 * 60_000).toISOString();
    const display = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt,
      cartrackConnected: true,
      nowMs: NOW,
    });
    const message = buildVehiclePositionShareMessage({
      licensePlate: 'CA 123-456',
      ...CAPE_TOWN,
      recordedAt,
      display,
      nowMs: NOW,
    });
    assert.match(message ?? '', /not a live location/i);
  });

  it('produces no share text without a usable coordinate', () => {
    const display = resolveVehiclePositionAddressDisplay({
      result: null,
      latitude: null,
      longitude: null,
      recordedAt: null,
      cartrackConnected: true,
      nowMs: NOW,
    });
    assert.equal(
      buildVehiclePositionShareMessage({
        licensePlate: 'CA 123-456',
        latitude: null,
        longitude: null,
        recordedAt: null,
        display,
      }),
      null,
    );
  });

  it('builds channel deep links only from real text', () => {
    assert.equal(buildWhatsappShareUrl('hello there'), 'https://wa.me/?text=hello%20there');
    assert.equal(buildSmsShareUrl('hello there'), 'sms:?&body=hello%20there');
    assert.equal(buildWhatsappShareUrl(null), null);
    assert.equal(buildSmsShareUrl('   '), null);
  });
});

describe('navigate warnings', () => {
  const display = resolveVehiclePositionAddressDisplay({
    result: resolved(),
    ...CAPE_TOWN,
    recordedAt: new Date(NOW - 10_000).toISOString(),
    cartrackConnected: true,
    nowMs: NOW,
  });

  it('warns when the vehicle was moving', () => {
    const warning = resolveVehicleNavigateWarning({
      display,
      speedKmh: 62,
      recordedAt: new Date(NOW - 10_000).toISOString(),
      nowMs: NOW,
    });
    assert.match(warning ?? '', /moving at 62 km\/h/);
  });

  it('says movement is unknown rather than claiming stationary', () => {
    const warning = resolveVehicleNavigateWarning({
      display,
      speedKmh: null,
      recordedAt: new Date(NOW - 10_000).toISOString(),
      nowMs: NOW,
    });
    assert.match(warning ?? '', /Movement cannot be confirmed/i);
  });

  it('has no warning for a fresh stationary position', () => {
    assert.equal(
      resolveVehicleNavigateWarning({
        display,
        speedKmh: 0,
        recordedAt: new Date(NOW - 10_000).toISOString(),
        nowMs: NOW,
      }),
      null,
    );
  });

  it('warns on a stale position with its age', () => {
    const recordedAt = new Date(NOW - 45 * 60_000).toISOString();
    const staleDisplay = resolveVehiclePositionAddressDisplay({
      result: resolved(),
      ...CAPE_TOWN,
      recordedAt,
      cartrackConnected: true,
      nowMs: NOW,
    });
    const warning = resolveVehicleNavigateWarning({
      display: staleDisplay,
      speedKmh: 0,
      recordedAt,
      nowMs: NOW,
    });
    assert.match(warning ?? '', /not a live location/i);
    assert.match(warning ?? '', /Updated 45 minutes ago/);
  });
});

describe('address cache keying', () => {
  it('collapses repeated polls of one spot onto a single key', () => {
    assert.equal(
      vehicleAddressCacheKey('company-1', -33.92491, 18.42412),
      vehicleAddressCacheKey('company-1', -33.92489, 18.42408),
    );
  });

  it('never shares a key across companies', () => {
    assert.notEqual(
      vehicleAddressCacheKey('company-1', -33.9249, 18.4241),
      vehicleAddressCacheKey('company-2', -33.9249, 18.4241),
    );
  });

  it('measures real distance so a material move forces a refresh', () => {
    const nearby = { latitude: -33.92512, longitude: 18.4241 };
    const faraway = { latitude: -33.9349, longitude: 18.4241 };
    assert.ok(distanceBetweenCoordinatesMeters(CAPE_TOWN, nearby) < VEHICLE_ADDRESS_MATERIAL_MOVE_METERS);
    assert.ok(distanceBetweenCoordinatesMeters(CAPE_TOWN, faraway) > VEHICLE_ADDRESS_MATERIAL_MOVE_METERS);
    assert.equal(distanceBetweenCoordinatesMeters(CAPE_TOWN, CAPE_TOWN), 0);
  });
});
