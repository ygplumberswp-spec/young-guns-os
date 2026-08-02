import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleMapsClient } from './google-maps.client.js';

describe('GoogleMapsClient', () => {
  it('parses geocode results without inventing coordinates', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                place_id: 'place-1',
                formatted_address: '12 Main Rd, Observatory, Cape Town',
                geometry: { location: { lat: -33.927, lng: 18.468 } },
                address_components: [
                  { long_name: '12', short_name: '12', types: ['street_number'] },
                  { long_name: 'Main Rd', short_name: 'Main Rd', types: ['route'] },
                  { long_name: 'Observatory', short_name: 'Observatory', types: ['sublocality'] },
                  { long_name: 'Cape Town', short_name: 'Cape Town', types: ['locality'] },
                  {
                    long_name: 'Western Cape',
                    short_name: 'WC',
                    types: ['administrative_area_level_1'],
                  },
                  { long_name: '7925', short_name: '7925', types: ['postal_code'] },
                  { long_name: 'South Africa', short_name: 'ZA', types: ['country'] },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const result = await client.geocodeAddress('12 Main Rd, Observatory');
    assert.ok(result);
    assert.equal(result.placeId, 'place-1');
    assert.equal(result.latitude, -33.927);
    assert.equal(result.longitude, 18.468);
    assert.equal(result.suburb, 'Observatory');
  });

  it('returns null for ZERO_RESULTS instead of inventing a pin', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const result = await client.geocodeAddress('not-a-real-place-zzzz');
    assert.equal(result, null);
  });

  it('parses Distance Matrix traffic-aware duration', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'OK',
            rows: [
              {
                elements: [
                  {
                    status: 'OK',
                    distance: { value: 5200, text: '5.2 km' },
                    duration: { value: 900, text: '15 mins' },
                    duration_in_traffic: { value: 1140, text: '19 mins' },
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const result = await client.distanceMatrix({
      origin: { latitude: -33.92, longitude: 18.42 },
      destination: { latitude: -33.93, longitude: 18.46 },
    });
    assert.ok(result);
    assert.equal(result.source, 'google_maps');
    assert.equal(result.durationInTrafficSeconds, 1140);
    assert.equal(result.distanceMeters, 5200);
  });

  it('reverse geocodes from real coordinates only', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                place_id: 'rev-1',
                formatted_address: 'Cape Town City Hall',
                geometry: { location: { lat: -33.9249, lng: 18.4241 } },
                address_components: [
                  { long_name: 'Cape Town', short_name: 'Cape Town', types: ['locality'] },
                  { long_name: 'South Africa', short_name: 'ZA', types: ['country'] },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const result = await client.reverseGeocode({ latitude: -33.9249, longitude: 18.4241 });
    assert.ok(result);
    assert.equal(result.placeId, 'rev-1');
    assert.equal(result.city, 'Cape Town');
  });

  it('probes services independently and marks disabled ones without failing others', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/geocode/')) {
          return new Response(
            JSON.stringify({
              status: 'OK',
              results: [
                {
                  place_id: 'probe',
                  formatted_address: 'Cape Town',
                  geometry: { location: { lat: -33.92, lng: 18.42 } },
                  address_components: [],
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('places.googleapis.com') || url.includes('routes.googleapis.com')) {
          return new Response(
            JSON.stringify({
              error: {
                message: 'This API project is not authorized to use this API.',
                status: 'PERMISSION_DENIED',
              },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/place/autocomplete')) {
          return new Response(
            JSON.stringify({
              status: 'REQUEST_DENIED',
              error_message: 'This API project is not authorized to use this API.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'denied' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const probes = await client.probeServices({
      places: true,
      geocoding: true,
      routes: true,
      directions: false,
      distanceMatrix: false,
      mapsJavascript: true,
    });

    const geocoding = probes.find((p) => p.service === 'geocoding');
    const places = probes.find((p) => p.service === 'places');
    const routes = probes.find((p) => p.service === 'routes');
    const directions = probes.find((p) => p.service === 'directions');
    const mapsJs = probes.find((p) => p.service === 'mapsJavascript');

    assert.equal(geocoding?.status, 'available');
    assert.equal(places?.status, 'unavailable');
    assert.equal(places?.keyStatus, 'restricted');
    assert.equal(routes?.status, 'unavailable');
    assert.equal(directions?.status, 'disabled');
    assert.equal(mapsJs?.status, 'skipped');
  });

  it('parses Routes API computeRoutes response', async () => {
    const client = new GoogleMapsClient({
      apiKey: 'test-key',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 4800,
                duration: '960s',
                polyline: { encodedPolyline: 'abc123' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const result = await client.computeRoutes({
      origin: { latitude: -33.92, longitude: 18.42 },
      destination: { latitude: -33.93, longitude: 18.46 },
    });
    assert.ok(result);
    assert.equal(result.distanceMeters, 4800);
    assert.equal(result.durationSeconds, 960);
    assert.equal(result.polyline, 'abc123');
    assert.equal(result.source, 'google_maps');
  });
});
