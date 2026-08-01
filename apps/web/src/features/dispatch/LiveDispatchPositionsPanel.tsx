import { Panel } from '@titan/ui';
import { useCartrackLivePositions } from './useCartrackLivePositions';

type LiveDispatchPositionsPanelProps = {
  accessToken: string | null;
};

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function LiveDispatchPositionsPanel({ accessToken }: LiveDispatchPositionsPanelProps) {
  const { tracking, isPolling, lastFetchedAt, error, isStale } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  if (!tracking?.cartrackConnected) {
    return (
      <Panel title="Live vehicle positions">
        <p className="page-muted">
          Cartrack is not connected. Connect Cartrack once in Integrations — positions refresh
          automatically here every 3 seconds while Live Dispatch is open.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Live vehicle positions">
      <p className="page-muted">
        Positions refresh every 3 seconds while this page is visible. Background fleet sync continues
        on the provider schedule.
      </p>

      <dl className="integration-status-list">
        <div>
          <dt>Mapped vehicles</dt>
          <dd>{tracking.mappedVehicleCount}</dd>
        </div>
        <div>
          <dt>Last fleet sync</dt>
          <dd>{tracking.lastSyncAt ? new Date(tracking.lastSyncAt).toLocaleString() : 'Never'}</dd>
        </div>
        <div>
          <dt>Live poll</dt>
          <dd>{isPolling ? 'Refreshing…' : lastFetchedAt ? formatRelativeTime(lastFetchedAt) : 'Waiting'}</dd>
        </div>
      </dl>

      {error ? <p className="form-error">{error}</p> : null}

      {tracking.latestPositions.length === 0 ? (
        <p className="page-muted">No GPS positions stored yet. Background sync will populate positions automatically.</p>
      ) : (
        <div className="integration-table-wrap">
          <table className="integration-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Speed</th>
                <th>Last position</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {tracking.latestPositions.map((position) => {
                const stale = isStale(position.recordedAt);
                return (
                  <tr key={`${position.externalVehicleId}-${position.recordedAt}`}>
                    <td>{position.vehicleName ?? 'Unmapped'}</td>
                    <td>{position.licensePlate ?? '—'}</td>
                    <td>{position.speedKmh != null ? `${Math.round(position.speedKmh)} km/h` : '—'}</td>
                    <td>{new Date(position.recordedAt).toLocaleString()}</td>
                    <td>
                      <span className={`status-pill status-pill--${stale ? 'warning' : 'success'}`}>
                        {stale ? 'Stale position' : 'Live'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
