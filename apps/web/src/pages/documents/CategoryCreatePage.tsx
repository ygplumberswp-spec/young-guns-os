import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { createDocumentCategory } from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canManageDocuments } from '../../features/documents/utils';

export function CategoryCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageDocuments(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/documents/categories');
  }, [canWrite, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !name.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await createDocumentCategory(accessToken, {
        name,
        description: description.trim() || null,
      });
      navigate('/documents/categories');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create category');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="documents-page">
      <PageHeader
        title="New category"
        description="Create a category for organising document records."
        actions={
          <Link href="/documents/categories">
            <Button variant="secondary">Back to categories</Button>
          </Link>
        }
      />
      <DocumentsNav />
      {error ? <p className="form-error">{error}</p> : null}

      <form className="documents-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="titan-input-group">
          <span className="titan-input-label">Description</span>
          <textarea
            className="titan-input documents-textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={isSaving || !name.trim()}>
          {isSaving ? 'Saving…' : 'Create category'}
        </Button>
      </form>
    </div>
  );
}
