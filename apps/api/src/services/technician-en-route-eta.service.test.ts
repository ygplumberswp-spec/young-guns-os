import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ETA_UNAVAILABLE_LABEL,
  customerEnRoutePayloadIsPrivacySafe,
  renderEnRouteCustomerMessage,
  resolveTechnicianEnRouteEtaTruth,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));

describe('technician en-route ETA service wiring', () => {
  it('service source enforces assignment, Cartrack+Maps truth, and privacy-safe notify', () => {
    const source = readFileSync(join(here, 'technician-en-route-eta.service.ts'), 'utf8');
    assert.match(source, /userHasJobAccess/);
    assert.match(source, /buildFleetTrackingContext/);
    assert.match(source, /estimateTravelMinutes/);
    assert.match(source, /queueApprovedDraft/);
    assert.match(source, /mark_en_route/);
    assert.match(source, /customerVisibleGps: false/);
    assert.match(source, /doNotContact/);
    assert.match(source, /technician_en_route/);
  });

  it('does not invent ETA without live route inputs', () => {
    const truth = resolveTechnicianEnRouteEtaTruth({
      travelMinutes: 30,
      travelSource: 'default',
      vehicleOriginUsed: false,
      cartrackConnected: true,
      googleMapsConnected: true,
      jobHasVerifiedCoordinates: true,
    });
    assert.equal(truth.arrivalWindowLabel, ETA_UNAVAILABLE_LABEL);
    assert.equal(truth.etaAvailable, false);
  });

  it('customer message stays privacy-safe', () => {
    const body = renderEnRouteCustomerMessage({
      companyName: 'Young Guns Plumbing',
      jobNumber: '1234',
      arrivalWindowLabel: '14:20–14:35',
    });
    assert.match(body, /on the way/);
    assert.equal(
      customerEnRoutePayloadIsPrivacySafe({
        jobNumber: '1234',
        arrivalWindowLabel: '14:20–14:35',
        messageBody: body,
      }),
      true,
    );
  });
});
