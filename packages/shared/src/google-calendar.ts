/**
 * Google Calendar live scheduling — shared contracts and the pure rules that
 * decide what leaves the tenant, what counts as a conflict, and who owns an edit.
 *
 * TITAN is the scheduling authority. Google is a mirror plus a read-only inbound
 * feed. Nothing in here moves a job: conflicts are described for human review.
 */

export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export type GoogleCalendarConnectionState =
  | 'not_configured'
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'reauth_required'
  | 'error';

export type GoogleCalendarSyncDirection = 'disabled' | 'push_only' | 'import_only' | 'two_way';

export type GoogleCalendarPrivacyMode = 'busy_only' | 'limited_details' | 'approved_details';

export type GoogleCalendarSyncRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'skipped';

export type GoogleCalendarSyncTrigger = 'manual' | 'scheduled' | 'oauth_connect' | 'job_change';

export type GoogleCalendarLinkState =
  | 'pending'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'deleted_remotely'
  | 'cancelled';

export type GoogleCalendarConflictType =
  | 'job_overlaps_google_event'
  | 'google_event_overlaps_job'
  | 'concurrent_edit'
  | 'remote_event_deleted'
  | 'remote_event_moved';

export type GoogleCalendarConflictStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export type GoogleCalendarConversionTarget =
  | 'job'
  | 'quote'
  | 'inspection'
  | 'meeting'
  | 'reminder';

/** Google's accessRole on a calendar — decides whether TITAN may write to it. */
export type GoogleCalendarAccessRole =
  | 'none'
  | 'freeBusyReader'
  | 'reader'
  | 'writer'
  | 'owner';

export type GoogleCalendarConnectionStatus = {
  /** Whether the API host has a Google OAuth client at all. */
  oauthConfigured: boolean;
  connected: boolean;
  state: GoogleCalendarConnectionState;
  googleAccountEmail: string | null;
  grantedScopes: string[];
  requiredScopes: string[];
  /** Scopes the brief needs that the current grant does not include. */
  missingScopes: string[];
  redirectUri: string | null;
  autoSyncEnabled: boolean;
  pushJobsEnabled: boolean;
  importEventsEnabled: boolean;
  defaultPrivacyMode: GoogleCalendarPrivacyMode;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: GoogleCalendarSyncRunStatus | null;
  lastError: string | null;
  connectedAt: string | null;
  selectedCalendarCount: number;
  openConflictCount: number;
  /** Honest one-liner for the settings card — never claims a connection we lack. */
  statusMessage: string;
};

export type GoogleCalendarCalendarSummary = {
  id: string;
  googleCalendarId: string;
  summary: string;
  description: string | null;
  timeZone: string | null;
  accessRole: GoogleCalendarAccessRole | null;
  isPrimary: boolean;
  selected: boolean;
  syncDirection: GoogleCalendarSyncDirection;
  privacyMode: GoogleCalendarPrivacyMode;
  /** False when Google only granted read access, so push must stay off. */
  canPush: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type GoogleCalendarSyncRunSummary = {
  id: string;
  trigger: GoogleCalendarSyncTrigger;
  status: GoogleCalendarSyncRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  eventsImported: number;
  eventsUpdated: number;
  jobsPushed: number;
  jobsUpdated: number;
  jobsDeleted: number;
  conflictsDetected: number;
  calendarsProcessed: number;
  message: string;
  requestedByUserId: string | null;
};

export type GoogleCalendarConflictSummary = {
  id: string;
  conflictType: GoogleCalendarConflictType;
  status: GoogleCalendarConflictStatus;
  severity: 'block' | 'warn' | 'info';
  message: string;
  windowStart: string | null;
  windowEnd: string | null;
  jobId: string | null;
  jobTitle: string | null;
  jobNumber: string | null;
  externalEventId: string | null;
  externalEventTitle: string | null;
  detectedAt: string;
  lastSeenAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type GoogleCalendarExternalEventSummary = {
  id: string;
  googleCalendarId: string;
  googleEventId: string;
  calendarSummary: string | null;
  /** Null when privacy reduced this to Busy. */
  title: string | null;
  location: string | null;
  organizerEmail: string | null;
  startAt: string | null;
  endAt: string | null;
  isAllDay: boolean;
  isPrivate: boolean;
  showsAsBusy: boolean;
  meetLink: string | null;
  htmlLink: string | null;
  convertedTarget: GoogleCalendarConversionTarget | null;
  convertedEntityId: string | null;
  convertedAt: string | null;
  dismissedAt: string | null;
};

/** A merged calendar entry: a real TITAN job, an imported Google event, or a busy block. */
export type GoogleCalendarMergedEntryKind =
  | 'titan_job'
  | 'google_event'
  | 'private_busy'
  | 'conflict';

export type GoogleCalendarMergedEntry = {
  key: string;
  kind: GoogleCalendarMergedEntryKind;
  title: string;
  startAt: string;
  endAt: string | null;
  isAllDay: boolean;
  /** Present for titan_job entries. */
  jobId: string | null;
  jobNumber: string | null;
  assignedUserName: string | null;
  /** Present for google_event / private_busy entries. */
  externalEventId: string | null;
  calendarSummary: string | null;
  meetLink: string | null;
  /** True when this entry participates in an open conflict. */
  hasConflict: boolean;
  /** True when TITAN itself created the Google event (so it is not shown twice). */
  isTitanMirror: boolean;
};

export type GoogleCalendarUnifiedCalendarResponse = {
  from: string;
  to: string;
  googleConnected: boolean;
  /** True only when Google is connected AND at least one calendar imports events. */
  googleMerged: boolean;
  viewScope: 'all' | 'own';
  titanJobCount: number;
  googleEventCount: number;
  openConflictCount: number;
  entries: GoogleCalendarMergedEntry[];
  /** Explains any gap between what is shown and what exists. */
  sourceNote: string;
};

export type GoogleCalendarSettingsResponse = {
  connection: GoogleCalendarConnectionStatus;
  calendars: GoogleCalendarCalendarSummary[];
  recentSyncRuns: GoogleCalendarSyncRunSummary[];
  technicianMappings: GoogleCalendarTechnicianMapping[];
};

export type GoogleCalendarTechnicianMapping = {
  id: string;
  userId: string;
  userName: string;
  calendarId: string;
  calendarSummary: string;
  pushAssignedJobs: boolean;
};

export type GoogleCalendarUpdateCalendarRequest = {
  selected?: boolean;
  syncDirection?: GoogleCalendarSyncDirection;
  privacyMode?: GoogleCalendarPrivacyMode;
};

export type GoogleCalendarUpdateConnectionRequest = {
  autoSyncEnabled?: boolean;
  pushJobsEnabled?: boolean;
  importEventsEnabled?: boolean;
  defaultPrivacyMode?: GoogleCalendarPrivacyMode;
};

export type GoogleCalendarConvertEventRequest = {
  target: GoogleCalendarConversionTarget;
  /** Required for a job conversion; TITAN will not invent a customer. */
  customerId?: string | null;
  assignedUserId?: string | null;
  title?: string | null;
  notes?: string | null;
};

/** The only TITAN fields ever written to a Google event. */
export type GoogleCalendarPushableJob = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  jobType: string | null;
  status: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  assignedUserName: string | null;
  customerName: string | null;
  addressDisplay: string | null;
  /** TITAN-internal only. Present so the redactor can prove it is dropped. */
  internalNotes?: string | null;
  costTotal?: number | null;
  marginPercent?: number | null;
  customerMobile?: string | null;
};

export type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  location: string | null;
  start: { dateTime: string };
  end: { dateTime: string };
  /** Free/busy visibility on the Google side. */
  transparency: 'opaque' | 'transparent';
  visibility: 'default' | 'private';
  /** Correlation back to TITAN so an imported event is recognised as our own mirror. */
  extendedProperties: {
    private: {
      titanJobId: string;
      titanCompanyId: string;
      titanSource: 'titan_job';
    };
  };
};

const DEFAULT_JOB_DURATION_MINUTES = 60;

/**
 * Build the Google event body for a TITAN job.
 *
 * Privacy is enforced here, not at the call site: internal notes, costs, margins
 * and customer contact numbers are never included at any privacy mode. `busy_only`
 * emits an opaque block with no identifying text at all.
 */
export function buildGoogleEventPayload(input: {
  job: GoogleCalendarPushableJob;
  companyId: string;
  privacyMode: GoogleCalendarPrivacyMode;
}): GoogleCalendarEventPayload {
  const { job, companyId, privacyMode } = input;
  const start = job.scheduledAt;
  const end =
    job.scheduledEndAt ??
    new Date(new Date(job.scheduledAt).getTime() + DEFAULT_JOB_DURATION_MINUTES * 60_000).toISOString();

  const correlation = {
    private: {
      titanJobId: job.jobId,
      titanCompanyId: companyId,
      titanSource: 'titan_job' as const,
    },
  };

  if (privacyMode === 'busy_only') {
    return {
      summary: 'Busy',
      description: '',
      location: null,
      start: { dateTime: start },
      end: { dateTime: end },
      transparency: 'opaque',
      visibility: 'private',
      extendedProperties: correlation,
    };
  }

  const reference = job.jobNumber ? `${job.jobNumber} — ` : '';

  if (privacyMode === 'limited_details') {
    return {
      summary: `${reference}${job.title}`.trim(),
      description: buildDescription([
        job.jobNumber ? `TITAN job: ${job.jobNumber}` : null,
        job.assignedUserName ? `Assigned: ${job.assignedUserName}` : null,
        'Scheduled by TITAN. Manage this job in TITAN.',
      ]),
      location: null,
      start: { dateTime: start },
      end: { dateTime: end },
      transparency: 'opaque',
      visibility: 'private',
      extendedProperties: correlation,
    };
  }

  return {
    summary: `${reference}${job.title}`.trim(),
    description: buildDescription([
      job.jobNumber ? `TITAN job: ${job.jobNumber}` : null,
      job.jobType ? `Type: ${job.jobType}` : null,
      job.customerName ? `Customer: ${job.customerName}` : null,
      job.assignedUserName ? `Assigned: ${job.assignedUserName}` : null,
      'Scheduled by TITAN. Manage this job in TITAN.',
    ]),
    location: job.addressDisplay ?? null,
    start: { dateTime: start },
    end: { dateTime: end },
    transparency: 'opaque',
    visibility: 'default',
    extendedProperties: correlation,
  };
}

function buildDescription(lines: Array<string | null>): string {
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

/**
 * Stable hash of a payload so an unchanged job is never re-pushed.
 *
 * Deliberately a small FNV-1a over the canonical JSON: it only needs to change
 * when the pushed content changes, and it must not depend on Node crypto so the
 * shared package stays runtime-agnostic.
 */
export function hashGoogleEventPayload(payload: GoogleCalendarEventPayload): string {
  const canonical = JSON.stringify([
    payload.summary,
    payload.description,
    payload.location,
    payload.start.dateTime,
    payload.end.dateTime,
    payload.transparency,
    payload.visibility,
  ]);

  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export type GoogleCalendarPushDecision =
  | { action: 'skip'; reason: string }
  | { action: 'create'; reason: string }
  | { action: 'update'; reason: string }
  | { action: 'delete'; reason: string }
  | { action: 'hold_for_review'; reason: string };

/**
 * Decide what to do with one job/link pair.
 *
 * The `hold_for_review` branch is the two-way ownership rule: if Google changed
 * the mirrored event since our last push AND TITAN also changed the job, neither
 * side wins automatically — both are preserved and a human reviews.
 */
export function decideGoogleEventPush(input: {
  jobStatus: string;
  jobScheduledAt: string | null;
  jobUpdatedAt: string;
  privacyMode: GoogleCalendarPrivacyMode;
  canPush: boolean;
  nextPayloadHash: string;
  link: {
    googleEventId: string | null;
    payloadHash: string | null;
    lastPushedAt: string | null;
    googleUpdatedAt: string | null;
    titanUpdatedAt: string | null;
    syncState: GoogleCalendarLinkState;
  } | null;
}): GoogleCalendarPushDecision {
  if (!input.canPush) {
    return { action: 'skip', reason: 'Google granted read-only access to this calendar' };
  }

  const isCancelled = input.jobStatus === 'cancelled';
  const isUnscheduled = !input.jobScheduledAt;

  if (isCancelled || isUnscheduled) {
    if (input.link?.googleEventId) {
      return {
        action: 'delete',
        reason: isCancelled
          ? 'TITAN job was cancelled'
          : 'TITAN job no longer has a scheduled time',
      };
    }
    return { action: 'skip', reason: 'Job is not scheduled and has no Google event' };
  }

  if (!input.link || !input.link.googleEventId) {
    return { action: 'create', reason: 'No Google event exists for this job yet' };
  }

  if (input.link.syncState === 'conflict') {
    return { action: 'hold_for_review', reason: 'An unresolved conflict is already recorded' };
  }

  const remoteChanged = hasRemoteEdit(input.link);
  const localChanged = input.link.payloadHash !== input.nextPayloadHash;

  if (remoteChanged && localChanged) {
    return {
      action: 'hold_for_review',
      reason: 'Both TITAN and Google changed this booking since the last sync',
    };
  }

  if (remoteChanged) {
    return {
      action: 'hold_for_review',
      reason: 'The Google event was edited outside TITAN',
    };
  }

  if (!localChanged) {
    return { action: 'skip', reason: 'Google already matches TITAN' };
  }

  return { action: 'update', reason: 'TITAN job details changed' };
}

function hasRemoteEdit(link: {
  googleUpdatedAt: string | null;
  lastPushedAt: string | null;
}): boolean {
  if (!link.googleUpdatedAt || !link.lastPushedAt) return false;
  const remote = Date.parse(link.googleUpdatedAt);
  const pushed = Date.parse(link.lastPushedAt);
  if (!Number.isFinite(remote) || !Number.isFinite(pushed)) return false;
  // Google's `updated` ticks on our own write, so allow a small settle window.
  return remote - pushed > 2000;
}

export type GoogleCalendarBusyBlock = {
  externalEventId: string;
  title: string | null;
  startAt: string;
  endAt: string;
  isPrivate: boolean;
  showsAsBusy: boolean;
  /** TITAN's own mirror of this job — an overlap with it is not a conflict. */
  titanJobId: string | null;
};

export type GoogleCalendarDetectedConflict = {
  conflictType: GoogleCalendarConflictType;
  severity: 'block' | 'warn' | 'info';
  fingerprint: string;
  jobId: string | null;
  externalEventId: string | null;
  windowStart: string;
  windowEnd: string;
  message: string;
};

/**
 * Find overlaps between TITAN jobs and imported Google events.
 *
 * Skips free/transparent events and TITAN's own mirrors, so a synced job never
 * conflicts with itself. Returns descriptions only — callers must not move jobs.
 */
export function detectGoogleCalendarConflicts(input: {
  jobs: Array<{
    jobId: string;
    jobNumber: string | null;
    title: string;
    scheduledAt: string;
    scheduledEndAt: string | null;
    assignedUserName: string | null;
  }>;
  busyBlocks: GoogleCalendarBusyBlock[];
}): GoogleCalendarDetectedConflict[] {
  const conflicts: GoogleCalendarDetectedConflict[] = [];

  for (const job of input.jobs) {
    const jobStart = Date.parse(job.scheduledAt);
    if (!Number.isFinite(jobStart)) continue;
    const jobEnd = job.scheduledEndAt
      ? Date.parse(job.scheduledEndAt)
      : jobStart + DEFAULT_JOB_DURATION_MINUTES * 60_000;
    if (!Number.isFinite(jobEnd)) continue;

    for (const block of input.busyBlocks) {
      if (!block.showsAsBusy) continue;
      if (block.titanJobId === job.jobId) continue;

      const blockStart = Date.parse(block.startAt);
      const blockEnd = Date.parse(block.endAt);
      if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) continue;

      if (jobStart >= blockEnd || blockStart >= jobEnd) continue;

      const label = block.isPrivate ? 'a private Google event (Busy)' : `"${block.title ?? 'Untitled Google event'}"`;
      const jobLabel = job.jobNumber ? `${job.jobNumber} (${job.title})` : job.title;

      conflicts.push({
        conflictType: 'job_overlaps_google_event',
        severity: 'warn',
        fingerprint: `job:${job.jobId}|event:${block.externalEventId}`,
        jobId: job.jobId,
        externalEventId: block.externalEventId,
        windowStart: new Date(Math.max(jobStart, blockStart)).toISOString(),
        windowEnd: new Date(Math.min(jobEnd, blockEnd)).toISOString(),
        message: `TITAN job ${jobLabel} overlaps ${label} on Google Calendar. TITAN has not moved anything — review and reschedule in TITAN if needed.`,
      });
    }
  }

  return conflicts;
}

/**
 * Merge the real TITAN schedule with imported Google events for the calendar UI.
 *
 * TITAN jobs are always present, connected or not. TITAN's own Google mirrors are
 * dropped so a synced job appears exactly once.
 */
export function mergeGoogleCalendarEntries(input: {
  jobs: Array<{
    jobId: string;
    jobNumber: string | null;
    title: string;
    scheduledAt: string;
    scheduledEndAt: string | null;
    assignedUserName: string | null;
  }>;
  externalEvents: Array<{
    externalEventId: string;
    title: string | null;
    calendarSummary: string | null;
    startAt: string | null;
    endAt: string | null;
    isAllDay: boolean;
    isPrivate: boolean;
    showsAsBusy: boolean;
    meetLink: string | null;
    titanJobId: string | null;
  }>;
  conflictJobIds?: string[];
  conflictExternalEventIds?: string[];
}): GoogleCalendarMergedEntry[] {
  const conflictJobs = new Set(input.conflictJobIds ?? []);
  const conflictEvents = new Set(input.conflictExternalEventIds ?? []);
  const entries: GoogleCalendarMergedEntry[] = [];

  for (const job of input.jobs) {
    entries.push({
      key: `job:${job.jobId}`,
      kind: 'titan_job',
      title: job.jobNumber ? `${job.jobNumber} — ${job.title}` : job.title,
      startAt: job.scheduledAt,
      endAt: job.scheduledEndAt,
      isAllDay: false,
      jobId: job.jobId,
      jobNumber: job.jobNumber,
      assignedUserName: job.assignedUserName,
      externalEventId: null,
      calendarSummary: null,
      meetLink: null,
      hasConflict: conflictJobs.has(job.jobId),
      isTitanMirror: false,
    });
  }

  for (const event of input.externalEvents) {
    // TITAN pushed this one; showing it again would double-book the view.
    if (event.titanJobId) continue;
    if (!event.startAt) continue;

    entries.push({
      key: `gcal:${event.externalEventId}`,
      kind: event.isPrivate ? 'private_busy' : 'google_event',
      title: event.isPrivate ? 'Busy' : (event.title ?? 'Untitled Google event'),
      startAt: event.startAt,
      endAt: event.endAt,
      isAllDay: event.isAllDay,
      jobId: null,
      jobNumber: null,
      assignedUserName: null,
      externalEventId: event.externalEventId,
      calendarSummary: event.calendarSummary,
      meetLink: event.isPrivate ? null : event.meetLink,
      hasConflict: conflictEvents.has(event.externalEventId),
      isTitanMirror: false,
    });
  }

  return entries.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

/** Google only lets TITAN write to calendars where it granted writer/owner. */
export function canPushToCalendar(accessRole: string | null | undefined): boolean {
  return accessRole === 'writer' || accessRole === 'owner';
}

/** Scopes the brief requires that the current grant is missing. */
export function findMissingCalendarScopes(grantedScopes: string[]): string[] {
  const granted = new Set(grantedScopes);
  return GOOGLE_CALENDAR_OAUTH_SCOPES.filter((scope) => !granted.has(scope));
}

/**
 * The honest settings-card line. Never claims a connection that does not exist,
 * and distinguishes "TITAN has no Google OAuth client" from "this tenant has not
 * connected yet".
 */
export function describeGoogleCalendarConnection(input: {
  oauthConfigured: boolean;
  state: GoogleCalendarConnectionState;
  googleAccountEmail: string | null;
  selectedCalendarCount: number;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  missingScopes: string[];
}): string {
  if (!input.oauthConfigured) {
    return 'Awaiting configuration — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API, then connect Google Calendar.';
  }

  switch (input.state) {
    case 'connected': {
      const account = input.googleAccountEmail ?? 'Google account';
      if (input.missingScopes.length > 0) {
        return `Connected as ${account}, but Google did not grant all calendar permissions. Reconnect to approve them.`;
      }
      if (input.selectedCalendarCount === 0) {
        return `Connected as ${account}. Select at least one calendar to start syncing — nothing syncs until you do.`;
      }
      const sync = input.lastSuccessfulSyncAt
        ? `Last successful sync ${input.lastSuccessfulSyncAt}.`
        : 'No successful sync yet — use Sync Now.';
      return `Connected as ${account}, ${input.selectedCalendarCount} calendar${input.selectedCalendarCount === 1 ? '' : 's'} selected. ${sync}`;
    }
    case 'reauth_required':
      return 'Google revoked or expired the grant. Reconnect Google Calendar to resume syncing.';
    case 'pending':
      return 'Waiting for Google to confirm authorization. Finish the Google consent screen.';
    case 'error':
      return input.lastError
        ? `Google Calendar reported an error: ${input.lastError}`
        : 'Google Calendar reported an error. Try Sync Now, or reconnect.';
    case 'not_configured':
      return 'Awaiting configuration — Google Calendar OAuth is not set up on this API host.';
    default:
      return 'Not connected. Connect Google Calendar to mirror TITAN jobs and see external events.';
  }
}

/** Which capabilities a role may use. TITAN keeps assignment authority regardless. */
export type GoogleCalendarCapability =
  | 'view_company_calendar'
  | 'view_own_calendar'
  | 'manage_connection'
  | 'trigger_sync'
  | 'resolve_conflicts'
  | 'convert_external_event';

export function resolveGoogleCalendarCapabilities(permissions: string[]): GoogleCalendarCapability[] {
  const has = (permission: string) =>
    permissions.includes('*') || permissions.includes(permission);

  const capabilities: GoogleCalendarCapability[] = [];

  if (has('dispatch:read') || has('dispatch:write')) {
    capabilities.push('view_company_calendar');
  } else if (has('mobile:read')) {
    capabilities.push('view_own_calendar');
  }

  if (has('integrations:manage')) {
    capabilities.push('manage_connection', 'trigger_sync');
  }

  if (has('dispatch:write')) {
    capabilities.push('resolve_conflicts', 'convert_external_event');
  }

  return capabilities;
}
