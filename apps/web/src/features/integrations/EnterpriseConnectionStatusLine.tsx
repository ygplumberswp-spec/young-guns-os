import {
  ENTERPRISE_CONNECTION_ACTION_LABELS,
  ENTERPRISE_CONNECTION_STATUS_LABELS,
  enterpriseStatusDotModifier,
  type EnterpriseConnectionStatus,
} from './enterprise-connection-status';

type EnterpriseConnectionStatusLineProps = {
  status: EnterpriseConnectionStatus;
  className?: string;
};

export function EnterpriseConnectionStatusLine({
  status,
  className,
}: EnterpriseConnectionStatusLineProps) {
  const dotModifier = enterpriseStatusDotModifier(status);

  return (
    <p
      className={['integration-enterprise-status', className].filter(Boolean).join(' ')}
      role="status"
    >
      <span
        className={`integration-enterprise-status__dot integration-enterprise-status__dot--${dotModifier}`}
        aria-hidden="true"
      />
      <span className="integration-enterprise-status__text">
        {ENTERPRISE_CONNECTION_STATUS_LABELS[status]}
      </span>
    </p>
  );
}

export function enterpriseConnectionActionLabel(
  status: EnterpriseConnectionStatus,
): string {
  return ENTERPRISE_CONNECTION_ACTION_LABELS[status];
}
