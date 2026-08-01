import { useMemo } from 'react';
import { Button, LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchFleetEvents } from '../../lib/fleet-api';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetAlertsPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data, error, isLoading, refetch } = useCachedQuery({
    queryKey: 'fleet/alerts',
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () => fetchFleetEvents(accessToken!),
  });

  const alerts = useMemo(
    () => (data?.events ?? []).filter((event) => event.severity !== 'info'),
    [data?.events],
  );

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Alerts" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Alerts"
        description="Daily fleet alerts from real Cartrack-derived signals — stale GPS, offline trackers, and reported speeding."
      />

      {isLoading ? <LoadingState label="Loading alerts…" /> : null}
      {error ? (
        <Panel title="Unable to load alerts">
          <p className="form-error">{error}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Panel>
      ) : null}

      {data && data.capability !== 'available' ? (
        <FleetCapabilityState capability={data.capability} title="Alerts unavailable" />
      ) : null}

      {data?.capability === 'available' && alerts.length === 0 ? (
        <FleetCapabilityState
          capability="available"
          title="No active alerts"
          description="Alerts appear when Cartrack reports stale GPS, offline trackers, or speeding events."
        />
      ) : null}

      {alerts.length > 0 ? (
        <Panel title={`Alerts (${alerts.length})`}>
          <ul className="portal-list">
            {alerts.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.registration ?? 'Vehicle'} · {event.eventType.replace(/_/g, ' ')}
                </strong>
                <span>{event.description}</span>
                <span>
                  {new Date(event.occurredAt).toLocaleString()}
                  {event.driverName ? ` · ${event.driverName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
