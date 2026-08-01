import { Link } from 'wouter';
import { Button } from '@titan/ui';
import type { ScheduledJobEvent } from '@titan/shared';
import { StatusBadge } from '../ux';
import { displayStatusClass, displayStatusTone, formatTimeRange } from './calendar-utils';

type JobPreviewDrawerProps = {
  event: ScheduledJobEvent | null;
  canWrite: boolean;
  isSaving: boolean;
  onClose: () => void;
  onUnschedule: () => void;
  onCancel: () => void;
};

export function JobPreviewDrawer({
  event,
  canWrite,
  isSaving,
  onClose,
  onUnschedule,
  onCancel,
}: JobPreviewDrawerProps) {
  if (!event) return null;

  const technician = event.assignedUserName || event.crewLabel || 'Unassigned';

  return (
    <div className="cal-drawer" role="dialog" aria-modal="true" aria-label="Job preview">
      <button type="button" className="cal-drawer__backdrop" onClick={onClose} aria-label="Close" />
      <aside className={`cal-drawer__panel cal-job-card ${displayStatusClass(event.displayStatus)}`}>
        <header className="cal-drawer__header">
          <div>
            <p className="cal-drawer__eyebrow">
              {event.jobNumber ? `#${event.jobNumber}` : 'Job'} · {event.jobType || 'General'}
            </p>
            <h2 className="cal-drawer__title">{event.customerName}</h2>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close drawer">
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
            <dt>Technician</dt>
            <dd>{technician}</dd>
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

        <div className="cal-drawer__actions">
          <Link href={`/jobs/${event.id}`}>
            <Button variant="primary">Open full job</Button>
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
                <Button variant="ghost">Duplicate as draft</Button>
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
