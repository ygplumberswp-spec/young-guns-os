import { Link } from 'wouter';
import type { FleetLiveMapVehicle } from '@titan/shared';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button, Panel } from '@titan/ui';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

type FleetVehicleSidePanelProps = {
  vehicle: FleetLiveMapVehicle;
  onShareEta?: () => void;
};

export function FleetVehicleSidePanel({ vehicle, onShareEta }: FleetVehicleSidePanelProps) {
  const stateLabel = FLEET_MOVEMENT_LABELS[vehicle.displayState];

  return (
    <Panel
      title={vehicle.registration ?? vehicle.name ?? 'Vehicle details'}
      className="fleet-live-map-detail"
    >
      <div className="fleet-side-panel__status-row">
        <span className={`status-pill status-pill--${vehicle.isStale ? 'warning' : 'success'}`}>
          {stateLabel}
        </span>
        {vehicle.isStale ? (
          <span className="status-pill status-pill--warning">Stale warning</span>
        ) : null}
        {vehicle.isTrackerOffline ? (
          <span className="status-pill status-pill--disabled">Tracker offline</span>
        ) : null}
      </div>

      <dl className="integration-status-list">
        <div>
          <dt>Registration</dt>
          <dd>{vehicle.registration ?? '—'}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{vehicle.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>{vehicle.driverName ?? '—'}</dd>
        </div>
        <div>
          <dt>Technician</dt>
          <dd>{vehicle.technicianName ?? '—'}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{vehicle.speedKmh != null ? `${Math.round(vehicle.speedKmh)} km/h` : '—'}</dd>
        </div>
        <div>
          <dt>Ignition</dt>
          <dd>{vehicle.ignitionOn == null ? '—' : vehicle.ignitionOn ? 'On' : 'Off'}</dd>
        </div>
        <div>
          <dt>Heading</dt>
          <dd>{vehicle.heading != null ? `${Math.round(vehicle.heading)}°` : '—'}</dd>
        </div>
        <div>
          <dt>Odometer</dt>
          <dd>{vehicle.odometerKm != null ? `${vehicle.odometerKm.toLocaleString()} km` : '—'}</dd>
        </div>
        <div>
          <dt>Fuel</dt>
          <dd>{vehicle.fuelPercent != null ? `${Math.round(vehicle.fuelPercent)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Last provider update</dt>
          <dd>
            {vehicle.recordedAt
              ? `${new Date(vehicle.recordedAt).toLocaleString()} (${formatRelativeTime(vehicle.recordedAt)})`
              : 'No position yet'}
          </dd>
        </div>
        <div>
          <dt>Today&apos;s distance</dt>
          <dd>{vehicle.todayDistanceKm != null ? `${vehicle.todayDistanceKm} km` : '—'}</dd>
        </div>
        <div>
          <dt>Trip start</dt>
          <dd>
            {vehicle.tripStartedAt ? new Date(vehicle.tripStartedAt).toLocaleTimeString() : '—'}
          </dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{vehicle.address ?? '—'}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>
            {vehicle.latitude != null && vehicle.longitude != null
              ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Tracker ID</dt>
          <dd>{vehicle.externalTrackerId ?? '—'}</dd>
        </div>
      </dl>

      {vehicle.currentJob ? (
        <div className="fleet-side-panel__job-block">
          <h4>Current job</h4>
          <Link href={`/jobs/${vehicle.currentJob.jobId}`}>
            <strong>
              {vehicle.currentJob.jobNumber ? `${vehicle.currentJob.jobNumber} · ` : ''}
              {vehicle.currentJob.title}
            </strong>
          </Link>
          <p className="page-muted">
            {vehicle.currentJob.customerName ?? 'Customer'} · {vehicle.currentJob.status}
          </p>
          {vehicle.currentJob.addressDisplay ? (
            <p className="page-muted">{vehicle.currentJob.addressDisplay}</p>
          ) : null}
        </div>
      ) : null}

      {vehicle.nextJob ? (
        <div className="fleet-side-panel__job-block">
          <h4>Next job</h4>
          <Link href={`/jobs/${vehicle.nextJob.jobId}`}>
            <strong>
              {vehicle.nextJob.jobNumber ? `${vehicle.nextJob.jobNumber} · ` : ''}
              {vehicle.nextJob.title}
            </strong>
          </Link>
          <p className="page-muted">
            {vehicle.nextJob.scheduledAt
              ? new Date(vehicle.nextJob.scheduledAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Unscheduled'}
          </p>
        </div>
      ) : null}

      <div className="page-header-actions fleet-side-panel__actions">
        {vehicle.technicianName ? (
          <Link href="/communications/messages/new">
            <Button variant="secondary">Message tech</Button>
          </Link>
        ) : null}
        <Link href={`/fleet/${vehicle.vehicleId}`}>
          <Button variant="secondary">Vehicle profile</Button>
        </Link>
        <Link href={`/fleet/route-history?vehicle=${vehicle.vehicleId}`}>
          <Button variant="secondary">Today&apos;s route</Button>
        </Link>
        {vehicle.currentJob && onShareEta ? (
          <Button variant="secondary" onClick={onShareEta}>
            Share customer ETA
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
