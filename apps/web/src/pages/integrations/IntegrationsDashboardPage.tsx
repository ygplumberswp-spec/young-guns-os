import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, LoadingState, Panel, StatCard } from '@titan/ui';
import type { IntegrationProviderAutoSyncStatus } from '@titan/shared';
import { FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { invalidateStaffQueryPrefixes } from '../../lib/cache-invalidation';
import { fetchIntegrationAutoSyncStatuses } from '../../lib/integration-auto-sync-api-client';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import {
  fetchIntegrationPlatformDashboard,
  fetchIntegrationTraces,
  fetchIntegrationVault,
  syncIntegrationConnectors,
} from '../../lib/integration-platform-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery, useStaffCacheScope } from '../../lib/use-scoped-cached-query';
import { useCachedQuery } from '../../lib/use-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { SocialConnectionsSection } from '../../features/integrations/SocialConnectionsSection';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { HubProviderOverviewCard } from '../../features/integrations/HubProviderOverviewCard';
import { IntegrationOverviewSection } from '../../features/integrations/IntegrationOverviewSection';
import {
  formatProviderCategory,
  formatSyncJobStatus,
  formatWebhookEventStatus,
} from '../../features/integrations/formatters';

const PROVIDER_GROUPS: Array<{ id: string; label: string; providers: string[] }> = [
  { id: 'accounting', label: 'Accounting', providers: ['xero'] },
  { id: 'communications', label: 'Communications', providers: ['whatsapp', 'email', 'gmail'] },
  { id: 'fleet', label: 'Fleet', providers: ['cartrack'] },
  { id: 'payments', label: 'Payments', providers: ['yoco'] },
  { id: 'automation', label: 'Automation', providers: ['n8n'] },
];

/** Social publishing providers (Facebook, Instagram, TikTok) render in SocialConnectionsSection only. */

const HUB_LOADING_SKELETON_COUNTS: Record<string, number> = {
  accounting: 1,
  communications: 3,
  fleet: 1,
  payments: 1,
  automation: 1,
  other: 1,
};

function IntegrationCategoryLinks() {
  return (
    <footer className="integration-overview-footer">
      <p className="integration-overview-footer__label">More connections</p>
      <div className="integration-overview-footer__links">
        <Link href="/social-media-integrations" className="integration-overview-footer__link">
          Business Profile
        </Link>
        <Link href="/integrations/whatsapp" className="integration-overview-footer__link">
          WhatsApp settings
        </Link>
        <Link href="/integrations/email" className="integration-overview-footer__link">
          Email settings
        </Link>
        <Link href="/finance/bank-control" className="integration-overview-footer__link">
          Bank Connection
        </Link>
        <Link href="/finance/bank-transactions/import" className="integration-overview-footer__link">
          Import statement
        </Link>
      </div>
    </footer>
  );
}

export function IntegrationsDashboardPage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const cacheScope = useStaffCacheScope();
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [isSyncingConnectors, setIsSyncingConnectors] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Legacy OAuth returns may land here; Page selection completes in Facebook Business.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('facebook') === 'select-page') {
      navigate(FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH, { replace: true });
    }
  }, [navigate]);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);
  const canAdvanced = canManage;

  const { data: autoSyncStatuses, refetch: refetchAutoSync } = useStaffCachedQuery({
    queryKey: 'integrations/auto-sync-statuses',
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: (signal) => fetchIntegrationAutoSyncStatuses(accessToken!, { signal }),
  });

  const autoSyncByProvider = useMemo(() => {
    const map = new Map<string, IntegrationProviderAutoSyncStatus>();
    for (const entry of autoSyncStatuses ?? []) {
      if (entry.integrationProvider) {
        map.set(entry.integrationProvider, entry);
      }
      map.set(entry.provider, entry);
    }
    return map;
  }, [autoSyncStatuses]);

  const {
    data: hubDashboard,
    error: hubError,
    isLoading: hubLoading,
    refetch: refetchHub,
  } = useStaffCachedQuery({
    queryKey: `integrations/hub-dashboard:${viewMode === 'simple' ? 'simple' : 'full'}`,
    enabled: canView,
    fetcher: (signal) =>
      fetchIntegrationHubDashboard(accessToken!, { signal, simple: viewMode === 'simple' }),
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

  // Prefer sync action errors over stale query errors so Sync now feedback is always visible.
  const error = actionError ?? hubError ?? platformError;
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
    setActionError(null);
    setActionSuccess(null);

    if (!accessToken) {
      setActionError(
        'You are not signed in. Refresh the page and sign in again, then retry Sync now.',
      );
      return;
    }

    if (!canManage) {
      setActionError('You need integrations:manage permission to run Sync now.');
      return;
    }

    if (isSyncingConnectors) {
      return;
    }

    setIsSyncingConnectors(true);

    try {
      const result = await syncIntegrationConnectors(accessToken);

      if (result.xeroSync) {
        if (result.xeroSync.success) {
          setActionSuccess(result.xeroSync.message);
        } else {
          const stage = result.xeroSync.failedStage
            ? ` Failed stage: ${result.xeroSync.failedStage}.`
            : '';
          setActionError(`${result.xeroSync.message}${stage}`);
        }
      } else {
        setActionError(
          'Connectors refreshed, but Xero import did not run. Open Xero settings and confirm the connection status is Connected, then retry Sync now.',
        );
      }

      if (cacheScope) {
        invalidateStaffQueryPrefixes(cacheScope, accessToken, [
          'integrations/hub-dashboard',
          'integrations/platform-dashboard',
        ]);
      }

      await Promise.all([refetchHub(), refetchPlatform(), refetchAutoSync()]);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === 'AbortError' || err.name === 'TimeoutError')
      ) {
        setActionError('Sync timed out waiting for Xero. Check your connection and try again.');
      } else if (err instanceof ApiClientError) {
        setActionError(err.message);
      } else if (err instanceof TypeError) {
        setActionError(
          'Network error while calling the sync API. Confirm the API is running on port 3000.',
        );
      } else {
        setActionError(err instanceof Error ? err.message : 'Unable to sync integrations');
      }
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
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSyncingConnectors}
                aria-busy={isSyncingConnectors}
                onClick={() => void handleRefreshConnectors()}
              >
                {isSyncingConnectors ? 'Please wait…' : 'Refresh connections'}
              </Button>
            ) : null}
          </div>
        }
      />

      {isSyncingConnectors ? (
        <p className="integration-overview-banner" role="status">
          Updating connection status…
        </p>
      ) : null}
      {error ? <p className="integration-overview-banner integration-overview-banner--error">{error}</p> : null}
      {actionSuccess ? (
        <p className="integration-overview-banner integration-overview-banner--success">{actionSuccess}</p>
      ) : null}

      <div className="integrations-overview-shell">
      {viewMode === 'advanced' && advancedOpen && monitoring ? (
        <section className="integrations-section">
          <div className="stat-grid">
            <StatCard label="Connected" value={String(monitoring.connectedServiceCount)} />
            <StatCard label="Needs Attention" value={String(monitoring.errorServiceCount)} />
            <StatCard label="Active Sync Jobs" value={String(monitoring.activeSyncJobCount)} />
            {platformDashboard ? (
              <StatCard
                label="Pending Approvals"
                value={String(platformDashboard.pendingActionCount)}
              />
            ) : null}
          </div>
          {platformDashboard ? (
            <p className="page-muted">{platformDashboard.summary}</p>
          ) : platformLoading ? (
            <LoadingState label="Loading Connection Summary…" />
          ) : null}
        </section>
      ) : null}

      {hubLoading && !hubDashboard ? (
        PROVIDER_GROUPS.map((group) => (
          <IntegrationOverviewSection
            key={group.id}
            title={group.label}
            loading
            skeletonCount={(HUB_LOADING_SKELETON_COUNTS[group.id] ?? group.providers.length) || 1}
          />
        ))
      ) : hubDashboard ? (
        <>
          {groupedProviders.length === 0 ? (
            <IntegrationOverviewSection
              title="Integrations"
              emptyTitle="No integrations available yet"
              emptyDescription="Connect accounting, communications, fleet or payment providers to extend TITAN for your business."
            />
          ) : (
            groupedProviders.map((group) => (
              <IntegrationOverviewSection key={group.id} title={group.label}>
                {group.providers.map((provider) => (
                  <HubProviderOverviewCard
                    key={provider.provider}
                    provider={provider}
                    autoSync={autoSyncByProvider.get(provider.provider)}
                  />
                ))}
              </IntegrationOverviewSection>
            ))
          )}

          {viewMode === 'simple' && hubDashboard.stats.connectedCount === 0 ? (
            <div className="integration-overview-section__state integration-overview-section__state--hint">
              <p className="integration-overview-section__state-title">Get started</p>
              <p className="integration-overview-section__state-detail">
                Connect Xero for accounting, WhatsApp for customer messaging, or Cartrack for fleet
                visibility. AURA can guide you through each setup.
              </p>
              <Link href="/aura" className="integration-overview-footer__link integration-overview-footer__link--cta">
                Ask AURA for help
              </Link>
            </div>
          ) : null}
        </>
      ) : null}

      <SocialConnectionsSection />
      </div>

      <IntegrationCategoryLinks />

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
              <Panel title="Recent Sync Jobs">
                {hubDashboard?.recentSyncJobs.length === 0 ? (
                  <EmptyState
                    title="No Sync Jobs Yet"
                    description="Sync jobs appear when a provider sync runs."
                  />
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

              <Panel title="Recent Webhook Events">
                {hubDashboard?.recentWebhookEvents.length === 0 ? (
                  <EmptyState
                    title="No Webhook Events Yet"
                    description="Events appear when inbound webhooks are received."
                  />
                ) : (
                  <ul className="integrations-list">
                    {hubDashboard?.recentWebhookEvents.map((event) => (
                      <li key={event.id}>
                        <strong>{event.eventType}</strong> —{' '}
                        {formatWebhookEventStatus(event.status)}
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
                <LoadingState label="Loading API Gateway Traces…" />
              ) : traces && traces.length > 0 ? (
                <Panel title="Recent API Gateway Traces">
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
                <LoadingState label="Loading Credential Metadata…" />
              ) : vaultEntries && vaultEntries.length > 0 ? (
                <Panel title="Credential Metadata">
                  <ul className="integrations-list">
                    {vaultEntries.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.provider}</strong> — {entry.authType.replace(/_/g, ' ')}
                        {entry.rotationRequired ? (
                          <span className="status-pill status-pill--warning">
                            Rotation required
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {platformDashboard && platformDashboard.connectors.length > 0 ? (
                <Panel title="Universal Connectors">
                  <ul className="integrations-list">
                    {platformDashboard.connectors.map((connector) => (
                      <li key={connector.id}>
                        <strong>{connector.name}</strong> —{' '}
                        {formatProviderCategory(connector.category)}
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
