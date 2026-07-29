import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  CustomerSummary,
  DocumentCategorySummary,
  DocumentDetail,
  JobSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchJobs } from '../../lib/jobs-api';
import {
  fetchDocument,
  fetchDocumentCategories,
  updateDocument,
} from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import {
  canManageDocuments,
  formatFileSize,
} from '../../features/documents/utils';

export function DocumentDetailPage() {
  const [, params] = useRoute('/documents/:id');
  const documentId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [categories, setCategories] = useState<DocumentCategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');

  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  const filteredJobs = customerId
    ? jobs.filter((job) => job.customerId === customerId)
    : jobs;

  async function loadDocument() {
    if (!accessToken || !documentId) return;

    const [documentData, customerData, jobData, categoryData] = await Promise.all([
      fetchDocument(accessToken, documentId),
      fetchCustomers(accessToken),
      fetchJobs(accessToken),
      fetchDocumentCategories(accessToken),
    ]);

    setDocument(documentData);
    setCustomers(customerData);
    setJobs(jobData);
    setCategories(categoryData);
    setTitle(documentData.title);
    setDescription(documentData.description ?? '');
    setFileName(documentData.fileName);
    setFileType(documentData.fileType ?? '');
    setFileSizeBytes(
      documentData.fileSizeBytes != null ? String(documentData.fileSizeBytes) : '',
    );
    setCategoryId(documentData.categoryId ?? '');
    setCustomerId(documentData.customerId ?? '');
    setJobId(documentData.jobId ?? '');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !documentId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadDocument();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load document');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [accessToken, documentId]);

  useEffect(() => {
    if (jobId && customerId && !filteredJobs.some((job) => job.id === jobId)) {
      setJobId('');
    }
  }, [customerId, filteredJobs, jobId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !documentId) return;

    const parsedSize = fileSizeBytes.trim() ? Number.parseInt(fileSizeBytes, 10) : null;
    if (fileSizeBytes.trim() && (Number.isNaN(parsedSize!) || parsedSize! < 0)) {
      setError('Enter a valid file size in bytes');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateDocument(accessToken, documentId, {
        title,
        description: description.trim() || null,
        fileName,
        fileType: fileType.trim() || null,
        fileSizeBytes: parsedSize,
        categoryId: categoryId || null,
        customerId: customerId || null,
        jobId: jobId || null,
      });
      await loadDocument();
      setIsEditing(false);
      setSuccess('Document updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update document');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading document…</p>;

  if (!document) {
    return (
      <div className="documents-page">
        <PageHeader title="Document not found" description="This document could not be found." />
        <Link href="/documents" className="documents-link">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="documents-page">
      <PageHeader
        title={document.title}
        description="Document metadata and linked customer or job records."
        actions={
          <div className="documents-detail-actions">
            <Link href="/documents">
              <Button variant="secondary">Back to documents</Button>
            </Link>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>
                {isEditing ? 'Cancel editing' : 'Edit document'}
              </Button>
            ) : null}
          </div>
        }
      />
      <DocumentsNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isEditing && canWrite ? (
        <form className="documents-form" onSubmit={(event) => void handleSubmit(event)}>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label className="titan-input-group">
            <span className="titan-input-label">Description</span>
            <textarea
              className="titan-input documents-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <Input
            label="File name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            required
          />
          <Input label="File type" value={fileType} onChange={(e) => setFileType(e.target.value)} />
          <Input
            label="File size (bytes)"
            type="number"
            min={0}
            value={fileSizeBytes}
            onChange={(e) => setFileSizeBytes(e.target.value)}
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Category</span>
            <select
              className="titan-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
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
            <span className="titan-input-label">Customer</span>
            <select
              className="titan-input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
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
            <span className="titan-input-label">Job</span>
            <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job</option>
              {filteredJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={isSaving || !title.trim() || !fileName.trim()}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      ) : (
        <Panel title="Document details">
          <dl className="documents-detail-grid">
            <div>
              <dt>File name</dt>
              <dd>{document.fileName}</dd>
            </div>
            <div>
              <dt>File type</dt>
              <dd>{document.fileType ?? '—'}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatFileSize(document.fileSizeBytes)}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{document.categoryName ?? '—'}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>
                {document.customerId ? (
                  <Link href={`/crm/${document.customerId}`} className="documents-link">
                    {document.customerName}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                {document.jobId ? (
                  <Link href={`/jobs/${document.jobId}`} className="documents-link">
                    {document.jobTitle}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Uploaded by</dt>
              <dd>{document.uploadedByName}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(document.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(document.updatedAt).toLocaleString()}</dd>
            </div>
            <div className="documents-detail-grid__full">
              <dt>Description</dt>
              <dd>{document.description ?? '—'}</dd>
            </div>
          </dl>
        </Panel>
      )}
    </div>
  );
}
