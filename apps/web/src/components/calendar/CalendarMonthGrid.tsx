import type { ScheduledJobEvent } from '@titan/shared';
import { addDays, startOfMonth, startOfWeek } from './calendar-utils';

type CalendarMonthGridProps = {
  anchorDate: Date;
  events: ScheduledJobEvent[];
  onDayClick: (date: Date) => void;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarMonthGrid({ anchorDate, events, onDayClick }: CalendarMonthGridProps) {
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const cells: Date[] = [];
  let cursor = gridStart;

  while (cursor <= monthEnd || cells.length % 7 !== 0) {
    cells.push(new Date(cursor));
    cursor = addDays(cursor, 1);
    if (cells.length > 42) break;
  }

  return (
    <div className="cal-month-grid">
      <div className="cal-month-grid__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="cal-month-grid__weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="cal-month-grid__cells">
        {cells.map((date) => {
          const inMonth = date.getMonth() === anchorDate.getMonth();
          const dayEvents = events.filter(
            (event) => new Date(event.scheduledAt).toDateString() === date.toDateString(),
          );
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`cal-month-grid__cell${inMonth ? '' : ' cal-month-grid__cell--outside'}${isToday ? ' cal-month-grid__cell--today' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="cal-month-grid__date">{date.getDate()}</span>
              {dayEvents.length > 0 ? (
                <span className="cal-month-grid__count">
                  {dayEvents.length} job{dayEvents.length === 1 ? '' : 's'}
                </span>
              ) : null}
              {dayEvents.length > 0 ? (
                <span className="cal-month-grid__dots" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className={`cal-month-grid__dot cal-month-grid__dot--${event.displayStatus.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
