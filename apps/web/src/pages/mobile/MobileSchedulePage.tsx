import { PageHeader } from '../../components/ux';
import { useCallback, useMemo } from 'react';
import { Link } from 'wouter';
import { Button } from '@titan/ui';
import {
  checkSchedulingConflicts,
  fetchAssignees,
  fetchSchedulingCalendar,
  patchCalendarEvent,
} from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { canAccessScheduling } from '../../features/scheduling/utils';
import { SchedulingCalendar, resolveRange, useCalendarState } from '../../components/calendar';
import { StatusBadge } from '../../components/ux';
import { formatTimeRange } from '../../components/calendar/calendar-utils';

/** CAL-001 — technician own-calendar view (mobile route). */
export function MobileSchedulePage() {
  const { accessToken, user } = useAuth();
  const { invalidateScheduling } = useStaffMutationInvalidation();
  const { view, setView, anchorDate, setAnchorDate, filters, setFilters } =
    useCalendarState('/mobile/schedule');

  const canView = useMemo(() => (user ? canAccessScheduling(user.permissions) : false), [user]);
  const range = useMemo(() => resolveRange(view, anchorDate), [view, anchorDate]);
  const rangeKey = `${range.from.toISOString()}:${range.to.toISOString()}`;

  const {
    data: calendar,
    error: calendarError,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: `mobile/scheduling:${rangeKey}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () =>
      fetchSchedulingCalendar(accessToken!, range.from.toISOString(), range.to.toISOString()),
  });

  const { data: assignees = [] } = useCachedQuery({
    queryKey: 'mobile/scheduling/assignees',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchAssignees(accessToken!),
  });

  const reload = useCallback(async () => {
    invalidateScheduling();
    await refetch();
  }, [invalidateScheduling, refetch]);

  const actions = useMemo(
    () => ({
      checkConflicts: (body: Parameters<typeof checkSchedulingConflicts>[1]) =>
        checkSchedulingConflicts(accessToken!, body),
      patchEvent: async (jobId: string, body: Parameters<typeof patchCalendarEvent>[2]) => {
        await patchCalendarEvent(accessToken!, jobId, body);
      },
      scheduleJob: async () => {
        /* technicians cannot create schedules from mobile calendar in CAL-001 */
      },
    }),
    [accessToken],
  );

  const todayEvents = useMemo(() => {
    const todayKey = new Date().toDateString();
    return (calendar?.events ?? [])
      .filter((event) => new Date(event.scheduledAt).toDateString() === todayKey)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [calendar?.events]);

  const currentJob = useMemo(() => {
    const now = Date.now();
    return todayEvents.find((event) => {
      const start = new Date(event.scheduledAt).getTime();
      const end = event.scheduledEndAt
        ? new Date(event.scheduledEndAt).getTime()
        : start + 60 * 60_000;
      return start <= now && now <= end;
    });
  }, [todayEvents]);

  const nextJob = useMemo(() => {
    const now = Date.now();
    return todayEvents.find((event) => new Date(event.scheduledAt).getTime() > now);
  }, [todayEvents]);

  if (!canView) {
    return (
      <div className="portal-page">
        <PageHeader title="My schedule" description="Schedule access is not enabled for this account." />
      </div>
    );
  }

  return (
    <div className="portal-page mobile-schedule-page">
      <PageHeader title="My schedule" description="Today-first timeline and day calendar." />

      <section className="mobile-schedule-page__highlights">
        <article className="mobile-schedule-page__highlight">
          <p className="mobile-schedule-page__label">Current job</p>
          {currentJob ? (
            <>
              <h2>{currentJob.customerName}</h2>
              <p>{formatTimeRange(currentJob.scheduledAt, currentJob.scheduledEndAt)}</p>
              <StatusBadge tone="warning" label={currentJob.displayStatus} />
              <Link href={`/mobile/jobs/${currentJob.id}`}>
                <Button variant="primary">Open job</Button>
              </Link>
            </>
          ) : (
            <p className="page-muted">No job in progress right now.</p>
          )}
        </article>
        <article className="mobile-schedule-page__highlight">
          <p className="mobile-schedule-page__label">Next up</p>
          {nextJob ? (
            <>
              <h2>{nextJob.customerName}</h2>
              <p>{formatTimeRange(nextJob.scheduledAt, nextJob.scheduledEndAt)}</p>
              <StatusBadge tone="info" label={nextJob.displayStatus} />
            </>
          ) : (
            <p className="page-muted">No upcoming jobs today.</p>
          )}
        </article>
      </section>

      <SchedulingCalendar
        calendar={calendar}
        assignees={assignees}
        jobs={[]}
        isLoading={isLoading}
        error={calendarError}
        canWrite={false}
        showTechnicianFilter={false}
        view={view}
        anchorDate={anchorDate}
        filters={filters}
        onViewChange={setView}
        onAnchorChange={setAnchorDate}
        onFiltersChange={setFilters}
        actions={actions}
        compactHeader
        onRefresh={() => void reload()}
      />
    </div>
  );
}
