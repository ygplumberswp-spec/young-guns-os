import { Link } from 'wouter';
import { Button } from '@titan/ui';
import { EnterpriseConnectionStatusLine, enterpriseConnectionActionLabel } from './EnterpriseConnectionStatusLine';
import type { EnterpriseConnectionStatus } from './enterprise-connection-status';
import { IntegrationProviderMark } from './IntegrationProviderMark';

export type IntegrationOverviewCardProps = {
  providerKey: string;
  name: string;
  status: EnterpriseConnectionStatus;
  description: string;
  actionLabel?: string;
  actionHref?: string | null;
  onAction?: () => void;
  actionBusy?: boolean;
  actionDisabled?: boolean;
};

export function IntegrationOverviewCard({
  providerKey,
  name,
  status,
  description,
  actionLabel,
  actionHref,
  onAction,
  actionBusy = false,
  actionDisabled = false,
}: IntegrationOverviewCardProps) {
  const label = actionLabel ?? enterpriseConnectionActionLabel(status);
  const showLink = Boolean(actionHref) && !onAction;
  const disabled = actionDisabled || actionBusy || (!showLink && !onAction);

  const actionButton = (
    <Button
      size="sm"
      variant="secondary"
      className="integration-overview-card__button"
      disabled={disabled}
      aria-busy={actionBusy}
      onClick={onAction}
    >
      {actionBusy ? 'Working…' : label}
    </Button>
  );

  return (
    <article
      className="integration-overview-card"
      data-provider={providerKey}
      data-connection-status={status}
    >
      <IntegrationProviderMark providerKey={providerKey} label={name} />
      <div className="integration-overview-card__body">
        <h3 className="integration-overview-card__name">{name}</h3>
        <EnterpriseConnectionStatusLine status={status} />
        <p className="integration-overview-card__description">{description}</p>
      </div>
      <div className="integration-overview-card__action">
        {showLink ? (
          <Link href={actionHref!} className="integration-overview-card__action-link">
            {actionButton}
          </Link>
        ) : (
          actionButton
        )}
      </div>
    </article>
  );
}
