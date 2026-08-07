import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Google Calendar live scheduling — extends TITAN Scheduling, never replaces it.
 *
 * TITAN remains the authority for job assignment and scheduling. Google is a
 * mirror (TITAN job -> Google event) plus a read-only inbound feed (Google
 * event -> external event awaiting an explicit Owner conversion). Nothing here
 * moves a TITAN job on its own: conflicts are recorded for human review.
 *
 * OAuth tokens live only in `google_calendar_connections.credentials_encrypted`
 * (AES-256-GCM via INTEGRATIONS_ENCRYPTION_KEY) and are never returned by an API.
 */

export const googleCalendarConnectionStatusEnum = pgEnum('google_calendar_connection_status', [
  'not_configured',
  'disconnected',
  'pending',
  'connected',
  'reauth_required',
  'error',
]);

/** Whose calendar a mapping represents, so technician calendars stay opt-in. */
export const googleCalendarSyncDirectionEnum = pgEnum('google_calendar_sync_direction', [
  'disabled',
  'push_only',
  'import_only',
  'two_way',
]);

/** How much TITAN detail may leave the tenant for a given calendar. */
export const googleCalendarPrivacyModeEnum = pgEnum('google_calendar_privacy_mode', [
  'busy_only',
  'limited_details',
  'approved_details',
]);

export const googleCalendarSyncRunStatusEnum = pgEnum('google_calendar_sync_run_status', [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
  'skipped',
]);

export const googleCalendarSyncTriggerEnum = pgEnum('google_calendar_sync_trigger', [
  'manual',
  'scheduled',
  'oauth_connect',
  'job_change',
]);

export const googleCalendarLinkStateEnum = pgEnum('google_calendar_link_state', [
  'pending',
  'synced',
  'failed',
  'conflict',
  'deleted_remotely',
  'cancelled',
]);

export const googleCalendarConflictTypeEnum = pgEnum('google_calendar_conflict_type', [
  'job_overlaps_google_event',
  'google_event_overlaps_job',
  'concurrent_edit',
  'remote_event_deleted',
  'remote_event_moved',
]);

export const googleCalendarConflictStatusEnum = pgEnum('google_calendar_conflict_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const googleCalendarExternalEventKindEnum = pgEnum('google_calendar_external_event_kind', [
  'external_event',
  'private_busy',
  'titan_mirror',
]);

/** What an Owner chose to turn an imported Google event into. */
export const googleCalendarConversionTargetEnum = pgEnum('google_calendar_conversion_target', [
  'job',
  'quote',
  'inspection',
  'meeting',
  'reminder',
]);

/** One Google account grant per tenant. Tokens encrypted; never exposed. */
export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    status: googleCalendarConnectionStatusEnum('status').notNull().default('disconnected'),
    credentialsEncrypted: text('credentials_encrypted'),
    googleAccountEmail: text('google_account_email'),
    googleAccountId: text('google_account_id'),
    grantedScopes: jsonb('granted_scopes').$type<string[]>().notNull().default([]),
    /** Owner toggle: allow the background scheduler to sync without a human pressing Sync Now. */
    autoSyncEnabled: boolean('auto_sync_enabled').notNull().default(false),
    /** Owner toggle: allow TITAN jobs to be mirrored into Google at all. */
    pushJobsEnabled: boolean('push_jobs_enabled').notNull().default(false),
    /** Owner toggle: allow Google events to be imported as external events. */
    importEventsEnabled: boolean('import_events_enabled').notNull().default(true),
    /** Default privacy applied to newly discovered calendars. */
    defaultPrivacyMode: googleCalendarPrivacyModeEnum('default_privacy_mode')
      .notNull()
      .default('limited_details'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
    lastSyncStatus: googleCalendarSyncRunStatusEnum('last_sync_status'),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    /** Set when Google revokes the grant so the UI can ask for re-consent honestly. */
    reauthRequiredAt: timestamp('reauth_required_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUnique: unique('google_calendar_connections_company_unique').on(table.companyId),
  }),
);

/** Calendars discovered on the connected Google account. Selection is explicit. */
export const googleCalendarCalendars = pgTable(
  'google_calendar_calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    summary: text('summary').notNull(),
    description: text('description'),
    timeZone: text('time_zone'),
    /** Google accessRole: freeBusyReader | reader | writer | owner. Gates whether push is possible. */
    accessRole: text('access_role'),
    isPrimary: boolean('is_primary').notNull().default(false),
    selected: boolean('selected').notNull().default(false),
    syncDirection: googleCalendarSyncDirectionEnum('sync_direction').notNull().default('disabled'),
    privacyMode: googleCalendarPrivacyModeEnum('privacy_mode').notNull().default('limited_details'),
    /** Google incremental syncToken checkpoint. Cleared on 410 GONE to force a full resync. */
    syncToken: text('sync_token'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCalendarUnique: unique('google_calendar_calendars_company_calendar_unique').on(
      table.companyId,
      table.googleCalendarId,
    ),
    companyIdx: index('google_calendar_calendars_company_idx').on(table.companyId),
  }),
);

/** Optional technician -> calendar mapping. TITAN still owns assignment. */
export const googleCalendarUserMappings = pgTable(
  'google_calendar_user_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => googleCalendarCalendars.id, { onDelete: 'cascade' }),
    /** Mirror only the jobs TITAN assigned to this user. */
    pushAssignedJobs: boolean('push_assigned_jobs').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserUnique: unique('google_calendar_user_mappings_company_user_unique').on(
      table.companyId,
      table.userId,
    ),
  }),
);

/** TITAN job <-> Google event linkage. Drives idempotent upserts and delete-on-cancel. */
export const googleCalendarJobEventLinks = pgTable(
  'google_calendar_job_event_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => googleCalendarCalendars.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    googleEventId: text('google_event_id'),
    googleEtag: text('google_etag'),
    googleSequence: integer('google_sequence'),
    /** Hash of the approved payload actually pushed, so unchanged jobs are not re-pushed. */
    payloadHash: text('payload_hash'),
    syncState: googleCalendarLinkStateEnum('sync_state').notNull().default('pending'),
    meetLink: text('meet_link'),
    htmlLink: text('html_link'),
    lastPushedAt: timestamp('last_pushed_at', { withTimezone: true }),
    lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
    /** Google's `updated` for the mirrored event — used for concurrent-edit detection. */
    googleUpdatedAt: timestamp('google_updated_at', { withTimezone: true }),
    /** TITAN's `jobs.updated_at` at the moment of the last successful push. */
    titanUpdatedAt: timestamp('titan_updated_at', { withTimezone: true }),
    lastError: text('last_error'),
    failureCount: integer('failure_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    jobCalendarUnique: unique('google_calendar_job_event_links_job_calendar_unique').on(
      table.companyId,
      table.jobId,
      table.googleCalendarId,
    ),
    companyEventIdx: index('google_calendar_job_event_links_event_idx').on(
      table.companyId,
      table.googleEventId,
    ),
    jobIdx: index('google_calendar_job_event_links_job_idx').on(table.jobId),
  }),
);

/**
 * Imported Google events. These are EXTERNAL events only — never a TITAN job.
 * An Owner must explicitly convert one before it becomes TITAN work.
 */
export const googleCalendarExternalEvents = pgTable(
  'google_calendar_external_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => googleCalendarCalendars.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    googleEventId: text('google_event_id').notNull(),
    googleEtag: text('google_etag'),
    eventKind: googleCalendarExternalEventKindEnum('event_kind')
      .notNull()
      .default('external_event'),
    /** Null when the calendar's privacy mode reduces the event to Busy. */
    title: text('title'),
    description: text('description'),
    location: text('location'),
    organizerEmail: text('organizer_email'),
    /** Google `transparency`: opaque = busy, transparent = free. */
    showsAsBusy: boolean('shows_as_busy').notNull().default(true),
    /** Google `visibility` private/confidential, or a busy_only calendar. */
    isPrivate: boolean('is_private').notNull().default(false),
    /** Google event status: confirmed | tentative | cancelled. */
    googleStatus: text('google_status'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    isAllDay: boolean('is_all_day').notNull().default(false),
    recurringEventId: text('recurring_event_id'),
    meetLink: text('meet_link'),
    htmlLink: text('html_link'),
    googleUpdatedAt: timestamp('google_updated_at', { withTimezone: true }),
    convertedTarget: googleCalendarConversionTargetEnum('converted_target'),
    convertedEntityId: uuid('converted_entity_id'),
    convertedByUserId: uuid('converted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedByUserId: uuid('dismissed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEventUnique: unique('google_calendar_external_events_event_unique').on(
      table.companyId,
      table.googleCalendarId,
      table.googleEventId,
    ),
    companyWindowIdx: index('google_calendar_external_events_window_idx').on(
      table.companyId,
      table.startAt,
    ),
  }),
);

/** Sync history. Also holds the processing lease so runs never overlap. */
export const googleCalendarSyncRuns = pgTable(
  'google_calendar_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => googleCalendarConnections.id, {
      onDelete: 'cascade',
    }),
    trigger: googleCalendarSyncTriggerEnum('trigger').notNull().default('manual'),
    status: googleCalendarSyncRunStatusEnum('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    eventsImported: integer('events_imported').notNull().default(0),
    eventsUpdated: integer('events_updated').notNull().default(0),
    jobsPushed: integer('jobs_pushed').notNull().default(0),
    jobsUpdated: integer('jobs_updated').notNull().default(0),
    jobsDeleted: integer('jobs_deleted').notNull().default(0),
    conflictsDetected: integer('conflicts_detected').notNull().default(0),
    calendarsProcessed: integer('calendars_processed').notNull().default(0),
    /** Set when Google asked us to back off, so the UI can explain the delay. */
    rateLimitedUntil: timestamp('rate_limited_until', { withTimezone: true }),
    message: text('message').notNull().default(''),
    /** Per-calendar page tokens so an interrupted run can resume. */
    checkpoint: jsonb('checkpoint').$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index('google_calendar_sync_runs_company_created_idx').on(
      table.companyId,
      table.createdAt,
    ),
  }),
);

/**
 * Detected conflicts. TITAN records them and asks a human — it never auto-moves
 * a job and never silently overwrites either side.
 */
export const googleCalendarConflicts = pgTable(
  'google_calendar_conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    conflictType: googleCalendarConflictTypeEnum('conflict_type').notNull(),
    status: googleCalendarConflictStatusEnum('status').notNull().default('open'),
    severity: text('severity').notNull().default('warn'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    externalEventId: uuid('external_event_id').references(
      () => googleCalendarExternalEvents.id,
      { onDelete: 'cascade' },
    ),
    jobEventLinkId: uuid('job_event_link_id').references(() => googleCalendarJobEventLinks.id, {
      onDelete: 'cascade',
    }),
    /** Stable key so re-detecting the same clash updates instead of duplicating. */
    fingerprint: text('fingerprint').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    message: text('message').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    syncRunId: uuid('sync_run_id').references(() => googleCalendarSyncRuns.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFingerprintUnique: unique('google_calendar_conflicts_fingerprint_unique').on(
      table.companyId,
      table.fingerprint,
    ),
    companyStatusIdx: index('google_calendar_conflicts_company_status_idx').on(
      table.companyId,
      table.status,
    ),
  }),
);

export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type NewGoogleCalendarConnection = typeof googleCalendarConnections.$inferInsert;
export type GoogleCalendarCalendar = typeof googleCalendarCalendars.$inferSelect;
export type NewGoogleCalendarCalendar = typeof googleCalendarCalendars.$inferInsert;
export type GoogleCalendarUserMapping = typeof googleCalendarUserMappings.$inferSelect;
export type GoogleCalendarJobEventLink = typeof googleCalendarJobEventLinks.$inferSelect;
export type GoogleCalendarExternalEvent = typeof googleCalendarExternalEvents.$inferSelect;
export type GoogleCalendarSyncRun = typeof googleCalendarSyncRuns.$inferSelect;
export type GoogleCalendarConflict = typeof googleCalendarConflicts.$inferSelect;
