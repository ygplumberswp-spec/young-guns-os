import type { SocialConnectionProviderCard } from '@titan/shared';
import { IntegrationOverviewCard } from './IntegrationOverviewCard';
import {
  deriveSocialEnterpriseConnectionStatus,
  resolveSocialEnterpriseActionHref,
  socialEnterpriseActionUsesConnectFlow,
} from './enterprise-connection-status';
import { enterpriseConnectionActionLabel } from './EnterpriseConnectionStatusLine';
import { resolveIntegrationOverviewDescriptionSafe } from './integration-overview-copy';

type SocialProviderOverviewCardProps = {
  card: SocialConnectionProviderCard;
  canManage: boolean;
  onConnect: () => void;
  connectBusy: boolean;
};

export function SocialProviderOverviewCard({
  card,
  canManage,
  onConnect,
  connectBusy,
}: SocialProviderOverviewCardProps) {
  const status = deriveSocialEnterpriseConnectionStatus(card);
  const actionLabel = enterpriseConnectionActionLabel(status);
  const actionHref = resolveSocialEnterpriseActionHref(card, status);
  const usesConnectFlow = socialEnterpriseActionUsesConnectFlow(card, status);

  return (
    <IntegrationOverviewCard
      providerKey={card.provider}
      name={card.label}
      status={status}
      description={resolveIntegrationOverviewDescriptionSafe({
        providerKey: card.provider,
        status,
      })}
      actionLabel={actionLabel}
      actionHref={canManage && usesConnectFlow ? null : actionHref}
      onAction={canManage && usesConnectFlow ? onConnect : undefined}
      actionBusy={connectBusy}
      actionDisabled={!canManage && usesConnectFlow}
    />
  );
}
