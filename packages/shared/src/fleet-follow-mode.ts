/**
 * Follow Vehicle mode — the rules, with no map or React in sight.
 *
 * Following a vehicle is a promise about the camera: keep this vehicle centred as new
 * positions arrive. Two things make that promise dangerous, and both are handled here
 * rather than in the view:
 *
 *  1. The operator may want to look somewhere else. A manual pan or zoom must suspend
 *     re-centring immediately, and only an explicit "Resume Follow" may resume it —
 *     otherwise the map fights the person using it.
 *  2. The vehicle may stop reporting. Following must then hold the last known position
 *     and say so. It must never extrapolate, interpolate or advance the marker, because
 *     a moving pin that isn't backed by a provider reading is a lie about a real van on
 *     a real road.
 */

import {
  deriveVehiclePositionFreshness,
  isPositionBehaviourUnreliable,
  CARTRACK_SYNC_INTERVAL_MS,
  type VehiclePositionFreshness,
} from './fleet-tracking.js';

export type FollowModeState = {
  /** Vehicle being followed, or null when follow mode is off. */
  followedVehicleId: string | null;
  /**
   * True when the operator moved the map themselves. Re-centring is suspended until
   * they resume, but follow mode is still on — the vehicle is still the subject.
   */
  recenterPaused: boolean;
  /** Plate captured when follow started, so the panel can name it even if data lags. */
  followedLabel: string | null;
};

export const initialFollowModeState: FollowModeState = {
  followedVehicleId: null,
  recenterPaused: false,
  followedLabel: null,
};

export type FollowModeAction =
  | { type: 'follow'; vehicleId: string; label?: string | null }
  | { type: 'manual_map_move' }
  | { type: 'resume' }
  | { type: 'exit' };

export function followModeReducer(
  state: FollowModeState,
  action: FollowModeAction,
): FollowModeState {
  switch (action.type) {
    case 'follow':
      // Following a different vehicle is a fresh start, so any earlier pause is cleared.
      return {
        followedVehicleId: action.vehicleId,
        recenterPaused: false,
        followedLabel: action.label ?? null,
      };

    case 'manual_map_move':
      // Only meaningful while following, and idempotent so a drag that fires many
      // events does not churn state.
      if (!state.followedVehicleId || state.recenterPaused) return state;
      return { ...state, recenterPaused: true };

    case 'resume':
      if (!state.followedVehicleId || !state.recenterPaused) return state;
      return { ...state, recenterPaused: false };

    case 'exit':
      return initialFollowModeState;
  }
}

export function isFollowingVehicle(state: FollowModeState, vehicleId: string): boolean {
  return state.followedVehicleId === vehicleId;
}

/** The id the map should track, or null when it must leave the camera alone. */
export function resolveActiveFollowTarget(state: FollowModeState): string | null {
  if (!state.followedVehicleId) return null;
  return state.recenterPaused ? null : state.followedVehicleId;
}

/* ------------------------------------------------------------------------- *
 * What the follow panel is allowed to say
 * ------------------------------------------------------------------------- */

export type FollowModeStatus = {
  active: boolean;
  /** Camera is currently tracking the vehicle. */
  recentring: boolean;
  /** Operator has taken the map over; "Resume Follow" should be offered. */
  paused: boolean;
  freshness: VehiclePositionFreshness;
  /** True when the position is too old to be treated as the vehicle's location now. */
  holdingLastKnownPosition: boolean;
  /** Sentence describing exactly what the camera is doing and why. */
  cameraNote: string;
  /** Sentence stating the refresh mechanism — never implies streaming. */
  refreshNote: string;
};

export function describeFollowMode(input: {
  state: FollowModeState;
  vehicleId: string | null;
  recordedAt: string | null | undefined;
  cartrackConnected: boolean;
  /** Poll interval the UI is actually using against the TITAN API. */
  uiRefreshIntervalMs?: number;
  /** Provider sync cadence — the real limit on how new a position can be. */
  providerSyncIntervalMs?: number;
  lastSuccessfulRefreshAt?: string | null;
  nowMs?: number;
}): FollowModeStatus {
  const active = Boolean(
    input.vehicleId && input.state.followedVehicleId === input.vehicleId,
  );
  const paused = active && input.state.recenterPaused;

  const freshness = deriveVehiclePositionFreshness({
    recordedAt: input.recordedAt,
    cartrackConnected: input.cartrackConnected,
    nowMs: input.nowMs,
  });
  const holdingLastKnownPosition = isPositionBehaviourUnreliable(freshness);

  const providerMinutes = Math.round(
    (input.providerSyncIntervalMs ?? CARTRACK_SYNC_INTERVAL_MS) / 60_000,
  );
  const uiSeconds = Math.round((input.uiRefreshIntervalMs ?? 0) / 1000);

  const refreshParts = [
    uiSeconds > 0
      ? `TITAN re-reads stored positions every ${uiSeconds}s`
      : 'TITAN re-reads stored positions on each refresh',
    `Cartrack itself is polled about every ${providerMinutes} minutes, so a position cannot be newer than that`,
  ];
  if (input.lastSuccessfulRefreshAt) {
    refreshParts.push(
      `last successful update ${formatClockTime(input.lastSuccessfulRefreshAt) ?? 'unknown'}`,
    );
  }

  let cameraNote: string;
  if (!active) {
    cameraNote = 'Follow Vehicle is off. The map stays where you put it.';
  } else if (paused) {
    cameraNote =
      'Re-centring is paused because you moved the map. Choose Resume Follow to centre on the vehicle again.';
  } else if (holdingLastKnownPosition) {
    cameraNote =
      'Following the last known position. The marker is held where the vehicle last reported and is not moved until Cartrack supplies a newer position.';
  } else {
    cameraNote = 'Following — the map re-centres each time a newer Cartrack position arrives.';
  }

  return {
    active,
    recentring: active && !paused,
    paused,
    freshness,
    holdingLastKnownPosition,
    cameraNote,
    refreshNote: `${refreshParts.join('. ')}.`,
  };
}

function formatClockTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/* ------------------------------------------------------------------------- *
 * Breadcrumb trail
 * ------------------------------------------------------------------------- */

export type VehicleTrailPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  speedKmh: number | null;
};

/**
 * Build the trail drawn behind a followed vehicle.
 *
 * The stored history contains the same provider reading re-saved on every poll, so
 * consecutive duplicates are collapsed: a parked vehicle must not accumulate a pile of
 * identical points, and the trail must show only positions the vehicle actually
 * reported from. Points are returned oldest-first so the polyline runs forwards.
 */
export function buildVehicleTrail(
  points: Array<{
    latitude: number | null;
    longitude: number | null;
    recordedAt: string | null;
    speedKmh?: number | null;
  }>,
  options: { maxPoints?: number } = {},
): VehicleTrailPoint[] {
  const usable = points
    .filter(
      (point): point is { latitude: number; longitude: number; recordedAt: string; speedKmh?: number | null } =>
        typeof point.latitude === 'number' &&
        typeof point.longitude === 'number' &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        typeof point.recordedAt === 'string' &&
        !Number.isNaN(new Date(point.recordedAt).getTime()),
    )
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  const deduped: VehicleTrailPoint[] = [];
  for (const point of usable) {
    const previous = deduped[deduped.length - 1];
    const sameSpot =
      previous &&
      previous.latitude === point.latitude &&
      previous.longitude === point.longitude;
    const sameMoment = previous && previous.recordedAt === point.recordedAt;

    if (sameSpot || sameMoment) continue;

    deduped.push({
      latitude: point.latitude,
      longitude: point.longitude,
      recordedAt: point.recordedAt,
      speedKmh:
        typeof point.speedKmh === 'number' && Number.isFinite(point.speedKmh)
          ? point.speedKmh
          : null,
    });
  }

  const maxPoints = options.maxPoints ?? 100;
  // Keep the most recent stretch — the trail behind the vehicle now, not last week.
  return deduped.length > maxPoints ? deduped.slice(deduped.length - maxPoints) : deduped;
}

/** Honest description of what the trail represents, or why there isn't one. */
export function describeVehicleTrail(trail: VehicleTrailPoint[]): string {
  if (trail.length === 0) {
    return 'No stored positions for this vehicle yet, so no trail is drawn.';
  }
  if (trail.length === 1) {
    return 'Only one distinct reported position is stored, so there is no trail to draw yet.';
  }
  const first = formatClockTime(trail[0]!.recordedAt);
  const last = formatClockTime(trail[trail.length - 1]!.recordedAt);
  return `${trail.length} reported positions between ${first ?? 'unknown'} and ${last ?? 'unknown'}. Points are Cartrack readings only — the line between them is drawn straight and is not the route actually driven.`;
}
