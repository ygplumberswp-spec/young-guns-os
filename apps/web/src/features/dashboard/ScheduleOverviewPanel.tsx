import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import type { CalendarViewMode } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { CalendarMonthGrid, CalendarTimeGrid } from '../../components/calendar';
import {
  endOfMonth,
  endOfWeek,
  formatCalendarRange,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../../components/calendar/calendar-utils';
import { useAuth } from '../../lib/auth-context';
import { fetchAssignees, fetchSchedulingCalendar } from '../../lib/scheduling-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

function rangeForView(view: CalendarViewMode, anchor: Date): { from: Date; to: Date } {
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: endOfWeek(from) };
  }
  if (view === 'month') {
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
  const from = startOfDay(anchor);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function formatAppointmentTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ScheduleOverviewPanel() {
  const { accessToken } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<CalendarViewMode>('day');
  const today = useMemo(() => startOfDay(new Date()), []);
  const range = useMemo(() => rangeForView(view, today), [view, today]);
  const from = range.from.toISOString();
  const to = range.to.toISOString();

  const calendarQuery = useStaffCachedQuery({
    queryKey: `scheduling/calendar/dashboard-${view}:${from}:${to}`,
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

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => event.scheduledAt && new Date(event.scheduledAt).getTime() >= now)
      .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
      .slice(0, 5);
  }, [events]);

  const allocation = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const event of events) {
      if (!event.assignedUserId) continue;
      const assignee = assignees.find((row) => row.id === event.assignedUserId);
      const name =
        event.assignedUserName ??
        (assignee
          ? [assignee.firstName, assignee.lastName].filter(Boolean).join(' ').trim() ||
            assignee.email
          : 'Technician');
      const current = counts.get(event.assignedUserId) ?? { name, count: 0 };
      current.count += 1;
      counts.set(event.assignedUserId, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [events, assignees]);

  const views: CalendarViewMode[] = ['day', 'week', 'month'];

  return (
    <Panel title="Schedule overview" description="Live calendar preview — real appointments only">
      <div className="exec-schedule-overview">
        <div className="exec-schedule-overview__toolbar">
          <div className="exec-schedule-overview__tabs" role="tablist" aria-label="Schedule view">
            {views.map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={view === mode}
                className={`exec-schedule-overview__tab${view === mode ? ' is-active' : ''}`}
                onClick={() => setView(mode)}
              >
                {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <span className="page-muted exec-schedule-overview__range">
            {formatCalendarRange(view, today)}
          </span>
        </div>

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
            title={
              view === 'day'
                ? 'No jobs scheduled today'
                : view === 'week'
                  ? 'No jobs scheduled this week'
                  : 'No jobs scheduled this month'
            }
            description="This calendar range has no scheduled jobs yet. TITAN will not invent a schedule."
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
              {view === 'month' ? (
                <CalendarMonthGrid
                  anchorDate={today}
                  events={events}
                  onDayClick={(date) =>
                    setLocation(`/scheduling?date=${startOfDay(date).toISOString()}`)
                  }
                />
              ) : (
                <CalendarTimeGrid
                  mode={view === 'week' ? 'week' : 'day'}
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
              )}
            </div>

            <div className="exec-schedule-overview__aside">
              <div className="exec-schedule-overview__block">
                <h3>Upcoming</h3>
                {upcoming.length === 0 ? (
                  <p className="page-muted">No upcoming appointments in this range.</p>
                ) : (
                  <ul className="exec-schedule-overview__list">
                    {upcoming.map((event) => (
                      <li key={event.id}>
                        <Link href={`/jobs/${event.id}`}>
                          <strong>{event.title}</strong>
                        </Link>
                        <span>
                          {formatAppointmentTime(event.scheduledAt)}
                          {event.assignedUserName ? ` · ${event.assignedUserName}` : ' · Unassigned'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="exec-schedule-overview__block">
                <h3>Technician allocation</h3>
                {allocation.length === 0 ? (
                  <p className="page-muted">No assigned technicians in this range.</p>
                ) : (
                  <ul className="exec-schedule-overview__list">
                    {allocation.map((row) => (
                      <li key={row.name}>
                        <strong>{row.name}</strong>
                        <span>
                          {row.count} job{row.count === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
      </div>
    </Panel>
  );
}
