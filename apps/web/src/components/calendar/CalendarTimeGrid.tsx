import { useMemo, type CSSProperties } from 'react';
import type { JobAssignee, ScheduledJobEvent, SchedulingSettingsSummary } from '@titan/shared';
import { CalendarJobCard } from './CalendarJobCard';
import {
  CAL_HOUR_HEIGHT_PX,
  buildHourLabels,
  composeSlotDate,
  currentTimeIndicatorTop,
  dropTimeFromOffset,
  eventBlockStyle,
  formatHourLabel,
  isSameDay,
  isToday,
  resolveWorkingHours,
  startOfDay,
  startOfWeek,
  addDays,
} from './calendar-utils';

export type TimeGridColumn = {
  key: string;
  label: string;
  sublabel?: string;
  date: Date;
  technicianId?: string | null;
};

type CalendarTimeGridProps = {
  mode: 'day' | 'week';
  anchorDate: Date;
  events: ScheduledJobEvent[];
  assignees: JobAssignee[];
  settings?: SchedulingSettingsSummary;
  technicianFilter?: string;
  canWrite: boolean;
  onSlotClick: (slot: Date, technicianId?: string | null) => void;
  onEventClick: (event: ScheduledJobEvent) => void;
  onEventDragStart: (event: ScheduledJobEvent) => void;
  onDrop: (slot: Date, technicianId?: string | null) => void;
};

export function CalendarTimeGrid({
  mode,
  anchorDate,
  events,
  assignees,
  settings,
  technicianFilter,
  canWrite,
  onSlotClick,
  onEventClick,
  onEventDragStart,
  onDrop,
}: CalendarTimeGridProps) {
  const { startHour, endHour } = resolveWorkingHours(settings);
  const hourLabels = useMemo(() => buildHourLabels(startHour, endHour), [startHour, endHour]);
  const gridHeight = (endHour - startHour) * CAL_HOUR_HEIGHT_PX;

  const columns = useMemo((): TimeGridColumn[] => {
    if (mode === 'week') {
      const weekStart = startOfWeek(anchorDate);
      return Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        return {
          key: date.toISOString(),
          label: date.toLocaleDateString(undefined, { weekday: 'short' }),
          sublabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          date,
        };
      });
    }

    const day = startOfDay(anchorDate);
    const laneAssignees = technicianFilter
      ? assignees.filter((assignee) => assignee.id === technicianFilter)
      : assignees;

    if (laneAssignees.length === 0) {
      return [
        {
          key: day.toISOString(),
          label: 'All Technicians',
          date: day,
        },
      ];
    }

    return laneAssignees.map((assignee) => ({
      key: `${day.toISOString()}-${assignee.id}`,
      label: `${assignee.firstName} ${assignee.lastName}`,
      sublabel: assignee.roleName,
      date: day,
      technicianId: assignee.id,
    }));
  }, [mode, anchorDate, assignees, technicianFilter]);

  function handleColumnDrop(column: TimeGridColumn, offsetY: number) {
    const { hour, minute } = dropTimeFromOffset(offsetY, startHour, endHour);
    onDrop(composeSlotDate(column.date, hour, minute), column.technicianId);
  }

  return (
    <div className="cal-time-grid" style={{ '--cal-grid-height': `${gridHeight}px` } as CSSProperties}>
      <div className="cal-time-grid__corner" aria-hidden="true" />
      <div className="cal-time-grid__day-headers">
        {columns.map((column) => (
          <header
            key={`header-${column.key}`}
            className={`cal-time-grid__day-header${isToday(column.date) ? ' cal-time-grid__day-header--today' : ''}`}
          >
            <span className="cal-time-grid__day-name">{column.label}</span>
            {column.sublabel ? (
              <span className="cal-time-grid__day-date">{column.sublabel}</span>
            ) : null}
          </header>
        ))}
      </div>

      <div className="cal-time-grid__hours" aria-hidden="true">
        {hourLabels.map((hour) => (
          <div key={hour} className="cal-time-grid__hour-label" style={{ height: CAL_HOUR_HEIGHT_PX }}>
            {formatHourLabel(hour)}
          </div>
        ))}
      </div>

      <div className="cal-time-grid__columns">
        {columns.map((column) => {
          const columnEvents = eventsForDay(
            mode === 'day' && column.technicianId
              ? events.filter((event) => event.assignedUserId === column.technicianId)
              : events,
            column.date,
          );
          const nowTop = isToday(column.date)
            ? currentTimeIndicatorTop(startHour, endHour)
            : null;

          return (
            <div key={column.key} className="cal-time-grid__column">
              <div
                className="cal-time-grid__column-body"
                style={{ height: gridHeight }}
                onDragOver={(event) => canWrite && event.preventDefault()}
                onDrop={(event) => {
                  if (!canWrite) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  handleColumnDrop(column, event.clientY - rect.top);
                }}
              >
                {hourLabels.slice(0, -1).map((hour) => (
                  <button
                    key={`${column.key}-${hour}`}
                    type="button"
                    className="cal-time-grid__slot"
                    style={{ height: CAL_HOUR_HEIGHT_PX }}
                    disabled={!canWrite}
                    aria-label={`Schedule at ${formatHourLabel(hour)} on ${column.label}`}
                    onClick={() =>
                      canWrite && onSlotClick(composeSlotDate(column.date, hour, 0), column.technicianId)
                    }
                  />
                ))}

                {nowTop ? (
                  <div className="cal-time-grid__now-line" style={{ top: nowTop }} aria-hidden="true" />
                ) : null}

                {columnEvents.map((event) => {
                  const style = eventBlockStyle(event, column.date, startHour, endHour);
                  if (!style) return null;
                  return (
                    <div
                      key={event.id}
                      className="cal-time-grid__event"
                      style={style}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onEventClick(event);
                      }}
                    >
                      <CalendarJobCard
                        event={event}
                        compact
                        draggable={canWrite}
                        onDragStart={onEventDragStart}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function eventsForDay(events: ScheduledJobEvent[], day: Date): ScheduledJobEvent[] {
  return events
    .filter((event) => isSameDay(new Date(event.scheduledAt), day))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}
