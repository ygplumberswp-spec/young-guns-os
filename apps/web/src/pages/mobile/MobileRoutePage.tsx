import { PageHeader, Panel } from '@titan/ui';
import { fetchMobileRoute } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileRoutePage() {
  const { accessToken } = useAuth();

  const routeQuery = useStaffCachedQuery({
    queryKey: 'mobile/route',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileRoute(accessToken!),
  });

  const route = routeQuery.data;

  return (
    <div className="portal-page">
      <PageHeader
        title="Route intelligence"
        description="Today's stops, next destination and fleet connection status."
      />

      <AnalyticsTabPanel
        isLoading={routeQuery.isLoading}
        error={routeQuery.error}
        hasData={route !== undefined}
        isEmpty={route !== undefined && route.route.stopCount === 0}
        emptyTitle="No route data"
        emptyDescription="Route intelligence is unavailable or you have no active stops."
        loadingLabel="Loading route…"
        onRetry={() => void routeQuery.refetch()}
      >
        {route ? (
          <>
            {route.route.nextDestination ? (
              <Panel title="Next destination">
                <p>
                  <strong>{route.route.nextDestination.title}</strong> —{' '}
                  {route.route.nextDestination.customerName}
                </p>
                {route.route.assignedVehicleName ? (
                  <p>
                    Vehicle: {route.route.assignedVehicleName} ({route.route.assignedVehiclePlate})
                  </p>
                ) : null}
              </Panel>
            ) : null}

            <Panel title="Route stops">
              {route.route.stops.length === 0 ? (
                <p className="page-muted">No active stops on your route.</p>
              ) : (
                <ul className="portal-list">
                  {route.route.stops.map((stop) => (
                    <li key={stop.jobId}>
                      <strong>
                        {stop.sequence}. {stop.title}
                      </strong>
                      <span>
                        {stop.customerName} · {stop.status}
                        {stop.scheduledAt ? ` · ${new Date(stop.scheduledAt).toLocaleString()}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Fleet status">
              <p>
                Cartrack {route.cartrackConnected ? 'connected' : 'disconnected'} ·{' '}
                {route.route.stopCount} stop(s)
              </p>
            </Panel>
          </>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
