import { Link } from 'wouter';
import type { ScheduledJobEvent } from '@titan/shared';
import { StatusBadge } from '../ux';
import { displayStatusTone, formatTimeRange } from './calendar-utils';

type CalendarJobCardProps = {
  event: ScheduledJobEvent;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (event: ScheduledJobEvent) => void;
};

export function CalendarJobCard({
  event,
  compact = false,
  draggable = false,
  onDragStart,
}: CalendarJobCardProps) {
  const technician = event.assignedUserName || event.crewLabel || 'Unassigned';

  return (
    <article
      className={`cal-job-card${compact ? ' cal-job-card--compact' : ''}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(event)}
    >
      <Link href={`/jobs/${event.id}`} className="cal-job-card__link">
        <div className="cal-job-card__header">
          <span className="cal-job-card__time">
            {formatTimeRange(event.scheduledAt, event.expectedFinishAt ?? event.scheduledEndAt)}
          </span>
          <StatusBadge tone={displayStatusTone(event.displayStatus)} label={event.displayStatus} />
        </div>
        <p className="cal-job-card__title">
          {event.jobNumber ? `#${event.jobNumber} · ` : ''}
          {event.customerName}
        </p>
        {!compact ? (
          <>
            <p className="cal-job-card__meta">
              {event.suburb || event.addressDisplay || 'No suburb'} · {event.jobType || 'Job'} ·{' '}
              {event.priority}
            </p>
            <p className="cal-job-card__meta">Technician: {technician}</p>
          </>
        ) : (
          <p className="cal-job-card__meta">{technician}</p>
        )}
      </Link>
    </article>
  );
}
