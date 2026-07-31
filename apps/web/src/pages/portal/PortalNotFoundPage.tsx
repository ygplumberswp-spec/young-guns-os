import { Link } from 'wouter';
import { Button, PageHeader } from '@titan/ui';

/** Nest-relative 404 for unknown `/portal/*` paths. */
export function PortalNotFoundPage() {
  return (
    <div className="portal-page">
      <PageHeader
        title="Page not found"
        description="That customer portal page does not exist or may have been moved."
      />
      <p className="page-muted">Check the address or return to your portal home.</p>
      <Link href="/">
        <Button>Return to portal home</Button>
      </Link>
    </div>
  );
}
