import { Link } from 'wouter';
import { useMemo } from 'react';
import { Button, Panel } from '@titan/ui';
import type { IntegrationProviderAutoSyncStatus } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { fetchIntegrationAutoSyncStatuses } from '../../lib/integration-auto-sync-api-client';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import { fetchSocialConnectionsDashboard } from '../../lib/social-connection-api-client';
import { EnterpriseConnectionStatusLine } from '../integrations/EnterpriseConnectionStatusLine';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import {
  buildDashboardConnectionOverviewRows,
  dashboardConnectionsFooterState,
} from './dashboard-connection-overview';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta, useReceivedAt } from './DashboardSourceMeta';

const DASHBOARD_CONNECTION_SKELETON_ROWS = 9;

/**
 * Core provider status from the same enterprise truth mapping as /integrations.
 * Connected requires persisted hub capability evidence — never config or routes alone.
 */
export function ConnectionsPanel() {
  const { accessToken } = useAuth();

  const hubQuery = useStaffCachedQuery({
    queryKey: 'integrations/hub-dashboard',
    enabled: Boolean(accessToken),
    fetcher: async (signal) =>
      fetchIntegrationHubDashboard(accessToken!, { signal, simple: true }),
  });

  const autoSyncQuery = useStaffCachedQuery({
    queryKey: 'integrations/auto-sync-statuses',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: (signal) => fetchIntegrationAutoSyncStatuses(accessToken!, { signal }),
  });

  const socialQuery = useStaffCachedQuery({
    queryKey: 'integrations/social-connections-dashboard',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async (signal) => {
      const data = await fetchSocialConnectionsDashboard(accessToken!, { signal });
      return data;
    },
  });

  const autoSyncByProvider = useMemo(() => {
    const map = new Map<string, IntegrationProviderAutoSyncStatus>();
    for (const entry of autoSyncQuery.data ?? []) {
      if (entry.integrationProvider) {
        map.set(entry.integrationProvider, entry);
      }
      map.set(entry.provider, entry);
    }
    return map;
  }, [autoSyncQuery.data]);

  const rows = useMemo(
    () =>
      buildDashboardConnectionOverviewRows({
        hubProviders: hubQuery.data?.providers ?? [],
        autoSyncByProvider,
        socialCards: socialQuery.data?.providers ?? [],
      }),
    [hubQuery.data?.providers, autoSyncByProvider, socialQuery.data?.providers],
  );

  const receivedAt = useReceivedAt(hubQuery.data ?? socialQuery.data);
  const footerState = dashboardConnectionsFooterState(rows);
  const attentionCount = rows.filter((row) => row.status !== 'connected').length;

  const isLoading =
    (hubQuery.isLoading && !hubQuery.data) ||
    (autoSyncQuery.isLoading && !autoSyncQuery.data) ||
    (socialQuery.isLoading && !socialQuery.data);

  const loadError = hubQuery.error ?? socialQuery.error;

  return (
    <Panel
      title="Connections"
      description="Integration connection status"
      headerAction={<Link href="/integrations">Manage</Link>}
    >
      {isLoading ? (
        <DashboardSectionSkeleton rows={DASHBOARD_CONNECTION_SKELETON_ROWS} />
      ) : loadError && rows.length === 0 ? (
        <div>
          <p className="form-error">{loadError}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void hubQuery.refetch();
              void autoSyncQuery.refetch();
              void socialQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="exec-utility-empty">Connection status unavailable.</p>
      ) : (
        <ul className="exec-utility-connections">
          {rows.map((row) => (
            <li key={row.providerKey} data-connection-status={row.status}>
              <div className="exec-utility-connections__meta">
                <span className="exec-utility-connections__name">{row.name}</span>
                <EnterpriseConnectionStatusLine status={row.status} />
              </div>
              <Link href={row.actionHref} className="exec-utility-connections__cta">
                {row.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DashboardSourceMeta
        source="Integration hub and social connection records"
        updatedAt={receivedAt}
        state={footerState}
        href="/integrations"
        linkLabel="Open integrations"
        note={
          attentionCount > 0
            ? `${attentionCount} of ${rows.length} providers need attention or setup.`
            : null
        }
      />
    </Panel>
  );
}
