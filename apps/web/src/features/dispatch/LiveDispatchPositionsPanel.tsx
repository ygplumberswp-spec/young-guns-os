import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import {
  CARTRACK_SLOW_SNAPSHOT_BANNER,
  deriveFleetPositionHealth,
  formatFleetConnectionDisplayLabel,
  formatFleetPositionHealthLabel,
  buildVehiclePositionNavigateUrl,
  formatVehiclePositionFreshness,
  resolveVehiclePositionAddressDisplay,
} from '@titan/shared';
import { useCartrackLivePositions } from './useCartrackLivePositions';
import { VehiclePositionCard } from '../fleet/VehiclePositionAddress';

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
      <Panel title="Vehicle Positions">
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
      <Panel title="Vehicle Positions" description="Honest Cartrack connection state — no fake live GPS.">
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
      title="Vehicle Positions"
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

      {tracking.providerRefresh?.showingCachedSnapshot ? (
        <p className="form-warning" role="status">
          {CARTRACK_SLOW_SNAPSHOT_BANNER}
          {tracking.providerRefresh.failedEndpoint
            ? ` Failed endpoint: ${tracking.providerRefresh.failedEndpoint}.`
            : ''}
        </p>
      ) : null}
      {tracking.lastError && !tracking.providerRefresh?.showingCachedSnapshot ? (
        <p className="form-error">{tracking.lastError}</p>
      ) : null}
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
                <th>Address</th>
                <th>Make / model</th>
                <th>Driver / assignee</th>
                <th>Ignition</th>
                <th>Speed</th>
                <th>Odometer</th>
                <th>Last position</th>
                <th>Health</th>
                <th>Reach vehicle</th>
              </tr>
            </thead>
            <tbody>
              {tracking.latestPositions.map((position) => {
                const health = deriveFleetPositionHealth({
                  cartrackConnected: tracking.cartrackConnected,
                  recordedAt: position.recordedAt,
                });
                const stale = isStale(position.recordedAt);
                const addressDisplay = resolveVehiclePositionAddressDisplay({
                  result: position.address,
                  latitude: position.latitude,
                  longitude: position.longitude,
                  recordedAt: position.recordedAt,
                  cartrackConnected: tracking.cartrackConnected,
                });
                const navigateUrl = buildVehiclePositionNavigateUrl({
                  latitude: position.latitude,
                  longitude: position.longitude,
                });
                return (
                  <tr key={`${position.externalVehicleId}-${position.recordedAt}`}>
                    <td>{position.vehicleName ?? 'Unmapped'}</td>
                    <td>{position.licensePlate ?? '—'}</td>
                    <td title={addressDisplay.note ?? undefined}>
                      {addressDisplay.line}
                      {addressDisplay.note ? (
                        <>
                          <br />
                          <span className="page-muted">{addressDisplay.note}</span>
                        </>
                      ) : null}
                    </td>
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
                      <br />
                      <span className="page-muted">
                        {formatVehiclePositionFreshness(position.recordedAt)}
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
                    <td>
                      {navigateUrl ? (
                        <a href={navigateUrl} target="_blank" rel="noreferrer">
                          Navigate
                        </a>
                      ) : (
                        <span className="page-muted">No usable coordinate</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tracking.latestPositions.length > 0 ? (
        <>
          <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
            Reach a vehicle
          </h3>
          <p className="page-muted">
            Readable addresses are reverse-geocoded from the stored Cartrack coordinate and cached —
            the coordinate stays the source of truth. Sharing opens your own messaging app; TITAN
            does not send or confirm delivery.
          </p>
          <div className="vehicle-position-grid">
            {tracking.latestPositions.slice(0, 12).map((position) => (
              <VehiclePositionCard
                key={`reach-${position.externalVehicleId}-${position.recordedAt}`}
                position={position}
                cartrackConnected={tracking.cartrackConnected}
              />
            ))}
          </div>
        </>
      ) : null}

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
