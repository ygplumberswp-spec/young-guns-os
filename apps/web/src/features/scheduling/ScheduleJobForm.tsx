import { FormEvent, useEffect, useState } from 'react';
import { Button, Input } from '@titan/ui';
import type { JobAssignee, JobSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchAssignees, scheduleJob } from '../../lib/scheduling-api';

type ScheduleJobFormProps = {
  accessToken: string;
  jobs: JobSummary[];
  onScheduled: () => void;
};

export function ScheduleJobForm({ accessToken, jobs, onScheduled }: ScheduleJobFormProps) {
  const [assignees, setAssignees] = useState<JobAssignee[]>([]);
  const [jobId, setJobId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledEndAt, setScheduledEndAt] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unscheduledJobs = jobs.filter((job) => !job.scheduledAt);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignees() {
      try {
        const data = await fetchAssignees(accessToken);

        if (!cancelled) {
          setAssignees(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load team members');
        }
      }
    }

    void loadAssignees();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    setJobId(unscheduledJobs[0]?.id ?? '');
  }, [unscheduledJobs]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!jobId || !scheduledAt) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await scheduleJob(accessToken, jobId, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
        assignedUserId: assignedUserId || null,
      });

      setScheduledAt('');
      setScheduledEndAt('');
      setAssignedUserId('');
      onScheduled();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to schedule job');
    } finally {
      setIsSaving(false);
    }
  }

  if (unscheduledJobs.length === 0) {
    return (
      <p className="page-muted">
        All jobs are scheduled or no jobs exist yet. Create a job first, then schedule it here.
      </p>
    );
  }

  return (
    <form className="scheduling-form" onSubmit={(event) => void handleSubmit(event)}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="titan-input-group">
        <span className="titan-input-label">Job</span>
        <select className="titan-input" value={jobId} onChange={(event) => setJobId(event.target.value)} required>
          {unscheduledJobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} · {job.customerName}
            </option>
          ))}
        </select>
      </label>

      <Input
        label="Start"
        type="datetime-local"
        value={scheduledAt}
        onChange={(event) => setScheduledAt(event.target.value)}
        required
      />

      <Input
        label="End (optional)"
        type="datetime-local"
        value={scheduledEndAt}
        onChange={(event) => setScheduledEndAt(event.target.value)}
      />

      <label className="titan-input-group">
        <span className="titan-input-label">Assign to</span>
        <select
          className="titan-input"
          value={assignedUserId}
          onChange={(event) => setAssignedUserId(event.target.value)}
        >
          <option value="">Unassigned</option>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.firstName} {assignee.lastName} · {assignee.roleName}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" disabled={isSaving || !jobId || !scheduledAt}>
        {isSaving ? 'Scheduling…' : 'Schedule job'}
      </Button>
    </form>
  );
}
