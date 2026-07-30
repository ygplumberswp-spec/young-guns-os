import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader, Panel, StatCard, TabNav } from '@titan/ui';
import type {
  IntegrationConnectorSummary,
  IntegrationHubDashboard,
  IntegrationPlatformExecutiveDashboard,
  IntegrationProviderStatus,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import {
  fetchIntegrationPlatformDashboard,
  retryConnectorSync,
  syncIntegrationConnectors,
} from '../../lib/integration-platform-api-client';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import {
  formatConnectionStatus,
  formatConnectorStatus,
  formatProviderCategory,
  formatSyncJobStatus,
  formatWebhookEventStatus,
} from '../../features/integrations/formatters';

type DashboardSection =
  'overview' | 'providers' | 'sync_jobs' | 'webhooks' | 'api_gateway' | 'monitoring' | 'settings';

const dashboardSections: Array<{ id: DashboardSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'providers', label: 'Providers' },
  { id: 'sync_jobs', label: 'Sync Jobs' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'api_gateway', label: 'API Gateway' },
  { id: 'monitoring', label: 'Platform Monitoring' },
  { id: 'settings', label: 'Settings' },
];

function ProviderCard({ provider }: { provider: IntegrationProviderStatus }) {
  return (
    <article className="integrations-provider-card">
      <div className="integrations-provider-card__header">
        <div>
          <h3>{provider.name}</h3>
          <p className="integrations-provider-card__category">
            {formatProviderCategory(provider.category)}
          </p>
        </div>
        <span className={`integrations-status integrations-status--${provider.connectionStatus}`}>
          {formatConnectionStatus(provider.connectionStatus)}
        </span>
      </div>
      <p className="integrations-provider-card__description">{provider.description}</p>
      <dl className="integrations-provider-card__meta">
        <div>
          <dt>Configured</dt>
          <dd>{provider.isConfigured ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Sync support</dt>
          <dd>{provider.supportsSync ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Webhooks</dt>
          <dd>{provider.supportsWebhooks ? 'Yes' : 'No'}</dd>
        </div>
        {provider.lastSyncAt ? (
          <div>
            <dt>Last sync</dt>
            <dd>{new Date(provider.lastSyncAt).toLocaleString()}</dd>
          </div>
        ) : null}
        {provider.lastError ? (
          <div>
            <dt>Last error</dt>
            <dd className="form-error">{provider.lastError}</dd>
          </div>
        ) : null}
      </dl>
      {provider.settingsPath && provider.availability === 'available' ? (
        <div className="integrations-provider-card__actions">
          <Link href={provider.settingsPath}>
            <Button size="sm" variant="secondary">
              Open settings
            </Button>
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function ConnectorRow({
  connector,
  canManage,
  accessToken,
  onRetried,
}: {
  connector: IntegrationConnectorSummary;
  canManage: boolean;
  accessToken: string;
  onRetried: () => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function handleRetry() {
    setIsRetrying(true);
    setRetryError(null);
    try {
      await retryConnectorSync(accessToken, connector.id);
      onRetried();
    } catch (err) {
      setRetryError(err instanceof ApiClientError ? err.message : 'Retry failed');
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{connector.name}</strong>
        <div className="page-muted">{formatProviderCategory(connector.category)}</div>
      </td>
      <td>
        <span className={`integrations-status integrations-status--${connector.status}`}>
          {formatConnectorStatus(connector.status)}
        </span>
      </td>
      <td>{connector.authType.replace(/_/g, ' ')}</td>
      <td>{connector.syncMode.replace(/_/g, ' ')}</td>
      <td>{connector.lastSyncAt ? new Date(connector.lastSyncAt).toLocaleString() : '—'}</td>
      <td>
        {connector.lastError ? <span className="form-error">{connector.lastError}</span> : '—'}
      </td>
      <td>
        {canManage && connector.status === 'error' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isRetrying}
            onClick={() => void handleRetry()}
          >
            {isRetrying ? 'Retrying…' : 'Retry sync'}
          </Button>
        ) : null}
        {retryError ? <div className="form-error">{retryError}</div> : null}
      </td>
    </tr>
  );
}

const platformSections: DashboardSection[] = ['overview', 'providers', 'api_gateway', 'monitoring'];

export function IntegrationsDashboardPage() {
  const { accessToken, user } = useAuth();
  const [dashboard, setDashboard] = useState<IntegrationHubDashboard | null>(null);
  const [platformDashboard, setPlatformDashboard] =
    useState<IntegrationPlatformExecutiveDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingConnectors, setIsSyncingConnectors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlatformLoading, setIsPlatformLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');

  const needsPlatformData = platformSections.includes(activeSection);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const hubData = await fetchIntegrationHubDashboard(accessToken);
        if (!cancelled) {
          setDashboard(hubData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load integrations dashboard',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView || !needsPlatformData || platformDashboard) {
      return;
    }

    let cancelled = false;
    setIsPlatformLoading(true);

    async function loadPlatform() {
      try {
        const platformData = await fetchIntegrationPlatformDashboard(accessToken!);
        if (!cancelled) {
          setPlatformDashboard(platformData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load platform monitoring',
          );
        }
      } finally {
        if (!cancelled) {
          setIsPlatformLoading(false);
        }
      }
    }

    void loadPlatform();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, needsPlatformData, platformDashboard]);

  async function loadDashboards() {
    if (!accessToken || !canView) return;

    const hubData = await fetchIntegrationHubDashboard(accessToken);
    setDashboard(hubData);

    const platformData = await fetchIntegrationPlatformDashboard(accessToken);
    setPlatformDashboard(platformData);
  }

  async function handleSyncConnectors() {
    if (!accessToken) return;
    setIsSyncingConnectors(true);
    setError(null);
    try {
      await syncIntegrationConnectors(accessToken);
      await loadDashboards();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to refresh connectors');
    } finally {
      setIsSyncingConnectors(false);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader
          title="Integrations"
          description="You do not have permission to view integrations."
        />
      </div>
    );
  }

  const monitoring = platformDashboard?.monitoring;

  return (
    <div className="integrations-page">
      <PageHeader
        title="Integrations"
        description="Enterprise integration hub — API gateway, universal connectors, sync engine, and webhook management."
      />
      <IntegrationsNav />
      <TabNav
        tabs={dashboardSections}
        activeTab={activeSection}
        onChange={(sectionId) => setActiveSection(sectionId as DashboardSection)}
        ariaLabel="Integration dashboard sections"
      />

      {isLoading ? <LoadingState label="Loading integrations dashboard" /> : null}
      {isPlatformLoading && needsPlatformData ? (
        <LoadingState label="Loading platform monitoring data" />
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && activeSection === 'overview' && dashboard ? (
        <>
          {platformDashboard && monitoring ? (
            <section className="integrations-section">
              <div className="integrations-section__header">
                <h2>Connection summary</h2>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSyncingConnectors}
                    onClick={() => void handleSyncConnectors()}
                  >
                    {isSyncingConnectors ? 'Refreshing…' : 'Refresh connectors'}
                  </Button>
                ) : null}
              </div>
              <div className="stat-grid">
                <StatCard
                  label="Connected services"
                  value={String(monitoring.connectedServiceCount)}
                />
                <StatCard
                  label="Services with errors"
                  value={String(monitoring.errorServiceCount)}
                />
                <StatCard label="Active sync jobs" value={String(monitoring.activeSyncJobCount)} />
                <StatCard
                  label="Failed requests (24h)"
                  value={String(monitoring.failedRequestCount24h)}
                />
                <StatCard
                  label="Avg latency"
                  value={monitoring.avgLatencyMs != null ? `${monitoring.avgLatencyMs} ms` : '—'}
                />
                <StatCard
                  label="Success rate"
                  value={
                    monitoring.successRatePercent != null
                      ? `${monitoring.successRatePercent}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Pending actions"
                  value={String(platformDashboard.pendingActionCount)}
                />
              </div>
              <p className="page-muted">{platformDashboard.summary}</p>
            </section>
          ) : null}

          <section className="integrations-stats">
            <Panel title="Connection overview">
              <dl className="integrations-stats__grid">
                <div>
                  <dt>Providers</dt>
                  <dd>{dashboard.stats.providerCount}</dd>
                </div>
                <div>
                  <dt>Configured</dt>
                  <dd>{dashboard.stats.configuredConnectionCount}</dd>
                </div>
                <div>
                  <dt>Connected</dt>
                  <dd>{dashboard.stats.connectedCount}</dd>
                </div>
                <div>
                  <dt>Errors</dt>
                  <dd>{dashboard.stats.errorCount}</dd>
                </div>
                <div>
                  <dt>Sync jobs</dt>
                  <dd>{dashboard.stats.syncJobCount}</dd>
                </div>
                <div>
                  <dt>Webhook endpoints</dt>
                  <dd>{dashboard.stats.webhookEndpointCount}</dd>
                </div>
              </dl>
            </Panel>
          </section>

          {dashboard.providers.length > 0 ? (
            <section className="integrations-section">
              <h2>Provider status summary</h2>
              <ul className="integrations-list">
                {dashboard.providers.slice(0, 6).map((provider) => (
                  <li key={provider.provider}>
                    <strong>{provider.name}</strong> —{' '}
                    {formatConnectionStatus(provider.connectionStatus)}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState
              title="No providers configured"
              description="Configure integration providers to connect external services."
              action={
                canManage ? (
                  <Button variant="secondary" onClick={() => setActiveSection('providers')}>
                    View providers
                  </Button>
                ) : undefined
              }
            />
          )}
        </>
      ) : null}

      {!isLoading && activeSection === 'providers' && dashboard ? (
        <>
          {platformDashboard && platformDashboard.connectors.length > 0 ? (
            <section className="integrations-section">
              <h2>Universal connectors</h2>
              <div className="integrations-table-wrap">
                <table className="integrations-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Auth</th>
                      <th>Sync mode</th>
                      <th>Last sync</th>
                      <th>Last error</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformDashboard.connectors.map((connector) => (
                      <ConnectorRow
                        key={connector.id}
                        connector={connector}
                        canManage={canManage}
                        accessToken={accessToken ?? ''}
                        onRetried={() => void loadDashboards()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="integrations-section">
            <h2>Provider registry</h2>
            {dashboard.providers.length === 0 ? (
              <EmptyState
                title="No providers registered"
                description="The integration provider registry is empty."
              />
            ) : (
              <div className="integrations-provider-grid">
                {dashboard.providers.map((provider) => (
                  <ProviderCard key={provider.provider} provider={provider} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!isLoading && activeSection === 'sync_jobs' && dashboard ? (
        <section className="integrations-section">
          <Panel title="Recent sync jobs">
            {dashboard.recentSyncJobs.length === 0 ? (
              <EmptyState
                title="No sync jobs yet"
                description="Sync jobs are created when a provider sync runs."
              />
            ) : (
              <ul className="integrations-list">
                {dashboard.recentSyncJobs.map((job) => (
                  <li key={job.id}>
                    <strong>{job.providerName}</strong> — {formatSyncJobStatus(job.status)}
                    <span className="page-muted">
                      {' '}
                      · {new Date(job.startedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="integrations-section__footer">
              <Link href="/integrations/sync-jobs">View all sync jobs</Link>
            </div>
          </Panel>
        </section>
      ) : null}

      {!isLoading && activeSection === 'webhooks' && dashboard ? (
        <section className="integrations-section">
          <Panel title="Recent webhook events">
            {dashboard.recentWebhookEvents.length === 0 ? (
              <EmptyState
                title="No webhook events yet"
                description="Events appear when inbound webhooks are received."
              />
            ) : (
              <ul className="integrations-list">
                {dashboard.recentWebhookEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.eventType}</strong> — {formatWebhookEventStatus(event.status)}
                    <span className="page-muted">
                      {' '}
                      · {new Date(event.receivedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="integrations-section__footer">
                <Link href="/integrations/webhooks">Manage webhooks</Link>
              </div>
            ) : null}
          </Panel>
        </section>
      ) : null}

      {!isLoading && activeSection === 'api_gateway' && platformDashboard ? (
        <section className="integrations-section">
          {platformDashboard.recentTraces.length === 0 ? (
            <EmptyState
              title="No gateway traces"
              description="API gateway traces appear when requests are logged."
            />
          ) : (
            <Panel title="Recent API gateway traces">
              <div className="integrations-table-wrap">
                <table className="integrations-table">
                  <thead>
                    <tr>
                      <th>Trace ID</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformDashboard.recentTraces.map((trace) => (
                      <tr key={trace.id}>
                        <td className="page-muted">{trace.traceId.slice(0, 8)}…</td>
                        <td>{trace.method}</td>
                        <td>{trace.path}</td>
                        <td>{trace.statusCode ?? '—'}</td>
                        <td>{trace.durationMs != null ? `${trace.durationMs} ms` : '—'}</td>
                        <td>{new Date(trace.occurredAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </section>
      ) : null}

      {!isLoading && activeSection === 'monitoring' && platformDashboard ? (
        <>
          {monitoring ? (
            <section className="integrations-section">
              <h2>Platform monitoring</h2>
              <div className="stat-grid">
                <StatCard
                  label="Connected services"
                  value={String(monitoring.connectedServiceCount)}
                />
                <StatCard
                  label="Services with errors"
                  value={String(monitoring.errorServiceCount)}
                />
                <StatCard label="Active sync jobs" value={String(monitoring.activeSyncJobCount)} />
                <StatCard
                  label="Failed requests (24h)"
                  value={String(monitoring.failedRequestCount24h)}
                />
                <StatCard
                  label="Avg latency"
                  value={monitoring.avgLatencyMs != null ? `${monitoring.avgLatencyMs} ms` : '—'}
                />
                <StatCard
                  label="Success rate"
                  value={
                    monitoring.successRatePercent != null
                      ? `${monitoring.successRatePercent}%`
                      : '—'
                  }
                />
                <StatCard label="Rate limit" value={monitoring.rateLimitStatus} />
              </div>
            </section>
          ) : null}
          {platformDashboard.vaultEntries.length > 0 ? (
            <section className="integrations-section">
              <Panel title="API credentials vault">
                <div className="integrations-table-wrap">
                  <table className="integrations-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Auth type</th>
                        <th>Hint</th>
                        <th>Encrypted</th>
                        <th>Expires</th>
                        <th>Rotation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformDashboard.vaultEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.provider}</td>
                          <td>{entry.authType.replace(/_/g, ' ')}</td>
                          <td>{entry.credentialHint ?? '—'}</td>
                          <td>{entry.encrypted ? 'Yes' : 'No'}</td>
                          <td>
                            {entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString() : '—'}
                          </td>
                          <td>{entry.rotationRequired ? 'Required' : 'OK'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </section>
          ) : (
            <EmptyState
              title="No vault entries"
              description="Credential metadata appears when providers are configured."
            />
          )}
        </>
      ) : null}

      {!isLoading && activeSection === 'settings' ? (
        <section className="integrations-section">
          <Panel title="Provider settings">
            <ul className="integrations-list">
              <li>
                <Link href="/integrations/xero">Xero accounting</Link>
              </li>
              <li>
                <Link href="/integrations/email">Email</Link>
              </li>
              <li>
                <Link href="/integrations/whatsapp">WhatsApp</Link>
              </li>
              <li>
                <Link href="/integrations/yoco">Yoco payments</Link>
              </li>
              <li>
                <Link href="/integrations/cartrack">Cartrack fleet</Link>
              </li>
              <li>
                <Link href="/integrations/webhooks">Webhook endpoints</Link>
              </li>
            </ul>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
