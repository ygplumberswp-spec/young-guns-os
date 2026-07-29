import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import { AI_NAME } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobs } from '../../lib/jobs-api';
import { fetchSchedulingCalendar } from '../../lib/scheduling-api';
import { useAuth } from '../../lib/auth-context';
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
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchSchedulingCalendar>>['events']>([]);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchJobs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessScheduling(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageScheduling(user.permissions) : false),
    [user],
  );

  const weekStart = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);

  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const weekDays = useMemo(() => groupEventsByDay(events, weekStart), [events, weekStart]);

  async function loadCalendar() {
    if (!accessToken) {
      return;
    }

    const [calendar, jobList] = await Promise.all([
      fetchSchedulingCalendar(accessToken, weekStart.toISOString(), weekEnd.toISOString()),
      fetchJobs(accessToken),
    ]);

    setEvents(calendar.events);
    setJobs(jobList);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadCalendar();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load schedule');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, weekStart, weekEnd]);

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

      {isLoading ? <p className="page-muted">Loading calendar…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="scheduling-layout">
          <Panel title="Week calendar">
            {events.length === 0 ? (
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
                            <Link href={`/jobs/${event.id}`} className="scheduling-calendar__event-link">
                              <span className="scheduling-calendar__event-time">
                                {new Date(event.scheduledAt).toLocaleTimeString(undefined, {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="scheduling-calendar__event-title">{event.title}</span>
                              <span className="scheduling-calendar__event-meta">
                                {event.customerName}
                                {event.assignedUserName ? ` · ${event.assignedUserName}` : ' · Unassigned'}
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
              <ScheduleJobForm
                accessToken={accessToken!}
                jobs={jobs}
                onScheduled={() => void loadCalendar().catch(() => undefined)}
              />
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
