import { Link } from 'wouter';
import type { FleetTrackingContext } from '@titan/shared';
import {
  formatFleetConnectionDisplayLabel,
  formatVehicleIgnitionLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionFreshness,
  resolveVehiclePositionAddressDisplay,
} from '@titan/shared';
import { mapFleetConnectionDisplayToEnterpriseLabel } from '../integrations/enterprise-overview-status';
import { Button, EmptyState, Panel } from '@titan/ui';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveFleetCardHonesty } from './dashboard-honesty';

type FleetOverviewPanelProps = {
  tracking: FleetTrackingContext | null;
  lastFetchedAt?: string | null;
  error?: string | null;
  isLoading?: boolean;
};

/**
 * Per-vehicle status for the top row: which vehicle, where it actually is in words, what
 * it is doing, and how old that reading is. Every field is a real Cartrack value or an
 * honest gap — TITAN never fills one in.
 */
export function FleetOverviewPanel({
  tracking,
  lastFetchedAt = null,
  error = null,
  isLoading = false,
}: FleetOverviewPanelProps) {
  const positions = tracking?.latestPositions ?? [];
  const honesty = resolveFleetCardHonesty({
    hasTracking: Boolean(tracking),
    cartrackConnected: Boolean(tracking?.cartrackConnected),
    connectionDisplayState: tracking?.connectionDisplayState ?? null,
    hasStoredPositions: positions.length > 0,
    error,
  });

  return (
    <Panel
      title="Fleet Overview"
      description={
        positions.length > 0
          ? `${positions.length} vehicle${positions.length === 1 ? '' : 's'} with stored positions`
          : 'Cartrack vehicles — real positions only'
      }
      headerAction={<Link href="/fleet">View all</Link>}
    >
      {isLoading && !tracking ? (
        <DashboardSectionSkeleton rows={3} />
      ) : !tracking ? (
        <EmptyState
          title="Fleet Status Unavailable"
          description={error ?? 'Cartrack connection state is still loading.'}
          action={
            <Link href="/integrations/cartrack">
              <Button size="sm" variant="secondary">
                Open Cartrack settings
              </Button>
            </Link>
          }
        />
      ) : positions.length === 0 ? (
        <EmptyState
          title="No Vehicle Positions"
          description={
            tracking.cartrackConnected
              ? 'Cartrack is connected but no GPS positions are stored yet. Run a Cartrack sync — TITAN will not invent coordinates.'
              : 'Cartrack is not connected, so TITAN has no vehicle positions to show.'
          }
          action={
            <Link href="/integrations/cartrack">
              <Button size="sm" variant="secondary">
                Open Cartrack settings
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="exec-fleet-overview">
          {positions.map((position) => {
            const address = resolveVehiclePositionAddressDisplay({
              result: position.address,
              latitude: position.latitude,
              longitude: position.longitude,
              recordedAt: position.recordedAt,
              cartrackConnected: tracking.cartrackConnected,
            });
            const identity =
              position.licensePlate ?? position.vehicleName ?? 'Unidentified vehicle';
            const secondary =
              position.licensePlate && position.vehicleName && position.vehicleName !== identity
                ? position.vehicleName
                : null;
            const moving =
              typeof position.speedKmh === 'number' && position.speedKmh >= 3;

            return (
              <li
                key={position.externalVehicleId}
                className={`exec-fleet-overview__item${moving ? ' is-moving' : ''}`}
              >
                <div className="exec-fleet-overview__head">
                  <strong className="exec-fleet-overview__plate">{identity}</strong>
                  <span className="exec-fleet-overview__motion">
                    {formatVehicleMotionLabel(position.speedKmh)}
                  </span>
                </div>
                {secondary ? (
                  <span className="exec-fleet-overview__name">{secondary}</span>
                ) : null}
                <p
                  className={`exec-fleet-overview__address is-${address.state}`}
                  title={address.note ?? undefined}
                >
                  {address.line}
                </p>
                <p className="exec-fleet-overview__meta">
                  {formatVehicleIgnitionLabel(position.ignitionOn)}
                  {position.driverName || position.assignedUserName
                    ? ` · ${position.driverName || position.assignedUserName}`
                    : ''}
                </p>
                <p className="exec-fleet-overview__age">
                  {formatVehiclePositionFreshness(position.recordedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <DashboardSourceMeta
        source={
          tracking
            ? `Cartrack · ${mapFleetConnectionDisplayToEnterpriseLabel(formatFleetConnectionDisplayLabel(tracking.connectionDisplayState))}`
            : 'Cartrack'
        }
        updatedAt={lastFetchedAt}
        state={honesty.state}
        href="/fleet"
        linkLabel="Open fleet"
        note={honesty.note}
      />
    </Panel>
  );
}
