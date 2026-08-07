import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  buildGoogleEventPayload,
  canPushToCalendar,
  decideGoogleEventPush,
  describeGoogleCalendarConnection,
  detectGoogleCalendarConflicts,
  hashGoogleEventPayload,
  mergeGoogleCalendarEntries,
  resolveGoogleCalendarCapabilities,
  type GoogleCalendarAccessRole,
  type GoogleCalendarCalendarSummary,
  type GoogleCalendarConflictSummary,
  type GoogleCalendarConnectionState,
  type GoogleCalendarConnectionStatus,
  type GoogleCalendarConvertEventRequest,
  type GoogleCalendarExternalEventSummary,
  type GoogleCalendarPrivacyMode,
  type GoogleCalendarPushableJob,
  type GoogleCalendarSettingsResponse,
  type GoogleCalendarSyncRunSummary,
  type GoogleCalendarTechnicianMapping,
  type GoogleCalendarUnifiedCalendarResponse,
  type GoogleCalendarUpdateCalendarRequest,
  type GoogleCalendarUpdateConnectionRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  googleCalendarCalendars,
  googleCalendarConflicts,
  googleCalendarConnections,
  googleCalendarExternalEvents,
  googleCalendarJobEventLinks,
  googleCalendarSyncRuns,
  googleCalendarUserMappings,
  jobs,
  securityAuditLogs,
  users,
} from '@titan/db';
import {
  extractGoogleMeetLink,
  parseGoogleEventWindow,
  GoogleCalendarClientError,
  type GoogleCalendarClient,
  type GoogleCalendarEvent,
} from '../lib/google-calendar.client.js';
import {
  GoogleCalendarOAuthError,
  type GoogleCalendarOAuthService,
} from './google-calendar-oauth.service.js';
import type { SchedulingService } from './scheduling.service.js';
import type { SchedulingAuthContext } from './scheduling-access.js';
import { resolveCalendarViewScope } from './scheduling-access.js';

/** How far back/forward an initial (non-incremental) import reaches. */
const INITIAL_IMPORT_PAST_DAYS = 30;
const INITIAL_IMPORT_FUTURE_DAYS = 180;
/** How far ahead TITAN jobs are mirrored into Google on each sync. */
const PUSH_WINDOW_FUTURE_DAYS = 120;
const PUSH_WINDOW_PAST_DAYS = 7;
const SYNC_LEASE_MS = 5 * 60 * 1000;
const MAX_EVENT_PAGES_PER_CALENDAR = 20;

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}

export type GoogleCalendarActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type SyncOutcome = {
  runId: string;
  status: 'succeeded' | 'partial' | 'failed' | 'skipped';
  message: string;
  eventsImported: number;
  eventsUpdated: number;
  jobsPushed: number;
  jobsUpdated: number;
  jobsDeleted: number;
  conflictsDetected: number;
  calendarsProcessed: number;
};

/**
 * Google Calendar live scheduling.
 *
 * TITAN owns the schedule. This service mirrors TITAN jobs outward, pulls Google
 * events inward as *external* events only, and records conflicts for a human. It
 * never moves a job, never converts a Google event on its own, and never writes
 * customer-facing messages.
 */
export class GoogleCalendarService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly schedulingService: SchedulingService,
  ) {}

  // ---------------------------------------------------------------- settings

  async getConnectionStatus(companyId: string): Promise<GoogleCalendarConnectionStatus> {
    const [row, resolved] = await Promise.all([
      this.oauth.getConnectionRow(companyId),
      this.oauth.resolveState(companyId),
    ]);

    const [selectedCount, openConflicts] = await Promise.all([
      this.countSelectedCalendars(companyId),
      this.countOpenConflicts(companyId),
    ]);

    return {
      oauthConfigured: this.oauth.isAppConfigured(),
      connected: resolved.connected,
      state: resolved.state,
      googleAccountEmail: resolved.googleAccountEmail,
      grantedScopes: resolved.grantedScopes,
      requiredScopes: this.oauth.getScopes(),
      missingScopes: resolved.missingScopes,
      redirectUri: this.oauth.getRedirectUri(),
      autoSyncEnabled: row?.autoSyncEnabled ?? false,
      pushJobsEnabled: row?.pushJobsEnabled ?? false,
      importEventsEnabled: row?.importEventsEnabled ?? true,
      defaultPrivacyMode: (row?.defaultPrivacyMode ?? 'limited_details') as GoogleCalendarPrivacyMode,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastSyncStatus: row?.lastSyncStatus ?? null,
      lastError: row?.lastError ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      selectedCalendarCount: selectedCount,
      openConflictCount: openConflicts,
      statusMessage: describeGoogleCalendarConnection({
        oauthConfigured: this.oauth.isAppConfigured(),
        state: resolved.state,
        googleAccountEmail: resolved.googleAccountEmail,
        selectedCalendarCount: selectedCount,
        lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastError: row?.lastError ?? null,
        missingScopes: resolved.missingScopes,
      }),
    };
  }

  /**
   * Read-only snapshot for Aura. Every field is derived from stored rows so Aura
   * can cite it; there is no inference and no placeholder. When Google is not
   * connected Aura is told exactly that, so it says "not connected" rather than
   * guessing at a calendar. Event titles are already redacted at import time for
   * free-busy calendars, so nothing private leaks through this surface.
   */
  async buildAuraContext(
    companyId: string,
    permissions: string[] = [],
  ): Promise<{
    connected: boolean;
    state: GoogleCalendarConnectionState;
    statusMessage: string;
    googleAccountEmail: string | null;
    selectedCalendarCount: number;
    autoSyncEnabled: boolean;
    lastSuccessfulSyncAt: string | null;
    lastSyncStatus: string | null;
    openConflictCount: number;
    todayGoogleEntries: Array<{
      title: string;
      startAt: string;
      endAt: string | null;
      isAllDay: boolean;
      calendarSummary: string | null;
      isPrivate: boolean;
    }>;
    pendingExternalEventCount: number;
    capabilities: string[];
    note: string;
  }> {
    const connection = await this.getConnectionStatus(companyId);

    if (!connection.connected) {
      return {
        connected: false,
        state: connection.state,
        statusMessage: connection.statusMessage,
        googleAccountEmail: connection.googleAccountEmail,
        selectedCalendarCount: connection.selectedCalendarCount,
        autoSyncEnabled: connection.autoSyncEnabled,
        lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
        lastSyncStatus: connection.lastSyncStatus,
        openConflictCount: connection.openConflictCount,
        todayGoogleEntries: [],
        pendingExternalEventCount: 0,
        capabilities: resolveGoogleCalendarCapabilities(permissions),
        note: 'Google Calendar is not connected. The TITAN schedule is the only source of truth right now — do not imply Google events exist.',
      };
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [external, pendingCount] = await Promise.all([
      this.listExternalEvents(companyId, { from: dayStart, to: dayEnd, limit: 25 }),
      this.countPendingExternalEvents(companyId),
    ]);

    return {
      connected: true,
      state: connection.state,
      statusMessage: connection.statusMessage,
      googleAccountEmail: connection.googleAccountEmail,
      selectedCalendarCount: connection.selectedCalendarCount,
      autoSyncEnabled: connection.autoSyncEnabled,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
      openConflictCount: connection.openConflictCount,
      todayGoogleEntries: external
        .filter((event): event is typeof event & { startAt: string } => Boolean(event.startAt))
        .map((event) => ({
          // A null title means privacy reduced the event to a busy block.
          title: event.title ?? 'Busy',
          startAt: event.startAt,
          endAt: event.endAt,
          isAllDay: event.isAllDay,
          calendarSummary: event.calendarSummary,
          isPrivate: event.isPrivate,
        })),
      pendingExternalEventCount: pendingCount,
      capabilities: resolveGoogleCalendarCapabilities(permissions),
      note: 'Google entries are external context only. TITAN jobs remain the scheduling authority. Never state that a job was moved, created, or cancelled from a Google event without explicit Owner confirmation.',
    };
  }

  async getSettings(companyId: string): Promise<GoogleCalendarSettingsResponse> {
    const [connection, calendars, recentSyncRuns, technicianMappings] = await Promise.all([
      this.getConnectionStatus(companyId),
      this.listCalendars(companyId),
      this.listSyncRuns(companyId, 10),
      this.listTechnicianMappings(companyId),
    ]);

    return { connection, calendars, recentSyncRuns, technicianMappings };
  }

  async listCalendars(companyId: string): Promise<GoogleCalendarCalendarSummary[]> {
    const rows = await this.db
      .select()
      .from(googleCalendarCalendars)
      .where(eq(googleCalendarCalendars.companyId, companyId))
      .orderBy(desc(googleCalendarCalendars.isPrimary), asc(googleCalendarCalendars.summary));

    return rows.map((row) => ({
      id: row.id,
      googleCalendarId: row.googleCalendarId,
      summary: row.summary,
      description: row.description,
      timeZone: row.timeZone,
      accessRole: (row.accessRole ?? null) as GoogleCalendarAccessRole | null,
      isPrimary: row.isPrimary,
      selected: row.selected,
      syncDirection: row.syncDirection,
      privacyMode: row.privacyMode,
      canPush: canPushToCalendar(row.accessRole),
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastError: row.lastError,
    }));
  }

  async listSyncRuns(companyId: string, limit = 20): Promise<GoogleCalendarSyncRunSummary[]> {
    const rows = await this.db
      .select()
      .from(googleCalendarSyncRuns)
      .where(eq(googleCalendarSyncRuns.companyId, companyId))
      .orderBy(desc(googleCalendarSyncRuns.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      eventsImported: row.eventsImported,
      eventsUpdated: row.eventsUpdated,
      jobsPushed: row.jobsPushed,
      jobsUpdated: row.jobsUpdated,
      jobsDeleted: row.jobsDeleted,
      conflictsDetected: row.conflictsDetected,
      calendarsProcessed: row.calendarsProcessed,
      message: row.message,
      requestedByUserId: row.requestedByUserId,
    }));
  }

  async listTechnicianMappings(companyId: string): Promise<GoogleCalendarTechnicianMapping[]> {
    const rows = await this.db
      .select({
        id: googleCalendarUserMappings.id,
        userId: googleCalendarUserMappings.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        calendarId: googleCalendarCalendars.id,
        calendarSummary: googleCalendarCalendars.summary,
        pushAssignedJobs: googleCalendarUserMappings.pushAssignedJobs,
      })
      .from(googleCalendarUserMappings)
      .innerJoin(users, eq(users.id, googleCalendarUserMappings.userId))
      .innerJoin(
        googleCalendarCalendars,
        eq(googleCalendarCalendars.id, googleCalendarUserMappings.calendarId),
      )
      .where(eq(googleCalendarUserMappings.companyId, companyId));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || 'Unnamed user',
      calendarId: row.calendarId,
      calendarSummary: row.calendarSummary,
      pushAssignedJobs: row.pushAssignedJobs,
    }));
  }

  /** Pull the calendar list from Google. Newly seen calendars start unselected. */
  async refreshCalendarList(actor: GoogleCalendarActor): Promise<GoogleCalendarCalendarSummary[]> {
    const connection = await this.requireConnection(actor.companyId);
    const client = await this.oauth.createClient(actor.companyId);

    let entries;
    try {
      entries = await client.listCalendars();
    } catch (error) {
      await this.handleGoogleFailure(actor.companyId, error);
      throw error;
    }

    const now = new Date();
    const seen: string[] = [];

    for (const entry of entries) {
      if (!entry.id || entry.deleted) continue;
      seen.push(entry.id);

      const summary = entry.summaryOverride?.trim() || entry.summary?.trim() || entry.id;

      await this.db
        .insert(googleCalendarCalendars)
        .values({
          companyId: actor.companyId,
          connectionId: connection.id,
          googleCalendarId: entry.id,
          summary,
          description: entry.description ?? null,
          timeZone: entry.timeZone ?? null,
          accessRole: entry.accessRole ?? null,
          isPrimary: entry.primary === true,
          selected: false,
          syncDirection: 'disabled',
          privacyMode: connection.defaultPrivacyMode,
        })
        .onConflictDoUpdate({
          target: [googleCalendarCalendars.companyId, googleCalendarCalendars.googleCalendarId],
          set: {
            connectionId: connection.id,
            summary,
            description: entry.description ?? null,
            timeZone: entry.timeZone ?? null,
            accessRole: entry.accessRole ?? null,
            isPrimary: entry.primary === true,
            updatedAt: now,
          },
        });
    }

    await this.writeAudit(actor, 'google_calendar_calendars_refreshed', {
      calendarCount: seen.length,
    });

    return this.listCalendars(actor.companyId);
  }

  async updateConnectionSettings(
    actor: GoogleCalendarActor,
    input: GoogleCalendarUpdateConnectionRequest,
  ): Promise<GoogleCalendarConnectionStatus> {
    const connection = await this.requireConnection(actor.companyId);

    await this.db
      .update(googleCalendarConnections)
      .set({
        ...(input.autoSyncEnabled === undefined ? {} : { autoSyncEnabled: input.autoSyncEnabled }),
        ...(input.pushJobsEnabled === undefined ? {} : { pushJobsEnabled: input.pushJobsEnabled }),
        ...(input.importEventsEnabled === undefined
          ? {}
          : { importEventsEnabled: input.importEventsEnabled }),
        ...(input.defaultPrivacyMode === undefined
          ? {}
          : { defaultPrivacyMode: input.defaultPrivacyMode }),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, connection.id));

    await this.writeAudit(actor, 'google_calendar_connection_settings_updated', { ...input });

    return this.getConnectionStatus(actor.companyId);
  }

  async updateCalendar(
    actor: GoogleCalendarActor,
    calendarId: string,
    input: GoogleCalendarUpdateCalendarRequest,
  ): Promise<GoogleCalendarCalendarSummary> {
    const [existing] = await this.db
      .select()
      .from(googleCalendarCalendars)
      .where(
        and(
          eq(googleCalendarCalendars.id, calendarId),
          eq(googleCalendarCalendars.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new GoogleCalendarError('NOT_FOUND', 'Calendar not found for this company');
    }

    // Google decides whether we may write; refuse a push direction it did not grant.
    const wantsPush =
      input.syncDirection === 'push_only' || input.syncDirection === 'two_way';
    if (wantsPush && !canPushToCalendar(existing.accessRole)) {
      throw new GoogleCalendarError(
        'READ_ONLY_CALENDAR',
        `Google granted "${existing.accessRole ?? 'no'}" access to "${existing.summary}", so TITAN cannot write events to it. Choose Import only.`,
      );
    }

    await this.db
      .update(googleCalendarCalendars)
      .set({
        ...(input.selected === undefined ? {} : { selected: input.selected }),
        ...(input.syncDirection === undefined ? {} : { syncDirection: input.syncDirection }),
        ...(input.privacyMode === undefined ? {} : { privacyMode: input.privacyMode }),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarCalendars.id, calendarId));

    await this.writeAudit(actor, 'google_calendar_calendar_updated', {
      calendarId,
      googleCalendarId: existing.googleCalendarId,
      ...input,
    });

    const calendars = await this.listCalendars(actor.companyId);
    const updated = calendars.find((calendar) => calendar.id === calendarId);
    if (!updated) {
      throw new GoogleCalendarError('NOT_FOUND', 'Calendar not found after update');
    }
    return updated;
  }

  async setTechnicianMapping(
    actor: GoogleCalendarActor,
    input: { userId: string; calendarId: string; pushAssignedJobs?: boolean },
  ): Promise<GoogleCalendarTechnicianMapping[]> {
    const [calendar] = await this.db
      .select()
      .from(googleCalendarCalendars)
      .where(
        and(
          eq(googleCalendarCalendars.id, input.calendarId),
          eq(googleCalendarCalendars.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!calendar) {
      throw new GoogleCalendarError('NOT_FOUND', 'Calendar not found for this company');
    }

    const [member] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.companyId, actor.companyId)))
      .limit(1);

    if (!member) {
      throw new GoogleCalendarError('NOT_FOUND', 'User not found in this company');
    }

    await this.db
      .insert(googleCalendarUserMappings)
      .values({
        companyId: actor.companyId,
        userId: input.userId,
        calendarId: input.calendarId,
        pushAssignedJobs: input.pushAssignedJobs ?? true,
        createdByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: [googleCalendarUserMappings.companyId, googleCalendarUserMappings.userId],
        set: {
          calendarId: input.calendarId,
          pushAssignedJobs: input.pushAssignedJobs ?? true,
          updatedAt: new Date(),
        },
      });

    await this.writeAudit(actor, 'google_calendar_technician_mapping_set', { ...input });

    return this.listTechnicianMappings(actor.companyId);
  }

  async removeTechnicianMapping(
    actor: GoogleCalendarActor,
    mappingId: string,
  ): Promise<GoogleCalendarTechnicianMapping[]> {
    await this.db
      .delete(googleCalendarUserMappings)
      .where(
        and(
          eq(googleCalendarUserMappings.id, mappingId),
          eq(googleCalendarUserMappings.companyId, actor.companyId),
        ),
      );

    await this.writeAudit(actor, 'google_calendar_technician_mapping_removed', { mappingId });

    return this.listTechnicianMappings(actor.companyId);
  }

  // ------------------------------------------------------------ unified view

  /**
   * The dashboard/scheduling calendar. The real TITAN schedule is always present,
   * whether or not Google is connected; Google events are merged only when the
   * tenant connected and selected a calendar that imports.
   */
  async getUnifiedCalendar(
    companyId: string,
    from: Date,
    to: Date,
    identity: SchedulingAuthContext,
  ): Promise<GoogleCalendarUnifiedCalendarResponse> {
    if (from >= to) {
      throw new GoogleCalendarError('VALIDATION_ERROR', 'Calendar range end must be after start');
    }

    const titanCalendar = await this.schedulingService.getCalendar(companyId, from, to, identity);
    const viewScope = resolveCalendarViewScope(identity);
    const status = await this.oauth.resolveState(companyId);

    const importingCalendars = await this.db
      .select({ id: googleCalendarCalendars.id, summary: googleCalendarCalendars.summary })
      .from(googleCalendarCalendars)
      .where(
        and(
          eq(googleCalendarCalendars.companyId, companyId),
          eq(googleCalendarCalendars.selected, true),
          inArray(googleCalendarCalendars.syncDirection, ['import_only', 'two_way']),
        ),
      );

    const googleMerged = status.connected && importingCalendars.length > 0;

    const jobEntries = titanCalendar.events.map((event) => ({
      jobId: event.id,
      jobNumber: event.jobNumber,
      title: event.title,
      scheduledAt: event.scheduledAt,
      scheduledEndAt: event.scheduledEndAt,
      assignedUserName: event.assignedUserName,
    }));

    if (!googleMerged) {
      const entries = mergeGoogleCalendarEntries({ jobs: jobEntries, externalEvents: [] });
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        googleConnected: status.connected,
        googleMerged: false,
        viewScope,
        titanJobCount: jobEntries.length,
        googleEventCount: 0,
        openConflictCount: 0,
        entries,
        sourceNote: status.connected
          ? 'Showing the TITAN schedule only. No Google calendar is selected for import yet.'
          : 'Showing the TITAN schedule only. Google Calendar is not connected.',
      };
    }

    // Technicians see their own work; they do not get the company's Google events.
    const externalRows =
      viewScope === 'own'
        ? []
        : await this.loadExternalEventsInWindow(companyId, from, to);

    const conflictRows = await this.db
      .select({
        jobId: googleCalendarConflicts.jobId,
        externalEventId: googleCalendarConflicts.externalEventId,
      })
      .from(googleCalendarConflicts)
      .where(
        and(
          eq(googleCalendarConflicts.companyId, companyId),
          inArray(googleCalendarConflicts.status, ['open', 'acknowledged']),
        ),
      );

    const calendarSummaries = new Map(
      importingCalendars.map((calendar) => [calendar.id, calendar.summary]),
    );

    const entries = mergeGoogleCalendarEntries({
      jobs: jobEntries,
      externalEvents: externalRows.map((row) => ({
        externalEventId: row.id,
        title: row.title,
        calendarSummary: calendarSummaries.get(row.calendarId) ?? null,
        startAt: row.startAt?.toISOString() ?? null,
        endAt: row.endAt?.toISOString() ?? null,
        isAllDay: row.isAllDay,
        isPrivate: row.isPrivate,
        showsAsBusy: row.showsAsBusy,
        meetLink: row.meetLink,
        titanJobId: row.titanJobId,
      })),
      conflictJobIds: conflictRows
        .map((row) => row.jobId)
        .filter((value): value is string => Boolean(value)),
      conflictExternalEventIds: conflictRows
        .map((row) => row.externalEventId)
        .filter((value): value is string => Boolean(value)),
    });

    const googleEventCount = entries.filter(
      (entry) => entry.kind === 'google_event' || entry.kind === 'private_busy',
    ).length;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      googleConnected: true,
      googleMerged: true,
      viewScope,
      titanJobCount: jobEntries.length,
      googleEventCount,
      openConflictCount: entries.filter((entry) => entry.hasConflict).length,
      entries,
      sourceNote:
        viewScope === 'own'
          ? 'Showing your assigned TITAN jobs. Company Google events are not shown at your access level.'
          : `Merged the TITAN schedule with ${importingCalendars.length} imported Google calendar${importingCalendars.length === 1 ? '' : 's'}.`,
    };
  }

  async listExternalEvents(
    companyId: string,
    input: { from?: Date; to?: Date; includeConverted?: boolean; limit?: number },
  ): Promise<GoogleCalendarExternalEventSummary[]> {
    const conditions = [eq(googleCalendarExternalEvents.companyId, companyId)];

    if (input.from) conditions.push(gte(googleCalendarExternalEvents.startAt, input.from));
    if (input.to) conditions.push(lt(googleCalendarExternalEvents.startAt, input.to));
    if (!input.includeConverted) {
      conditions.push(isNull(googleCalendarExternalEvents.convertedAt));
      conditions.push(isNull(googleCalendarExternalEvents.dismissedAt));
    }

    const rows = await this.db
      .select({
        event: googleCalendarExternalEvents,
        calendarSummary: googleCalendarCalendars.summary,
      })
      .from(googleCalendarExternalEvents)
      .innerJoin(
        googleCalendarCalendars,
        eq(googleCalendarCalendars.id, googleCalendarExternalEvents.calendarId),
      )
      .where(and(...conditions))
      .orderBy(asc(googleCalendarExternalEvents.startAt))
      .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));

    return rows
      // A TITAN mirror is our own event coming back; it is not an external event.
      .filter((row) => row.event.eventKind !== 'titan_mirror')
      .map((row) => ({
        id: row.event.id,
        googleCalendarId: row.event.googleCalendarId,
        googleEventId: row.event.googleEventId,
        calendarSummary: row.calendarSummary,
        title: row.event.isPrivate ? null : row.event.title,
        location: row.event.isPrivate ? null : row.event.location,
        organizerEmail: row.event.isPrivate ? null : row.event.organizerEmail,
        startAt: row.event.startAt?.toISOString() ?? null,
        endAt: row.event.endAt?.toISOString() ?? null,
        isAllDay: row.event.isAllDay,
        isPrivate: row.event.isPrivate,
        showsAsBusy: row.event.showsAsBusy,
        meetLink: row.event.isPrivate ? null : row.event.meetLink,
        htmlLink: row.event.isPrivate ? null : row.event.htmlLink,
        convertedTarget: row.event.convertedTarget,
        convertedEntityId: row.event.convertedEntityId,
        convertedAt: row.event.convertedAt?.toISOString() ?? null,
        dismissedAt: row.event.dismissedAt?.toISOString() ?? null,
      }));
  }

  /**
   * Turn an imported Google event into TITAN work. Only an explicit human action
   * reaches here — the sync never converts anything.
   */
  async convertExternalEvent(
    actor: GoogleCalendarActor,
    externalEventId: string,
    input: GoogleCalendarConvertEventRequest,
  ): Promise<GoogleCalendarExternalEventSummary> {
    const [existing] = await this.db
      .select()
      .from(googleCalendarExternalEvents)
      .where(
        and(
          eq(googleCalendarExternalEvents.id, externalEventId),
          eq(googleCalendarExternalEvents.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new GoogleCalendarError('NOT_FOUND', 'Google event not found for this company');
    }
    if (existing.convertedAt) {
      throw new GoogleCalendarError(
        'ALREADY_CONVERTED',
        'This Google event was already converted. Open the linked TITAN record instead.',
      );
    }

    let convertedEntityId: string | null = null;

    if (input.target === 'job') {
      convertedEntityId = await this.createJobFromExternalEvent(actor, existing, input);
    }

    const now = new Date();
    await this.db
      .update(googleCalendarExternalEvents)
      .set({
        convertedTarget: input.target,
        convertedEntityId,
        convertedByUserId: actor.userId,
        convertedAt: now,
        updatedAt: now,
      })
      .where(eq(googleCalendarExternalEvents.id, externalEventId));

    await this.writeAudit(actor, 'google_calendar_external_event_converted', {
      externalEventId,
      googleEventId: existing.googleEventId,
      target: input.target,
      convertedEntityId,
    });

    const [summary] = await this.listExternalEvents(actor.companyId, { includeConverted: true }).then(
      (events) => events.filter((event) => event.id === externalEventId),
    );

    if (!summary) {
      throw new GoogleCalendarError('NOT_FOUND', 'Converted event could not be reloaded');
    }
    return summary;
  }

  async dismissExternalEvent(
    actor: GoogleCalendarActor,
    externalEventId: string,
  ): Promise<void> {
    const result = await this.db
      .update(googleCalendarExternalEvents)
      .set({ dismissedAt: new Date(), dismissedByUserId: actor.userId, updatedAt: new Date() })
      .where(
        and(
          eq(googleCalendarExternalEvents.id, externalEventId),
          eq(googleCalendarExternalEvents.companyId, actor.companyId),
        ),
      )
      .returning({ id: googleCalendarExternalEvents.id });

    if (result.length === 0) {
      throw new GoogleCalendarError('NOT_FOUND', 'Google event not found for this company');
    }

    await this.writeAudit(actor, 'google_calendar_external_event_dismissed', { externalEventId });
  }

  // ------------------------------------------------------------- conflicts

  async listConflicts(
    companyId: string,
    input: { includeResolved?: boolean; limit?: number } = {},
  ): Promise<GoogleCalendarConflictSummary[]> {
    const conditions = [eq(googleCalendarConflicts.companyId, companyId)];
    if (!input.includeResolved) {
      conditions.push(inArray(googleCalendarConflicts.status, ['open', 'acknowledged']));
    }

    const rows = await this.db
      .select({
        conflict: googleCalendarConflicts,
        jobTitle: jobs.title,
        jobNumber: jobs.jobNumber,
        eventTitle: googleCalendarExternalEvents.title,
        eventIsPrivate: googleCalendarExternalEvents.isPrivate,
      })
      .from(googleCalendarConflicts)
      .leftJoin(jobs, eq(jobs.id, googleCalendarConflicts.jobId))
      .leftJoin(
        googleCalendarExternalEvents,
        eq(googleCalendarExternalEvents.id, googleCalendarConflicts.externalEventId),
      )
      .where(and(...conditions))
      .orderBy(desc(googleCalendarConflicts.lastSeenAt))
      .limit(Math.min(Math.max(input.limit ?? 100, 1), 300));

    return rows.map((row) => ({
      id: row.conflict.id,
      conflictType: row.conflict.conflictType,
      status: row.conflict.status,
      severity: (row.conflict.severity as 'block' | 'warn' | 'info') ?? 'warn',
      message: row.conflict.message,
      windowStart: row.conflict.windowStart?.toISOString() ?? null,
      windowEnd: row.conflict.windowEnd?.toISOString() ?? null,
      jobId: row.conflict.jobId,
      jobTitle: row.jobTitle ?? null,
      jobNumber: row.jobNumber ?? null,
      externalEventId: row.conflict.externalEventId,
      externalEventTitle: row.eventIsPrivate ? null : (row.eventTitle ?? null),
      detectedAt: row.conflict.detectedAt.toISOString(),
      lastSeenAt: row.conflict.lastSeenAt.toISOString(),
      resolutionNote: row.conflict.resolutionNote,
      resolvedAt: row.conflict.resolvedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Record a human decision on a conflict. This only changes the conflict record:
   * rescheduling still happens through the TITAN scheduling engine.
   */
  async resolveConflict(
    actor: GoogleCalendarActor,
    conflictId: string,
    input: { status: 'acknowledged' | 'resolved' | 'dismissed'; note?: string | null },
  ): Promise<GoogleCalendarConflictSummary> {
    const [existing] = await this.db
      .select()
      .from(googleCalendarConflicts)
      .where(
        and(
          eq(googleCalendarConflicts.id, conflictId),
          eq(googleCalendarConflicts.companyId, actor.companyId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new GoogleCalendarError('NOT_FOUND', 'Conflict not found for this company');
    }

    const now = new Date();
    await this.db
      .update(googleCalendarConflicts)
      .set({
        status: input.status,
        resolutionNote: input.note?.slice(0, 1000) ?? existing.resolutionNote,
        resolvedByUserId: input.status === 'acknowledged' ? existing.resolvedByUserId : actor.userId,
        resolvedAt: input.status === 'acknowledged' ? existing.resolvedAt : now,
        updatedAt: now,
      })
      .where(eq(googleCalendarConflicts.id, conflictId));

    // Let a held-back job resume syncing once a human cleared the conflict.
    if (input.status !== 'acknowledged' && existing.jobEventLinkId) {
      await this.db
        .update(googleCalendarJobEventLinks)
        .set({ syncState: 'pending', lastError: null, updatedAt: now })
        .where(eq(googleCalendarJobEventLinks.id, existing.jobEventLinkId));
    }

    await this.writeAudit(actor, 'google_calendar_conflict_resolved', {
      conflictId,
      status: input.status,
      conflictType: existing.conflictType,
    });

    const [summary] = await this.listConflicts(actor.companyId, { includeResolved: true }).then(
      (conflicts) => conflicts.filter((conflict) => conflict.id === conflictId),
    );

    if (!summary) {
      throw new GoogleCalendarError('NOT_FOUND', 'Conflict could not be reloaded');
    }
    return summary;
  }

  // ------------------------------------------------------------------- sync

  /**
   * Run one sync. Takes a DB lease first so a manual Sync Now and the background
   * scheduler can never overlap for the same tenant.
   */
  async sync(input: {
    companyId: string;
    userId: string | null;
    trigger: 'manual' | 'scheduled' | 'oauth_connect' | 'job_change';
  }): Promise<SyncOutcome> {
    const status = await this.oauth.resolveState(input.companyId);

    if (!status.connected) {
      return this.recordSkippedRun(input, `Google Calendar is not connected (${status.state}).`);
    }

    const connection = await this.requireConnection(input.companyId);
    const lease = await this.acquireLease(input, connection.id);
    if (!lease) {
      return this.recordSkippedRun(input, 'Another Google Calendar sync is already running.');
    }

    const counters = {
      eventsImported: 0,
      eventsUpdated: 0,
      jobsPushed: 0,
      jobsUpdated: 0,
      jobsDeleted: 0,
      conflictsDetected: 0,
      calendarsProcessed: 0,
    };
    const problems: string[] = [];
    let rateLimitedUntil: Date | null = null;

    try {
      const client = await this.oauth.createClient(input.companyId);

      const calendars = await this.db
        .select()
        .from(googleCalendarCalendars)
        .where(
          and(
            eq(googleCalendarCalendars.companyId, input.companyId),
            eq(googleCalendarCalendars.selected, true),
          ),
        );

      if (calendars.length === 0) {
        await this.finishRun(lease.runId, input.companyId, 'skipped', {
          ...counters,
          message: 'No Google calendar is selected. Select a calendar in Settings to sync.',
          rateLimitedUntil: null,
        });
        return {
          runId: lease.runId,
          status: 'skipped',
          message: 'No Google calendar is selected. Select a calendar in Settings to sync.',
          ...counters,
        };
      }

      for (const calendar of calendars) {
        try {
          if (
            connection.importEventsEnabled &&
            (calendar.syncDirection === 'import_only' || calendar.syncDirection === 'two_way')
          ) {
            const imported = await this.importCalendarEvents(client, input.companyId, calendar);
            counters.eventsImported += imported.created;
            counters.eventsUpdated += imported.updated;
          }

          if (
            connection.pushJobsEnabled &&
            (calendar.syncDirection === 'push_only' || calendar.syncDirection === 'two_way') &&
            canPushToCalendar(calendar.accessRole)
          ) {
            const pushed = await this.pushJobsToCalendar(
              client,
              input.companyId,
              calendar,
              lease.runId,
            );
            counters.jobsPushed += pushed.created;
            counters.jobsUpdated += pushed.updated;
            counters.jobsDeleted += pushed.deleted;
            counters.conflictsDetected += pushed.held;
          }

          counters.calendarsProcessed += 1;
          await this.db
            .update(googleCalendarCalendars)
            .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
            .where(eq(googleCalendarCalendars.id, calendar.id));
        } catch (error) {
          const message = describeError(error);
          problems.push(`${calendar.summary}: ${message}`);

          if (error instanceof GoogleCalendarClientError && error.code === 'RATE_LIMITED') {
            const waitSeconds = error.retryAfterSeconds ?? 60;
            rateLimitedUntil = new Date(Date.now() + waitSeconds * 1000);
          }

          await this.db
            .update(googleCalendarCalendars)
            .set({ lastError: message.slice(0, 1000), updatedAt: new Date() })
            .where(eq(googleCalendarCalendars.id, calendar.id));

          if (isFatalGoogleError(error)) throw error;
        }
      }

      const detected = await this.detectAndRecordConflicts(input.companyId, lease.runId);
      counters.conflictsDetected += detected;

      const status: 'succeeded' | 'partial' = problems.length === 0 ? 'succeeded' : 'partial';
      const message =
        problems.length === 0
          ? buildSyncMessage(counters)
          : `${buildSyncMessage(counters)} Problems: ${problems.slice(0, 5).join('; ')}`;

      await this.finishRun(lease.runId, input.companyId, status, {
        ...counters,
        message,
        rateLimitedUntil,
      });

      return { runId: lease.runId, status, message, ...counters };
    } catch (error) {
      const message = describeError(error);
      await this.handleGoogleFailure(input.companyId, error);
      await this.finishRun(lease.runId, input.companyId, 'failed', {
        ...counters,
        message,
        rateLimitedUntil,
      });
      return { runId: lease.runId, status: 'failed', message, ...counters };
    }
  }

  /**
   * Pull events for one calendar, preferring Google's incremental syncToken and
   * falling back to a bounded window when Google expires it.
   */
  private async importCalendarEvents(
    client: GoogleCalendarClient,
    companyId: string,
    calendar: typeof googleCalendarCalendars.$inferSelect,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    let syncToken = calendar.syncToken;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let pages = 0;

    while (pages < MAX_EVENT_PAGES_PER_CALENDAR) {
      pages += 1;

      let page;
      try {
        page = await client.listEvents({
          calendarId: calendar.googleCalendarId,
          syncToken,
          pageToken,
          ...(syncToken ? {} : buildInitialWindow()),
        });
      } catch (error) {
        if (
          error instanceof GoogleCalendarClientError &&
          error.code === 'SYNC_TOKEN_EXPIRED' &&
          syncToken
        ) {
          // Google dropped our checkpoint; restart this calendar from a full window.
          await this.db
            .update(googleCalendarCalendars)
            .set({ syncToken: null, updatedAt: new Date() })
            .where(eq(googleCalendarCalendars.id, calendar.id));
          syncToken = null;
          pageToken = undefined;
          continue;
        }
        throw error;
      }

      for (const event of page.events) {
        const outcome = await this.upsertExternalEvent(companyId, calendar, event);
        if (outcome === 'created') created += 1;
        if (outcome === 'updated') updated += 1;
      }

      if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }

    if (nextSyncToken) {
      await this.db
        .update(googleCalendarCalendars)
        .set({ syncToken: nextSyncToken, updatedAt: new Date() })
        .where(eq(googleCalendarCalendars.id, calendar.id));
    }

    return { created, updated };
  }

  /** Idempotent upsert keyed on (company, calendar, googleEventId). */
  private async upsertExternalEvent(
    companyId: string,
    calendar: typeof googleCalendarCalendars.$inferSelect,
    event: GoogleCalendarEvent,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!event.id) return 'skipped';

    const titanJobId = event.extendedProperties?.private?.titanJobId ?? null;
    const isOurMirror =
      Boolean(titanJobId) &&
      event.extendedProperties?.private?.titanCompanyId === companyId;

    const window = parseGoogleEventWindow(event);

    // Google removed the event: drop our copy so the calendar stays truthful.
    if (event.status === 'cancelled') {
      const removed = await this.db
        .delete(googleCalendarExternalEvents)
        .where(
          and(
            eq(googleCalendarExternalEvents.companyId, companyId),
            eq(googleCalendarExternalEvents.googleCalendarId, calendar.googleCalendarId),
            eq(googleCalendarExternalEvents.googleEventId, event.id),
          ),
        )
        .returning({ id: googleCalendarExternalEvents.id });

      if (isOurMirror && titanJobId) {
        await this.flagRemoteDeletion(companyId, titanJobId, calendar);
      }
      return removed.length > 0 ? 'updated' : 'skipped';
    }

    const privacyForced = calendar.privacyMode === 'busy_only';
    const googleMarkedPrivate =
      event.visibility === 'private' || event.visibility === 'confidential';
    const isPrivate = privacyForced || googleMarkedPrivate;

    const values = {
      companyId,
      calendarId: calendar.id,
      googleCalendarId: calendar.googleCalendarId,
      googleEventId: event.id,
      googleEtag: event.etag ?? null,
      eventKind: isOurMirror
        ? ('titan_mirror' as const)
        : isPrivate
          ? ('private_busy' as const)
          : ('external_event' as const),
      // A private event contributes only its busy window, never its content.
      title: isPrivate ? null : (event.summary?.trim() ?? null),
      description: isPrivate ? null : (event.description?.slice(0, 4000) ?? null),
      location: isPrivate ? null : (event.location?.trim() ?? null),
      organizerEmail: isPrivate ? null : (event.organizer?.email?.trim() ?? null),
      showsAsBusy: event.transparency !== 'transparent',
      isPrivate,
      googleStatus: event.status ?? null,
      startAt: window.startAt,
      endAt: window.endAt,
      isAllDay: window.isAllDay,
      recurringEventId: event.recurringEventId ?? null,
      meetLink: isPrivate ? null : extractGoogleMeetLink(event),
      htmlLink: isPrivate ? null : (event.htmlLink ?? null),
      googleUpdatedAt: event.updated ? new Date(event.updated) : null,
      updatedAt: new Date(),
    };

    const result = await this.db
      .insert(googleCalendarExternalEvents)
      .values(values)
      .onConflictDoUpdate({
        target: [
          googleCalendarExternalEvents.companyId,
          googleCalendarExternalEvents.googleCalendarId,
          googleCalendarExternalEvents.googleEventId,
        ],
        set: {
          googleEtag: values.googleEtag,
          eventKind: values.eventKind,
          title: values.title,
          description: values.description,
          location: values.location,
          organizerEmail: values.organizerEmail,
          showsAsBusy: values.showsAsBusy,
          isPrivate: values.isPrivate,
          googleStatus: values.googleStatus,
          startAt: values.startAt,
          endAt: values.endAt,
          isAllDay: values.isAllDay,
          meetLink: values.meetLink,
          htmlLink: values.htmlLink,
          googleUpdatedAt: values.googleUpdatedAt,
          updatedAt: values.updatedAt,
        },
      })
      .returning({
        id: googleCalendarExternalEvents.id,
        firstSeenAt: googleCalendarExternalEvents.firstSeenAt,
        createdAt: googleCalendarExternalEvents.createdAt,
      });

    if (isOurMirror && titanJobId) {
      await this.recordMirrorObservation(companyId, titanJobId, calendar, event);
    }

    const row = result[0];
    if (!row) return 'skipped';
    return row.createdAt.getTime() === row.firstSeenAt.getTime() &&
      Date.now() - row.createdAt.getTime() < 5000
      ? 'created'
      : 'updated';
  }

  /** Track Google's `updated` on our own mirror so concurrent edits are detectable. */
  private async recordMirrorObservation(
    companyId: string,
    jobId: string,
    calendar: typeof googleCalendarCalendars.$inferSelect,
    event: GoogleCalendarEvent,
  ): Promise<void> {
    await this.db
      .update(googleCalendarJobEventLinks)
      .set({
        googleUpdatedAt: event.updated ? new Date(event.updated) : null,
        googleEtag: event.etag ?? null,
        googleSequence: event.sequence ?? null,
        lastPulledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(googleCalendarJobEventLinks.companyId, companyId),
          eq(googleCalendarJobEventLinks.jobId, jobId),
          eq(googleCalendarJobEventLinks.googleCalendarId, calendar.googleCalendarId),
        ),
      );
  }

  /** Somebody deleted TITAN's mirror in Google. Never delete the job — ask a human. */
  private async flagRemoteDeletion(
    companyId: string,
    jobId: string,
    calendar: typeof googleCalendarCalendars.$inferSelect,
  ): Promise<void> {
    const [link] = await this.db
      .select()
      .from(googleCalendarJobEventLinks)
      .where(
        and(
          eq(googleCalendarJobEventLinks.companyId, companyId),
          eq(googleCalendarJobEventLinks.jobId, jobId),
          eq(googleCalendarJobEventLinks.googleCalendarId, calendar.googleCalendarId),
        ),
      )
      .limit(1);

    if (!link) return;

    await this.db
      .update(googleCalendarJobEventLinks)
      .set({ syncState: 'deleted_remotely', updatedAt: new Date() })
      .where(eq(googleCalendarJobEventLinks.id, link.id));

    await this.upsertConflict({
      companyId,
      conflictType: 'remote_event_deleted',
      severity: 'warn',
      fingerprint: `remote_deleted:${link.id}`,
      jobId,
      jobEventLinkId: link.id,
      externalEventId: null,
      windowStart: null,
      windowEnd: null,
      message: `The Google event for this TITAN job was deleted in Google Calendar (${calendar.summary}). The TITAN job is unchanged — review it and re-sync if the booking still stands.`,
      syncRunId: null,
    });
  }

  /** Mirror scheduled TITAN jobs into one calendar, honouring its privacy mode. */
  private async pushJobsToCalendar(
    client: GoogleCalendarClient,
    companyId: string,
    calendar: typeof googleCalendarCalendars.$inferSelect,
    syncRunId: string,
  ): Promise<{ created: number; updated: number; deleted: number; held: number }> {
    const counters = { created: 0, updated: 0, deleted: 0, held: 0 };

    const from = new Date(Date.now() - PUSH_WINDOW_PAST_DAYS * 86_400_000);
    const to = new Date(Date.now() + PUSH_WINDOW_FUTURE_DAYS * 86_400_000);

    // Only technicians mapped to this calendar, when a mapping exists for it.
    const mappings = await this.db
      .select({ userId: googleCalendarUserMappings.userId })
      .from(googleCalendarUserMappings)
      .where(
        and(
          eq(googleCalendarUserMappings.companyId, companyId),
          eq(googleCalendarUserMappings.calendarId, calendar.id),
          eq(googleCalendarUserMappings.pushAssignedJobs, true),
        ),
      );
    const mappedUserIds = mappings.map((mapping) => mapping.userId);

    const jobRows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.scheduledAt, from),
        lt(jobs.scheduledAt, to),
        mappedUserIds.length > 0 ? inArray(jobs.assignedUserId, mappedUserIds) : undefined,
      ),
      with: { customer: true, assignedUser: true },
      orderBy: [asc(jobs.scheduledAt)],
      limit: 500,
    });

    // Cancellations and unscheduled jobs are found through their existing links.
    const linkRows = await this.db
      .select()
      .from(googleCalendarJobEventLinks)
      .where(
        and(
          eq(googleCalendarJobEventLinks.companyId, companyId),
          eq(googleCalendarJobEventLinks.googleCalendarId, calendar.googleCalendarId),
        ),
      );
    const linksByJobId = new Map(linkRows.map((link) => [link.jobId, link]));

    const candidates = new Map<string, (typeof jobRows)[number] | null>();
    for (const job of jobRows) candidates.set(job.id, job);
    for (const link of linkRows) {
      if (!candidates.has(link.jobId)) candidates.set(link.jobId, null);
    }

    for (const [jobId, loadedJob] of candidates) {
      const job = loadedJob ?? (await this.loadJobForPush(companyId, jobId));
      if (!job) continue;

      const link = linksByJobId.get(jobId) ?? null;

      const pushable = toPushableJob(job);
      const payload = pushable.scheduledAt
        ? buildGoogleEventPayload({
            job: pushable as GoogleCalendarPushableJob,
            companyId,
            privacyMode: calendar.privacyMode,
          })
        : null;
      const nextPayloadHash = payload ? hashGoogleEventPayload(payload) : '';

      const decision = decideGoogleEventPush({
        jobStatus: job.status,
        jobScheduledAt: job.scheduledAt?.toISOString() ?? null,
        jobUpdatedAt: job.updatedAt.toISOString(),
        privacyMode: calendar.privacyMode,
        canPush: canPushToCalendar(calendar.accessRole),
        nextPayloadHash,
        link: link
          ? {
              googleEventId: link.googleEventId,
              payloadHash: link.payloadHash,
              lastPushedAt: link.lastPushedAt?.toISOString() ?? null,
              googleUpdatedAt: link.googleUpdatedAt?.toISOString() ?? null,
              titanUpdatedAt: link.titanUpdatedAt?.toISOString() ?? null,
              syncState: link.syncState,
            }
          : null,
      });

      try {
        if (decision.action === 'skip') continue;

        if (decision.action === 'hold_for_review') {
          counters.held += await this.holdLinkForReview(
            companyId,
            job,
            calendar,
            link,
            decision.reason,
            syncRunId,
          );
          continue;
        }

        if (decision.action === 'delete') {
          if (link?.googleEventId) {
            await client.deleteEvent(calendar.googleCalendarId, link.googleEventId);
            await this.db
              .update(googleCalendarJobEventLinks)
              .set({
                syncState: 'cancelled',
                googleEventId: null,
                googleEtag: null,
                payloadHash: null,
                lastPushedAt: new Date(),
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(googleCalendarJobEventLinks.id, link.id));
            counters.deleted += 1;
          }
          continue;
        }

        if (!payload) continue;

        if (decision.action === 'create') {
          const created = await client.createEvent(calendar.googleCalendarId, payload);
          await this.upsertLink({
            companyId,
            jobId,
            calendar,
            googleEvent: created,
            payloadHash: nextPayloadHash,
            titanUpdatedAt: job.updatedAt,
            existingLinkId: link?.id ?? null,
          });
          counters.created += 1;
          continue;
        }

        const patched = await client.patchEvent(
          calendar.googleCalendarId,
          link!.googleEventId!,
          payload,
          link!.googleEtag,
        );
        await this.upsertLink({
          companyId,
          jobId,
          calendar,
          googleEvent: patched,
          payloadHash: nextPayloadHash,
          titanUpdatedAt: job.updatedAt,
          existingLinkId: link!.id,
        });
        counters.updated += 1;
      } catch (error) {
        // A 412 means Google changed underneath us: preserve both sides for review.
        if (
          error instanceof GoogleCalendarClientError &&
          error.code === 'PRECONDITION_FAILED' &&
          link
        ) {
          counters.held += await this.holdLinkForReview(
            companyId,
            job,
            calendar,
            link,
            'The Google event changed while TITAN was updating it.',
            syncRunId,
          );
          continue;
        }

        if (isFatalGoogleError(error)) throw error;

        const message = describeError(error);
        if (link) {
          await this.db
            .update(googleCalendarJobEventLinks)
            .set({
              syncState: 'failed',
              lastError: message.slice(0, 1000),
              failureCount: sql`${googleCalendarJobEventLinks.failureCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(googleCalendarJobEventLinks.id, link.id));
        }
      }
    }

    return counters;
  }

  private async loadJobForPush(companyId: string, jobId: string) {
    return this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
      with: { customer: true, assignedUser: true },
    });
  }

  /** Preserve both versions and raise a conflict rather than overwriting either. */
  private async holdLinkForReview(
    companyId: string,
    job: { id: string; title: string; jobNumber: string | null },
    calendar: typeof googleCalendarCalendars.$inferSelect,
    link: typeof googleCalendarJobEventLinks.$inferSelect | null,
    reason: string,
    syncRunId: string,
  ): Promise<number> {
    if (!link) return 0;

    await this.db
      .update(googleCalendarJobEventLinks)
      .set({ syncState: 'conflict', lastError: reason.slice(0, 1000), updatedAt: new Date() })
      .where(eq(googleCalendarJobEventLinks.id, link.id));

    const label = job.jobNumber ? `${job.jobNumber} (${job.title})` : job.title;

    return this.upsertConflict({
      companyId,
      conflictType: 'concurrent_edit',
      severity: 'warn',
      fingerprint: `concurrent_edit:${link.id}`,
      jobId: job.id,
      jobEventLinkId: link.id,
      externalEventId: null,
      windowStart: null,
      windowEnd: null,
      message: `${reason} TITAN job ${label} and its Google event in "${calendar.summary}" have both been kept as-is. Review and decide which version is correct — TITAN has changed nothing.`,
      syncRunId,
    });
  }

  private async upsertLink(input: {
    companyId: string;
    jobId: string;
    calendar: typeof googleCalendarCalendars.$inferSelect;
    googleEvent: GoogleCalendarEvent;
    payloadHash: string;
    titanUpdatedAt: Date;
    existingLinkId: string | null;
  }): Promise<void> {
    const now = new Date();
    const values = {
      companyId: input.companyId,
      jobId: input.jobId,
      calendarId: input.calendar.id,
      googleCalendarId: input.calendar.googleCalendarId,
      googleEventId: input.googleEvent.id ?? null,
      googleEtag: input.googleEvent.etag ?? null,
      googleSequence: input.googleEvent.sequence ?? null,
      payloadHash: input.payloadHash,
      syncState: 'synced' as const,
      meetLink: extractGoogleMeetLink(input.googleEvent),
      htmlLink: input.googleEvent.htmlLink ?? null,
      lastPushedAt: now,
      googleUpdatedAt: input.googleEvent.updated ? new Date(input.googleEvent.updated) : now,
      titanUpdatedAt: input.titanUpdatedAt,
      lastError: null,
      failureCount: 0,
      updatedAt: now,
    };

    await this.db
      .insert(googleCalendarJobEventLinks)
      .values(values)
      .onConflictDoUpdate({
        target: [
          googleCalendarJobEventLinks.companyId,
          googleCalendarJobEventLinks.jobId,
          googleCalendarJobEventLinks.googleCalendarId,
        ],
        set: values,
      });
  }

  /**
   * Compare the real TITAN schedule against imported busy blocks and record any
   * overlaps. Detection only — jobs are never moved.
   */
  private async detectAndRecordConflicts(companyId: string, syncRunId: string): Promise<number> {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + PUSH_WINDOW_FUTURE_DAYS * 86_400_000);

    const jobRows = await this.db
      .select({
        jobId: jobs.id,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        scheduledAt: jobs.scheduledAt,
        scheduledEndAt: jobs.scheduledEndAt,
        assignedUserId: jobs.assignedUserId,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          gte(jobs.scheduledAt, from),
          lt(jobs.scheduledAt, to),
          inArray(jobs.status, ['new', 'scheduled', 'in_progress']),
        ),
      );

    const eventRows = await this.loadExternalEventsInWindow(companyId, from, to);

    const detected = detectGoogleCalendarConflicts({
      jobs: jobRows
        .filter((row) => row.scheduledAt)
        .map((row) => ({
          jobId: row.jobId,
          jobNumber: row.jobNumber,
          title: row.title,
          scheduledAt: row.scheduledAt!.toISOString(),
          scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
          assignedUserName: null,
        })),
      busyBlocks: eventRows
        .filter((row) => row.startAt && row.endAt)
        .map((row) => ({
          externalEventId: row.id,
          title: row.title,
          startAt: row.startAt!.toISOString(),
          endAt: row.endAt!.toISOString(),
          isPrivate: row.isPrivate,
          showsAsBusy: row.showsAsBusy,
          titanJobId: row.titanJobId,
        })),
    });

    let recorded = 0;
    for (const conflict of detected) {
      recorded += await this.upsertConflict({
        companyId,
        conflictType: conflict.conflictType,
        severity: conflict.severity,
        fingerprint: conflict.fingerprint,
        jobId: conflict.jobId,
        jobEventLinkId: null,
        externalEventId: conflict.externalEventId,
        windowStart: new Date(conflict.windowStart),
        windowEnd: new Date(conflict.windowEnd),
        message: conflict.message,
        syncRunId,
      });
    }

    // Overlaps that no longer exist are closed so the badge stays truthful.
    const liveFingerprints = detected.map((conflict) => conflict.fingerprint);
    await this.db
      .update(googleCalendarConflicts)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(googleCalendarConflicts.companyId, companyId),
          eq(googleCalendarConflicts.status, 'open'),
          eq(googleCalendarConflicts.conflictType, 'job_overlaps_google_event'),
          liveFingerprints.length > 0
            ? sql`${googleCalendarConflicts.fingerprint} NOT IN ${liveFingerprints}`
            : undefined,
        ),
      );

    return recorded;
  }

  /** Returns 1 when a new conflict was created, 0 when an existing one was refreshed. */
  private async upsertConflict(input: {
    companyId: string;
    conflictType:
      | 'job_overlaps_google_event'
      | 'google_event_overlaps_job'
      | 'concurrent_edit'
      | 'remote_event_deleted'
      | 'remote_event_moved';
    severity: 'block' | 'warn' | 'info';
    fingerprint: string;
    jobId: string | null;
    jobEventLinkId: string | null;
    externalEventId: string | null;
    windowStart: Date | null;
    windowEnd: Date | null;
    message: string;
    syncRunId: string | null;
  }): Promise<number> {
    const now = new Date();

    const result = await this.db
      .insert(googleCalendarConflicts)
      .values({
        companyId: input.companyId,
        conflictType: input.conflictType,
        status: 'open',
        severity: input.severity,
        jobId: input.jobId,
        externalEventId: input.externalEventId,
        jobEventLinkId: input.jobEventLinkId,
        fingerprint: input.fingerprint,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        message: input.message,
        syncRunId: input.syncRunId,
      })
      .onConflictDoUpdate({
        target: [googleCalendarConflicts.companyId, googleCalendarConflicts.fingerprint],
        set: {
          message: input.message,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: googleCalendarConflicts.id,
        detectedAt: googleCalendarConflicts.detectedAt,
        lastSeenAt: googleCalendarConflicts.lastSeenAt,
      });

    const row = result[0];
    if (!row) return 0;
    return row.detectedAt.getTime() === row.lastSeenAt.getTime() ? 1 : 0;
  }

  private async loadExternalEventsInWindow(companyId: string, from: Date, to: Date) {
    return this.db
      .select({
        id: googleCalendarExternalEvents.id,
        calendarId: googleCalendarExternalEvents.calendarId,
        title: googleCalendarExternalEvents.title,
        startAt: googleCalendarExternalEvents.startAt,
        endAt: googleCalendarExternalEvents.endAt,
        isAllDay: googleCalendarExternalEvents.isAllDay,
        isPrivate: googleCalendarExternalEvents.isPrivate,
        showsAsBusy: googleCalendarExternalEvents.showsAsBusy,
        meetLink: googleCalendarExternalEvents.meetLink,
        eventKind: googleCalendarExternalEvents.eventKind,
        titanJobId: googleCalendarJobEventLinks.jobId,
      })
      .from(googleCalendarExternalEvents)
      .leftJoin(
        googleCalendarJobEventLinks,
        and(
          eq(googleCalendarJobEventLinks.companyId, googleCalendarExternalEvents.companyId),
          eq(
            googleCalendarJobEventLinks.googleEventId,
            googleCalendarExternalEvents.googleEventId,
          ),
        ),
      )
      .where(
        and(
          eq(googleCalendarExternalEvents.companyId, companyId),
          isNull(googleCalendarExternalEvents.dismissedAt),
          gte(googleCalendarExternalEvents.startAt, from),
          lt(googleCalendarExternalEvents.startAt, to),
          or(
            eq(googleCalendarExternalEvents.googleStatus, 'confirmed'),
            eq(googleCalendarExternalEvents.googleStatus, 'tentative'),
            isNull(googleCalendarExternalEvents.googleStatus),
          ),
        ),
      )
      .orderBy(asc(googleCalendarExternalEvents.startAt));
  }

  private async createJobFromExternalEvent(
    actor: GoogleCalendarActor,
    event: typeof googleCalendarExternalEvents.$inferSelect,
    input: GoogleCalendarConvertEventRequest,
  ): Promise<string> {
    if (!input.customerId) {
      throw new GoogleCalendarError(
        'CUSTOMER_REQUIRED',
        'Converting a Google event into a job needs a TITAN customer — TITAN will not invent one.',
      );
    }
    if (!event.startAt) {
      throw new GoogleCalendarError(
        'VALIDATION_ERROR',
        'This Google event has no start time, so it cannot become a scheduled job.',
      );
    }

    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.companyId, actor.companyId)))
      .limit(1);

    if (!customer) {
      throw new GoogleCalendarError('NOT_FOUND', 'Customer not found in this company');
    }

    const title = input.title?.trim() || event.title?.trim() || 'Booking from Google Calendar';

    // Route through the scheduling engine so conflict rules and audits still apply.
    const [created] = await this.db
      .insert(jobs)
      .values({
        companyId: actor.companyId,
        customerId: input.customerId,
        title,
        description: input.notes?.trim() || null,
        status: 'new',
        notes: `Created from Google Calendar event ${event.googleEventId}.`,
      })
      .returning({ id: jobs.id });

    await this.schedulingService.scheduleJob(
      actor.companyId,
      created.id,
      {
        scheduledAt: event.startAt.toISOString(),
        scheduledEndAt: event.endAt?.toISOString() ?? null,
        assignedUserId: input.assignedUserId ?? null,
        acknowledgeConflicts: true,
        overrideReason: `Converted from Google Calendar event ${event.googleEventId}`,
      },
      {
        userId: actor.userId,
        roleName: actor.roleName,
        permissions: actor.permissions,
      },
    );

    return created.id;
  }

  // ------------------------------------------------------------- lease/runs

  private async acquireLease(
    input: {
      companyId: string;
      userId: string | null;
      trigger: 'manual' | 'scheduled' | 'oauth_connect' | 'job_change';
    },
    connectionId: string,
  ): Promise<{ runId: string; leaseOwner: string } | null> {
    const now = new Date();

    const active = await this.db
      .select({ id: googleCalendarSyncRuns.id })
      .from(googleCalendarSyncRuns)
      .where(
        and(
          eq(googleCalendarSyncRuns.companyId, input.companyId),
          eq(googleCalendarSyncRuns.status, 'running'),
          gte(googleCalendarSyncRuns.leaseExpiresAt, now),
        ),
      )
      .limit(1);

    if (active.length > 0) return null;

    const leaseOwner = `${process.pid}-${randomUUID().slice(0, 8)}`;
    const [run] = await this.db
      .insert(googleCalendarSyncRuns)
      .values({
        companyId: input.companyId,
        connectionId,
        trigger: input.trigger,
        status: 'running',
        startedAt: now,
        requestedByUserId: input.userId,
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + SYNC_LEASE_MS),
        heartbeatAt: now,
      })
      .returning({ id: googleCalendarSyncRuns.id });

    await this.db
      .update(googleCalendarConnections)
      .set({ lastSyncAt: now, lastSyncStatus: 'running', updatedAt: now })
      .where(eq(googleCalendarConnections.id, connectionId));

    return { runId: run.id, leaseOwner };
  }

  private async recordSkippedRun(
    input: { companyId: string; userId: string | null; trigger: 'manual' | 'scheduled' | 'oauth_connect' | 'job_change' },
    message: string,
  ): Promise<SyncOutcome> {
    const connection = await this.oauth.getConnectionRow(input.companyId);
    const now = new Date();

    const [run] = await this.db
      .insert(googleCalendarSyncRuns)
      .values({
        companyId: input.companyId,
        connectionId: connection?.id ?? null,
        trigger: input.trigger,
        status: 'skipped',
        startedAt: now,
        finishedAt: now,
        message,
        requestedByUserId: input.userId,
      })
      .returning({ id: googleCalendarSyncRuns.id });

    return {
      runId: run.id,
      status: 'skipped',
      message,
      eventsImported: 0,
      eventsUpdated: 0,
      jobsPushed: 0,
      jobsUpdated: 0,
      jobsDeleted: 0,
      conflictsDetected: 0,
      calendarsProcessed: 0,
    };
  }

  private async finishRun(
    runId: string,
    companyId: string,
    status: 'succeeded' | 'partial' | 'failed' | 'skipped',
    input: {
      eventsImported: number;
      eventsUpdated: number;
      jobsPushed: number;
      jobsUpdated: number;
      jobsDeleted: number;
      conflictsDetected: number;
      calendarsProcessed: number;
      message: string;
      rateLimitedUntil: Date | null;
    },
  ): Promise<void> {
    const now = new Date();

    await this.db
      .update(googleCalendarSyncRuns)
      .set({
        status,
        finishedAt: now,
        eventsImported: input.eventsImported,
        eventsUpdated: input.eventsUpdated,
        jobsPushed: input.jobsPushed,
        jobsUpdated: input.jobsUpdated,
        jobsDeleted: input.jobsDeleted,
        conflictsDetected: input.conflictsDetected,
        calendarsProcessed: input.calendarsProcessed,
        rateLimitedUntil: input.rateLimitedUntil,
        message: input.message.slice(0, 2000),
        leaseExpiresAt: now,
        heartbeatAt: now,
      })
      .where(eq(googleCalendarSyncRuns.id, runId));

    const connection = await this.oauth.getConnectionRow(companyId);
    if (!connection) return;

    await this.db
      .update(googleCalendarConnections)
      .set({
        lastSyncAt: now,
        lastSyncStatus: status,
        // Only a clean run may claim a successful sync.
        ...(status === 'succeeded' ? { lastSuccessfulSyncAt: now } : {}),
        ...(status === 'failed' || status === 'partial'
          ? { lastError: input.message.slice(0, 1000), lastErrorAt: now }
          : { lastError: null, lastErrorAt: null }),
        updatedAt: now,
      })
      .where(eq(googleCalendarConnections.id, connection.id));
  }

  private async handleGoogleFailure(companyId: string, error: unknown): Promise<void> {
    if (
      error instanceof GoogleCalendarOAuthError &&
      (error.code === 'RECONNECT_REQUIRED' || error.code === 'NOT_CONNECTED')
    ) {
      await this.oauth.markReauthRequired(companyId, error.message);
      return;
    }

    if (error instanceof GoogleCalendarClientError && error.code === 'UNAUTHENTICATED') {
      await this.oauth.markReauthRequired(companyId, error.message);
      return;
    }

    await this.oauth.recordError(companyId, describeError(error));
  }

  private async requireConnection(companyId: string) {
    const row = await this.oauth.getConnectionRow(companyId);
    if (!row) {
      throw new GoogleCalendarError(
        'NOT_CONNECTED',
        'Google Calendar is not connected for this company.',
      );
    }
    return row;
  }

  private async countSelectedCalendars(companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(googleCalendarCalendars)
      .where(
        and(
          eq(googleCalendarCalendars.companyId, companyId),
          eq(googleCalendarCalendars.selected, true),
        ),
      );
    return row?.count ?? 0;
  }

  private async countOpenConflicts(companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(googleCalendarConflicts)
      .where(
        and(
          eq(googleCalendarConflicts.companyId, companyId),
          eq(googleCalendarConflicts.status, 'open'),
        ),
      );
    return row?.count ?? 0;
  }

  /** Imported Google events still awaiting an Owner decision (convert or dismiss). */
  private async countPendingExternalEvents(companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(googleCalendarExternalEvents)
      .where(
        and(
          eq(googleCalendarExternalEvents.companyId, companyId),
          isNull(googleCalendarExternalEvents.convertedAt),
          isNull(googleCalendarExternalEvents.dismissedAt),
        ),
      );
    return row?.count ?? 0;
  }

  private async writeAudit(
    actor: GoogleCalendarActor,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'integrations',
      action,
      entityType: 'google_calendar',
      entityId: actor.companyId,
      userId: actor.userId,
      metadata,
    });
  }
}

type JobWithRelations = {
  id: string;
  jobNumber: string | null;
  title: string;
  jobType: string | null;
  status: string;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
  snapshotFormattedAddress: string | null;
  snapshotSuburb: string | null;
  snapshotCustomerName: string | null;
  customer?: { name?: string | null } | null;
  assignedUser?: { firstName?: string | null; lastName?: string | null } | null;
};

/** Only the approved, non-sensitive fields ever reach the payload builder. */
function toPushableJob(job: JobWithRelations): Omit<GoogleCalendarPushableJob, 'scheduledAt'> & {
  scheduledAt: string | null;
} {
  const assignedUserName = job.assignedUser
    ? `${job.assignedUser.firstName ?? ''} ${job.assignedUser.lastName ?? ''}`.trim() || null
    : null;

  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    jobType: job.jobType,
    status: job.status,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    scheduledEndAt: job.scheduledEndAt?.toISOString() ?? null,
    assignedUserName,
    customerName: job.snapshotCustomerName ?? job.customer?.name ?? null,
    addressDisplay: job.snapshotFormattedAddress ?? job.snapshotSuburb ?? null,
  };
}

function buildInitialWindow(): { timeMin: string; timeMax: string } {
  return {
    timeMin: new Date(Date.now() - INITIAL_IMPORT_PAST_DAYS * 86_400_000).toISOString(),
    timeMax: new Date(Date.now() + INITIAL_IMPORT_FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

function buildSyncMessage(counters: {
  eventsImported: number;
  eventsUpdated: number;
  jobsPushed: number;
  jobsUpdated: number;
  jobsDeleted: number;
  conflictsDetected: number;
  calendarsProcessed: number;
}): string {
  return [
    `${counters.calendarsProcessed} calendar(s) processed`,
    `${counters.eventsImported} event(s) imported`,
    `${counters.eventsUpdated} event(s) updated`,
    `${counters.jobsPushed} job(s) created in Google`,
    `${counters.jobsUpdated} job(s) updated in Google`,
    `${counters.jobsDeleted} Google event(s) removed`,
    `${counters.conflictsDetected} conflict(s) needing review`,
  ].join(', ');
}

/** Errors that make continuing pointless — stop the run instead of looping. */
function isFatalGoogleError(error: unknown): boolean {
  if (error instanceof GoogleCalendarOAuthError) return true;
  if (error instanceof GoogleCalendarClientError) {
    return error.code === 'UNAUTHENTICATED' || error.code === 'RATE_LIMITED';
  }
  return false;
}

function describeError(error: unknown): string {
  if (error instanceof GoogleCalendarError) return error.message;
  if (error instanceof GoogleCalendarOAuthError) return error.message;
  if (error instanceof GoogleCalendarClientError) return error.message;
  return error instanceof Error ? error.message : 'Unexpected Google Calendar error';
}
