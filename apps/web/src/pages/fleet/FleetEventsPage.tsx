import { useMemo } from 'react';
import { Button, LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { fetchFleetEvents } from '../../lib/fleet-api';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetEventsPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data, error, isLoading, refetch } = useCachedQuery({
    queryKey: 'fleet/events',
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () => fetchFleetEvents(accessToken!),
  });

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Events" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Events"
        description="Provider-derived fleet events — view and acknowledge. No remote vehicle commands."
      />

      {isLoading ? <LoadingState label="Loading events…" /> : null}
      {error ? (
        <Panel title="Unable to load events">
          <p className="form-error">{error}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Panel>
      ) : null}

      {data && data.capability !== 'available' ? (
        <FleetCapabilityState capability={data.capability} title="Events unavailable" />
      ) : null}

      {data?.capability === 'available' && data.events.length === 0 ? (
        <FleetCapabilityState
          capability="waiting_for_provider_data"
          title="No events recorded"
          description="Harsh driving, geofence, and ignition events appear when Cartrack exposes them."
        />
      ) : null}

      {data && data.events.length > 0 ? (
        <Panel title={`Events (${data.events.length})`}>
          <ul className="portal-list">
            {data.events.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.eventType.replace(/_/g, ' ')} · {event.registration ?? 'Vehicle'}
                </strong>
                <span>{event.description}</span>
                <span>{new Date(event.occurredAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
