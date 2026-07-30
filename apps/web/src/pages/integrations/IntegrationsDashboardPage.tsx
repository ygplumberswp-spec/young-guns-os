import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { IntegrationProviderStatus } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import {
  fetchIntegrationPlatformDashboard,
  fetchIntegrationTraces,
  fetchIntegrationVault,
  syncIntegrationConnectors,
} from '../../lib/integration-platform-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { useCachedQuery } from '../../lib/use-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import {
  formatConnectionStatus,
  formatProviderCategory,
  formatSyncJobStatus,
  formatWebhookEventStatus,
} from '../../features/integrations/formatters';

const PROVIDER_GROUPS: Array<{ id: string; label: string; providers: string[] }> = [
  { id: 'accounting', label: 'Accounting', providers: ['xero'] },
  { id: 'communications', label: 'Communications', providers: ['whatsapp'] },
  { id: 'google', label: 'Google Workspace', providers: ['google', 'google_workspace', 'gmail'] },
  { id: 'fleet', label: 'Fleet', providers: ['cartrack'] },
  { id: 'payments', label: 'Payments', providers: ['yoco'] },
  { id: 'social', label: 'Social Media', providers: ['meta', 'facebook', 'instagram'] },
  { id: 'automation', label: 'Automation', providers: ['n8n'] },
];

function SimpleProviderRow({ provider }: { provider: IntegrationProviderStatus }) {
  const actionLabel =
    provider.connectionStatus === 'connected'
      ? 'Configure'
      : provider.connectionStatus === 'error'
        ? 'Reconnect'
        : 'Connect';

  return (
    <article className="integrations-simple-row">
      <div className="integrations-simple-row__main">
        <strong>{provider.name}</strong>
        <p className="page-muted">{provider.description}</p>
        {provider.lastSyncAt ? (
          <p className="integrations-simple-row__meta">
            Last sync: {new Date(provider.lastSyncAt).toLocaleString()}
          </p>
        ) : null}
        {provider.lastError ? <p className="form-error">{provider.lastError}</p> : null}
      </div>
      <div className="integrations-simple-row__aside">
        <span className={`status-pill status-pill--${provider.connectionStatus}`}>
          {formatConnectionStatus(provider.connectionStatus)}
        </span>
        {provider.settingsPath && provider.availability === 'available' ? (
          <Link href={provider.settingsPath}>
            <Button size="sm" variant="secondary">
              {actionLabel}
            </Button>
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function IntegrationsDashboardPage() {
  const { accessToken, user } = useAuth();
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [isSyncingConnectors, setIsSyncingConnectors] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);
  const canAdvanced = canManage;

  const {
    data: hubDashboard,
    error: hubError,
    isLoading: hubLoading,
    refetch: refetchHub,
  } = useStaffCachedQuery({
    queryKey: 'integrations/hub-dashboard',
    enabled: canView,
    fetcher: (signal) => fetchIntegrationHubDashboard(accessToken!, { signal, simple: viewMode === 'simple' }),
  });

  const {
    data: platformDashboard,
    error: platformError,
    isLoading: platformLoading,
    isFetching: platformFetching,
    refetch: refetchPlatform,
  } = useStaffCachedQuery({
    queryKey: 'integrations/platform-dashboard',
    enabled: canView && viewMode === 'advanced' && advancedOpen,
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchIntegrationPlatformDashboard(accessToken!, { signal }),
  });

  const { data: vaultEntries, isLoading: vaultLoading } = useCachedQuery({
    queryKey: 'integrations/vault',
    accessToken,
    enabled: canView && viewMode === 'advanced' && advancedOpen,
    staleTimeMs: 120_000,
    fetcher: async () => fetchIntegrationVault(accessToken!),
  });

  const { data: traces, isLoading: tracesLoading } = useCachedQuery({
    queryKey: 'integrations/traces',
    accessToken,
    enabled: canView && viewMode === 'advanced' && advancedOpen,
    staleTimeMs: 60_000,
    fetcher: async () => fetchIntegrationTraces(accessToken!),
  });

  const error = hubError ?? platformError ?? actionError;
  const monitoring = platformDashboard?.monitoring;

  const groupedProviders = useMemo(() => {
    if (!hubDashboard) {
      return [];
    }

    const used = new Set<string>();
    const groups = PROVIDER_GROUPS.map((group) => {
      const providers = hubDashboard.providers.filter((provider) => {
        if (used.has(provider.provider)) {
          return false;
        }
        const match = group.providers.some(
          (key) => provider.provider === key || provider.provider.includes(key),
        );
        if (match) {
          used.add(provider.provider);
        }
        return match;
      });
      return { ...group, providers };
    });

    const other = hubDashboard.providers.filter((provider) => !used.has(provider.provider));
    if (other.length > 0) {
      groups.push({ id: 'other', label: 'Other', providers: other });
    }

    return groups.filter((group) => group.providers.length > 0);
  }, [hubDashboard]);

  async function handleRefreshConnectors() {
    if (!accessToken) return;
    setIsSyncingConnectors(true);
    setActionError(null);
    try {
      await syncIntegrationConnectors(accessToken);
      await Promise.all([refetchHub(), refetchPlatform()]);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to refresh connectors');
    } finally {
      setIsSyncingConnectors(false);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page page-shell">
        <PageHeader
          title="Integrations"
          description="You do not have permission to view integrations."
        />
      </div>
    );
  }

  return (
    <div className="integrations-page page-shell">
      <PageHeader
        title="Integrations"
        description="Connect the services your business already uses."
        actions={
          <div className="page-header-actions">
            <SimpleAdvancedToggle
              mode={viewMode}
              onChange={setViewMode}
              canAccessAdvanced={canAdvanced}
            />
            {canManage ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={isSyncingConnectors}
                onClick={() => void handleRefreshConnectors()}
              >
                {isSyncingConnectors ? 'Refreshing…' : 'Sync now'}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      {viewMode === 'advanced' && advancedOpen && monitoring ? (
        <section className="integrations-section">
          <div className="stat-grid">
            <StatCard label="Connected" value={String(monitoring.connectedServiceCount)} />
            <StatCard label="Needs attention" value={String(monitoring.errorServiceCount)} />
            <StatCard label="Active sync jobs" value={String(monitoring.activeSyncJobCount)} />
            {platformDashboard ? (
              <StatCard
                label="Pending approvals"
                value={String(platformDashboard.pendingActionCount)}
              />
            ) : null}
          </div>
          {platformDashboard ? (
            <p className="page-muted">{platformDashboard.summary}</p>
          ) : platformLoading ? (
            <LoadingState label="Loading connection summary…" />
          ) : null}
        </section>
      ) : null}

      {hubLoading && !hubDashboard ? (
        <LoadingState label="Loading providers…" />
      ) : hubDashboard ? (
        <>
          {groupedProviders.length === 0 ? (
            <EmptyState
              title="No integrations configured yet"
              description="Connect accounting, communications, fleet or payment providers to sync data with TITAN."
            />
          ) : (
            groupedProviders.map((group) => (
              <section key={group.id} className="integrations-section">
                <h2 className="integrations-section__title">{group.label}</h2>
                <div className="integrations-simple-list">
                  {group.providers.map((provider) => (
                    <SimpleProviderRow key={provider.provider} provider={provider} />
                  ))}
                </div>
              </section>
            ))
          )}

          {viewMode === 'simple' && hubDashboard.stats.connectedCount === 0 ? (
            <Panel title="Get started">
              <p className="page-muted">
                Connect Xero for accounting, WhatsApp for customer messaging, or Cartrack for fleet
                tracking. AURA can guide you through each setup.
              </p>
              <div className="panel-actions">
                <Link href="/aura">
                  <Button variant="secondary">Ask AURA for help</Button>
                </Link>
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      {viewMode === 'advanced' ? (
        <section className="integrations-advanced">
          <button
            type="button"
            className="integrations-advanced__toggle"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? 'Hide' : 'Show'} Advanced Integrations
          </button>

          {advancedOpen ? (
            <div className="integrations-advanced__content">
              <Panel title="Recent sync jobs">
                {hubDashboard?.recentSyncJobs.length === 0 ? (
                  <EmptyState title="No sync jobs yet" description="Sync jobs appear when a provider sync runs." />
                ) : (
                  <ul className="integrations-list">
                    {hubDashboard?.recentSyncJobs.map((job) => (
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
                <div className="panel-actions">
                  <Link href="/integrations/sync-jobs">View all sync jobs</Link>
                </div>
              </Panel>

              <Panel title="Recent webhook events">
                {hubDashboard?.recentWebhookEvents.length === 0 ? (
                  <EmptyState title="No webhook events yet" description="Events appear when inbound webhooks are received." />
                ) : (
                  <ul className="integrations-list">
                    {hubDashboard?.recentWebhookEvents.map((event) => (
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
                  <div className="panel-actions">
                    <Link href="/integrations/webhooks">Manage webhooks</Link>
                  </div>
                ) : null}
              </Panel>

              {tracesLoading ? (
                <LoadingState label="Loading API gateway traces…" />
              ) : traces && traces.length > 0 ? (
                <Panel title="Recent API gateway traces">
                  <ul className="integrations-list">
                    {traces.slice(0, 10).map((trace) => (
                      <li key={trace.id}>
                        <strong>{trace.method}</strong> {trace.path} — {trace.statusCode ?? '—'}
                        <span className="page-muted">
                          {' '}
                          · {trace.durationMs != null ? `${trace.durationMs} ms` : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {vaultLoading ? (
                <LoadingState label="Loading credential metadata…" />
              ) : vaultEntries && vaultEntries.length > 0 ? (
                <Panel title="Credential metadata">
                  <ul className="integrations-list">
                    {vaultEntries.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.provider}</strong> — {entry.authType.replace(/_/g, ' ')}
                        {entry.rotationRequired ? (
                          <span className="status-pill status-pill--warning">Rotation required</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {platformDashboard && platformDashboard.connectors.length > 0 ? (
                <Panel title="Universal connectors">
                  <ul className="integrations-list">
                    {platformDashboard.connectors.map((connector) => (
                      <li key={connector.id}>
                        <strong>{connector.name}</strong> — {formatProviderCategory(connector.category)}
                        <span className={`status-pill status-pill--${connector.status}`}>
                          {connector.status.replace(/_/g, ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {platformFetching ? <p className="page-muted">Refreshing platform data…</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
