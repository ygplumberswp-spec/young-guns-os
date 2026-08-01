import { PageHeader } from '../../components/ux';
import { useCallback, useMemo } from 'react';
import { Link } from 'wouter';
import { Button } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { fetchJobs } from '../../lib/jobs-api';
import {
  checkSchedulingConflicts,
  fetchAssignees,
  fetchSchedulingCalendar,
  patchCalendarEvent,
  scheduleJob,
} from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import {
  canAccessScheduling,
  canManageScheduling,
} from '../../features/scheduling/utils';
import { SchedulingCalendar, resolveRange } from '../../components/calendar';
import { useCalendarState } from '../../components/calendar/useCalendarState';

export function SchedulingPage() {
  const { accessToken, user } = useAuth();
  const { view, anchorDate, filters } = useCalendarState('/scheduling');

  const canView = useMemo(() => (user ? canAccessScheduling(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageScheduling(user.permissions) : false), [user]);

  const range = useMemo(() => resolveRange(view, anchorDate), [view, anchorDate]);
  const rangeKey = `${range.from.toISOString()}:${range.to.toISOString()}:${JSON.stringify(filters)}`;

  const {
    data: calendar,
    error: calendarError,
    isLoading: isCalendarLoading,
    refetch: refetchCalendar,
  } = useCachedQuery({
    queryKey: `scheduling/calendar:${rangeKey}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () =>
      fetchSchedulingCalendar(
        accessToken!,
        range.from.toISOString(),
        range.to.toISOString(),
        filters,
      ),
  });

  const { data: jobs } = useCachedQuery({
    queryKey: 'jobs/list',
    accessToken,
    enabled: canView && canWrite,
    staleTimeMs: 30_000,
    fetcher: async () => fetchJobs(accessToken!),
  });

  const { data: assignees = [] } = useCachedQuery({
    queryKey: 'scheduling/assignees',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchAssignees(accessToken!),
  });

  const reloadCalendar = useCallback(async () => {
    await refetchCalendar();
  }, [refetchCalendar]);

  const actions = useMemo(
    () => ({
      checkConflicts: (body: Parameters<typeof checkSchedulingConflicts>[1]) =>
        checkSchedulingConflicts(accessToken!, body),
      patchEvent: async (jobId: string, body: Parameters<typeof patchCalendarEvent>[2]) => {
        await patchCalendarEvent(accessToken!, jobId, body);
      },
      scheduleJob: async (jobId: string, body: Parameters<typeof scheduleJob>[2]) => {
        await scheduleJob(accessToken!, jobId, body);
      },
    }),
    [accessToken],
  );

  if (!canView) {
    return (
      <div className="scheduling-page scheduling-page--calendar-first">
        <PageHeader title="Schedule" description="You do not have permission to view scheduling." />
      </div>
    );
  }

  return (
    <div className="scheduling-page scheduling-page--calendar-first">
      <PageHeader
        title="Schedule"
        description="Dispatch calendar — week view opens by default."
        actions={
          <div className="scheduling-page__actions">
            <Link href="/workforce/day-timeline">
              <Button variant="secondary">Live dispatch</Button>
            </Link>
            <Link href={`/aura?scheduling=1`}>
              <Button variant="ghost">Ask {AI_NAME}</Button>
            </Link>
          </div>
        }
      />

      <SchedulingCalendar
        calendar={calendar}
        assignees={assignees}
        jobs={jobs ?? []}
        isLoading={isCalendarLoading}
        error={calendarError}
        canWrite={canWrite}
        showTechnicianFilter={calendar?.viewScope !== 'own'}
        actions={actions}
        accessToken={accessToken}
        onRefresh={() => void reloadCalendar()}
      />
    </div>
  );
}
