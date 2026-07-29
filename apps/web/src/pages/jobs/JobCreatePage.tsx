import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary, JobStatus } from '@titan/shared';
import { JOB_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { createJob } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { canManageJobs } from '../../features/jobs/JobList';

export function JobCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<JobStatus>('new');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageJobs(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) {
      navigate('/jobs');
    }
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchCustomers(accessToken);

        if (!cancelled) {
          setCustomers(data);
          setCustomerId(data[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load customers');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canWrite || !customerId) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const job = await createJob(accessToken, {
        customerId,
        title,
        description: description.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create job');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading form…</p>;
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title="New job"
        description="Create a job linked to a customer."
        actions={
          <Link href="/jobs">
            <Button variant="secondary">Back to jobs</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <div className="jobs-empty-customers">
          <p className="page-muted">You need at least one customer before creating a job.</p>
          <Link href="/crm/new">
            <Button>Add customer</Button>
          </Link>
        </div>
      ) : (
        <form className="jobs-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer</span>
            <select
              className="titan-input"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />

          <label className="titan-input-group">
            <span className="titan-input-label">Description</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What work needs to be done?"
            />
          </label>

          <label className="titan-input-group">
            <span className="titan-input-label">Status</span>
            <select
              className="titan-input"
              value={status}
              onChange={(event) => setStatus(event.target.value as JobStatus)}
            >
              {JOB_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input jobs-textarea"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="jobs-form__actions">
            <Button type="submit" disabled={isSaving || !title.trim() || !customerId}>
              {isSaving ? 'Creating…' : 'Create job'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
