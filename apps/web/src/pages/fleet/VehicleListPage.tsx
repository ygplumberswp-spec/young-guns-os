import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageLoadState } from '@titan/ui';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canAccessFleet, canManageFleet, VehicleList } from '../../features/fleet/VehicleList';
import { FleetDispatchBoard } from '../../features/fleet/FleetDispatchBoard';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';

export function VehicleListPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFleet(user.permissions) : false), [user]);

  const {
    data: vehicles,
    error,
    isLoading,
  } = useCachedQuery({
    queryKey: 'fleet/vehicles',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchVehicles(accessToken!),
  });

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Vehicles" description="You do not have permission to view fleet.">
        <p className="page-muted">Fleet read permission required.</p>
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Vehicles"
      description="Vehicle registry and today's dispatch board. Live GPS is on the Live Map tab."
      actions={
        <div className="page-header-actions">
          <Link href="/fleet/live-map">
            <Button variant="secondary">Live Map</Button>
          </Link>
          {canWrite ? (
            <Link href="/fleet/new">
              <Button>Add vehicle</Button>
            </Link>
          ) : null}
        </div>
      }
    >
      <FleetDispatchBoard />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(vehicles?.length ?? 0) === 0}
        emptyTitle="No vehicles yet"
        emptyDescription="Add a vehicle to start tracking your fleet."
        loadingLabel="Loading vehicles…"
      >
        <VehicleList vehicles={vehicles ?? []} canWrite={canWrite} />
      </PageLoadState>
    </FleetWorkspaceShell>
  );
}
