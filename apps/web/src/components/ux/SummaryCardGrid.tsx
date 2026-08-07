import type { ReactNode } from 'react';

type SummaryCardGridProps = {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
};

export function SummaryCardGrid({ children, columns = 4, className = '' }: SummaryCardGridProps) {
  return (
    <div
      className={`ux-summary-grid ux-summary-grid--cols-${columns} ${className}`.trim()}
      role="list"
    >
      {children}
    </div>
  );
}
