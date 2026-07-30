import { Link } from 'wouter';
import { Button, PageHeader } from '@titan/ui';

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <PageHeader
        title="Page not found"
        description="The page you requested does not exist or may have been moved."
      />
      <div className="not-found-page__panel">
        <p className="not-found-page__code">404</p>
        <p className="not-found-page__message">
          Check the address or use the navigation to find what you need.
        </p>
        <Link href="/">
          <Button>Return to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
