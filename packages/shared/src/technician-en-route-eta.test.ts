import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETA_UNAVAILABLE_LABEL,
  buildArrivalWindowFromTravelMinutes,
  customerEnRoutePayloadIsPrivacySafe,
  renderEnRouteCustomerMessage,
  resolveTechnicianEnRouteEtaTruth,
} from './technician-en-route-eta.js';

describe('technician en-route ETA truth', () => {
  it('builds an arrival window from live travel minutes', () => {
    const window = buildArrivalWindowFromTravelMinutes({
      nowMs: Date.parse('2026-08-07T12:00:00.000Z'),
      travelMinutes: 20,
      windowBufferMinutes: 15,
    });
    assert.ok(window);
    assert.equal(window!.startAt, '2026-08-07T12:20:00.000Z');
    assert.equal(window!.endAt, '2026-08-07T12:35:00.000Z');
  });

  it('returns ETA UNAVAILABLE when Cartrack/Maps/coords are incomplete', () => {
    const truth = resolveTechnicianEnRouteEtaTruth({
      travelMinutes: 12,
      travelSource: 'default',
      vehicleOriginUsed: false,
      cartrackConnected: false,
      googleMapsConnected: true,
      jobHasVerifiedCoordinates: true,
    });
    assert.equal(truth.etaAvailable, false);
    assert.equal(truth.arrivalWindowLabel, ETA_UNAVAILABLE_LABEL);
  });

  it('accepts live routing only with Cartrack origin + Google Maps minutes', () => {
    const truth = resolveTechnicianEnRouteEtaTruth({
      travelMinutes: 25,
      travelSource: 'google_maps',
      vehicleOriginUsed: true,
      cartrackConnected: true,
      googleMapsConnected: true,
      jobHasVerifiedCoordinates: true,
      nowMs: Date.parse('2026-08-07T12:00:00.000Z'),
      windowBufferMinutes: 15,
    });
    assert.equal(truth.etaAvailable, true);
    assert.equal(truth.travelSource, 'google_maps');
    assert.match(truth.arrivalWindowLabel, /–/);
  });

  it('renders configurable customer message without inventing GPS', () => {
    const body = renderEnRouteCustomerMessage({
      companyName: 'Young Guns Plumbing',
      jobNumber: '1234',
      arrivalWindowLabel: '14:20–14:35',
    });
    assert.match(body, /Young Guns Plumbing is on the way/);
    assert.match(body, /14:20–14:35/);
    assert.match(body, /Job #1234/);
    assert.equal(
      customerEnRoutePayloadIsPrivacySafe({
        jobNumber: '1234',
        arrivalWindowLabel: '14:20–14:35',
      }),
      true,
    );
    assert.equal(
      customerEnRoutePayloadIsPrivacySafe({
        latitude: -33.9,
        longitude: 18.4,
      }),
      false,
    );
  });
});
