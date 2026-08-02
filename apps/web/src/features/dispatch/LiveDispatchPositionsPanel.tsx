import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import {
  deriveFleetPositionHealth,
  formatFleetConnectionDisplayLabel,
  formatFleetPositionHealthLabel,
} from '@titan/shared';
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

  if (!tracking) {
    return (
      <Panel title="Vehicle positions">
        <p className="page-muted">
          {error ? error : 'Loading Cartrack connection state…'}
        </p>
      </Panel>
    );
  }

  const connectionLabel = formatFleetConnectionDisplayLabel(tracking.connectionDisplayState);
  const canShowLivePoll = tracking.livePollingAllowed;
  const showStoredPositions = tracking.cartrackConnected || tracking.latestPositions.length > 0;

  if (!tracking.cartrackConnected && tracking.latestPositions.length === 0) {
    return (
      <Panel title="Vehicle positions" description="Honest Cartrack connection state — no fake live GPS.">
        <dl className="integration-status-list">
          <div>
            <dt>Connection</dt>
            <dd>
              <span className="status-pill status-pill--warning">{connectionLabel}</span>
            </dd>
          </div>
          <div>
            <dt>Last successful sync</dt>
            <dd>{tracking.lastSyncAt ? new Date(tracking.lastSyncAt).toLocaleString() : 'Never'}</dd>
          </div>
          <div>
            <dt>Credentials</dt>
            <dd>{tracking.hasCredentials ? 'Present' : 'Missing'}</dd>
          </div>
          <div>
            <dt>Live polling</dt>
            <dd>Disabled</dd>
          </div>
        </dl>
        {tracking.lastError ? <p className="form-error">{tracking.lastError}</p> : null}
        <p className="page-muted">
          Positions are not labelled live while Cartrack is disconnected, misconfigured, or in
          error. Connect and sync from{' '}
          <Link href="/integrations/cartrack" className="jobs-link">
            Cartrack settings
          </Link>
          .
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Vehicle positions"
      description={
        canShowLivePoll
          ? 'Real Cartrack GPS from the last successful sync. Polling uses the existing tracking endpoint while this board is open.'
          : 'Stored Cartrack GPS only — live polling is disabled while sync is stale, degraded, disconnected, or credentials are missing. TITAN will not invent coordinates.'
      }
    >
      <dl className="integration-status-list">
        <div>
          <dt>Connection</dt>
          <dd>
            <span
              className={`status-pill status-pill--${
                tracking.connectionDisplayState === 'connected'
                  ? 'success'
                  : tracking.connectionDisplayState === 'stale' ||
                      tracking.connectionDisplayState === 'degraded'
                    ? 'warning'
                    : 'disabled'
              }`}
            >
              {connectionLabel}
            </span>
          </dd>
        </div>
        <div>
          <dt>Mapped vehicles</dt>
          <dd>{tracking.mappedVehicleCount}</dd>
        </div>
        <div>
          <dt>Last successful sync</dt>
          <dd>{tracking.lastSyncAt ? new Date(tracking.lastSyncAt).toLocaleString() : 'Never'}</dd>
        </div>
        <div>
          <dt>Credentials</dt>
          <dd>{tracking.hasCredentials ? 'Present' : 'Missing'}</dd>
        </div>
        <div>
          <dt>Live polling</dt>
          <dd>
            {canShowLivePoll
              ? isPolling
                ? 'Refreshing…'
                : lastFetchedAt
                  ? formatRelativeTime(lastFetchedAt)
                  : 'Waiting'
              : 'Disabled'}
          </dd>
        </div>
      </dl>

      {tracking.lastError ? <p className="form-error">{tracking.lastError}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!showStoredPositions || tracking.latestPositions.length === 0 ? (
        <p className="page-muted">
          No GPS positions stored yet. Run a Cartrack sync to populate mapped vehicle positions —
          TITAN will not invent coordinates.
        </p>
      ) : (
        <div className="integration-table-wrap">
          <table className="integration-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Make / model</th>
                <th>Driver / assignee</th>
                <th>Ignition</th>
                <th>Speed</th>
                <th>Odometer</th>
                <th>Last position</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {tracking.latestPositions.map((position) => {
                const health = deriveFleetPositionHealth({
                  cartrackConnected: tracking.cartrackConnected,
                  recordedAt: position.recordedAt,
                });
                const stale = isStale(position.recordedAt);
                return (
                  <tr key={`${position.externalVehicleId}-${position.recordedAt}`}>
                    <td>{position.vehicleName ?? 'Unmapped'}</td>
                    <td>{position.licensePlate ?? '—'}</td>
                    <td>
                      {[position.make, position.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td>
                      {position.driverName || position.assignedUserName || '—'}
                    </td>
                    <td>
                      {position.ignitionOn == null
                        ? '—'
                        : position.ignitionOn
                          ? 'On'
                          : 'Off'}
                    </td>
                    <td>
                      {position.speedKmh != null ? `${Math.round(position.speedKmh)} km/h` : '—'}
                    </td>
                    <td>
                      {position.odometerKm != null
                        ? `${Math.round(position.odometerKm)} km`
                        : '—'}
                    </td>
                    <td>
                      {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
                      <br />
                      <span className="page-muted">
                        {new Date(position.recordedAt).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill status-pill--${
                          health === 'live' ? 'success' : 'warning'
                        }`}
                      >
                        {formatFleetPositionHealthLabel(health)}
                        {stale ? ` · ${formatRelativeTime(position.recordedAt)}` : ''}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="page-muted" style={{ marginTop: '0.75rem' }}>
        Trips and behaviour events remain on{' '}
        <Link href="/fleet-intelligence" className="jobs-link">
          Fleet Intelligence
        </Link>
        . Geofence records are not available in this release.
      </p>
    </Panel>
  );
}
