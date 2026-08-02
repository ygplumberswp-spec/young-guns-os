import { useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { CalendarTimeGrid } from '../../components/calendar';
import { useAuth } from '../../lib/auth-context';
import { fetchAssignees, fetchSchedulingCalendar } from '../../lib/scheduling-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

function startOfLocalDay(date = new Date()): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date = new Date()): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function ScheduleOverviewPanel() {
  const { accessToken } = useAuth();
  const [, setLocation] = useLocation();
  const today = useMemo(() => startOfLocalDay(), []);
  const from = today.toISOString();
  const to = endOfLocalDay(today).toISOString();

  const calendarQuery = useStaffCachedQuery({
    queryKey: `scheduling/calendar/dashboard-today:${from}`,
    enabled: Boolean(accessToken),
    fetcher: async () => fetchSchedulingCalendar(accessToken!, from, to),
  });

  const assigneesQuery = useStaffCachedQuery({
    queryKey: 'scheduling/assignees',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchAssignees(accessToken!),
  });

  const isLoading =
    (calendarQuery.isLoading && !calendarQuery.data) ||
    (assigneesQuery.isLoading && !assigneesQuery.data);
  const error = calendarQuery.error || assigneesQuery.error;
  const events = calendarQuery.data?.events ?? [];
  const settings = calendarQuery.data?.settings;
  const assignees = assigneesQuery.data ?? [];

  return (
    <Panel title="Schedule overview" description="Live calendar preview for today">
      {isLoading ? (
        <DashboardSectionSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          title="Unable to load schedule"
          description={error}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void calendarQuery.refetch();
                void assigneesQuery.refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          title="No jobs scheduled today"
          description="Today’s calendar has no scheduled jobs yet. TITAN will not invent a schedule."
          action={
            <Link href="/scheduling">
              <Button size="sm" variant="secondary">
                Open calendar
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="exec-schedule-overview__preview">
            <CalendarTimeGrid
              mode="day"
              anchorDate={today}
              events={events}
              assignees={assignees}
              settings={settings}
              canWrite={false}
              onSlotClick={() => setLocation('/scheduling')}
              onEventClick={(event) => setLocation(`/jobs/${event.id}`)}
              onEventDragStart={() => undefined}
              onDrop={() => undefined}
            />
          </div>
          <div className="exec-schedule-overview__footer">
            <span className="page-muted">
              {events.length} scheduled · source `/scheduling/calendar`
              {settings?.cartrackConnected ? ' · Cartrack travel available' : ''}
            </span>
            <Link href="/scheduling">
              <Button size="sm" variant="secondary">
                Open calendar
              </Button>
            </Link>
          </div>
        </>
      )}
    </Panel>
  );
}
