import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchFleetDrivers } from '../../lib/fleet-api';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetDriversPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data, error, isLoading, refetch } = useCachedQuery({
    queryKey: 'fleet/drivers',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchFleetDrivers(accessToken!),
  });

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Drivers" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Drivers"
        description="Driver names from Cartrack GPS payloads and TITAN vehicle assignments — never guessed."
      />

      {isLoading ? <LoadingState label="Loading drivers…" /> : null}
      {error ? (
        <Panel title="Unable to load drivers">
          <p className="form-error">{error}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Panel>
      ) : null}

      {data && data.capability !== 'available' ? (
        <FleetCapabilityState capability={data.capability} title="Drivers unavailable" />
      ) : null}

      {data?.capability === 'available' && data.drivers.length === 0 ? (
        <FleetCapabilityState
          capability="waiting_for_provider_data"
          title="No driver data yet"
          description="Driver names appear when Cartrack includes driver fields in GPS payloads."
        />
      ) : null}

      {data && data.drivers.length > 0 ? (
        <Panel title={`Drivers (${data.drivers.length})`}>
          <ul className="portal-list">
            {data.drivers.map((driver) => (
              <li key={driver.driverName}>
                <strong>{driver.driverName}</strong>
                <span>
                  {driver.assignedVehicleRegistration ?? 'No assigned vehicle'} ·{' '}
                  {FLEET_MOVEMENT_LABELS[driver.status]}
                </span>
                <span>
                  Today: {driver.todayDistanceKm != null ? `${driver.todayDistanceKm} km` : '—'}
                  {driver.lastArea ? ` · ${driver.lastArea}` : ''}
                </span>
                {driver.currentJob ? (
                  <Link href={`/jobs/${driver.currentJob.jobId}`}>
                    Job: {driver.currentJob.title}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
