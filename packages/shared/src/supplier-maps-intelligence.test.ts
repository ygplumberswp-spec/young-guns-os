import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSupplierExtraDistance,
  emptySupplierMultiStopSuggestion,
  formatSupplierMapsCapabilityLabel,
  resolveSupplierMapsCapability,
} from './supplier-maps-intelligence.js';

describe('supplier-maps-intelligence foundation', () => {
  it('resolves capability honestly without inventing supplier locations', () => {
    assert.equal(
      resolveSupplierMapsCapability({
        googleMapsConnected: false,
        hasVerifiedSupplierLocation: false,
      }),
      'not_configured',
    );
    assert.equal(
      resolveSupplierMapsCapability({
        googleMapsConnected: true,
        hasVerifiedSupplierLocation: false,
      }),
      'locations_unverified',
    );
    assert.equal(
      resolveSupplierMapsCapability({
        googleMapsConnected: true,
        hasVerifiedSupplierLocation: true,
      }),
      'ready_for_reporting',
    );
    assert.match(formatSupplierMapsCapabilityLabel('locations_unverified'), /verify supplier/i);
  });

  it('computes extra distance only from real route legs', () => {
    const missing = computeSupplierExtraDistance({
      direct: null,
      viaSupplier: { distanceMeters: 10000, durationSeconds: 900 },
      fromStopId: 'a',
      toStopId: 'b',
      viaSupplierStopId: 's',
    });
    assert.equal(missing.source, 'unavailable');
    assert.equal(missing.extraDistanceMeters, null);
    assert.ok(missing.warning);

    const ok = computeSupplierExtraDistance({
      direct: { distanceMeters: 5000, durationSeconds: 600 },
      viaSupplier: { distanceMeters: 8000, durationSeconds: 960 },
      fromStopId: 'a',
      toStopId: 'b',
      viaSupplierStopId: 's',
    });
    assert.equal(ok.source, 'google_maps');
    assert.equal(ok.extraDistanceMeters, 3000);
    assert.equal(ok.extraDurationSeconds, 360);
    assert.equal(ok.warning, null);
  });

  it('empty multi-stop suggestion never invents order or charges', () => {
    const suggestion = emptySupplierMultiStopSuggestion({
      technicianId: 'tech-1',
      technicianName: 'Alex',
      planDate: '2026-08-02',
      stops: [],
      reason: 'No verified supplier coordinates on file.',
    });
    assert.equal(suggestion.suggestedStopOrder, null);
    assert.equal(suggestion.source, 'unavailable');
    assert.equal(suggestion.requiresOwnerApproval, true);
    assert.equal(suggestion.wouldChangeSchedule, true);
    assert.match(suggestion.honestyNote, /No verified supplier/);
  });
});
