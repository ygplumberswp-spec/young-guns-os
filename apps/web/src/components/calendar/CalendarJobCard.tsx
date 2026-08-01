import { Link } from 'wouter';
import type { ScheduledJobEvent } from '@titan/shared';
import { StatusBadge } from '../ux';
import { displayStatusClass, displayStatusTone, formatTimeRange } from './calendar-utils';

type CalendarJobCardProps = {
  event: ScheduledJobEvent;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (event: ScheduledJobEvent) => void;
  onClick?: (event: ScheduledJobEvent) => void;
};

export function CalendarJobCard({
  event,
  compact = false,
  draggable = false,
  onDragStart,
  onClick,
}: CalendarJobCardProps) {
  const technician = event.assignedUserName || event.crewLabel || 'Unassigned';
  const statusClass = displayStatusClass(event.displayStatus);

  return (
    <article
      className={`cal-job-card ${statusClass}${compact ? ' cal-job-card--compact' : ''}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(event)}
      onClick={(clickEvent) => {
        if (onClick) {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          onClick(event);
        }
      }}
    >
      {onClick ? (
        <div className="cal-job-card__link" role="button" tabIndex={0}>
          <CardBody event={event} compact={compact} technician={technician} />
        </div>
      ) : (
        <Link href={`/jobs/${event.id}`} className="cal-job-card__link">
          <CardBody event={event} compact={compact} technician={technician} />
        </Link>
      )}
    </article>
  );
}

function CardBody({
  event,
  compact,
  technician,
}: {
  event: ScheduledJobEvent;
  compact: boolean;
  technician: string;
}) {
  return (
    <>
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
    </>
  );
}
