/**
 * Pure camera policy for GoogleMapView — keeps live marker polling from
 * recentering after the user has panned/zoomed.
 */

export type MapCameraReason =
  | 'initial'
  | 'context_change'
  | 'follow_vehicle'
  | 'locate'
  | 'none';

export type MapCameraDecisionInput = {
  /** True once the map has applied its first camera placement. */
  didInitialCamera: boolean;
  /** Previous context key (job id, board name, etc.). */
  previousContextKey: string | null | undefined;
  /** Current context key — recenter when this changes (not on GPS poll). */
  contextKey?: string | null;
  /** Alias accepted by consumers / older call sites. */
  cameraContextKey?: string | null;
  /** Explicit follow mode — only then auto-pan to a moving vehicle. */
  followVehicleId?: string | null;
  /** Alias for followVehicleId. */
  followMarkerId?: string | null;
  /** Parent increments to request a one-shot locate/recenter. */
  locateToken?: number | null;
  previousLocateToken?: number | null;
};

export function resolveContextKey(input: {
  contextKey?: string | null;
  cameraContextKey?: string | null;
}): string | null {
  return input.contextKey ?? input.cameraContextKey ?? null;
}

export function resolveFollowId(input: {
  followVehicleId?: string | null;
  followMarkerId?: string | null;
}): string | null {
  return input.followVehicleId ?? input.followMarkerId ?? null;
}

/**
 * Decide whether the map camera should move for this overlay update.
 * Marker/polyline reference changes alone must return `'none'` after initial load
 * unless follow mode or locateToken/context change applies.
 */
export function decideMapCameraAction(input: MapCameraDecisionInput): MapCameraReason {
  const contextKey = resolveContextKey(input);
  const followId = resolveFollowId(input);
  const locateToken = input.locateToken ?? null;
  const previousLocateToken = input.previousLocateToken ?? null;

  if (!input.didInitialCamera) {
    return 'initial';
  }

  if (locateToken != null && locateToken !== previousLocateToken) {
    return 'locate';
  }

  if (contextKey != null && contextKey !== input.previousContextKey) {
    return 'context_change';
  }

  if (followId) {
    return 'follow_vehicle';
  }

  return 'none';
}
