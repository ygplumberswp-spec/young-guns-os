import type { IntegrationCapabilityState } from './integration-capability.js';
import { deriveIntegrationCapabilityState } from './integration-capability.js';
import type { IntegrationConnectionStatus } from './integrations.js';

/** Position older than this is never labelled "live". */
export const FLEET_POSITION_STALE_MS = 120_000;

/** Sync older than this while connected is treated as degraded/stale sync. */
export const FLEET_SYNC_STALE_MS = 15 * 60_000;

export type FleetPositionHealth = 'live' | 'stale' | 'unavailable';

/* ------------------------------------------------------------------------- *
 * Position freshness against the real polling cadence
 * ------------------------------------------------------------------------- */

/**
 * Cartrack is polled on a schedule; TITAN holds no streaming connection to it. Freshness
 * is therefore judged against that cadence rather than a wall-clock ideal, so a position
 * that is as current as polling can make it is not cried down as stale — while anything
 * genuinely old is still named plainly.
 */
export type VehiclePositionFreshness = 'live' | 'fresh' | 'delayed' | 'stale' | 'offline';

/** Sync cadence configured for the Cartrack connector (`integration_sync_schedules`). */
export const CARTRACK_SYNC_INTERVAL_MS = 15 * 60_000;

/** Within one poll interval the position is as current as polling allows. */
export const FLEET_POSITION_FRESH_MS = CARTRACK_SYNC_INTERVAL_MS;

/** Beyond two intervals the vehicle has missed an expected report. */
export const FLEET_POSITION_DELAYED_MS = 2 * CARTRACK_SYNC_INTERVAL_MS;

/** Beyond this the tracker has stopped reporting for practical purposes. */
export const FLEET_POSITION_OFFLINE_MS = 6 * 60 * 60_000;

export function deriveVehiclePositionFreshness(input: {
  recordedAt: string | null | undefined;
  cartrackConnected: boolean;
  nowMs?: number;
}): VehiclePositionFreshness {
  if (!input.cartrackConnected) return 'offline';
  if (!input.recordedAt) return 'offline';

  const recordedMs = new Date(input.recordedAt).getTime();
  if (!Number.isFinite(recordedMs)) return 'offline';

  const ageMs = (input.nowMs ?? Date.now()) - recordedMs;
  // A provider clock slightly ahead of ours is not evidence of a problem.
  if (ageMs < 0) return 'fresh';

  if (ageMs <= 60_000) return 'live';
  if (ageMs <= FLEET_POSITION_FRESH_MS) return 'fresh';
  if (ageMs <= FLEET_POSITION_DELAYED_MS) return 'delayed';
  if (ageMs <= FLEET_POSITION_OFFLINE_MS) return 'stale';
  return 'offline';
}

export function formatVehiclePositionFreshnessLabel(
  freshness: VehiclePositionFreshness,
): string {
  switch (freshness) {
    case 'live':
      return 'LIVE';
    case 'fresh':
      return 'FRESH';
    case 'delayed':
      return 'DELAYED';
    case 'stale':
      return 'STALE';
    case 'offline':
      return 'OFFLINE';
  }
}

/**
 * The honest sentence behind the badge. Every state names the polling reality, because
 * none of them may be read as a streaming connection.
 */
export function describeVehiclePositionFreshness(input: {
  freshness: VehiclePositionFreshness;
  refreshIntervalMs?: number;
}): string {
  const minutes = Math.round((input.refreshIntervalMs ?? CARTRACK_SYNC_INTERVAL_MS) / 60_000);
  const cadence = `TITAN polls Cartrack about every ${minutes} minutes — it is not a live stream.`;

  switch (input.freshness) {
    case 'live':
      return `Position reported in the last minute. ${cadence}`;
    case 'fresh':
      return `Position is within one refresh interval — as current as polling allows. ${cadence}`;
    case 'delayed':
      return `The vehicle has missed at least one expected report. ${cadence}`;
    case 'stale':
      return `This is a last known position, not where the vehicle is now. ${cadence}`;
    case 'offline':
      return `The tracker has stopped reporting. The last known position is kept and not moved. ${cadence}`;
  }
}

/** True when the reading is too old to describe what the vehicle is doing right now. */
export function isPositionBehaviourUnreliable(freshness: VehiclePositionFreshness): boolean {
  return freshness === 'stale' || freshness === 'offline';
}

export type FleetConnectionDisplayState =
  | 'connected'
  | 'disconnected'
  | 'degraded'
  | 'stale'
  | 'error'
  | 'not_configured';

export function isFleetPositionStale(
  recordedAt: string | null | undefined,
  nowMs: number = Date.now(),
  staleMs: number = FLEET_POSITION_STALE_MS,
): boolean {
  if (!recordedAt) return true;
  const ts = new Date(recordedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts > staleMs;
}

export function deriveFleetPositionHealth(input: {
  cartrackConnected: boolean;
  recordedAt: string | null | undefined;
  nowMs?: number;
}): FleetPositionHealth {
  if (!input.cartrackConnected) return 'unavailable';
  if (isFleetPositionStale(input.recordedAt, input.nowMs)) return 'stale';
  return 'live';
}

export function deriveFleetConnectionDisplayState(input: {
  connectionStatus: IntegrationConnectionStatus;
  hasCredentials: boolean;
  lastSyncAt: string | null | undefined;
  lastError?: string | null;
  nowMs?: number;
}): FleetConnectionDisplayState {
  const capability = deriveIntegrationCapabilityState({
    availability: 'available',
    connectionStatus: input.connectionStatus,
    isConfigured: input.hasCredentials,
    backendImplemented: true,
    lastError: input.lastError,
  });

  if (capability === 'failed_degraded' || input.connectionStatus === 'error') {
    return 'error';
  }

  if (capability === 'connected_usable') {
    if (
      input.lastSyncAt &&
      isFleetPositionStale(input.lastSyncAt, input.nowMs, FLEET_SYNC_STALE_MS)
    ) {
      return 'stale';
    }
    if (input.lastError) return 'degraded';
    return 'connected';
  }

  if (capability === 'not_configured') return 'not_configured';
  if (capability === 'configured_unverified') return 'disconnected';
  return 'disconnected';
}

export function formatFleetConnectionDisplayLabel(state: FleetConnectionDisplayState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'degraded':
      return 'Degraded';
    case 'stale':
      return 'Stale sync';
    case 'error':
      return 'Error';
    case 'not_configured':
      return 'Not configured';
  }
}

export function formatFleetPositionHealthLabel(health: FleetPositionHealth): string {
  switch (health) {
    case 'live':
      return 'Live';
    case 'stale':
      return 'Stale position';
    case 'unavailable':
      return 'Unavailable';
  }
}

export const CARTRACK_SLOW_SNAPSHOT_BANNER =
  'Cartrack is temporarily slow — showing the last successful update.';

/**
 * Banner copy when Cartrack timed out / failed a refresh but stored positions remain.
 * Never invents coordinates — surfaces keep the last successful snapshot.
 */
export function cartrackSlowSnapshotBanner(showingCachedSnapshot: boolean): string | null {
  if (!showingCachedSnapshot) return null;
  return CARTRACK_SLOW_SNAPSHOT_BANNER;
}

export function deriveCartrackCapabilityState(input: {
  connectionStatus: IntegrationConnectionStatus;
  hasCredentials: boolean;
  lastError?: string | null;
}): IntegrationCapabilityState {
  return deriveIntegrationCapabilityState({
    availability: 'available',
    connectionStatus: input.connectionStatus,
    isConfigured: input.hasCredentials,
    backendImplemented: true,
    lastError: input.lastError,
  });
}
