import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type {
  GoogleCalendarMergedEntry,
  GoogleCalendarMergedEntryKind,
} from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import {
  fetchGoogleCalendarConflicts,
  fetchUnifiedCalendar,
} from '../../lib/google-calendar-api';

const KIND_LABELS: Record<GoogleCalendarMergedEntryKind, string> = {
  titan_job: 'TITAN job',
  google_event: 'Google event',
  private_busy: 'Private (Busy)',
  conflict: 'Conflict',
};

/** Distinct classes so the four entry kinds are visually separable. */
const KIND_CLASSES: Record<GoogleCalendarMergedEntryKind, string> = {
  titan_job: 'gcal-entry gcal-entry--titan',
  google_event: 'gcal-entry gcal-entry--google',
  private_busy: 'gcal-entry gcal-entry--busy',
  conflict: 'gcal-entry gcal-entry--conflict',
};

function formatWindow(entry: GoogleCalendarMergedEntry): string {
  const start = new Date(entry.startAt);
  if (entry.isAllDay) {
    return `${start.toLocaleDateString()} · all day`;
  }
  const startLabel = start.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!entry.endAt) return startLabel;
  const end = new Date(entry.endAt);
  return `${startLabel} – ${end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Google Calendar overlay for the TITAN schedule.
 *
 * The TITAN calendar above this panel is always the authority; this panel adds
 * what Google contributes for the same visible range. It renders nothing but an
 * honest note when Google is not connected, and it never offers to move a job.
 */
export function GoogleCalendarOverlayPanel({
  from,
  to,
  viewLabel,
}: {
  from: Date;
  to: Date;
  viewLabel: string;
}) {
  const { accessToken } = useAuth();
  const rangeKey = `${from.toISOString()}:${to.toISOString()}`;

  const { data, error, isLoading } = useCachedQuery({
    queryKey: `google-calendar/calendar:${rangeKey}`,
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchUnifiedCalendar(accessToken!, from.toISOString(), to.toISOString()),
  });

  const { data: conflicts = [] } = useCachedQuery({
    queryKey: 'google-calendar/conflicts',
    accessToken,
    enabled: Boolean(accessToken) && Boolean(data?.googleMerged),
    staleTimeMs: 30_000,
    fetcher: async () => fetchGoogleCalendarConflicts(accessToken!),
  });

  const googleEntries = useMemo(
    () =>
      (data?.entries ?? []).filter(
        (entry) => entry.kind === 'google_event' || entry.kind === 'private_busy',
      ),
    [data],
  );

  const conflictedJobs = useMemo(
    () => (data?.entries ?? []).filter((entry) => entry.kind === 'titan_job' && entry.hasConflict),
    [data],
  );

  if (error) {
    return (
      <Panel title="Google Calendar" description="Overlay unavailable">
        <p className="form-error">{error}</p>
      </Panel>
    );
  }

  if (isLoading && !data) {
    return (
      <Panel title="Google Calendar" description="Loading overlay…">
        <p className="page-muted">Loading…</p>
      </Panel>
    );
  }

  if (!data?.googleConnected) {
    return (
      <Panel
        title="Google Calendar"
        description="Not connected"
        headerAction={<Link href="/integrations/google-calendar">Connect</Link>}
      >
        <p className="page-muted">
          The schedule above is the real TITAN schedule. Connect Google Calendar to also see
          external Google events and clash warnings here.
        </p>
      </Panel>
    );
  }

  if (!data.googleMerged) {
    return (
      <Panel
        title="Google Calendar"
        description="Connected — no calendar selected for import"
        headerAction={<Link href="/integrations/google-calendar">Configure</Link>}
      >
        <p className="page-muted">{data.sourceNote}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Google Calendar"
      description={`${viewLabel} · ${data.titanJobCount} TITAN job(s), ${data.googleEventCount} Google entr${data.googleEventCount === 1 ? 'y' : 'ies'}`}
      headerAction={<Link href="/integrations/google-calendar">Configure</Link>}
    >
      <p className="page-muted" style={{ marginBottom: '0.5rem' }}>
        {data.sourceNote} TITAN jobs already mirrored into Google are shown once, on the schedule
        above.
      </p>

      {conflicts.length > 0 ? (
        <div className="gcal-conflicts" style={{ marginBottom: '0.75rem' }}>
          <strong>{conflicts.length} clash(es) need review</strong>
          <ul className="exec-utility-status">
            {conflicts.slice(0, 5).map((conflict) => (
              <li key={conflict.id} className={KIND_CLASSES.conflict}>
                <strong>{KIND_LABELS.conflict}</strong>
                <span> · {conflict.message}</span>
              </li>
            ))}
          </ul>
          <p className="page-muted">
            TITAN has not moved any job. Reschedule from the calendar above if a clash is real.
          </p>
        </div>
      ) : null}

      {conflictedJobs.length > 0 ? (
        <ul className="exec-utility-status" style={{ marginBottom: '0.75rem' }}>
          {conflictedJobs.map((entry) => (
            <li key={entry.key} className={KIND_CLASSES.conflict}>
              <strong>{KIND_LABELS.titan_job}</strong>
              <span>
                {' '}
                · {entry.title} · {formatWindow(entry)} · clashes with a Google entry
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {googleEntries.length === 0 ? (
        <p className="page-muted">No Google entries in this range.</p>
      ) : (
        <ul className="exec-utility-status">
          {googleEntries.map((entry) => (
            <li key={entry.key} className={KIND_CLASSES[entry.kind]}>
              <strong>{KIND_LABELS[entry.kind]}</strong>
              <span>
                {' '}
                · {entry.title} · {formatWindow(entry)}
                {entry.calendarSummary ? ` · ${entry.calendarSummary}` : ''}
              </span>
              {entry.meetLink ? (
                <>
                  {' '}
                  <a href={entry.meetLink} target="_blank" rel="noreferrer noopener">
                    Join Meet
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="ux-page-header__actions" style={{ marginTop: '0.75rem' }}>
        <Link href="/integrations/google-calendar">
          <Button variant="secondary" size="sm">
            Manage Google Calendar
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
