import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsNavigateUrl,
  isValidLatLng,
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

  it('validates lat/lng ranges and rejects invented NaN', () => {
    assert.equal(isValidLatLng(-33.9, 18.4), true);
    assert.equal(isValidLatLng(91, 0), false);
    assert.equal(isValidLatLng(Number.NaN, 18), false);
    assert.equal(isValidLatLng(null, null), false);
  });
});
