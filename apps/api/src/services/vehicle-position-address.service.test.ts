import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { vehicleAddressCacheKey } from '@titan/shared';
import { GoogleMapsError } from './google-maps.service.js';
import { VehiclePositionAddressService } from './vehicle-position-address.service.js';

const CAPE_TOWN = { latitude: -33.9249, longitude: 18.4241 };
/** ~1 km from CAPE_TOWN — a material move that must not reuse the cached address. */
const BELLVILLE = { latitude: -33.9349, longitude: 18.4241 };

type ReverseGeocodeCall = { companyId: string; latitude: number; longitude: number };

function fakeGoogleMaps(options?: {
  connected?: boolean;
  geocoding?: boolean;
  reverseGeocode?: (input: { latitude: number; longitude: number }) => unknown;
}) {
  const calls: ReverseGeocodeCall[] = [];
  const connectionCalls: string[] = [];

  const service = {
    async getConnection(companyId: string) {
      connectionCalls.push(companyId);
      return {
        connected: options?.connected ?? true,
        services: { geocoding: options?.geocoding ?? true },
      };
    },
    async reverseGeocode(companyId: string, location: { latitude: number; longitude: number }) {
      calls.push({ companyId, ...location });
      if (options?.reverseGeocode) return options.reverseGeocode(location);
      return {
        placeId: 'place-1',
        formattedAddress: '2 Durban Road, Bellville, Cape Town, 7530, South Africa',
        locationType: 'ROOFTOP',
        street: '2 Durban Road',
        suburb: 'Bellville',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7530',
        country: 'South Africa',
        latitude: location.latitude,
        longitude: location.longitude,
      };
    },
  };

  return { service, calls, connectionCalls };
}

function build(options?: Parameters<typeof fakeGoogleMaps>[0]) {
  const maps = fakeGoogleMaps(options);
  const service = VehiclePositionAddressService.create({
    googleMapsService: maps.service as never,
  });
  return { service, maps };
}

describe('VehiclePositionAddressService', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('reverse-geocodes a position into the preferred readable form', async () => {
    const result = await harness.service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(result.status, 'resolved');
    if (result.status !== 'resolved') return;
    assert.equal(result.address.shortAddress, '2 Durban Road, Bellville, Cape Town');
    assert.equal(result.address.precision, 'precise');
    assert.equal(result.address.source, 'google_maps');
    assert.equal(result.address.resolvedForLatitude, CAPE_TOWN.latitude);
  });

  it('serves a repeat lookup of the same spot from cache', async () => {
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(harness.maps.calls.length, 1);
  });

  it('reuses the cached address while the vehicle stays within the material-move radius', async () => {
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    const nudged = { latitude: CAPE_TOWN.latitude - 0.0002, longitude: CAPE_TOWN.longitude };
    const result = await harness.service.resolveOnePosition('company-1', nudged);

    assert.equal(harness.maps.calls.length, 1);
    assert.equal(result.status, 'resolved');
  });

  it('re-resolves once the vehicle has moved materially', async () => {
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-1', BELLVILLE);

    assert.equal(harness.maps.calls.length, 2);
  });

  it('dedupes concurrent lookups of the same coordinate into one provider call', async () => {
    await Promise.all([
      harness.service.resolveOnePosition('company-1', CAPE_TOWN),
      harness.service.resolveOnePosition('company-1', CAPE_TOWN),
      harness.service.resolveOnePosition('company-1', CAPE_TOWN),
    ]);

    assert.equal(harness.maps.calls.length, 1);
  });

  it('collapses duplicate coordinates within one batch', async () => {
    const results = await harness.service.resolveMany('company-1', [
      CAPE_TOWN,
      CAPE_TOWN,
      { latitude: CAPE_TOWN.latitude, longitude: CAPE_TOWN.longitude },
    ]);

    assert.equal(harness.maps.calls.length, 1);
    assert.equal(results.size, 1);
  });

  it('never serves one company an address cached for another', async () => {
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-2', CAPE_TOWN);

    assert.equal(harness.maps.calls.length, 2);
    assert.deepEqual(
      harness.maps.calls.map((call) => call.companyId),
      ['company-1', 'company-2'],
    );
  });

  it('scopes every provider call to the caller company', async () => {
    await harness.service.resolveMany('company-9', [CAPE_TOWN, BELLVILLE]);
    assert.ok(harness.maps.calls.every((call) => call.companyId === 'company-9'));
    assert.ok(harness.maps.connectionCalls.every((id) => id === 'company-9'));
  });

  it('clears only the requested company from the cache', async () => {
    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-2', CAPE_TOWN);
    harness.service.clearCache('company-1');

    await harness.service.resolveOnePosition('company-1', CAPE_TOWN);
    await harness.service.resolveOnePosition('company-2', CAPE_TOWN);

    assert.equal(harness.maps.calls.length, 3);
  });

  it('rejects an invalid coordinate without calling the provider', async () => {
    const result = await harness.service.resolveOnePosition('company-1', {
      latitude: 200,
      longitude: 18,
    });

    assert.equal(result.status, 'unresolved');
    if (result.status !== 'unresolved') return;
    assert.equal(result.reason, 'invalid_coordinates');
    assert.equal(harness.maps.calls.length, 0);
  });

  it('skips invalid coordinates in a batch but still resolves the valid ones', async () => {
    const results = await harness.service.resolveMany('company-1', [
      { latitude: Number.NaN, longitude: 18 },
      CAPE_TOWN,
    ]);

    assert.equal(results.size, 1);
    assert.equal(harness.maps.calls.length, 1);
  });

  it('reports Google Maps being disconnected instead of attempting a call', async () => {
    const { service, maps } = build({ connected: false });
    const result = await service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(result.status, 'unresolved');
    if (result.status !== 'unresolved') return;
    assert.equal(result.reason, 'maps_not_connected');
    assert.equal(maps.calls.length, 0);
  });

  it('reports geocoding being disabled by name', async () => {
    const { service, maps } = build({ geocoding: false });
    const result = await service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(result.status, 'unresolved');
    if (result.status !== 'unresolved') return;
    assert.equal(result.reason, 'geocoding_disabled');
    assert.equal(maps.calls.length, 0);
  });

  it('reports a zero-result lookup honestly rather than inventing an address', async () => {
    const { service } = build({ reverseGeocode: () => null });
    const result = await service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(result.status, 'unresolved');
    if (result.status !== 'unresolved') return;
    assert.equal(result.reason, 'no_result');
  });

  it('reports a provider failure as a failure and does not retry it immediately', async () => {
    const { service, maps } = build({
      reverseGeocode: () => {
        throw new Error('Google Maps HTTP 500');
      },
    });

    const first = await service.resolveOnePosition('company-1', CAPE_TOWN);
    const second = await service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(first.status, 'unresolved');
    if (first.status !== 'unresolved') return;
    assert.equal(first.reason, 'provider_error');
    assert.equal(second.status, 'unresolved');
    assert.equal(maps.calls.length, 1);
  });

  it('maps a service-disabled provider error to the disabled reason', async () => {
    const { service } = build({
      reverseGeocode: () => {
        throw new GoogleMapsError('SERVICE_DISABLED', 'Geocoding is disabled.');
      },
    });
    const result = await service.resolveOnePosition('company-1', CAPE_TOWN);

    assert.equal(result.status, 'unresolved');
    if (result.status !== 'unresolved') return;
    assert.equal(result.reason, 'geocoding_disabled');
  });

  it('defers lookups beyond the per-batch provider budget and says so', async () => {
    const points = Array.from({ length: 14 }, (_, index) => ({
      // ~1.1 km apart so each is a distinct, non-cacheable coordinate.
      latitude: CAPE_TOWN.latitude - index * 0.01,
      longitude: CAPE_TOWN.longitude,
    }));

    const results = await harness.service.resolveMany('company-1', points);

    assert.equal(harness.maps.calls.length, 10);
    const deferred = points
      .slice(10)
      .map((point) =>
        results.get(vehicleAddressCacheKey('company-1', point.latitude, point.longitude)),
      );
    assert.equal(deferred.length, 4);
    for (const entry of deferred) {
      assert.equal(entry?.status, 'unresolved');
      if (entry?.status !== 'unresolved') continue;
      assert.equal(entry.reason, 'lookup_budget_reached');
    }
  });

  it('returns nothing for an empty batch without touching the provider', async () => {
    const results = await harness.service.resolveMany('company-1', []);
    assert.equal(results.size, 0);
    assert.equal(harness.maps.connectionCalls.length, 0);
  });

  it('marks an unnumbered area match as approximate so it never reads as a property address', async () => {
    const { service } = build({
      reverseGeocode: (location) => ({
        placeId: null,
        formattedAddress: 'Bellville, Cape Town, South Africa',
        locationType: 'APPROXIMATE',
        street: null,
        suburb: 'Bellville',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: null,
        country: 'South Africa',
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    });

    const result = await service.resolveOnePosition('company-1', CAPE_TOWN);
    assert.equal(result.status, 'resolved');
    if (result.status !== 'resolved') return;
    assert.equal(result.address.precision, 'approximate');
    assert.equal(result.address.shortAddress, 'Bellville, Cape Town');
  });
});
