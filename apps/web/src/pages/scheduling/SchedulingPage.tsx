import { useCallback, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, PageHeader, Panel } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { fetchJobs } from '../../lib/jobs-api';
import { fetchSchedulingCalendar } from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ScheduleJobForm } from '../../features/scheduling/ScheduleJobForm';
import {
  canAccessScheduling,
  canManageScheduling,
  endOfWeek,
  formatWeekLabel,
  groupEventsByDay,
  startOfWeek,
} from '../../features/scheduling/utils';

export function SchedulingPage() {
  const { accessToken, user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);

  const canView = useMemo(() => (user ? canAccessScheduling(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageScheduling(user.permissions) : false), [user]);

  const weekStart = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);

  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const weekKey = weekStart.toISOString().slice(0, 10);

  const {
    data: calendar,
    error: calendarError,
    isLoading: isCalendarLoading,
    refetch: refetchCalendar,
  } = useCachedQuery({
    queryKey: `scheduling/calendar:${weekKey}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () =>
      fetchSchedulingCalendar(accessToken!, weekStart.toISOString(), weekEnd.toISOString()),
  });

  const { data: jobs, isLoading: isJobsLoading } = useCachedQuery({
    queryKey: 'jobs/list',
    accessToken,
    enabled: canView && canWrite,
    staleTimeMs: 30_000,
    fetcher: async () => fetchJobs(accessToken!),
  });

  const events = calendar?.events ?? [];
  const weekDays = useMemo(() => groupEventsByDay(events, weekStart), [events, weekStart]);

  const reloadCalendar = useCallback(async () => {
    await refetchCalendar();
  }, [refetchCalendar]);

  if (!canView) {
    return (
      <div className="scheduling-page">
        <PageHeader title="Schedule" description="You do not have permission to view scheduling." />
      </div>
    );
  }

  return (
    <div className="scheduling-page">
      <PageHeader
        title="Schedule"
        description="Calendar view of scheduled jobs and team assignments."
        actions={
          <div className="scheduling-page__actions">
            <Link href={`/aura?scheduling=1`}>
              <Button variant="secondary">Ask {AI_NAME}</Button>
            </Link>
            <Button variant="ghost" onClick={() => setWeekOffset((current) => current - 1)}>
              Previous week
            </Button>
            <Button variant="ghost" onClick={() => setWeekOffset(0)}>
              This week
            </Button>
            <Button variant="ghost" onClick={() => setWeekOffset((current) => current + 1)}>
              Next week
            </Button>
          </div>
        }
      />

      <p className="scheduling-page__range">{formatWeekLabel(weekStart, weekEnd)}</p>

      <div className="scheduling-layout">
        <Panel title="Week calendar">
          {calendarError ? <p className="form-error">{calendarError}</p> : null}
          {isCalendarLoading ? (
            <LoadingState label="Loading calendar…" />
          ) : events.length === 0 ? (
            <EmptyState
              title="No scheduled jobs"
              description="Schedule jobs to see them on the calendar. Nothing is scheduled yet."
            />
          ) : (
            <div className="scheduling-calendar">
              {weekDays.map((day) => (
                <section key={day.date.toISOString()} className="scheduling-calendar__day">
                  <h3 className="scheduling-calendar__day-title">{day.label}</h3>
                  {day.events.length === 0 ? (
                    <p className="scheduling-calendar__empty">No jobs</p>
                  ) : (
                    <ul className="scheduling-calendar__events">
                      {day.events.map((event) => (
                        <li key={event.id} className="scheduling-calendar__event">
                          <Link
                            href={`/jobs/${event.id}`}
                            className="scheduling-calendar__event-link"
                          >
                            <span className="scheduling-calendar__event-time">
                              {new Date(event.scheduledAt).toLocaleTimeString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              {event.scheduledEndAt
                                ? `–${new Date(event.scheduledEndAt).toLocaleTimeString(undefined, {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}`
                                : ''}
                            </span>
                            <span className="scheduling-calendar__event-title">
                              {event.jobNumber ? `${event.jobNumber} · ` : ''}
                              {event.title}
                            </span>
                            <span className="scheduling-calendar__event-meta">
                              {event.customerName}
                              {event.suburb || event.addressDisplay
                                ? ` · ${event.suburb || event.addressDisplay}`
                                : ''}
                            </span>
                            <span className="scheduling-calendar__event-meta">
                              {event.jobType || 'Job'}
                              {` · ${event.priority}`}
                              {` · ${event.status}`}
                              {event.accessWarning ? ' · Access note' : ''}
                            </span>
                            <span className="scheduling-calendar__event-meta">
                              {event.siteContactName || 'Site contact'}
                              {event.siteContactMobile ? ` · ${event.siteContactMobile}` : ''}
                              {event.assignedUserName || event.crewLabel
                                ? ` · ${event.assignedUserName || event.crewLabel}`
                                : ' · Unassigned'}
                              {event.vehicleLabel ? ` · ${event.vehicleLabel}` : ''}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </Panel>

        {canWrite ? (
          <Panel title="Schedule a job">
            {isJobsLoading ? (
              <LoadingState label="Loading jobs…" />
            ) : (
              <ScheduleJobForm
                accessToken={accessToken!}
                jobs={jobs ?? []}
                onScheduled={() => void reloadCalendar()}
              />
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
