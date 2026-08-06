import type { ReactNode } from 'react';
import React from 'react';
import { IntegrationOverviewCardSkeleton } from './IntegrationOverviewCardSkeleton';

type IntegrationOverviewSectionProps = {
  title: string;
  children?: ReactNode;
  loading?: boolean;
  skeletonCount?: number;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function IntegrationOverviewSection({
  title,
  children,
  loading = false,
  skeletonCount = 0,
  error = null,
  emptyTitle,
  emptyDescription,
}: IntegrationOverviewSectionProps) {
  const childCount = loading ? skeletonCount : React.Children.count(children);
  const showEmpty = !loading && !error && emptyTitle && childCount === 0;

  return (
    <section className="integrations-section integration-overview-section">
      <h2 className="integrations-section__title integration-overview-section__title">{title}</h2>
      {error ? (
        <div className="integration-overview-section__state integration-overview-section__state--error" role="alert">
          <p className="integration-overview-section__state-title">Unable to load integrations</p>
          <p className="integration-overview-section__state-detail">{error}</p>
        </div>
      ) : null}
      {!showEmpty ? (
        <div className="integration-overview-grid">
          {loading
            ? Array.from({ length: skeletonCount }, (_, index) => (
                <IntegrationOverviewCardSkeleton key={`skeleton-${index}`} />
              ))
            : children}
        </div>
      ) : null}
      {showEmpty ? (
        <div className="integration-overview-section__state integration-overview-section__state--empty">
          <p className="integration-overview-section__state-title">{emptyTitle}</p>
          {emptyDescription ? (
            <p className="integration-overview-section__state-detail">{emptyDescription}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
