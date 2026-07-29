import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileRouteIntelligence } from '@titan/shared';
import { MobileApiClientError, fetchMobileRoute } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileRoutePage() {
  const { accessToken } = useAuth();
  const [route, setRoute] = useState<MobileRouteIntelligence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileRoute(accessToken);
        if (!cancelled) setRoute(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load route');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (isLoading) return <p className="page-muted">Loading route…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!route) return <EmptyState title="No route data" description="Route intelligence is unavailable." />;

  return (
    <div className="portal-page">
      <PageHeader
        title="Route intelligence"
        description={`${route.route.stopCount} stop(s) · Cartrack ${route.cartrackConnected ? 'connected' : 'disconnected'}`}
      />

      {route.route.nextDestination ? (
        <Panel title="Next destination">
          <p>
            <strong>{route.route.nextDestination.title}</strong> — {route.route.nextDestination.customerName}
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

      {route.latestGps ? (
        <Panel title="Latest GPS">
          <p>
            {route.latestGps.latitude.toFixed(5)}, {route.latestGps.longitude.toFixed(5)}
          </p>
          <p className="page-muted">Recorded {new Date(route.latestGps.recordedAt).toLocaleString()}</p>
        </Panel>
      ) : null}

      <Panel title="Travel history">
        {route.travelHistory.length === 0 ? (
          <p className="page-muted">No travel history recorded.</p>
        ) : (
          <ul className="portal-list">
            {route.travelHistory.slice(0, 15).map((entry, index) => (
              <li key={`${entry.startedAt}-${index}`}>
                <strong>{entry.entryType}</strong>
                <span>
                  {entry.jobTitle ?? 'General'} · {new Date(entry.startedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
