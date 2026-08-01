import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type { JobAssignee, JobSummary } from '@titan/shared';
import { toDatetimeLocalValue } from '../../features/scheduling/utils';

type ScheduleSlotModalProps = {
  slotDate: Date;
  jobs: JobSummary[];
  assignees: JobAssignee[];
  canWrite: boolean;
  onClose: () => void;
  onSchedule: (
    jobId: string,
    body: {
      scheduledAt: string;
      scheduledEndAt?: string | null;
      assignedUserId?: string | null;
    },
  ) => Promise<void>;
};

export function ScheduleSlotModal({
  slotDate,
  jobs,
  assignees,
  canWrite,
  onClose,
  onSchedule,
}: ScheduleSlotModalProps) {
  const unscheduled = jobs.filter((job) => !job.scheduledAt);
  const [jobId, setJobId] = useState(unscheduled[0]?.id ?? '');
  const [startLocal, setStartLocal] = useState(() => {
    const start = new Date(slotDate);
    start.setHours(8, 0, 0, 0);
    return toDatetimeLocalValue(start.toISOString());
  });
  const [endLocal, setEndLocal] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!jobId || !startLocal) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSchedule(jobId, {
        scheduledAt: new Date(startLocal).toISOString(),
        scheduledEndAt: endLocal ? new Date(endLocal).toISOString() : null,
        assignedUserId: assignedUserId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule job');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="cal-modal-backdrop" role="dialog" aria-modal="true">
      <Panel title="Schedule in slot" className="cal-modal">
        {!canWrite ? (
          <p className="page-muted">You do not have permission to schedule jobs.</p>
        ) : unscheduled.length === 0 ? (
          <>
            <p className="page-muted">No unscheduled jobs available.</p>
            <Link href="/jobs/new">
              <Button variant="secondary">Create job draft</Button>
            </Link>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            {error ? <p className="form-error">{error}</p> : null}
            <label className="titan-input-group">
              <span className="titan-input-label">Job</span>
              <select
                className="titan-input"
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                required
              >
                {unscheduled.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNumber ? `#${job.jobNumber} · ` : ''}
                    {job.title} · {job.customerName}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Start"
              type="datetime-local"
              value={startLocal}
              onChange={(event) => setStartLocal(event.target.value)}
              required
            />
            <Input
              label="End (optional)"
              type="datetime-local"
              value={endLocal}
              onChange={(event) => setEndLocal(event.target.value)}
            />
            <label className="titan-input-group">
              <span className="titan-input-label">Technician</span>
              <select
                className="titan-input"
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.firstName} {assignee.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="cal-modal__actions">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !jobId}>
                {isSaving ? 'Saving…' : 'Save schedule'}
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
