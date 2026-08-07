import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { formatFleetConnectionDisplayLabel } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { VehiclePositionCard } from './VehiclePositionAddress';

/**
 * Same permissions the `/integrations/cartrack/tracking` endpoint enforces, checked
 * client-side so unauthorised roles never poll it. The server remains the gate.
 */
export function canReadVehicleTracking(permissions: string[]): boolean {
  return hasAnyPermission(permissions, [
    'integrations:read',
    'integrations:manage',
    'dispatch:read',
    '*',
  ]);
}

/**
 * Latest Cartrack position for one vehicle, with the reverse-geocoded address and
 * the Navigate / Share actions. Reads the existing tracking context — no second
 * position fetch and no new position store.
 */
export function VehicleTrackedPositionPanel({ vehicleId }: { vehicleId: string }) {
  const { accessToken, user } = useAuth();
  const permitted = user ? canReadVehicleTracking(user.permissions) : false;

  const { tracking, error } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken) && permitted,
  });

  if (!permitted) {
    return null;
  }

  const position =
    tracking?.latestPositions.find((entry) => entry.vehicleId === vehicleId) ?? null;

  return (
    <Panel
      title="Tracked Position"
      description="Latest Cartrack coordinate for this vehicle, with the address it reverse-geocodes to. Coordinates remain the source of truth."
    >
      {!tracking ? (
        <p className="page-muted">{error ?? 'Loading Cartrack connection state…'}</p>
      ) : !position ? (
        <>
          <p className="page-muted">
            No Cartrack position is stored for this vehicle, so TITAN shows no address and offers no
            navigation.
          </p>
          <p className="page-muted">
            Cartrack connection:{' '}
            {formatFleetConnectionDisplayLabel(tracking.connectionDisplayState)} ·{' '}
            <Link href="/integrations/cartrack" className="fleet-link">
              Cartrack settings
            </Link>
          </p>
        </>
      ) : (
        <VehiclePositionCard
          position={position}
          cartrackConnected={tracking.cartrackConnected}
        />
      )}
      {error && tracking ? <p className="form-error">{error}</p> : null}
    </Panel>
  );
}
