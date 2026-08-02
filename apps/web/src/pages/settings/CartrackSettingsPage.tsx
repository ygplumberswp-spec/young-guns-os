import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import {
  INTEGRATION_CONNECTION_STATUS_OPTIONS,
  deriveFleetConnectionDisplayState,
  formatFleetConnectionDisplayLabel,
  type CartrackConnectionSummary,
  type IntegrationVehicleMappingSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchVehicles } from '../../lib/fleet-api';
import {
  disconnectCartrack,
  fetchCartrackConnection,
  fetchCartrackMappings,
  saveCartrackConnection,
  syncCartrack,
  updateCartrackMapping,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';

function formatConnectionStatus(status: CartrackConnectionSummary['status']): string {
  return (
    INTEGRATION_CONNECTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

export function CartrackSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<CartrackConnectionSummary | null>(null);
  const [mappings, setMappings] = useState<IntegrationVehicleMappingSummary[]>([]);
  const [vehicles, setVehicles] = useState<Awaited<ReturnType<typeof fetchVehicles>>>([]);
  const [baseUrl, setBaseUrl] = useState('https://fleetapi-za.cartrack.com/rest');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) {
      return;
    }

    const [connectionData, mappingData, vehicleData] = await Promise.all([
      fetchCartrackConnection(accessToken),
      fetchCartrackMappings(accessToken),
      fetchVehicles(accessToken).catch(() => []),
    ]);

    setConnection(connectionData);
    setMappings(mappingData);
    setVehicles(vehicleData);

    if (connectionData.baseUrl) {
      setBaseUrl(connectionData.baseUrl);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadPageData();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load Cartrack settings',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveCartrackConnection(accessToken, { baseUrl, username, password });
      setConnection(updated);
      setPassword('');
      setSuccess('Cartrack connected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Cartrack');
      if (accessToken) {
        const latest = await fetchCartrackConnection(accessToken).catch(() => null);
        if (latest) setConnection(latest);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await disconnectCartrack(accessToken);
      setConnection(updated);
      setMappings([]);
      setPassword('');
      setSuccess('Cartrack disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Cartrack');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSync() {
    if (!accessToken || !canManage) return;

    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await syncCartrack(accessToken);
      setSuccess(
        `Sync complete: ${result.externalVehicleCount} external vehicles, ${result.positionsStored} GPS positions stored.`,
      );
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sync Cartrack data');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleMappingChange(mappingId: string, vehicleId: string) {
    if (!accessToken || !canManage) return;

    setError(null);

    try {
      await updateCartrackMapping(accessToken, mappingId, {
        vehicleId: vehicleId || null,
        status: vehicleId ? 'mapped' : 'unmapped',
      });
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update vehicle mapping');
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader
          title="Cartrack GPS"
          description="You do not have permission to view integrations."
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="integrations-page">
        <PageHeader
          title="Cartrack GPS"
          description="Connect Cartrack to sync vehicles and store live GPS positions for your fleet."
        />
        <IntegrationsNav />
        <p className="page-muted">Loading Cartrack settings…</p>
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Cartrack GPS"
        description="Connect Cartrack to sync vehicles and store live GPS positions for your fleet."
      />
      <IntegrationsNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Connection status">
        <dl className="integration-status-list">
          <div>
            <dt>Provider status</dt>
            <dd>{connection ? formatConnectionStatus(connection.status) : 'Disconnected'}</dd>
          </div>
          <div>
            <dt>Fleet health</dt>
            <dd>
              {connection
                ? formatFleetConnectionDisplayLabel(
                    deriveFleetConnectionDisplayState({
                      connectionStatus: connection.status,
                      hasCredentials: connection.hasCredentials,
                      lastSyncAt: connection.lastSyncAt,
                      lastError: connection.lastError,
                    }),
                  )
                : 'Not configured'}
            </dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{connection?.baseUrl ?? 'Not configured'}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{connection?.usernameHint ?? 'Not configured'}</dd>
          </div>
          <div>
            <dt>Last successful sync</dt>
            <dd>
              {connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}
            </dd>
          </div>
          <div>
            <dt>Credentials</dt>
            <dd>{connection?.hasCredentials ? 'Present' : 'Missing'}</dd>
          </div>
          <div>
            <dt>Mapped vehicles</dt>
            <dd>{connection?.mappedVehicleCount ?? 0}</dd>
          </div>
          <div>
            <dt>GPS positions stored</dt>
            <dd>{connection?.positionCount ?? 0}</dd>
          </div>
          {connection?.lastError ? (
            <div>
              <dt>Last error</dt>
              <dd className="integration-status-list__error">{connection.lastError}</dd>
            </div>
          ) : null}
        </dl>
        <p className="page-muted">
          Live positions on Fleet Dispatch never claim “live” when disconnected, credentials are
          missing, sync is stale, or a position is older than two minutes.
        </p>
      </Panel>

      {canManage ? (
        <Panel title="Connect Cartrack">
          <form className="settings-form" onSubmit={(event) => void handleConnect(event)}>
            <Input
              label="API base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://fleetapi-za.cartrack.com/rest"
              required
            />
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <p className="page-muted">
              Credentials are encrypted at rest and never returned to the browser after saving.
              Connection is verified against the live Cartrack API before being marked connected.
            </p>
            <div className="integration-actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? 'Connecting…'
                  : connection?.status === 'connected'
                    ? 'Update connection'
                    : 'Connect'}
              </Button>
              {connection?.status === 'connected' ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSyncing}
                    onClick={() => void handleSync()}
                  >
                    {isSyncing ? 'Syncing…' : 'Sync now'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSaving}
                    onClick={() => void handleDisconnect()}
                  >
                    Disconnect
                  </Button>
                </>
              ) : null}
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title="Vehicle sync mappings">
        {mappings.length === 0 ? (
          <p className="page-muted">
            No Cartrack vehicles synced yet. Connect Cartrack and run a sync to import external
            vehicles.
          </p>
        ) : (
          <div className="integration-table-wrap">
            <table className="integration-table">
              <thead>
                <tr>
                  <th>External vehicle</th>
                  <th>Registration</th>
                  <th>Status</th>
                  <th>Titan vehicle</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td>{mapping.externalName ?? mapping.externalVehicleId}</td>
                    <td>{mapping.externalRegistration ?? '—'}</td>
                    <td>{mapping.status}</td>
                    <td>
                      {canManage ? (
                        <select
                          className="titan-input"
                          value={mapping.vehicleId ?? ''}
                          onChange={(e) => void handleMappingChange(mapping.id, e.target.value)}
                        >
                          <option value="">Unmapped</option>
                          {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.name} ({vehicle.licensePlate})
                            </option>
                          ))}
                        </select>
                      ) : (
                        (mapping.vehicleName ?? 'Unmapped')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="page-muted">
        Need Titan vehicles first?{' '}
        <Link href="/fleet" className="integration-link">
          Manage fleet
        </Link>
      </p>
    </div>
  );
}
