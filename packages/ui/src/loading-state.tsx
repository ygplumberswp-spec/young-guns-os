import clsx from 'clsx';
import type { ReactNode } from 'react';

export type LoadingStateProps = {
  label?: string;
  className?: string;
};

export type PageLoadStateProps = {
  isLoading: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loadingLabel?: string;
  children: ReactNode;
};

export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div className={clsx('titan-loading-state', className)} role="status" aria-live="polite">
      <span className="titan-loading-state__spinner" aria-hidden="true" />
      <span className="titan-loading-state__label">{label}</span>
    </div>
  );
}

export function PageLoadState({
  isLoading,
  error,
  isEmpty,
  emptyTitle = 'No records yet',
  emptyDescription = 'There is nothing to display for this workspace.',
  emptyAction,
  loadingLabel = 'Loading…',
  children,
}: PageLoadStateProps) {
  if (isLoading) {
    return <LoadingState label={loadingLabel} />;
  }

  if (error) {
    return (
      <div className="titan-page-error" role="alert">
        <p className="titan-page-error__title">Unable to load this section</p>
        <p className="titan-page-error__message">{error}</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="titan-page-empty">
        <h2 className="titan-page-empty__title">{emptyTitle}</h2>
        <p className="titan-page-empty__description">{emptyDescription}</p>
        {emptyAction ? <div className="titan-page-empty__action">{emptyAction}</div> : null}
      </div>
    );
  }

  return children;
}
