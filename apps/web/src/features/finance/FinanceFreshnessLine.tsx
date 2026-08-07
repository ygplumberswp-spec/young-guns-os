type FinanceFreshnessLineProps = {
  label: string | null;
  refreshing?: boolean;
};

export function FinanceFreshnessLine({ label, refreshing }: FinanceFreshnessLineProps) {
  if (!label && !refreshing) {
    return null;
  }

  return (
    <p
      className="finance-freshness-line"
      aria-live="polite"
      aria-busy={refreshing ? true : undefined}
      data-finance-freshness={refreshing ? 'refreshing' : 'idle'}
    >
      {label ?? 'Refreshing quietly'}
    </p>
  );
}
