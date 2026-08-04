import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { fetchIntegrationHubDashboard } from '../../lib/integration-hub-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta, useReceivedAt } from './DashboardSourceMeta';
import {
  formatOwnerIntegrationHonesty,
  ownerHonestyCtaLabel,
  pickOwnerDashboardProviders,
  toOwnerIntegrationHonesty,
} from './integration-honesty';

/**
 * Core provider status straight from the integration hub. A provider is only "Connected"
 * when the hub reports a usable capability — configuration alone is never enough.
 */
export function ConnectionsPanel() {
  const { accessToken } = useAuth();

  const hubQuery = useStaffCachedQuery({
    queryKey: 'integrations/hub/dashboard?simple=true',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchIntegrationHubDashboard(accessToken!, { simple: true }),
  });

  const coreProviders = pickOwnerDashboardProviders(hubQuery.data?.providers ?? []);
  const receivedAt = useReceivedAt(hubQuery.data);
  const disconnectedCount = coreProviders.filter(
    (provider) => toOwnerIntegrationHonesty(provider.capabilityState) !== 'connected',
  ).length;

  return (
    <Panel
      title="Connections"
      description="Live hub status"
      headerAction={<Link href="/integrations">Manage</Link>}
    >
      {hubQuery.isLoading && !hubQuery.data ? (
        <DashboardSectionSkeleton rows={6} />
      ) : hubQuery.error && !hubQuery.data ? (
        <div>
          <p className="form-error">{hubQuery.error}</p>
          <Button size="sm" variant="secondary" onClick={() => void hubQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : coreProviders.length === 0 ? (
        <p className="exec-utility-empty">Connection status unavailable.</p>
      ) : (
        <ul className="exec-utility-connections">
          {coreProviders.map((provider) => {
            const honesty = toOwnerIntegrationHonesty(provider.capabilityState);
            const label = formatOwnerIntegrationHonesty(honesty);
            const href = provider.settingsPath || '/integrations';
            const cta = ownerHonestyCtaLabel(honesty, provider.canConnect);
            const tone =
              honesty === 'connected' ? 'is-ok' : honesty === 'attention' ? 'is-warn' : 'is-muted';

            const lastSyncHint =
              String(provider.provider) === 'xero' && honesty === 'connected'
                ? provider.lastSyncAt
                  ? `Synced ${new Date(provider.lastSyncAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}`
                  : 'Connected — awaiting first sync'
                : null;

            return (
              <li key={String(provider.provider)}>
                <span className={`exec-utility-status__dot ${tone}`} />
                <div className="exec-utility-connections__meta">
                  <span className="exec-utility-connections__name">{provider.name}</span>
                  <strong className={`exec-utility-connections__status ${tone}`}>{label}</strong>
                  {lastSyncHint ? (
                    <em className="exec-utility-connections__sync">{lastSyncHint}</em>
                  ) : null}
                </div>
                <Link href={href} className="exec-utility-connections__cta">
                  {cta}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <DashboardSourceMeta
        source="Integration hub connection records"
        updatedAt={receivedAt}
        state={
          coreProviders.length === 0 ? 'unavailable' : disconnectedCount > 0 ? 'partial' : 'live'
        }
        href="/integrations"
        linkLabel="Open integrations"
        note={
          disconnectedCount > 0
            ? `${disconnectedCount} of ${coreProviders.length} core providers are not fully connected.`
            : null
        }
      />
    </Panel>
  );
}
