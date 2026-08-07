import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

function readPanel(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
}

const liveOpsSource = readPanel('LiveOperationsPanel.tsx');
const opsStripSource = readPanel('OpsIntelligenceLiveStrip.tsx');
const fleetCopySource = readPanel('fleet-dashboard-copy.ts');

describe('DASH-001C Live Fleet Map fleet diagnostics cleanup', () => {
  it('does not expose Partial, timeouts or endpoint paths on default Live Fleet Map surfaces', () => {
    assert.doesNotMatch(liveOpsSource, /formatOpsSnapshotFreshnessLabel/);
    assert.doesNotMatch(opsStripSource, /formatOpsSnapshotFreshnessLabel/);
    assert.doesNotMatch(liveOpsSource, /failedEndpoint/);
    assert.doesNotMatch(liveOpsSource, /timeoutMessage/);
    assert.doesNotMatch(liveOpsSource, /tracking\.lastError/);
    assert.doesNotMatch(liveOpsSource, /fleetError\s*\?\s*</);
    assert.doesNotMatch(liveOpsSource, /CARTRACK_SLOW_SNAPSHOT_BANNER/);
    assert.doesNotMatch(liveOpsSource, /mapFooterLabel/);
    assert.doesNotMatch(opsStripSource, /degradedSources/);
    assert.doesNotMatch(opsStripSource, /honestyNotes/);
    assert.doesNotMatch(opsStripSource, /Partial — some sources did not answer/);
  });

  it('shows calm unavailable and stored-position wording on the default surface', () => {
    assert.match(liveOpsSource, /FLEET_LIVE_UNAVAILABLE_NOTE/);
    assert.match(liveOpsSource, /FLEET_SHOWING_STORED_POSITIONS_NOTE/);
    assert.match(liveOpsSource, /exec-live-ops-panel__calm-note/);
    assert.match(liveOpsSource, /showMapSurface/);
    assert.match(liveOpsSource, /hasStoredPositions && liveDegraded/);
  });

  it('keeps technical fleet information behind View source disclosure', () => {
    assert.match(liveOpsSource, /DashboardDetailsDisclosure/);
    assert.match(liveOpsSource, /buildFleetMapDisclosureLines/);
    assert.match(fleetCopySource, /formatSanitisedCartrackDisclosureLine/);
    assert.match(fleetCopySource, /formatSanitisedOpsSourceLine/);
  });

  it('preserves stored vehicle positions on the map surface', () => {
    assert.match(liveOpsSource, /tracking\?\.latestPositions/);
    assert.match(liveOpsSource, /GoogleMapView/);
    assert.match(liveOpsSource, /fleetMapShowsStoredPositions/);
  });
});
