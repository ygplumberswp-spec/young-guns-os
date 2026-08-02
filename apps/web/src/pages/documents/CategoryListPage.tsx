import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { DocumentCategorySummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchDocumentCategories } from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canAccessDocuments, canManageDocuments } from '../../features/documents/utils';

export function CategoryListPage() {
  const { accessToken, user } = useAuth();
  const [categories, setCategories] = useState<DocumentCategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchDocumentCategories(accessToken);
        if (!cancelled) setCategories(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load categories');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="documents-page">
        <PageHeader
          title="Categories"
          description="You do not have permission to view documents."
        />
      </div>
    );
  }

  return (
    <div className="documents-page">
      <PageHeader
        title="Documents"
        description="Organise document records with reusable categories."
        actions={
          canWrite ? (
            <Link href="/documents/categories/new">
              <Button>New Category</Button>
            </Link>
          ) : undefined
        }
      />
      <DocumentsNav />

      {isLoading ? <p className="page-muted">Loading categories…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        categories.length === 0 ? (
          <EmptyState
            title="No Categories Yet"
            description="Create categories to organise contracts, certificates, and other business documents."
            action={
              canWrite ? (
                <Link href="/documents/categories/new">
                  <Button>New Category</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Document Categories">
            <div className="documents-table-wrap">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Documents</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td>{category.name}</td>
                      <td>{category.description ?? '—'}</td>
                      <td>{category.documentCount}</td>
                      <td>{new Date(category.updatedAt).toLocaleDateString()}</td>
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
