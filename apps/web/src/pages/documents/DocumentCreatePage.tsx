import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary, DocumentCategorySummary, JobSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchJobs } from '../../lib/jobs-api';
import { createDocument, fetchDocumentCategories } from '../../lib/documents-api';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canManageDocuments } from '../../features/documents/utils';
import { AutosaveIndicator } from '../../components/ux/AutosaveIndicator';
import { DraftRestoreBanner } from '../../components/ux/DraftRestoreBanner';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';

export function DocumentCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [categories, setCategories] = useState<DocumentCategorySummary[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{
    id: string;
    title: string | null;
    lastEditedAt: string;
    payload: Record<string, unknown>;
  } | null>(null);

  const canWrite = user ? canManageDocuments(user.permissions) : false;
  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'document',
    enabled: canWrite,
    getPayload: () => ({
      title,
      description,
      fileName,
      fileType,
      fileSizeBytes,
      categoryId,
      customerId,
      jobId,
    }),
    getMeta: () => ({ title: title.trim() || 'New document' }),
  });

  const filteredJobs = customerId ? jobs.filter((job) => job.customerId === customerId) : jobs;

  useEffect(() => {
    if (user && !canWrite) navigate('/documents');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const [customerData, jobData, categoryData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchJobs(accessToken),
          fetchDocumentCategories(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setJobs(jobData);
          setCategories(categoryData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load form data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      if (!accessToken) return;
      const draftId = new URLSearchParams(search).get('draftId');
      if (!draftId) return;
      try {
        const draft = await fetchDraft(accessToken, draftId);
        if (cancelled || draft.recordType !== 'document') return;
        setPendingDraft({
          id: draft.id,
          title: draft.title,
          lastEditedAt: draft.lastEditedAt,
          payload: draft.payload,
        });
      } catch {
        /* Ignore unavailable drafts. */
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  function applyDraftPayload(payload: Record<string, unknown>) {
    if (typeof payload.title === 'string') setTitle(payload.title);
    if (typeof payload.description === 'string') setDescription(payload.description);
    if (typeof payload.fileName === 'string') setFileName(payload.fileName);
    if (typeof payload.fileType === 'string') setFileType(payload.fileType);
    if (typeof payload.fileSizeBytes === 'string') setFileSizeBytes(payload.fileSizeBytes);
    if (typeof payload.categoryId === 'string') setCategoryId(payload.categoryId);
    if (typeof payload.customerId === 'string') setCustomerId(payload.customerId);
    if (typeof payload.jobId === 'string') setJobId(payload.jobId);
    draftShell.touchField();
  }

  useEffect(() => {
    if (jobId && customerId && !filteredJobs.some((job) => job.id === jobId)) {
      setJobId('');
    }
  }, [customerId, filteredJobs, jobId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !title.trim() || !fileName.trim()) return;

    const parsedSize = fileSizeBytes.trim() ? Number.parseInt(fileSizeBytes, 10) : null;
    if (fileSizeBytes.trim() && (Number.isNaN(parsedSize!) || parsedSize! < 0)) {
      setError('Enter a valid file size in bytes');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const document = await createDocument(accessToken, {
        title,
        description: description.trim() || null,
        fileName,
        fileType: fileType.trim() || null,
        fileSizeBytes: parsedSize,
        categoryId: categoryId || null,
        customerId: customerId || null,
        jobId: jobId || null,
      });
      draftShell.markSubmitted();
      navigate(`/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create document');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="documents-page">
      <PageHeader
        title="Add document"
        description="Register document metadata and link it to customers or jobs."
        actions={
          <Button
            variant="secondary"
            onClick={() => draftShell.guard.guardNavigation(() => navigate('/documents'))}
          >
            Back to documents
          </Button>
        }
      />
      <DocumentsNav />
      <AutosaveIndicator
        status={draftShell.autosave.status}
        lastSavedAt={draftShell.autosave.lastSavedAt}
      />
      {draftShell.guard.unsavedChangesModal}
      {pendingDraft ? (
        <DraftRestoreBanner
          title={pendingDraft.title}
          lastEditedAt={pendingDraft.lastEditedAt}
          onRestore={() => {
            applyDraftPayload(pendingDraft.payload);
            setPendingDraft(null);
          }}
          onDismiss={() => setPendingDraft(null)}
        />
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      <form className="documents-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            draftShell.touchField();
          }}
          required
        />
        <label className="titan-input-group">
          <span className="titan-input-label">Description</span>
          <textarea
            className="titan-input documents-textarea"
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              draftShell.touchField();
            }}
          />
        </label>
        <Input
          label="File name"
          value={fileName}
          onChange={(e) => {
            setFileName(e.target.value);
            draftShell.touchField();
          }}
          required
        />
        <Input
          label="File type"
          value={fileType}
          onChange={(e) => {
            setFileType(e.target.value);
            draftShell.touchField();
          }}
          placeholder="e.g. application/pdf"
        />
        <Input
          label="File size (bytes)"
          type="number"
          min={0}
          value={fileSizeBytes}
          onChange={(e) => {
            setFileSizeBytes(e.target.value);
            draftShell.touchField();
          }}
        />
        <label className="titan-input-group">
          <span className="titan-input-label">Category (optional)</span>
          <select
            className="titan-input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              draftShell.touchField();
            }}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Customer (optional)</span>
          <select
            className="titan-input"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              draftShell.touchField();
            }}
          >
            <option value="">No customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Job (optional)</span>
          <select
            className="titan-input"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              draftShell.touchField();
            }}
          >
            <option value="">No job</option>
            {filteredJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={isSaving || !title.trim() || !fileName.trim()}>
          {isSaving ? 'Saving…' : 'Add document'}
        </Button>
      </form>
    </div>
  );
}
