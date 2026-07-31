import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { CxDocumentCentre } from '@titan/shared';
import { PortalApiClientError, fetchCxPortalDocuments } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalDocumentsPage() {
  const { accessToken } = usePortalAuth();
  const [documentCentre, setDocumentCentre] = useState<CxDocumentCentre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchCxPortalDocuments(accessToken)
      .then(setDocumentCentre)
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load documents'),
      );
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="Documents"
        description="Download invoices, quotations, certificates, and job documents."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {!documentCentre ? (
        <p className="page-muted">Loading documents…</p>
      ) : documentCentre.documents.length === 0 ? (
        <EmptyState
          title="No documents shared yet"
          description="When the office shares invoices, quotations, certificates, or job documents with your account, they will appear here. This list is empty because none are linked yet — not because the page failed to load."
        />
      ) : (
        <Panel title="Your documents">
          <ul className="portal-list">
            {documentCentre.documents.map((doc) => (
              <li key={doc.id}>
                <strong>{doc.title}</strong>
                <span>
                  {doc.accessType.replace(/_/g, ' ')} · v{doc.version}
                </span>
                {doc.fileName ? <span>{doc.fileName}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
