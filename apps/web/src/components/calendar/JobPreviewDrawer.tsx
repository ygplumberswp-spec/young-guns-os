import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@titan/ui';
import type { JobAssignee, ScheduledJobEvent, VehicleSummary } from '@titan/shared';
import { StatusBadge } from '../ux';
import { displayStatusClass, displayStatusTone, formatTimeRange } from './calendar-utils';

type JobPreviewDrawerProps = {
  event: ScheduledJobEvent | null;
  assignees: JobAssignee[];
  vehicles: VehicleSummary[];
  canWrite: boolean;
  canAssignCrew: boolean;
  isSaving: boolean;
  onClose: () => void;
  onUnschedule: () => void;
  onCancel: () => void;
  onReassignTechnician: (assignedUserId: string | null) => Promise<void>;
  onAssignVehicle: (vehicleId: string | null) => Promise<void>;
};

export function JobPreviewDrawer({
  event,
  assignees,
  vehicles,
  canWrite,
  canAssignCrew,
  isSaving,
  onClose,
  onUnschedule,
  onCancel,
  onReassignTechnician,
  onAssignVehicle,
}: JobPreviewDrawerProps) {
  const [assignedUserId, setAssignedUserId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssignedUserId(event?.assignedUserId ?? '');
    setVehicleId('');
    setError(null);
  }, [event]);

  if (!event) return null;

  const technician = event.assignedUserName || event.crewLabel || 'Unassigned';

  async function handleAssignSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event) return;
    const current = event;
    setError(null);
    try {
      if (canWrite && assignedUserId !== (current.assignedUserId ?? '')) {
        await onReassignTechnician(assignedUserId || null);
      }
      if (canAssignCrew && vehicleId) {
        await onAssignVehicle(vehicleId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update assignment');
    }
  }

  return (
    <div className="cal-drawer" role="dialog" aria-modal="true" aria-label="Job Preview">
      <button type="button" className="cal-drawer__backdrop" onClick={onClose} aria-label="Close" />
      <aside className={`cal-drawer__panel cal-job-card ${displayStatusClass(event.displayStatus)}`}>
        <header className="cal-drawer__header">
          <div>
            <p className="cal-drawer__eyebrow">
              {event.jobNumber ? `#${event.jobNumber}` : 'Job'} · {event.jobType || 'General'}
            </p>
            <h2 className="cal-drawer__title">{event.customerName}</h2>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close Drawer">
            ✕
          </Button>
        </header>

        <div className="cal-drawer__meta-row">
          <StatusBadge tone={displayStatusTone(event.displayStatus)} label={event.displayStatus} />
          <span className="cal-drawer__priority">{event.priority} priority</span>
        </div>

        <dl className="cal-drawer__details">
          <div>
            <dt>Time</dt>
            <dd>{formatTimeRange(event.scheduledAt, event.expectedFinishAt ?? event.scheduledEndAt)}</dd>
          </div>
          <div>
            <dt>Suburb</dt>
            <dd>{event.suburb || event.addressDisplay || '—'}</dd>
          </div>
          <div>
            <dt>Technician / crew</dt>
            <dd>
              {technician}
              {event.vehicleLabel ? ` · ${event.vehicleLabel}` : ''}
            </dd>
          </div>
          <div>
            <dt>Site contact</dt>
            <dd>
              {event.siteContactName || '—'}
              {event.siteContactMobile ? ` · ${event.siteContactMobile}` : ''}
            </dd>
          </div>
          {event.accessWarning ? (
            <div>
              <dt>Access</dt>
              <dd>{event.accessInstructions || 'Access note on file'}</dd>
            </div>
          ) : null}
        </dl>

        {canWrite || canAssignCrew ? (
          <form className="cal-drawer__assign" onSubmit={(formEvent) => void handleAssignSubmit(formEvent)}>
            {error ? <p className="form-error">{error}</p> : null}
            {canWrite ? (
              <label className="titan-input-group">
                <span className="titan-input-label">Assign technician</span>
                <select
                  className="titan-input"
                  value={assignedUserId}
                  onChange={(changeEvent) => setAssignedUserId(changeEvent.target.value)}
                  disabled={isSaving}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.firstName} {assignee.lastName} · {assignee.roleName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canAssignCrew ? (
              <label className="titan-input-group">
                <span className="titan-input-label">Vehicle</span>
                <select
                  className="titan-input"
                  value={vehicleId}
                  onChange={(changeEvent) => setVehicleId(changeEvent.target.value)}
                  disabled={isSaving}
                >
                  <option value="">
                    {event.vehicleLabel ? `Keep current (${event.vehicleLabel})` : 'No vehicle'}
                  </option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name}
                      {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="page-muted">
                Full crew roles stay on the job file. Open the job to edit multi-person crews.
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save assignment'}
            </Button>
          </form>
        ) : null}

        <div className="cal-drawer__actions">
          <Link href={`/jobs/${event.id}`}>
            <Button variant="primary">Open Full Job</Button>
          </Link>
          {canWrite ? (
            <>
              <Button variant="secondary" disabled={isSaving} onClick={() => void onUnschedule()}>
                Unschedule
              </Button>
              <Button variant="ghost" disabled={isSaving} onClick={() => void onCancel()}>
                Cancel job
              </Button>
              <Link href={`/jobs/new?duplicateFrom=${event.id}`}>
                <Button variant="ghost">Duplicate As Draft</Button>
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
