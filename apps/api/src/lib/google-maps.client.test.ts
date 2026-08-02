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
});
