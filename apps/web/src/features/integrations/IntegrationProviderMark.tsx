type IntegrationProviderMarkProps = {
  providerKey: string;
  label: string;
  className?: string;
};

/** Restrained provider tile — initials on a brand-tinted surface (overview only). */
export function IntegrationProviderMark({
  providerKey,
  label,
  className,
}: IntegrationProviderMarkProps) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={['integration-overview-card__mark', className].filter(Boolean).join(' ')}
      data-provider={providerKey}
      aria-hidden="true"
    >
      <span className="integration-overview-card__mark-inner">{initials || 'IN'}</span>
    </span>
  );
}
