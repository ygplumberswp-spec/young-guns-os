import { useMemo } from 'react';
import { useSearch } from 'wouter';
import { LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchFleetLiveMap } from '../../lib/fleet-api';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';
import { FleetLiveMapCanvas } from '../../features/fleet/FleetLiveMapCanvas';

export function FleetRouteHistoryPage() {
  const search = useSearch();
  const vehicleFilter = new URLSearchParams(search).get('vehicle');
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data, error, isLoading } = useCachedQuery({
    queryKey: `fleet/route-history/${vehicleFilter ?? 'all'}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchFleetLiveMap(accessToken!),
  });

  const vehicles = useMemo(() => {
    const all = data?.vehicles ?? [];
    if (!vehicleFilter) return all;
    return all.filter((vehicle) => vehicle.vehicleId === vehicleFilter);
  }, [data?.vehicles, vehicleFilter]);

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Route history" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Route history"
        description="Trip replay from stored Cartrack GPS points — no invented coordinates."
      />

      {isLoading ? <LoadingState label="Loading route history…" /> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && vehicles.every((vehicle) => vehicle.trailToday.length < 2) ? (
        <FleetCapabilityState
          capability="waiting_for_provider_data"
          title="No route points yet"
          description="Route lines appear when multiple GPS points are stored for today."
        />
      ) : null}

      {vehicles.some((vehicle) => vehicle.trailToday.length >= 2) ? (
        <Panel title="Today's routes">
          <FleetLiveMapCanvas
            vehicles={vehicles}
            selectedVehicleId={vehicleFilter}
            onSelect={() => undefined}
          />
          <ul className="portal-list" style={{ marginTop: '1rem' }}>
            {vehicles
              .filter((vehicle) => vehicle.trailToday.length >= 2)
              .map((vehicle) => (
                <li key={vehicle.vehicleId}>
                  <strong>{vehicle.registration ?? vehicle.name}</strong>
                  <span>
                    {vehicle.trailToday.length} points ·{' '}
                    {vehicle.todayDistanceKm != null ? `${vehicle.todayDistanceKm} km` : '—'}
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
