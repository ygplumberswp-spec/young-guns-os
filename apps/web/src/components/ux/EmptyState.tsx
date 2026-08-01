import { type ReactNode } from 'react';
import { EmptyState as UiEmptyState, type EmptyStateProps } from '@titan/ui';

export function EmptyState(props: EmptyStateProps) {
  return <UiEmptyState {...props} />;
}

export type { ReactNode, EmptyStateProps };
