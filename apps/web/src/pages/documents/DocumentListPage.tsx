import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { DocumentSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchDocuments } from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import {
  canAccessDocuments,
  canManageDocuments,
  formatFileSize,
} from '../../features/documents/utils';

export function DocumentListPage() {
  const { accessToken, user } = useAuth();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchDocuments(accessToken);
        if (!cancelled) setDocuments(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load documents');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="documents-page">
        <PageHeader title="Documents" description="You do not have permission to view documents." />
      </div>
    );
  }

  return (
    <div className="documents-page">
      <PageHeader
        title="Documents"
        description="Register and organise business documents linked to customers and jobs."
        actions={
          canWrite ? (
            <Link href="/documents/new">
              <Button>Add Document</Button>
            </Link>
          ) : undefined
        }
      />
      <DocumentsNav />

      {isLoading ? <p className="page-muted">Loading documents…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        documents.length === 0 ? (
          <EmptyState
            title="No Documents Yet"
            description="Register your first document record to start building your document library."
            action={
              canWrite ? (
                <Link href="/documents/new">
                  <Button>Add Document</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Document Library">
            <div className="documents-table-wrap">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>File</th>
                    <th>Category</th>
                    <th>Customer</th>
                    <th>Job</th>
                    <th>Size</th>
                    <th>Uploaded by</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <Link href={`/documents/${document.id}`} className="documents-link">
                          {document.title}
                        </Link>
                      </td>
                      <td>{document.fileName}</td>
                      <td>{document.categoryName ?? '—'}</td>
                      <td>
                        {document.customerId ? (
                          <Link href={`/crm/${document.customerId}`} className="documents-link">
                            {document.customerName}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {document.jobId ? (
                          <Link href={`/jobs/${document.jobId}`} className="documents-link">
                            {document.jobTitle}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatFileSize(document.fileSizeBytes)}</td>
                      <td>{document.uploadedByName}</td>
                      <td>{new Date(document.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  );
}
