import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EmptyState } from './EmptyState';

type SectionErrorBoundaryProps = {
  sectionName: string;
  children: ReactNode;
  onRetry?: () => void;
};

type SectionErrorBoundaryState = {
  error: Error | null;
};

export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[SectionErrorBoundary:${this.props.sectionName}]`, error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <EmptyState
          title={`${this.props.sectionName} unavailable`}
          description="This section failed to load. Other dashboard areas remain available."
          action={
            this.props.onRetry ? (
              <button type="button" className="titan-btn titan-btn--secondary" onClick={this.handleRetry}>
                Retry section
              </button>
            ) : undefined
          }
        />
      );
    }

    return this.props.children;
  }
}
