import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { FleetLiveMapCanvas } from '../fleet/FleetLiveMapCanvas';
import { FleetVehicleSidePanel } from '../fleet/FleetVehicleSidePanel';
import { useFleetLiveMap } from '../fleet/useFleetLiveMap';

type LiveDispatchMapPanelProps = {
  accessToken: string | null;
  enabled?: boolean;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function delayRiskLabel(vehicle: {
  isStale: boolean;
  isTrackerOffline: boolean;
  nextJob?: { scheduledAt: string | null } | null;
}): 'none' | 'stale_gps' | 'offline' | 'schedule_pressure' {
  if (vehicle.isTrackerOffline) return 'offline';
  if (vehicle.isStale) return 'stale_gps';
  if (vehicle.nextJob?.scheduledAt) {
    const minsUntil =
      (new Date(vehicle.nextJob.scheduledAt).getTime() - Date.now()) / 60_000;
    if (minsUntil > 0 && minsUntil < 30) return 'schedule_pressure';
  }
  return 'none';
}

const DELAY_RISK_LABELS: Record<ReturnType<typeof delayRiskLabel>, string> = {
  none: 'On track',
  stale_gps: 'Stale GPS',
  offline: 'Tracker offline',
  schedule_pressure: 'Next job soon',
};

export function LiveDispatchMapPanel({ accessToken, enabled = true }: LiveDispatchMapPanelProps) {
  const { snapshot, isPolling, lastFetchedAt, error, refresh } = useFleetLiveMap({
    accessToken,
    enabled: enabled && Boolean(accessToken),
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<{ ready: boolean; error: string | null }>({
    ready: false,
    error: null,
  });

  const vehicles = snapshot?.vehicles ?? [];
  const selected =
    vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId) ?? vehicles[0] ?? null;

  const positionedCount = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          vehicle.latitude != null &&
          vehicle.longitude != null &&
          Number.isFinite(vehicle.latitude) &&
          Number.isFinite(vehicle.longitude),
      ).length,
    [vehicles],
  );

  return (
    <Panel
      title="Live dispatch map"
      description="Cartrack GPS from TITAN cache — staff only. Customers receive private expiring ETA links, never fleet-wide tracking."
      className="live-dispatch-map-panel"
    >
      <div className="live-dispatch-map-panel__status">
        <span className="page-muted">
          {snapshot?.tracking.cartrackConnected ? 'Cartrack connected' : 'Cartrack not connected'} ·{' '}
          {vehicles.length} vehicle(s) · {positionedCount} with GPS ·{' '}
          {isPolling ? 'Refreshing…' : formatRelativeTime(lastFetchedAt)}
        </span>
        <div className="page-header-actions">
          <Link href="/fleet/live-map">
            <Button variant="ghost" size="sm">
              Full fleet map
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={isPolling}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {mapStatus.error ? <p className="form-error">{mapStatus.error}</p> : null}

      <div className="live-dispatch-map-layout">
        <div className="live-dispatch-map-layout__list">
          {vehicles.length === 0 ? (
            <p className="page-muted">
              Waiting for Cartrack GPS. Known vehicles CF172047 and CF77263 appear after background
              sync — coordinates shown in fallback list if map tiles fail.
            </p>
          ) : (
            <ul className="fleet-live-map-vehicle-list">
              {vehicles.map((vehicle) => {
                const risk = delayRiskLabel(vehicle);
                return (
                  <li key={vehicle.vehicleId}>
                    <button
                      type="button"
                      className={`fleet-live-map-vehicle-card${
                        selected?.vehicleId === vehicle.vehicleId ? ' is-selected' : ''
                      }`}
                      onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
                    >
                      <div className="fleet-live-map-vehicle-card__header">
                        <strong>{vehicle.registration ?? vehicle.name ?? 'Unnamed vehicle'}</strong>
                        <span
                          className={`status-pill status-pill--${
                            risk === 'none' ? 'success' : 'warning'
                          }`}
                        >
                          {DELAY_RISK_LABELS[risk]}
                        </span>
                      </div>
                      <p className="page-muted">
                        {vehicle.technicianName ?? vehicle.driverName ?? 'No driver'} ·{' '}
                        {FLEET_MOVEMENT_LABELS[vehicle.displayState]}
                        {vehicle.speedKmh != null ? ` · ${Math.round(vehicle.speedKmh)} km/h` : ''}
                      </p>
                      <p className="page-muted">
                        GPS: {formatRelativeTime(vehicle.recordedAt)}
                        {vehicle.currentJob ? ` · Job: ${vehicle.currentJob.title}` : ''}
                      </p>
                      {vehicle.nextJob ? (
                        <p className="page-muted">
                          Next: {vehicle.nextJob.title}
                          {vehicle.nextJob.scheduledAt
                            ? ` @ ${new Date(vehicle.nextJob.scheduledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="live-dispatch-map-layout__canvas">
          <FleetLiveMapCanvas
            vehicles={vehicles}
            selectedVehicleId={selected?.vehicleId ?? null}
            onMapStatusChange={setMapStatus}
            onSelect={setSelectedVehicleId}
          />
        </div>

        {selected ? (
          <div className="live-dispatch-map-layout__detail">
            <FleetVehicleSidePanel
              vehicle={selected}
              onShareEta={() => {
                /* Private customer ETA — portal job tracking only; no fleet coordinates */
              }}
            />
            {selected.currentJob ? (
              <p className="page-muted live-dispatch-eta-note">
                Customer ETA links are private, expiring portal URLs — never fleet-wide GPS. Share
                from job communications when technician is en route.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
