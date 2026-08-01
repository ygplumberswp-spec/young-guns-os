import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchFleetTrips } from '../../lib/fleet-api';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetTripsPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data, error, isLoading, refetch } = useCachedQuery({
    queryKey: 'fleet/trips',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchFleetTrips(accessToken!),
  });

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState
          capability="permission_required"
          title="Trips"
          description="You do not have permission to view fleet trips."
        />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Trips"
        description="Trip summaries derived from cached Cartrack GPS trail points — no invented routes."
      />

      {isLoading ? <LoadingState label="Loading trips…" /> : null}
      {error ? (
        <Panel title="Unable to load trips">
          <p className="form-error">{error}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Panel>
      ) : null}

      {data && data.capability !== 'available' ? (
        <FleetCapabilityState capability={data.capability} title="No trips yet" />
      ) : null}

      {data?.trips.length === 0 && data.capability === 'available' ? (
        <FleetCapabilityState
          capability="waiting_for_provider_data"
          title="No trips recorded today"
          description="Trips appear when Cartrack GPS trail points are stored for mapped vehicles."
        />
      ) : null}

      {data && data.trips.length > 0 ? (
        <Panel title={`Trips (${data.trips.length})`}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Distance</th>
                  <th>Points</th>
                  <th>Job</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>{trip.registration ?? trip.vehicleName ?? '—'}</td>
                    <td>{trip.driverName ?? '—'}</td>
                    <td>{new Date(trip.startedAt).toLocaleString()}</td>
                    <td>{trip.endedAt ? new Date(trip.endedAt).toLocaleString() : '—'}</td>
                    <td>{trip.distanceKm != null ? `${trip.distanceKm} km` : '—'}</td>
                    <td>{trip.pointCount}</td>
                    <td>{trip.linkedJobTitle ?? '—'}</td>
                    <td>
                      <Link href={`/fleet/route-history?vehicle=${trip.vehicleId}`}>
                        <Button size="sm" variant="secondary">
                          View route
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
