import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsNavigateUrl,
  buildGoogleMapsPlaceUrl,
  buildGoogleStreetViewUrl,
  classifyGoogleMapsApiStatus,
  formatLatLngCoordinates,
  isValidLatLng,
  summarizeGoogleMapsServiceProbes,
  type GoogleMapsServiceProbe,
} from './google-maps.js';

describe('google-maps helpers', () => {
  it('builds navigate URLs from placeId, coords, or address only', () => {
    assert.ok(
      buildGoogleMapsNavigateUrl({ placeId: 'abc123' })?.includes('destination_place_id=abc123'),
    );
    assert.ok(
      buildGoogleMapsNavigateUrl({ latitude: -33.9, longitude: 18.4 })?.includes('-33.9,18.4'),
    );
    assert.ok(
      buildGoogleMapsNavigateUrl({ address: 'Observatory, Cape Town' })?.includes('Observatory'),
    );
    assert.equal(buildGoogleMapsNavigateUrl({}), null);
  });

  it('builds place, Street View, and coordinate labels only from real data', () => {
    assert.ok(
      buildGoogleMapsPlaceUrl({ placeId: 'ChIJplace' })?.includes('query_place_id=ChIJplace'),
    );
    assert.ok(
      buildGoogleStreetViewUrl({ latitude: -33.9249, longitude: 18.4241 })?.includes(
        'viewpoint=-33.9249,18.4241',
      ),
    );
    assert.equal(buildGoogleStreetViewUrl({ latitude: null, longitude: null }), null);
    assert.equal(formatLatLngCoordinates(-33.9249, 18.4241, 4), '-33.9249, 18.4241');
    assert.equal(formatLatLngCoordinates(null, null), null);
  });

  it('validates lat/lng ranges and rejects invented NaN', () => {
    assert.equal(isValidLatLng(-33.9, 18.4), true);
    assert.equal(isValidLatLng(91, 0), false);
    assert.equal(isValidLatLng(Number.NaN, 18), false);
    assert.equal(isValidLatLng(null, null), false);
  });

  it('classifies restricted / expired / billing key failures honestly', () => {
    assert.equal(classifyGoogleMapsApiStatus('REQUEST_DENIED', 'API keys with referer restrictions'), 'restricted');
    assert.equal(classifyGoogleMapsApiStatus('REQUEST_DENIED', 'API key expired'), 'expired');
    assert.equal(
      classifyGoogleMapsApiStatus('OVER_DAILY_LIMIT', 'Billing has not been enabled'),
      'billing_disabled',
    );
    assert.equal(classifyGoogleMapsApiStatus('OK'), 'configured');
  });

  it('summarises probes without failing the whole integration for one disabled API', () => {
    const probes: GoogleMapsServiceProbe[] = [
      {
        service: 'geocoding',
        status: 'available',
        message: 'ok',
        keyStatus: 'configured',
      },
      {
        service: 'directions',
        status: 'unavailable',
        message: 'This API project is not authorized',
        keyStatus: 'restricted',
      },
      {
        service: 'places',
        status: 'disabled',
        message: 'Disabled in TITAN settings',
        keyStatus: null,
      },
      {
        service: 'mapsJavascript',
        status: 'configured_unverified',
        message: 'Browser key stored',
        keyStatus: 'configured',
      },
    ];
    const summary = summarizeGoogleMapsServiceProbes(probes);
    assert.equal(summary.ok, true);
    assert.match(summary.message, /1 service\(s\) unavailable/i);
  });
});
