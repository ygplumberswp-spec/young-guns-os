import type { ReactNode } from 'react';
import { Button, EmptyState, LoadingState } from '@titan/ui';

type AnalyticsTabPanelProps = {
  isLoading: boolean;
  error?: string | null;
  hasData: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  loadingLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
};

export function AnalyticsTabPanel({
  isLoading,
  error,
  hasData,
  isEmpty = false,
  emptyTitle = 'No analytics data yet',
  emptyDescription = 'There is no data to display for this section in the selected period.',
  loadingLabel = 'Loading section…',
  onRetry,
  children,
}: AnalyticsTabPanelProps) {
  if (isLoading && !hasData) {
    return <LoadingState label={loadingLabel} className="analytics-tab-panel__loading" />;
  }

  if (error && !hasData) {
    return (
      <div className="analytics-tab-panel__error" role="alert">
        <p className="analytics-tab-panel__error-title">Unable to load this section</p>
        <p className="analytics-tab-panel__error-message">{error}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => void onRetry()}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      {error && hasData ? (
        <p className="analytics-tab-panel__stale-warning" role="status">
          Showing saved data. {error}
          {onRetry ? (
            <>
              {' '}
              <button type="button" className="analytics-tab-panel__retry-link" onClick={() => void onRetry()}>
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {children}
    </>
  );
}
