import type { IntegrationProviderAutoSyncStatus, IntegrationProviderStatus } from '@titan/shared';
import { IntegrationOverviewCard } from './IntegrationOverviewCard';
import {
  deriveHubEnterpriseConnectionStatus,
  resolveHubEnterpriseActionHref,
  type EnterpriseConnectionStatus,
} from './enterprise-connection-status';
import { enterpriseConnectionActionLabel } from './EnterpriseConnectionStatusLine';
import { resolveIntegrationOverviewDescriptionSafe } from './integration-overview-copy';

function resolveHubOverviewActionLabel(
  status: EnterpriseConnectionStatus,
  provider: IntegrationProviderStatus,
): string {
  if (
    (status === 'not_connected' && !provider.canConnect && provider.settingsPath) ||
    provider.capabilityState === 'not_implemented'
  ) {
    return 'View status';
  }
  return enterpriseConnectionActionLabel(status);
}

export function HubProviderOverviewCard({
  provider,
  autoSync,
}: {
  provider: IntegrationProviderStatus;
  autoSync?: IntegrationProviderAutoSyncStatus;
}) {
  const status = deriveHubEnterpriseConnectionStatus(provider, autoSync);
  const actionLabel = resolveHubOverviewActionLabel(status, provider);
  const actionHref = resolveHubEnterpriseActionHref(provider, status);

  return (
    <IntegrationOverviewCard
      providerKey={String(provider.provider)}
      name={provider.name}
      status={status}
      description={resolveIntegrationOverviewDescriptionSafe({
        providerKey: String(provider.provider),
        status,
      })}
      actionLabel={actionHref ? actionLabel : 'Unavailable'}
      actionHref={actionHref}
      actionDisabled={!actionHref}
    />
  );
}
