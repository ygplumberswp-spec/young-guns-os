import type { FleetLiveMapVehicle } from '@titan/shared';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button } from '@titan/ui';

type FleetMapFallbackListProps = {
  vehicles: FleetLiveMapVehicle[];
  onRetry?: () => void;
  message?: string;
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

/** Compact vehicle list when the map canvas cannot render tiles. */
export function FleetMapFallbackList({
  vehicles,
  onRetry,
  message = 'Map could not load',
}: FleetMapFallbackListProps) {
  return (
    <div className="fleet-live-map-fallback" role="alert">
      <div className="fleet-live-map-fallback__header">
        <p className="fleet-live-map-fallback__title">{message}</p>
        {onRetry ? (
          <Button variant="secondary" type="button" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
      <ul className="fleet-live-map-fallback__list">
        {vehicles.map((vehicle) => (
          <li key={vehicle.vehicleId} className="fleet-live-map-fallback__item">
            <strong>{vehicle.registration ?? vehicle.name ?? 'Vehicle'}</strong>
            <span>
              {vehicle.latitude != null && vehicle.longitude != null
                ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`
                : 'No coordinates'}
            </span>
            <span>
              Last: {formatRelativeTime(vehicle.recordedAt)}
              {vehicle.speedKmh != null ? ` · ${Math.round(vehicle.speedKmh)} km/h` : ''}
              {vehicle.ignitionOn != null
                ? ` · Ignition ${vehicle.ignitionOn ? 'on' : 'off'}`
                : ''}
            </span>
            <span>{FLEET_MOVEMENT_LABELS[vehicle.displayState ?? 'unknown']}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
