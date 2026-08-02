import { PageHeader } from '../../components/ux';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageLoadState } from '@titan/ui';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canAccessFleet, canManageFleet, VehicleList } from '../../features/fleet/VehicleList';
import { FleetDispatchBoard } from '../../features/fleet/FleetDispatchBoard';

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
      <div className="fleet-page">
        <PageHeader title="Fleet" description="You do not have permission to view fleet." />
      </div>
    );
  }

  return (
    <div className="fleet-page">
      <PageHeader
        title="Fleet"
        description="Company vehicles, driver assignments, and Cartrack positions when connected — never fake live GPS."
        actions={
          canWrite ? (
            <Link href="/fleet/new">
              <Button>Add Vehicle</Button>
            </Link>
          ) : undefined
        }
      />

      <FleetDispatchBoard />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(vehicles?.length ?? 0) === 0}
        emptyTitle="No Vehicles Yet"
        emptyDescription="Add a vehicle to start tracking your fleet."
        loadingLabel="Loading vehicles…"
      >
        <VehicleList vehicles={vehicles ?? []} canWrite={canWrite} />
      </PageLoadState>
    </div>
  );
}
