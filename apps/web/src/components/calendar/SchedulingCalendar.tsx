import { useEffect, useMemo, useState } from 'react';
import { LoadingState } from '@titan/ui';
import type {
  CalendarViewMode,
  JobAssignee,
  JobSummary,
  ScheduledJobEvent,
  SchedulingCalendarResponse,
  SchedulingConflictCheckResponse,
  VehicleSummary,
} from '@titan/shared';
import { assignJobCrew, fetchJobExecution, updateJob } from '../../lib/jobs-api';
import { fetchVehicles } from '../../lib/fleet-api';
import { updateJobSchedule } from '../../lib/scheduling-api';
import {
  applyClientCalendarFilters,
  CalendarFilters,
  type CalendarFilterState,
} from './CalendarFilters';
import { BookJobModal } from './BookJobModal';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarTimeGrid } from './CalendarTimeGrid';
import { CalendarToolbar } from './CalendarToolbar';
import { ConflictWarningModal } from './ConflictWarningModal';
import { JobPreviewDrawer } from './JobPreviewDrawer';
import { OverrideReasonModal } from './OverrideReasonModal';
import { ScheduleSlotModal } from './ScheduleSlotModal';
import { UnscheduledJobsTray } from './UnscheduledJobsTray';
import { eventDurationMs, resolveRange, startOfDay } from './calendar-utils';

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
  canAssignCrew?: boolean;
  canCreateJobs?: boolean;
  showTechnicianFilter?: boolean;
  view: CalendarViewMode;
  anchorDate: Date;
  filters: CalendarFilterState;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorChange: (date: Date) => void;
  onFiltersChange: (filters: CalendarFilterState) => void;
  actions: SchedulingCalendarActions;
  onRefresh: () => void;
  accessToken?: string | null;
  userId?: string;
  compactHeader?: boolean;
  focusJobId?: string | null;
  focusMode?: string | null;
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
  canAssignCrew = false,
  canCreateJobs = false,
  showTechnicianFilter = true,
  view,
  anchorDate,
  filters,
  onViewChange,
  onAnchorChange,
  onFiltersChange,
  actions,
  onRefresh,
  accessToken,
  userId,
  compactHeader = false,
  focusJobId = null,
  focusMode = null,
}: SchedulingCalendarProps) {
  const [slotDate, setSlotDate] = useState<Date | null>(null);
  const [slotTechnicianId, setSlotTechnicianId] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<ScheduledJobEvent | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [conflicts, setConflicts] = useState<SchedulingConflictCheckResponse | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [draggingEvent, setDraggingEvent] = useState<ScheduledJobEvent | null>(null);
  const [draggingJob, setDraggingJob] = useState<JobSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);

  const events = useMemo(
    () => applyClientCalendarFilters(calendar?.events ?? [], filters, assignees),
    [calendar?.events, filters, assignees],
  );

  useEffect(() => {
    if (!accessToken || !(canAssignCrew || canCreateJobs)) {
      setVehicles([]);
      return;
    }

    let cancelled = false;
    void fetchVehicles(accessToken)
      .then((data) => {
        if (!cancelled) setVehicles(data);
      })
      .catch(() => {
        if (!cancelled) setVehicles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, canAssignCrew, canCreateJobs]);

  useEffect(() => {
    if (!focusJobId || deepLinkConsumed || isLoading) return;

    const scheduled = events.find((event) => event.id === focusJobId);
    if (scheduled) {
      onAnchorChange(startOfDay(new Date(scheduled.scheduledAt)));
      if (focusMode === 'reschedule' || view === 'month') {
        onViewChange('day');
      }
      setPreviewEvent(scheduled);
      setDeepLinkConsumed(true);
      return;
    }

    const linkedJob = jobs.find((job) => job.id === focusJobId);
    if (!linkedJob) return;

    if (linkedJob.scheduledAt) {
      onAnchorChange(startOfDay(new Date(linkedJob.scheduledAt)));
      onViewChange('day');
      setDeepLinkConsumed(true);
      return;
    }

    if (canWrite || canCreateJobs) {
      setSlotTechnicianId(linkedJob.assignedUserId);
      setSlotDate(startOfDay(anchorDate));
      setDeepLinkConsumed(true);
    }
  }, [
    focusJobId,
    focusMode,
    deepLinkConsumed,
    isLoading,
    events,
    jobs,
    canWrite,
    canCreateJobs,
    view,
    anchorDate,
    onAnchorChange,
    onViewChange,
  ]);

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

  async function handleReassignTechnician(assignedUserId: string | null) {
    if (!previewEvent) return;
    await attemptMove(
      previewEvent.id,
      previewEvent.scheduledAt,
      previewEvent.scheduledEndAt,
      assignedUserId,
      'patch',
    );
  }

  async function handleAssignVehicle(vehicleId: string) {
    if (!previewEvent || !accessToken) return;
    setIsSaving(true);
    try {
      const execution = await fetchJobExecution(accessToken, previewEvent.id);
      const members =
        execution.crew.length > 0
          ? execution.crew.map((member) => ({
              userId: member.userId,
              crewRole: member.crewRole,
              isPrimary: member.isPrimary,
            }))
          : previewEvent.assignedUserId
            ? [
                {
                  userId: previewEvent.assignedUserId,
                  crewRole: 'crew_leader' as const,
                  isPrimary: true,
                },
              ]
            : [];

      if (members.length === 0) {
        throw new Error('Assign a technician before selecting a vehicle.');
      }

      await assignJobCrew(accessToken, previewEvent.id, {
        members,
        vehicleId,
        primaryUserId: members.find((member) => member.isPrimary)?.userId ?? members[0]!.userId,
      });
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  function openBooking(slot: Date, technicianId?: string | null) {
    if (!canWrite && !canCreateJobs) return;
    setSlotDate(slot);
    setSlotTechnicianId(technicianId ?? null);
  }

  function handleMonthDayClick(date: Date) {
    if (canCreateJobs || canWrite) {
      const slot = startOfDay(date);
      slot.setHours(8, 0, 0, 0);
      openBooking(slot, null);
      return;
    }
    onAnchorChange(startOfDay(date));
    onViewChange('day');
  }

  return (
    <div className={`cal-shell${compactHeader ? ' cal-shell--compact' : ''}`}>
      <div className="cal-shell__header">
        <CalendarToolbar
          view={view}
          anchorDate={anchorDate}
          onViewChange={onViewChange}
          onAnchorChange={onAnchorChange}
        />
        <CalendarFilters
          assignees={assignees}
          filters={filters}
          jobTypes={jobTypes}
          onChange={onFiltersChange}
          showTechnicianFilter={showTechnicianFilter}
          collapsible
          defaultExpanded={false}
        />
      </div>

      {calendar?.settings ? (
        <p className="page-muted cal-shell__travel-note">
          Working hours {calendar.settings.workDayStartHour}:00–{calendar.settings.workDayEndHour}:00
          · Travel {calendar.settings.defaultTravelMinutes} min default
          {calendar.settings.travelTimeSource === 'google_maps'
            ? ' · Google Maps routing when coordinates verified'
            : calendar.settings.cartrackConnected
              ? ' · Cartrack GPS connected (routing uses Google Maps when configured)'
              : ''}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="cal-shell__main">
        {isLoading ? (
          <LoadingState label="Loading Calendar…" />
        ) : view === 'month' ? (
          <CalendarMonthGrid
            anchorDate={anchorDate}
            events={events}
            onDayClick={handleMonthDayClick}
          />
        ) : (
          <CalendarTimeGrid
            mode={view}
            anchorDate={anchorDate}
            events={events}
            assignees={assignees}
            settings={calendar?.settings}
            technicianFilter={filters.technicianId}
            canWrite={canWrite || canCreateJobs}
            onSlotClick={openBooking}
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
            else openBooking(startOfDay(anchorDate), job.assignedUserId);
          }}
        />
      ) : null}

      {slotDate && accessToken && canCreateJobs ? (
        <BookJobModal
          slotDate={slotDate}
          accessToken={accessToken}
          userId={userId}
          assignees={assignees}
          vehicles={vehicles}
          defaultTechnicianId={slotTechnicianId}
          canWrite={canCreateJobs}
          onClose={() => {
            setSlotDate(null);
            setSlotTechnicianId(null);
          }}
          onCreated={onRefresh}
        />
      ) : null}

      {slotDate && canWrite && !canCreateJobs ? (
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
        assignees={assignees}
        vehicles={vehicles}
        canWrite={canWrite}
        canAssignCrew={canAssignCrew}
        isSaving={isSaving}
        onClose={() => setPreviewEvent(null)}
        onUnschedule={() => void handleUnschedule()}
        onCancel={() => void handleCancelJob()}
        onReassignTechnician={handleReassignTechnician}
        onAssignVehicle={handleAssignVehicle}
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
