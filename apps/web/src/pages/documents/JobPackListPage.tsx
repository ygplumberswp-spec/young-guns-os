import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { LoadingState, Panel } from '@titan/ui';
import type { JobDocumentPackSummary } from '@titan/shared';
import {
  JOB_DOCUMENT_PACK_STATUS_OPTIONS,
  formatJobDocumentPackDeliveryState,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobDocumentPacks } from '../../lib/job-document-pack-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canAccessDocuments } from '../../features/documents/utils';

function formatStatus(status: JobDocumentPackSummary['status']): string {
  return JOB_DOCUMENT_PACK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function JobPackListPage() {
  const { accessToken, user } = useAuth();
  const [packs, setPacks] = useState<JobDocumentPackSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const rows = await fetchJobDocumentPacks(accessToken);
        if (!cancelled) setPacks(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load job packs');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="documents-page">
        <PageHeader title="Job packs" description="You do not have permission to view documents." />
      </div>
    );
  }

  return (
    <div className="documents-page">
      <PageHeader
        title="Job document packs"
        description="Approved document bundles for customer portal sharing — internal review required before send."
      />
      <DocumentsNav />

      {isLoading ? <LoadingState label="Loading job packs…" /> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        <Panel title="All job packs">
          {packs.length === 0 ? (
            <p className="page-muted">
              No job packs yet. Open a job, link documents, then create a pack from the job detail
              page.
            </p>
          ) : (
            <div className="documents-table-wrap">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th>Pack</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Delivery</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((pack) => (
                    <tr key={pack.id}>
                      <td>
                        <Link href={`/documents/job-packs/${pack.id}`} className="documents-link">
                          {pack.packNumber}
                        </Link>
                        <div className="page-muted">{pack.title}</div>
                      </td>
                      <td>
                        <Link href={`/jobs/${pack.jobId}`} className="documents-link">
                          {pack.jobTitle ?? pack.jobId.slice(0, 8)}
                        </Link>
                      </td>
                      <td>{formatStatus(pack.status)}</td>
                      <td>{formatJobDocumentPackDeliveryState(pack.deliveryState)}</td>
                      <td>{pack.itemCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
