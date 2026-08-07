import { PageHeader } from '../../components/ux';
import { Link } from 'wouter';
import { Button } from '@titan/ui';

/** Nest-relative 404 for unknown `/portal/*` paths. */
export function PortalNotFoundPage() {
  return (
    <div className="portal-page">
      <PageHeader
        title="Page Not Found"
        description="That customer portal page does not exist or may have been moved."
      />
      <p className="page-muted">Check the address or return to your portal home.</p>
      <Link href="/">
        <Button>Return To Portal Home</Button>
      </Link>
    </div>
  );
}
