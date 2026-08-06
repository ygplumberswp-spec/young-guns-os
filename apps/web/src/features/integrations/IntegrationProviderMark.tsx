type IntegrationProviderMarkProps = {
  providerKey: string;
  label: string;
  className?: string;
};

function providerInitials(label: string): string {
  const words = label
    .replace(/[()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'IN';
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Restrained provider tile — initials on a brand-tinted surface (overview only). */
export function IntegrationProviderMark({
  providerKey,
  label,
  className,
}: IntegrationProviderMarkProps) {
  return (
    <span
      className={['integration-overview-card__mark', className].filter(Boolean).join(' ')}
      data-provider={providerKey}
      aria-hidden="true"
    >
      <span className="integration-overview-card__mark-inner">{providerInitials(label)}</span>
    </span>
  );
}
