import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary, DocumentCategorySummary, JobSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchJobs } from '../../lib/jobs-api';
import {
  createDocument,
  fetchDocumentCategories,
} from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canManageDocuments } from '../../features/documents/utils';

export function DocumentCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
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

  const canWrite = user ? canManageDocuments(user.permissions) : false;

  const filteredJobs = customerId
    ? jobs.filter((job) => job.customerId === customerId)
    : jobs;

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
    return () => { cancelled = true; };
  }, [accessToken]);

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
          <Link href="/documents">
            <Button variant="secondary">Back to documents</Button>
          </Link>
        }
      />
      <DocumentsNav />
      {error ? <p className="form-error">{error}</p> : null}

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
        <Input
          label="File type"
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          placeholder="e.g. application/pdf"
        />
        <Input
          label="File size (bytes)"
          type="number"
          min={0}
          value={fileSizeBytes}
          onChange={(e) => setFileSizeBytes(e.target.value)}
        />
        <label className="titan-input-group">
          <span className="titan-input-label">Category (optional)</span>
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
          <span className="titan-input-label">Customer (optional)</span>
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
          <span className="titan-input-label">Job (optional)</span>
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
          {isSaving ? 'Saving…' : 'Add document'}
        </Button>
      </form>
    </div>
  );
}
