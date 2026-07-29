import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet, canManageFleet, VehicleList } from '../../features/fleet/VehicleList';

export function VehicleListPage() {
  const { accessToken, user } = useAuth();
  const [vehicles, setVehicles] = useState<Awaited<ReturnType<typeof fetchVehicles>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFleet(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadVehicles() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchVehicles(accessToken);
        if (!cancelled) setVehicles(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load vehicles');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadVehicles();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

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
        description="Manage company vehicles and driver assignments."
        actions={
          canWrite ? (
            <Link href="/fleet/new">
              <Button>Add vehicle</Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? <p className="page-muted">Loading vehicles…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? <VehicleList vehicles={vehicles} canWrite={canWrite} /> : null}
    </div>
  );
}
