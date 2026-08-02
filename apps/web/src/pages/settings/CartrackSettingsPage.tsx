import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Panel } from '@titan/ui';
import { isCompanyOwnerRole } from '@titan/auth/browser';
import {
  type CartrackConnectionSummary,
  type IntegrationVehicleMappingSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchVehicles } from '../../lib/fleet-api';
import {
  disconnectCartrack,
  fetchCartrackConnection,
  fetchCartrackMappings,
  replaceCartrackCredentials,
  saveCartrackConnection,
  updateCartrackMapping,
  verifyStoredCartrackConnection,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { IntegrationConnectionLock } from '../../features/integrations/IntegrationConnectionLock';
import { CartrackSyncPanel } from '../../features/integrations/CartrackSyncPanel';
import { SettingsNav } from '../../features/settings/SettingsNav';

const CONNECT_FIELD_KEYS = ['baseUrl', 'username', 'password'] as const;

function reviewCategoryModifier(category: IntegrationVehicleMappingSummary['reviewCategory']): string {
  switch (category) {
    case 'auto_matched':
      return 'success';
    case 'ambiguous_match':
      return 'warning';
    case 'no_titan_vehicle':
      return 'muted';
    default:
      return 'neutral';
  }
}

export function CartrackSettingsPage() {
  const { accessToken, user } = useAuth();
  const [location] = useLocation();
  const isSettingsFleetRoute = location === '/settings/cartrack';
  const [connection, setConnection] = useState<CartrackConnectionSummary | null>(null);
  const [mappings, setMappings] = useState<IntegrationVehicleMappingSummary[]>([]);
  const [vehicles, setVehicles] = useState<Awaited<ReturnType<typeof fetchVehicles>>>([]);
  const [formValues, setFormValues] = useState({
    baseUrl: 'https://fleetapi-za.cartrack.com/rest',
    username: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);
  const isOwner = useMemo(
    () =>
      user
        ? isCompanyOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

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

    setFormValues((current) => ({
      baseUrl: connectionData.baseUrl ?? current.baseUrl,
      username: '',
      password: '',
    }));
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

  function resetCredentialFields() {
    setFormValues((current) => ({
      ...current,
      username: '',
      password: '',
    }));
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveCartrackConnection(accessToken, formValues);
      setConnection(updated);
      resetCredentialFields();
      setSuccess('Cartrack connected successfully. Vehicle discovery and background sync will start automatically.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Cartrack');
      if (accessToken) {
        const latest = await fetchCartrackConnection(accessToken).catch(() => null);
        if (latest) setConnection(latest);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReplaceCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !isOwner) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await replaceCartrackCredentials(accessToken, formValues);
      setConnection(updated);
      resetCredentialFields();
      setSuccess('Cartrack credentials replaced successfully.');
      await loadPageData();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Credential validation failed. Your previous connection was preserved.',
      );
      if (accessToken) {
        const latest = await fetchCartrackConnection(accessToken).catch(() => null);
        if (latest) setConnection(latest);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await disconnectCartrack(accessToken);
      setConnection(updated);
      setMappings([]);
      resetCredentialFields();
      setSuccess('Cartrack disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Cartrack');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerifyStored() {
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await verifyStoredCartrackConnection(accessToken);
      setConnection(updated);
      setSuccess('Stored Cartrack credentials verified successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify stored credentials');
    } finally {
      setIsBusy(false);
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

  const reviewMappings = mappings.filter((mapping) => mapping.reviewCategory !== 'auto_matched');
  const autoMappedMappings = mappings.filter((mapping) => mapping.reviewCategory === 'auto_matched');
  const workspaceNav = isSettingsFleetRoute ? <SettingsNav /> : null;
  const integrationBreadcrumbs = isSettingsFleetRoute
    ? undefined
    : [
        { label: 'Settings', href: '/settings/company' },
        { label: 'Integrations', href: '/integrations' },
        { label: 'Cartrack' },
      ];
  const pageDescription =
    'Connect Cartrack once — vehicles, GPS positions, and fleet data sync automatically in the background.';

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
        {workspaceNav}
        <PageHeader
          title="Cartrack GPS"
          description={pageDescription}
          breadcrumbs={integrationBreadcrumbs}
        />
        <p className="page-muted">Loading Cartrack settings…</p>
      </div>
    );
  }

  return (
    <div className="integrations-page">
      {workspaceNav}
      <PageHeader
        title="Cartrack GPS"
        description={pageDescription}
        breadcrumbs={integrationBreadcrumbs}
      />

      {connection ? (
        <IntegrationConnectionLock
          providerName="Cartrack"
          status={connection.status}
          isConnected={connection.hasCredentials}
          canManage={canManage}
          isOwner={isOwner}
          isBusy={isBusy}
          error={error}
          success={success}
          statusRows={[
            { label: 'Base URL', value: connection.baseUrl ?? 'Not configured' },
            { label: 'Username', value: connection.usernameHint ?? 'Not configured' },
            {
              label: 'Last successful sync',
              value: connection.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString()
                : 'Never',
            },
            {
              label: 'Next automatic sync',
              value: connection.nextScheduledSyncAt
                ? new Date(connection.nextScheduledSyncAt).toLocaleString()
                : 'Pending schedule',
            },
            { label: 'Sync health', value: connection.syncHealth },
            { label: 'Mapped vehicles', value: String(connection.mappedVehicleCount) },
            { label: 'GPS positions stored', value: String(connection.positionCount) },
          ]}
          connectFields={[
            {
              key: 'baseUrl',
              label: 'API base URL',
              autoComplete: 'off',
              placeholder: 'https://fleetapi-za.cartrack.com/rest',
            },
            {
              key: 'username',
              label: 'Username',
              autoComplete: 'off',
            },
            {
              key: 'password',
              label: 'Password',
              type: 'password',
              autoComplete: 'new-password',
            },
          ]}
          connectValues={formValues}
          onConnectValueChange={(key, value) => {
            if (!CONNECT_FIELD_KEYS.includes(key as (typeof CONNECT_FIELD_KEYS)[number])) {
              return;
            }
            setFormValues((current) => ({ ...current, [key]: value }));
          }}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onReplaceCredentials={handleReplaceCredentials}
          onVerifyStored={handleVerifyStored}
          connectHelpText="Credentials are encrypted at rest, validated against the live Cartrack API before saving, and never returned to the browser."
          recoveryContent={
            accessToken ? (
              <CartrackSyncPanel
                accessToken={accessToken}
                connection={connection}
                canManage={canManage}
                onConnectionChange={loadPageData}
              />
            ) : null
          }
        />
      ) : null}

      <Panel title="Vehicle mappings">
        {mappings.length === 0 ? (
          <p className="page-muted">
            No Cartrack vehicles discovered yet. Connect Cartrack to import vehicles and auto-map
            exact registration matches.
          </p>
        ) : (
          <>
            {autoMappedMappings.length > 0 ? (
              <div className="integration-mapping-group">
                <h3 className="integration-mapping-group__title">Automatically matched</h3>
                <div className="integration-table-wrap">
                  <table className="integration-table">
                    <thead>
                      <tr>
                        <th>External vehicle</th>
                        <th>Registration</th>
                        <th>Titan vehicle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoMappedMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td>{mapping.externalName ?? mapping.externalVehicleId}</td>
                          <td>{mapping.externalRegistration ?? '—'}</td>
                          <td>
                            {mapping.vehicleName
                              ? `${mapping.vehicleName} (${mapping.vehicleLicensePlate ?? '—'})`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {reviewMappings.length > 0 ? (
              <div className="integration-mapping-group">
                <h3 className="integration-mapping-group__title">Needs review</h3>
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
                      {reviewMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td>{mapping.externalName ?? mapping.externalVehicleId}</td>
                          <td>{mapping.externalRegistration ?? '—'}</td>
                          <td>
                            <span
                              className={`status-pill status-pill--${reviewCategoryModifier(mapping.reviewCategory)}`}
                            >
                              {mapping.reviewLabel}
                            </span>
                          </td>
                          <td>
                            {canManage &&
                            (mapping.reviewCategory === 'needs_review' ||
                              mapping.reviewCategory === 'ambiguous_match') ? (
                              <select
                                className="titan-input"
                                value={mapping.vehicleId ?? ''}
                                onChange={(event) =>
                                  void handleMappingChange(mapping.id, event.target.value)
                                }
                              >
                                <option value="">Select vehicle</option>
                                {vehicles.map((vehicle) => (
                                  <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.name} ({vehicle.licensePlate})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              (mapping.vehicleName ?? '—')
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
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
