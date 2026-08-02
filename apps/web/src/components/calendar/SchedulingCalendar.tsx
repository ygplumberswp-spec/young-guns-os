import { useMemo, useState } from 'react';
import { EmptyState, LoadingState } from '@titan/ui';
import type {
  JobAssignee,
  JobSummary,
  ScheduledJobEvent,
  SchedulingCalendarResponse,
  SchedulingConflictCheckResponse,
} from '@titan/shared';
import { updateJob } from '../../lib/jobs-api';
import { updateJobSchedule } from '../../lib/scheduling-api';
import {
  applyClientCalendarFilters,
  CalendarFilters,
  type CalendarFilterState,
} from './CalendarFilters';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarTimeGrid } from './CalendarTimeGrid';
import { CalendarToolbar } from './CalendarToolbar';
import { ConflictWarningModal } from './ConflictWarningModal';
import { JobPreviewDrawer } from './JobPreviewDrawer';
import { OverrideReasonModal } from './OverrideReasonModal';
import { ScheduleSlotModal } from './ScheduleSlotModal';
import { UnscheduledJobsTray } from './UnscheduledJobsTray';
import { eventDurationMs, resolveRange, startOfDay } from './calendar-utils';
import type { CalendarStateController } from './useCalendarState';

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
  calendarState: CalendarStateController;
  actions: SchedulingCalendarActions;
  onRefresh: () => void;
  accessToken?: string | null;
  compactHeader?: boolean;
};

type PendingMove = {
  action: 'patch' | 'schedule';
  jobId: string;
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
  calendarState,
  actions,
  onRefresh,
  accessToken,
  compactHeader = false,
}: SchedulingCalendarProps) {
  const { view, setView, anchorDate, setAnchorDate, filters, setFilters } = calendarState;
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [slotTechnicianId, setSlotTechnicianId] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<ScheduledJobEvent | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [conflicts, setConflicts] = useState<SchedulingConflictCheckResponse | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [draggingEvent, setDraggingEvent] = useState<ScheduledJobEvent | null>(null);
  const [draggingJob, setDraggingJob] = useState<JobSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const events = useMemo(
    () => applyClientCalendarFilters(calendar?.events ?? [], filters as CalendarFilterState, assignees),
    [calendar?.events, filters, assignees],
  );

  const jobTypes = useMemo(() => {
    const values = new Set<string>();
    for (const job of jobs) {
      if (job.jobType) values.add(job.jobType);
    }
    for (const event of calendar?.events ?? []) {
      if (event.jobType) values.add(event.jobType);
    }
    return [...values].sort();
  }, [jobs, calendar?.events]);

  async function commitMove(move: PendingMove, overrideReason?: string) {
    setIsSaving(true);
    try {
      const body = {
        scheduledAt: move.scheduledAt,
        scheduledEndAt: move.scheduledEndAt,
        assignedUserId: move.assignedUserId ?? null,
        acknowledgeConflicts: Boolean(overrideReason),
        overrideReason: overrideReason ?? null,
      };

      if (move.action === 'schedule') {
        await actions.scheduleJob(move.jobId, body);
        setSlotDate(null);
      } else {
        await actions.patchEvent(move.jobId, body);
      }

      setPendingMove(null);
      setConflicts(null);
      setShowOverride(false);
      setDraggingEvent(null);
      setDraggingJob(null);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function attemptMove(
    jobId: string,
    scheduledAt: string,
    scheduledEndAt: string | null,
    assignedUserId: string | null | undefined,
    action: 'patch' | 'schedule',
  ) {
    const check = await actions.checkConflicts({
      jobId,
      scheduledAt,
      scheduledEndAt,
      assignedUserId,
    });

    const move: PendingMove = {
      action,
      jobId,
      scheduledAt,
      scheduledEndAt,
      assignedUserId,
    };

    if (check.hasConflicts) {
      setConflicts(check);
      setPendingMove(move);
      return;
    }

    await commitMove(move);
  }

  async function handleDrop(slot: Date, technicianId?: string | null) {
    if (!canWrite) return;

    if (draggingJob) {
      const end = new Date(slot.getTime() + 60 * 60_000);
      await attemptMove(
        draggingJob.id,
        slot.toISOString(),
        end.toISOString(),
        technicianId ?? draggingJob.assignedUserId,
        'schedule',
      );
      return;
    }

    if (!draggingEvent) return;

    const durationMs = eventDurationMs(draggingEvent);
    const end = new Date(slot.getTime() + durationMs);
    await attemptMove(
      draggingEvent.id,
      slot.toISOString(),
      end.toISOString(),
      technicianId ?? draggingEvent.assignedUserId,
      'patch',
    );
  }

  async function handleUnschedule() {
    if (!previewEvent || !accessToken) return;
    setIsSaving(true);
    try {
      await updateJobSchedule(accessToken, previewEvent.id, { clearSchedule: true });
      setPreviewEvent(null);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelJob() {
    if (!previewEvent || !accessToken) return;
    setIsSaving(true);
    try {
      await updateJob(accessToken, previewEvent.id, { status: 'cancelled' });
      setPreviewEvent(null);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  function openSlot(slot: Date, technicianId?: string | null) {
    if (!canWrite) return;
    setSlotDate(slot);
    setSlotTechnicianId(technicianId ?? null);
  }

  function switchToDay(date: Date) {
    setAnchorDate(startOfDay(date));
    setView('day');
  }

  const showEmptyState = !isLoading && events.length === 0;

  const emptyStateCopy =
    view === 'day'
      ? {
          title: 'No jobs scheduled today',
          description: 'Pick another day or drag unscheduled jobs from the tray below.',
        }
      : view === 'week'
        ? {
            title: 'No jobs scheduled this week',
            description: 'Switch to day view to schedule jobs, or drag from the tray below.',
          }
        : {
            title: 'No scheduled jobs this month',
            description: 'Use week or day view to schedule jobs, or drag from the tray below.',
          };

  return (
    <div
      className={`cal-shell${compactHeader ? ' cal-shell--compact' : ''}`}
      data-view={view}
    >
      <div className="cal-shell__header">
        <CalendarToolbar
          view={view}
          anchorDate={anchorDate}
          onViewChange={setView}
          onAnchorChange={setAnchorDate}
        />
        <CalendarFilters
          assignees={assignees}
          filters={filters as CalendarFilterState}
          jobTypes={jobTypes}
          onChange={(next) => setFilters(next)}
          showTechnicianFilter={showTechnicianFilter}
        />
      </div>

      {calendar?.settings ? (
        <p className="page-muted cal-shell__travel-note">
          Working hours {calendar.settings.workDayStartHour}:00–{calendar.settings.workDayEndHour}:00
          · Travel {calendar.settings.defaultTravelMinutes} min
          {calendar.settings.cartrackConnected ? ' · Cartrack connected (stub ETA)' : ''}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="cal-shell__main">
        {isLoading ? (
          <LoadingState label="Loading calendar…" />
        ) : view === 'month' ? (
          showEmptyState ? (
            <EmptyState title={emptyStateCopy.title} description={emptyStateCopy.description} />
          ) : (
            <CalendarMonthGrid anchorDate={anchorDate} events={events} onDayClick={switchToDay} />
          )
        ) : showEmptyState ? (
          <EmptyState title={emptyStateCopy.title} description={emptyStateCopy.description} />
        ) : (
          <CalendarTimeGrid
            mode={view}
            anchorDate={anchorDate}
            events={events}
            assignees={assignees}
            settings={calendar?.settings}
            technicianFilter={filters.technicianId}
            canWrite={canWrite}
            onSlotClick={openSlot}
            onEventClick={setPreviewEvent}
            onEventDragStart={setDraggingEvent}
            onDrop={(slot, technicianId) => void handleDrop(slot, technicianId)}
          />
        )}
      </div>

      {canWrite ? (
        <UnscheduledJobsTray
          jobs={jobs}
          events={events}
          canWrite={canWrite}
          onDragStart={setDraggingJob}
          onJobClick={(job) => {
            const event = events.find((item) => item.id === job.id);
            if (event) setPreviewEvent(event);
            else openSlot(startOfDay(anchorDate), job.assignedUserId);
          }}
        />
      ) : null}

      {slotDate ? (
        <ScheduleSlotModal
          slotDate={slotDate}
          jobs={jobs}
          assignees={assignees}
          canWrite={canWrite}
          defaultTechnicianId={slotTechnicianId}
          onClose={() => {
            setSlotDate(null);
            setSlotTechnicianId(null);
          }}
          onSchedule={async (jobId, body) => {
            await attemptMove(
              jobId,
              body.scheduledAt,
              body.scheduledEndAt ?? null,
              body.assignedUserId,
              'schedule',
            );
          }}
        />
      ) : null}

      <JobPreviewDrawer
        event={previewEvent}
        canWrite={canWrite}
        isSaving={isSaving}
        onClose={() => setPreviewEvent(null)}
        onUnschedule={() => void handleUnschedule()}
        onCancel={() => void handleCancelJob()}
      />

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
        onConfirm={(reason) => pendingMove && void commitMove(pendingMove, reason)}
      />
    </div>
  );
}

export { resolveRange };
