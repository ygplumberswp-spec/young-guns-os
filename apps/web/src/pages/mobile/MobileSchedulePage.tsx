import { PageHeader } from '../../components/ux';
import { useCallback, useMemo } from 'react';
import {
  checkSchedulingConflicts,
  fetchAssignees,
  fetchSchedulingCalendar,
  patchCalendarEvent,
} from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canAccessScheduling } from '../../features/scheduling/utils';
import { SchedulingCalendar, resolveRange } from '../../components/calendar';
import { useCalendarState } from '../../components/calendar/useCalendarState';

/** CAL-001 — technician own-calendar view (mobile route). */
export function MobileSchedulePage() {
  const { accessToken, user } = useAuth();
  const { view, anchorDate } = useCalendarState('/mobile/schedule');

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
    await refetch();
  }, [refetch]);

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

  if (!canView) {
    return (
      <div className="portal-page">
        <PageHeader title="My schedule" description="Schedule access is not enabled for this account." />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PageHeader title="My schedule" description="Your assigned jobs for the selected period." />
      <SchedulingCalendar
        calendar={calendar}
        assignees={assignees}
        jobs={[]}
        isLoading={isLoading}
        error={calendarError}
        canWrite={false}
        showTechnicianFilter={false}
        pathname="/mobile/schedule"
        actions={actions}
        onRefresh={() => void reload()}
      />
    </div>
  );
}
