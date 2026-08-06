import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Button } from '@titan/ui';
import {
  buildVehicleTrail,
  describeFollowMode,
  describeVehicleTrail,
  followModeReducer,
  initialFollowModeState,
  resolveActiveFollowTarget,
  type FleetTrackingContext,
  type VehicleTrailPoint,
} from '@titan/shared';
import { fetchCartrackVehicleTrail } from '../../lib/integrations-api';
import { GoogleMapView, type MapMarker } from '../maps/GoogleMapView';
import { FleetVehicleDetailCard, buildPositionCardModel } from './FleetVehicleCards';
import type { TrackedVehiclePosition } from './VehiclePositionAddress';

/**
 * Follow Vehicle mode.
 *
 * The camera keeps the selected vehicle centred as newer Cartrack positions arrive, and
 * gets out of the way the moment the operator drags the map. Two honesty rules are
 * structural rather than cosmetic:
 *
 *  - the marker only ever sits on a position Cartrack reported. When the tracker goes
 *    quiet the marker stays put and the panel says it is holding the last known position;
 *  - nothing here claims a stream. The panel states the UI refresh interval, the provider
 *    poll cadence, and the time of the last successful update.
 */

export type FollowVehiclePanelProps = {
  accessToken: string | null;
  tracking: FleetTrackingContext | null;
  /** UI poll interval, surfaced so the refresh cadence is stated rather than implied. */
  uiRefreshIntervalMs: number;
  lastFetchedAt: string | null;
  /** Plate to follow on first render, used to deep-link into follow mode. */
  initialPlate?: string | null;
  onOpenJob?: (jobId: string) => void;
};

function markerIdFor(position: TrackedVehiclePosition): string {
  return `vehicle-${position.externalVehicleId}`;
}

export function FollowVehiclePanel({
  accessToken,
  tracking,
  uiRefreshIntervalMs,
  lastFetchedAt,
  initialPlate = null,
  onOpenJob,
}: FollowVehiclePanelProps) {
  const [followState, dispatchFollow] = useReducer(followModeReducer, initialFollowModeState);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [trailPoints, setTrailPoints] = useState<VehicleTrailPoint[]>([]);
  const [trailError, setTrailError] = useState<string | null>(null);

  const cartrackConnected = Boolean(tracking?.cartrackConnected);
  const positions = useMemo(
    () =>
      (tracking?.latestPositions ?? []).filter(
        (position) =>
          Number.isFinite(position.latitude) && Number.isFinite(position.longitude),
      ),
    [tracking?.latestPositions],
  );

  const selectedPosition = useMemo(() => {
    if (selectedMarkerId) {
      return positions.find((position) => markerIdFor(position) === selectedMarkerId) ?? null;
    }
    if (initialPlate) {
      return (
        positions.find(
          (position) =>
            position.licensePlate?.toUpperCase() === initialPlate.toUpperCase(),
        ) ?? null
      );
    }
    return null;
  }, [initialPlate, positions, selectedMarkerId]);

  const selectedVehicleId = selectedPosition?.vehicleId ?? null;
  const followMarkerId = selectedPosition ? markerIdFor(selectedPosition) : null;

  const status = describeFollowMode({
    state: followState,
    vehicleId: followMarkerId,
    recordedAt: selectedPosition?.recordedAt ?? null,
    cartrackConnected,
    uiRefreshIntervalMs,
    providerSyncIntervalMs: tracking?.syncIntervalMs ?? undefined,
    lastSuccessfulRefreshAt: lastFetchedAt,
  });

  // The trail is only fetched for a vehicle actually being followed — no background
  // history requests for vehicles nobody is looking at.
  const loadTrail = useCallback(async () => {
    if (!accessToken || !selectedVehicleId || !status.active) {
      setTrailPoints([]);
      return;
    }
    try {
      const trail = await fetchCartrackVehicleTrail(accessToken, selectedVehicleId, {
        maxPoints: 60,
      });
      setTrailPoints(buildVehicleTrail(trail.points));
      setTrailError(null);
    } catch (error) {
      setTrailPoints([]);
      setTrailError(
        error instanceof Error ? error.message : 'Unable to load the position history.',
      );
    }
  }, [accessToken, selectedVehicleId, status.active]);

  useEffect(() => {
    void loadTrail();
  }, [loadTrail, selectedPosition?.recordedAt]);

  const markers = useMemo((): MapMarker[] => {
    return positions.map((position) => {
      const model = buildPositionCardModel(position, cartrackConnected);
      return {
        id: markerIdFor(position),
        latitude: position.latitude,
        longitude: position.longitude,
        headingDegrees: model.headingDegrees,
        label: [
          model.plate,
          model.statusLabel,
          model.location.line,
          model.updatedAtTime ? `Updated ${model.updatedAtTime}` : null,
          model.speedValue,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'vehicle' as const,
      };
    });
  }, [cartrackConnected, positions]);

  const handleManualMapMove = useCallback(() => {
    dispatchFollow({ type: 'manual_map_move' });
  }, []);

  function selectVehicle(position: TrackedVehiclePosition) {
    setSelectedMarkerId(markerIdFor(position));
  }

  const selectedModel = selectedPosition
    ? buildPositionCardModel(selectedPosition, cartrackConnected)
    : null;

  if (!cartrackConnected) {
    return (
      <div className="follow-vehicle">
        <p className="page-muted">
          Follow Vehicle needs a connected Cartrack account. TITAN will not simulate vehicle
          movement while the integration is disconnected.
        </p>
      </div>
    );
  }

  return (
    <div className="follow-vehicle">
      <div className="follow-vehicle__controls">
        <label className="follow-vehicle__select">
          <span className="page-muted">Vehicle</span>
          <select
            value={followMarkerId ?? ''}
            onChange={(event) => {
              const next = positions.find(
                (position) => markerIdFor(position) === event.target.value,
              );
              if (next) selectVehicle(next);
            }}
          >
            <option value="">Select a vehicle</option>
            {positions.map((position) => (
              <option key={markerIdFor(position)} value={markerIdFor(position)}>
                {position.licensePlate ?? position.externalVehicleId}
              </option>
            ))}
          </select>
        </label>

        {selectedPosition && followMarkerId ? (
          status.active ? (
            <>
              {status.paused ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => dispatchFollow({ type: 'resume' })}
                >
                  Resume Follow
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => dispatchFollow({ type: 'exit' })}
              >
                Exit Follow Mode
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                dispatchFollow({
                  type: 'follow',
                  vehicleId: followMarkerId,
                  label: selectedPosition.licensePlate,
                })
              }
            >
              Follow Vehicle
            </Button>
          )
        ) : null}
      </div>

      <div className="follow-vehicle__state">
        <span
          className={`status-pill ${
            status.active
              ? status.paused
                ? 'status-pill--warning'
                : 'status-pill--success'
              : 'status-pill--disabled'
          }`}
        >
          {status.active
            ? status.paused
              ? 'Follow paused'
              : `Following ${followState.followedLabel ?? ''}`.trim()
            : 'Follow off'}
        </span>
        <span className="page-muted">{status.cameraNote}</span>
      </div>

      <p className="page-muted follow-vehicle__refresh">{status.refreshNote}</p>

      {markers.length > 0 ? (
        <GoogleMapView
          markers={markers}
          followMarkerId={resolveActiveFollowTarget(followState)}
          onManualMapMove={handleManualMapMove}
          trail={status.active && trailPoints.length > 1 ? { points: trailPoints } : null}
          allowFullscreen
          cameraContextKey="fleet-follow"
          className="follow-vehicle__map"
          height={420}
          emptyTitle="Live Map Unavailable"
          emptyDescription="Cartrack positions exist, but the Google Maps browser key is not configured."
        />
      ) : (
        <p className="page-muted">
          No stored Cartrack positions to plot yet. TITAN will not place a marker it cannot
          source from the provider.
        </p>
      )}

      {status.active ? (
        <p className="page-muted">
          {describeVehicleTrail(trailPoints)}
          {trailError ? ` ${trailError}` : ''}
        </p>
      ) : null}

      {selectedModel ? (
        <FleetVehicleDetailCard model={selectedModel} onOpenJob={onOpenJob} />
      ) : (
        <p className="page-muted">
          Select a vehicle to see its telemetry and enable Follow Vehicle.
        </p>
      )}
    </div>
  );
}
