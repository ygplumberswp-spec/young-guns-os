import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@titan/ui';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application error boundary caught an error', error, errorInfo);
  }

  private handleReturn = () => {
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-boundary">
          <div className="app-error-boundary__panel">
            <h1 className="app-error-boundary__title">Something went wrong</h1>
            <p className="app-error-boundary__description">
              An unexpected error occurred while loading this page. You can return to the dashboard
              and continue working.
            </p>
            <Button type="button" onClick={this.handleReturn}>
              Return to dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
