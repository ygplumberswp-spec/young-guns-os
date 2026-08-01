import { type ReactNode } from 'react';
import { StatCard } from '@titan/ui';

export type SummaryCardItem = {
  label: string;
  value: string;
  hint?: string;
};

type SummaryCardGridProps = {
  items: SummaryCardItem[];
  'aria-label'?: string;
};

export function SummaryCardGrid({ items, 'aria-label': ariaLabel }: SummaryCardGridProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="ux-summary-grid" aria-label={ariaLabel}>
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
      ))}
    </section>
  );
}

export type { ReactNode };
