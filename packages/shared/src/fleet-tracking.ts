import type { IntegrationCapabilityState } from './integration-capability.js';
import { deriveIntegrationCapabilityState } from './integration-capability.js';
import type { IntegrationConnectionStatus } from './integrations.js';

/** Position older than this is never labelled "live". */
export const FLEET_POSITION_STALE_MS = 120_000;

/** Sync older than this while connected is treated as degraded/stale sync. */
export const FLEET_SYNC_STALE_MS = 15 * 60_000;

export type FleetPositionHealth = 'live' | 'stale' | 'unavailable';

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
