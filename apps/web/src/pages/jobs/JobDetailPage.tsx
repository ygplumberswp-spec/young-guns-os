import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type { JobDetail, JobStatus } from '@titan/shared';
import { AI_NAME, JOB_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchJob, updateJob } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { canManageJobs, formatJobStatus } from '../../features/jobs/JobList';
import { JobSchedulePanel } from '../../features/scheduling/JobSchedulePanel';
import {
  canAccessScheduling,
  canManageScheduling,
} from '../../features/scheduling/utils';

export function JobDetailPage() {
  const [, params] = useRoute('/jobs/:id');
  const jobId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<JobStatus>('new');
  const [notes, setNotes] = useState('');

  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);
  const canViewSchedule = useMemo(
    () => (user ? canAccessScheduling(user.permissions) : false),
    [user],
  );
  const canWriteSchedule = useMemo(
    () => (user ? canManageScheduling(user.permissions) : false),
    [user],
  );

  async function loadJob() {
    if (!accessToken || !jobId) {
      return;
    }

    const data = await fetchJob(accessToken, jobId);
    setJob(data);
    setTitle(data.title);
    setDescription(data.description ?? '');
    setStatus(data.status);
    setNotes(data.notes ?? '');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !jobId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadJob();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load job');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !jobId || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateJob(accessToken, jobId, {
        title,
        description: description.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      setJob(updated);
      setIsEditing(false);
      setSuccess('Job updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update job');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading job…</p>;
  }

  if (error && !job) {
    return (
      <div className="jobs-page">
        <PageHeader title="Job" description="Job record" />
        <p className="form-error">{error}</p>
        <Link href="/jobs">
          <Button variant="secondary">Back to jobs</Button>
        </Link>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title={job.title}
        description={`Job for ${job.customerName}`}
        actions={
          <div className="jobs-detail__actions">
            <Link href={`/aura?jobId=${job.id}`}>
              <Button variant="secondary">Ask {AI_NAME}</Button>
            </Link>
            <Link href="/jobs">
              <Button variant="ghost">Back to jobs</Button>
            </Link>
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="jobs-detail">
        <Panel title="Job details">
          {isEditing && canWrite ? (
            <form className="jobs-form" onSubmit={(event) => void handleSave(event)}>
              <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />

              <label className="titan-input-group">
                <span className="titan-input-label">Description</span>
                <textarea
                  className="titan-input jobs-textarea"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
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
                <Button type="submit" disabled={isSaving || !title.trim()}>
                  {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="jobs-detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`jobs-status jobs-status--${job.status}`}>
                    {formatJobStatus(job.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>
                  <Link href={`/crm/${job.customerId}`} className="jobs-link">
                    {job.customerName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{job.description ?? '—'}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{job.notes ?? '—'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(job.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          )}

          {canWrite && !isEditing ? (
            <div className="jobs-form__actions">
              <Button type="button" onClick={() => setIsEditing(true)}>
                Edit job
              </Button>
            </div>
          ) : null}
        </Panel>

        {canViewSchedule && accessToken ? (
          <JobSchedulePanel
            accessToken={accessToken}
            job={job}
            canWrite={canWriteSchedule}
            onUpdated={() => void loadJob()}
          />
        ) : null}
      </div>
    </div>
  );
}
