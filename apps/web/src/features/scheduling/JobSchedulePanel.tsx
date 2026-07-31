import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import type { JobDetail, JobAssignee } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchAssignees, scheduleJob, updateJobSchedule } from '../../lib/scheduling-api';
import { toDatetimeLocalValue } from './utils';

type JobSchedulePanelProps = {
  accessToken: string;
  job: JobDetail;
  canWrite: boolean;
  onUpdated: () => void;
};

export function JobSchedulePanel({ accessToken, job, canWrite, onUpdated }: JobSchedulePanelProps) {
  const [assignees, setAssignees] = useState<JobAssignee[]>([]);
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(job.scheduledAt));
  const [scheduledEndAt, setScheduledEndAt] = useState(toDatetimeLocalValue(job.scheduledEndAt));
  const [assignedUserId, setAssignedUserId] = useState(job.assignedUserId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setScheduledAt(toDatetimeLocalValue(job.scheduledAt));
    setScheduledEndAt(toDatetimeLocalValue(job.scheduledEndAt));
    setAssignedUserId(job.assignedUserId ?? '');
  }, [job]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignees() {
      try {
        const data = await fetchAssignees(accessToken);

        if (!cancelled) {
          setAssignees(data);
        }
      } catch {
        if (!cancelled) {
          setAssignees([]);
        }
      }
    }

    if (canWrite) {
      void loadAssignees();
    }

    return () => {
      cancelled = true;
    };
  }, [accessToken, canWrite]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite || !scheduledAt) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        scheduledAt: new Date(scheduledAt).toISOString(),
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
        assignedUserId: assignedUserId || null,
      };

      if (job.scheduledAt) {
        await updateJobSchedule(accessToken, job.id, payload);
      } else {
        await scheduleJob(accessToken, job.id, payload);
      }

      onUpdated();
      setSuccess(job.scheduledAt ? 'Schedule updated.' : 'Job scheduled.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save schedule');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearSchedule() {
    if (!canWrite || !job.scheduledAt) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateJobSchedule(accessToken, job.id, { clearSchedule: true });
      onUpdated();
      setScheduledAt('');
      setScheduledEndAt('');
      setAssignedUserId('');
      setSuccess('Schedule cleared.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to clear schedule');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel title="Schedule & assignment">
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!canWrite ? (
        <dl className="jobs-detail-list">
          <div>
            <dt>Scheduled start</dt>
            <dd>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Scheduled end</dt>
            <dd>{job.scheduledEndAt ? new Date(job.scheduledEndAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{job.assignedUserName ?? 'Unassigned'}</dd>
          </div>
        </dl>
      ) : (
        <form className="scheduling-form" onSubmit={(event) => void handleSubmit(event)}>
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

          <div className="jobs-form__actions">
            <Button type="submit" disabled={isSaving || !scheduledAt}>
              {isSaving ? 'Saving…' : job.scheduledAt ? 'Update schedule' : 'Schedule job'}
            </Button>
            {job.scheduledAt ? (
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={() => void handleClearSchedule()}
              >
                Clear schedule
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Panel>
  );
}
