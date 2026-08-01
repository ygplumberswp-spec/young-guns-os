import { useMemo, useState } from 'react';
import { EmptyState, LoadingState, Panel } from '@titan/ui';
import type {
  JobAssignee,
  JobSummary,
  ScheduledJobEvent,
  SchedulingCalendarResponse,
  SchedulingConflictCheckResponse,
} from '@titan/shared';
import { CalendarFilters, type CalendarFilterState } from './CalendarFilters';
import { CalendarJobCard } from './CalendarJobCard';
import { CalendarToolbar } from './CalendarToolbar';
import { ConflictWarningModal } from './ConflictWarningModal';
import { OverrideReasonModal } from './OverrideReasonModal';
import { ScheduleSlotModal } from './ScheduleSlotModal';
import {
  addDays,
  resolveRange,
  startOfDay,
  startOfWeek,
} from './calendar-utils';
import { useCalendarState } from './useCalendarState';
import type { CalendarViewMode } from '@titan/shared';

export type SchedulingCalendarActions = {
  checkConflicts: (body: {
    jobId?: string | null;
    scheduledAt: string;
    scheduledEndAt?: string | null;
    assignedUserId?: string | null;
  }) => Promise<SchedulingConflictCheckResponse>;
  patchEvent: (
    jobId: string,
    body: {
      scheduledAt: string;
      scheduledEndAt?: string | null;
      assignedUserId?: string | null;
      overrideReason?: string | null;
      acknowledgeConflicts?: boolean;
    },
  ) => Promise<void>;
  scheduleJob: (
    jobId: string,
    body: {
      scheduledAt: string;
      scheduledEndAt?: string | null;
      assignedUserId?: string | null;
      overrideReason?: string | null;
      acknowledgeConflicts?: boolean;
    },
  ) => Promise<void>;
};

type SchedulingCalendarProps = {
  calendar: SchedulingCalendarResponse | undefined;
  assignees: JobAssignee[];
  jobs: JobSummary[];
  isLoading: boolean;
  error: string | null;
  canWrite: boolean;
  showTechnicianFilter?: boolean;
  pathname?: string;
  actions: SchedulingCalendarActions;
  onRefresh: () => void;
};

type PendingMove = {
  action: 'patch' | 'schedule';
  job: ScheduledJobEvent;
  scheduledAt: string;
  scheduledEndAt: string | null;
  assignedUserId?: string | null;
};

export function SchedulingCalendar({
  calendar,
  assignees,
  jobs,
  isLoading,
  error,
  canWrite,
  showTechnicianFilter = true,
  pathname = '/scheduling',
  actions,
  onRefresh,
}: SchedulingCalendarProps) {
  const { view, setView, anchorDate, setAnchorDate, filters, setFilters } =
    useCalendarState(pathname);
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [conflicts, setConflicts] = useState<SchedulingConflictCheckResponse | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [draggingJob, setDraggingJob] = useState<ScheduledJobEvent | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const events = calendar?.events ?? [];

  const grouped = useMemo(() => groupEventsForView(view, anchorDate, events), [view, anchorDate, events]);

  async function handleDrop(day: Date, hour = 8) {
    if (!canWrite || !draggingJob) return;
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const durationMs = draggingJob.scheduledEndAt
      ? new Date(draggingJob.scheduledEndAt).getTime() - new Date(draggingJob.scheduledAt).getTime()
      : 60 * 60_000;
    const end = new Date(start.getTime() + durationMs);

    const check = await actions.checkConflicts({
      jobId: draggingJob.id,
      scheduledAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      assignedUserId: draggingJob.assignedUserId,
    });

    if (check.hasConflicts) {
      setConflicts(check);
      setPendingMove({
        action: 'patch',
        job: draggingJob,
        scheduledAt: start.toISOString(),
        scheduledEndAt: end.toISOString(),
      });
      return;
    }

    setIsSaving(true);
    try {
      await actions.patchEvent(draggingJob.id, {
        scheduledAt: start.toISOString(),
        scheduledEndAt: end.toISOString(),
        assignedUserId: draggingJob.assignedUserId,
      });
      onRefresh();
    } finally {
      setIsSaving(false);
      setDraggingJob(null);
    }
  }

  async function confirmMove(overrideReason?: string) {
    if (!pendingMove) return;
    setIsSaving(true);
    try {
      const body = {
        scheduledAt: pendingMove.scheduledAt,
        scheduledEndAt: pendingMove.scheduledEndAt,
        assignedUserId: pendingMove.assignedUserId ?? pendingMove.job.assignedUserId,
        acknowledgeConflicts: Boolean(overrideReason),
        overrideReason: overrideReason ?? null,
      };

      if (pendingMove.action === 'schedule') {
        await actions.scheduleJob(pendingMove.job.id, body);
        setSlotDate(null);
      } else {
        await actions.patchEvent(pendingMove.job.id, body);
      }

      setPendingMove(null);
      setConflicts(null);
      setShowOverride(false);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="cal-shell">
      <CalendarToolbar
        view={view}
        anchorDate={anchorDate}
        onViewChange={setView}
        onAnchorChange={setAnchorDate}
      />

      <CalendarFilters
        assignees={assignees}
        filters={filters as CalendarFilterState}
        onChange={(next) => setFilters(next)}
        showTechnicianFilter={showTechnicianFilter}
      />

      {calendar?.settings ? (
        <p className="page-muted cal-shell__travel-note">
          Travel time: {calendar.settings.defaultTravelMinutes} min default
          {calendar.settings.cartrackConnected
            ? ' · Cartrack connected (routing stub — not live ETA)'
            : ' · Cartrack not connected'}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <Panel title="Calendar">
        {isLoading ? (
          <LoadingState label="Loading calendar…" />
        ) : events.length === 0 ? (
          <EmptyState
            title="No scheduled jobs"
            description="Schedule jobs to see them on the calendar for this range."
          />
        ) : (
          <div className={`cal-grid cal-grid--${view}`}>
            {grouped.map((column) => (
              <section
                key={column.key}
                className="cal-grid__column"
                onDragOver={(event) => canWrite && event.preventDefault()}
                onDrop={() => void handleDrop(column.date)}
              >
                <header className="cal-grid__column-header">
                  <button
                    type="button"
                    className="cal-grid__slot-trigger"
                    onClick={() => canWrite && setSlotDate(column.date)}
                  >
                    {column.label}
                  </button>
                </header>
                <div className="cal-grid__events">
                  {column.events.map((event) => (
                    <CalendarJobCard
                      key={event.id}
                      event={event}
                      compact={view === 'month'}
                      draggable={canWrite}
                      onDragStart={setDraggingJob}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>

      {slotDate ? (
        <ScheduleSlotModal
          slotDate={slotDate}
          jobs={jobs}
          assignees={assignees}
          canWrite={canWrite}
          onClose={() => setSlotDate(null)}
          onSchedule={async (jobId, body) => {
            const check = await actions.checkConflicts({ jobId, ...body });
            if (check.hasConflicts) {
              setConflicts(check);
              setPendingMove({
                action: 'schedule',
                job: { id: jobId } as ScheduledJobEvent,
                scheduledAt: body.scheduledAt,
                scheduledEndAt: body.scheduledEndAt ?? null,
                assignedUserId: body.assignedUserId,
              });
              return;
            }
            await actions.scheduleJob(jobId, body);
            setSlotDate(null);
            onRefresh();
          }}
        />
      ) : null}

      <ConflictWarningModal
        open={Boolean(conflicts && pendingMove && !showOverride)}
        conflicts={conflicts?.conflicts ?? []}
        suggestions={conflicts?.suggestions ?? []}
        canOverride={conflicts?.canOverride}
        onCancel={() => {
          setConflicts(null);
          setPendingMove(null);
        }}
        onProceed={() => setShowOverride(true)}
      />

      <OverrideReasonModal
        open={showOverride}
        isSaving={isSaving}
        onCancel={() => setShowOverride(false)}
        onConfirm={(reason) => void confirmMove(reason)}
      />
    </div>
  );
}

function groupEventsForView(
  view: CalendarViewMode,
  anchor: Date,
  events: ScheduledJobEvent[],
): Array<{ key: string; label: string; date: Date; events: ScheduledJobEvent[] }> {
  if (view === 'day') {
    const day = startOfDay(anchor);
    return [
      {
        key: day.toISOString(),
        label: day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        date: day,
        events: eventsForDay(events, day),
      },
    ];
  }

  if (view === 'week') {
    const weekStart = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return {
        key: date.toISOString(),
        label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        date,
        events: eventsForDay(events, date),
      };
    });
  }

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = addDays(monthStart, index);
    return {
      key: date.toISOString(),
      label: String(date.getDate()),
      date,
      events: eventsForDay(events, date),
    };
  });
}

function eventsForDay(events: ScheduledJobEvent[], day: Date): ScheduledJobEvent[] {
  const key = day.toDateString();
  return events
    .filter((event) => new Date(event.scheduledAt).toDateString() === key)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

export { resolveRange };
