import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FleetTrackingContext, OpsSourceState } from '@titan/shared';
import {
  FLEET_LIVE_UNAVAILABLE_NOTE,
  FLEET_SHOWING_STORED_POSITIONS_NOTE,
  buildFleetMapDisclosureLines,
  formatOwnerFleetOpsFreshnessLabel,
  formatSanitisedCartrackDisclosureLine,
  formatSanitisedOpsSourceLine,
  isTechnicalFleetDiagnostic,
} from './fleet-dashboard-copy';

function tracking(
  overrides: Partial<FleetTrackingContext> = {},
): FleetTrackingContext {
  return {
    cartrackStatus: 'connected',
    cartrackConnected: true,
    hasCredentials: true,
    capabilityState: 'connected_usable',
    connectionDisplayState: 'connected',
    mappedVehicleCount: 1,
    unmappedVehicleCount: 0,
    positionCount: 1,
    lastSyncAt: '2026-08-06T12:00:00.000Z',
    lastError: null,
    livePollingAllowed: true,
    syncIntervalMs: 60_000,
    providerRefresh: {
      status: 'ok',
      lastSuccessfulAt: '2026-08-06T12:00:00.000Z',
      dataAgeMs: 30_000,
      failedEndpoint: null,
      timeoutMessage: null,
      showingCachedSnapshot: false,
    },
    latestPositions: [
      {
        vehicleId: 'v1',
        vehicleName: 'Van 1',
        licensePlate: 'CF77263',
        make: null,
        model: null,
        assignedUserName: null,
        driverName: null,
        externalVehicleId: 'ext-1',
        latitude: -33.9,
        longitude: 18.4,
        speedKmh: 0,
        heading: null,
        ignitionOn: true,
        recordedAt: '2026-08-06T12:00:00.000Z',
        address: null,
      },
    ],
    ...overrides,
  } as FleetTrackingContext;
}

describe('fleet dashboard owner copy', () => {
  it('flags raw Cartrack diagnostics as technical', () => {
    assert.equal(
      isTechnicalFleetDiagnostic('Cartrack request timed out after 20000ms [/vehicles/status]'),
      true,
    );
    assert.equal(isTechnicalFleetDiagnostic('Partial — some sources did not answer'), true);
    assert.equal(isTechnicalFleetDiagnostic(FLEET_LIVE_UNAVAILABLE_NOTE), false);
  });

  it('never exposes Partial on owner ops freshness labels', () => {
    assert.equal(formatOwnerFleetOpsFreshnessLabel('live'), 'Live');
    assert.equal(formatOwnerFleetOpsFreshnessLabel('partial'), 'Updated recently');
    assert.doesNotMatch(formatOwnerFleetOpsFreshnessLabel('partial') ?? '', /Partial/i);
  });

  it('sanitises ops source lines without endpoint paths or timeouts', () => {
    const line = formatSanitisedOpsSourceLine({
      key: 'fleet_tracking',
      label: 'Cartrack tracking',
      status: 'timed_out',
      detail: 'Cartrack request timed out after 20000ms [/vehicles/status]',
    } satisfies OpsSourceState);
    assert.equal(line, 'Cartrack tracking — temporarily unavailable');
    assert.doesNotMatch(line, /20000ms/);
    assert.doesNotMatch(line, /\/vehicles\/status/);
  });

  it('builds disclosure lines with provider name and sanitised status only', () => {
    const lines = buildFleetMapDisclosureLines({
      tracking: tracking({
        providerRefresh: {
          status: 'degraded',
          lastSuccessfulAt: '2026-08-06T11:00:00.000Z',
          dataAgeMs: 900_000,
          failedEndpoint: '/vehicles/status',
          timeoutMessage: 'Cartrack request timed out after 20000ms',
          showingCachedSnapshot: true,
        },
        lastError: 'Cartrack request timed out after 20000ms [/vehicles/status]',
      }),
      opsFreshness: 'partial',
      opsSources: [
        {
          key: 'fleet_tracking',
          label: 'Cartrack tracking',
          status: 'timed_out',
          detail: 'Cartrack request timed out after 20000ms [/vehicles/status]',
        },
      ],
      hasStoredPositions: true,
    });

    assert.match(lines.join(' '), /Cartrack — refresh delayed/);
    assert.match(lines.join(' '), /Ops intelligence — some inputs temporarily unavailable/);
    for (const line of lines) {
      assert.doesNotMatch(line, /20000ms/);
      assert.doesNotMatch(line, /\/vehicles\/status/);
      assert.doesNotMatch(line, /Partial/i);
    }
  });

  it('keeps sanitised cartrack disclosure readable when connected', () => {
    assert.match(formatSanitisedCartrackDisclosureLine(tracking()), /Cartrack —/);
    assert.equal(FLEET_SHOWING_STORED_POSITIONS_NOTE, 'Showing the latest available vehicle positions.');
  });
});
