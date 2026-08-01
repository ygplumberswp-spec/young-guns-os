import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import type { BusinessDayTimelineCategory } from '@titan/shared';
import { fetchAssignees } from '../../lib/scheduling-api';
import { fetchBusinessDayTimeline } from '../../lib/workforce-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canAccessScheduling } from '../../features/scheduling/utils';

const CATEGORY_LABELS: Record<BusinessDayTimelineCategory, string> = {
  attendance: 'Attendance',
  travel: 'Travel',
  labour: 'Labour',
  break: 'Break',
  workflow: 'Job workflow',
};

function formatTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDateIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** FRZ-007 — office business-day timeline from time entries + job workflow events. */
export function BusinessDayTimelinePage() {
  const { accessToken, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(formatTodayIso);
  const [filterUserId, setFilterUserId] = useState('');

  const canView = useMemo(() => (user ? canAccessScheduling(user.permissions) : false), [user]);

  const assigneesQuery = useCachedQuery({
    queryKey: 'scheduling/assignees',
    accessToken,
    enabled: canView,
    staleTimeMs: 60_000,
    fetcher: async () => fetchAssignees(accessToken!),
  });

  const timelineQuery = useCachedQuery({
    queryKey: `workforce/day-timeline:${selectedDate}:${filterUserId || 'all'}`,
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () =>
      fetchBusinessDayTimeline(accessToken!, selectedDate, filterUserId || null),
  });

  const timeline = timelineQuery.data;

  if (!canView) {
    return (
      <div className="scheduling-page">
        <PageHeader
          title="Business day timeline"
          description="You do not have permission to view workforce timelines."
        />
      </div>
    );
  }

  return (
    <div className="scheduling-page">
      <PageHeader
        title="Business day timeline"
        description="Operational events from clock-in through job workflow — sourced from live time entries and field execution."
      />

      <Panel title="Day filter">
        <div className="scheduling-page__actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={() => setSelectedDate(shiftDateIso(selectedDate, -1))}>
            Previous day
          </Button>
          <input
            className="titan-input"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Timeline date"
          />
          <Button variant="secondary" onClick={() => setSelectedDate(shiftDateIso(selectedDate, 1))}>
            Next day
          </Button>
          <Button variant="ghost" onClick={() => setSelectedDate(formatTodayIso())}>
            Today
          </Button>
        </div>

        <label className="titan-input-group" style={{ marginTop: '0.75rem', maxWidth: '20rem' }}>
          <span className="titan-input-label">Team member</span>
          <select
            className="titan-input"
            value={filterUserId}
            onChange={(event) => setFilterUserId(event.target.value)}
          >
            <option value="">All team members</option>
            {(assigneesQuery.data ?? []).map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {[assignee.firstName, assignee.lastName].filter(Boolean).join(' ') || assignee.email}
              </option>
            ))}
          </select>
        </label>

        <p className="page-muted" style={{ marginTop: '0.5rem' }}>
          Showing {formatDisplayDate(selectedDate)}
        </p>
      </Panel>

      {timelineQuery.isLoading ? <LoadingState label="Loading timeline…" /> : null}
      {timelineQuery.error ? (
        <p className="form-error">
          {timelineQuery.error}
          {' '}
          <Button variant="ghost" onClick={() => void timelineQuery.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}

      {timeline ? (
        <>
          <Panel title="Day summary">
            <dl className="jobs-meta-list">
              <div>
                <dt>Events</dt>
                <dd>{timeline.summary.totalEvents}</dd>
              </div>
              <div>
                <dt>Team members active</dt>
                <dd>{timeline.summary.uniqueUsers}</dd>
              </div>
              <div>
                <dt>On-site labour</dt>
                <dd>{timeline.summary.totalJobTimeMinutes} min</dd>
              </div>
              <div>
                <dt>Travel logged</dt>
                <dd>{timeline.summary.totalTravelMinutes} min</dd>
              </div>
              <div>
                <dt>Workflow transitions</dt>
                <dd>{timeline.summary.workflowEventCount}</dd>
              </div>
            </dl>
          </Panel>

          {timeline.events.length === 0 ? (
            <EmptyState
              title="No events recorded"
              description="Time entries and job workflow actions for this day will appear here as technicians clock in and execute jobs."
            />
          ) : (
            <Panel title="Timeline">
              <ul className="portal-list">
                {timeline.events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.label}</strong>
                    <span>
                      {new Date(event.occurredAt).toLocaleTimeString()} · {event.userName} ·{' '}
                      {CATEGORY_LABELS[event.category]}
                      {event.jobNumber ? ` · ${event.jobNumber}` : ''}
                      {event.durationMinutes ? ` · ${event.durationMinutes} min` : ''}
                    </span>
                    {event.detail ? <p className="page-muted">{event.detail}</p> : null}
                    {event.jobId ? (
                      <Link href={`/jobs/${event.jobId}`} className="crm-link">
                        Open job{event.jobTitle ? `: ${event.jobTitle}` : ''}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}
