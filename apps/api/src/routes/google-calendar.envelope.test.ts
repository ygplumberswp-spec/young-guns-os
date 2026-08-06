import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'google-calendar.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/google-calendar.service.ts'),
  'utf8',
);
const oauthSource = readFileSync(
  join(here, '../services/google-calendar-oauth.service.ts'),
  'utf8',
);
const clientSource = readFileSync(join(here, '../lib/google-calendar.client.ts'), 'utf8');
const schemaSource = readFileSync(
  join(here, '../../../../packages/db/src/schema/google-calendar.ts'),
  'utf8',
);

describe('google calendar API envelope & routes', () => {
  it('wraps every success response in { data: ... } or { error: ... }', () => {
    const jsonResponses = [...routeSource.matchAll(/res\.(?:status\(\d+\)\.)?json\(/g)];
    assert.ok(jsonResponses.length > 0);

    for (const match of jsonResponses) {
      const window = routeSource.slice(match.index!, match.index! + 60);
      assert.ok(
        /json\(\{\s*data/.test(window) || /json\(\{\s*error/.test(window),
        `response is neither a data nor an error envelope: ${window.split('\n')[0]}`,
      );
    }
  });

  it('exposes the OAuth, settings, sync and calendar routes', () => {
    for (const [method, path] of [
      ['get', '/oauth/callback'],
      ['post', '/oauth/start'],
      ['post', '/oauth/disconnect'],
      ['get', '/status'],
      ['get', '/settings'],
      ['patch', '/settings'],
      ['get', '/calendars'],
      ['post', '/calendars/refresh'],
      ['patch', '/calendars/:calendarId'],
      ['post', '/sync'],
      ['get', '/sync-runs'],
      ['get', '/calendar'],
      ['get', '/external-events'],
      ['post', '/external-events/:externalEventId/convert'],
      ['post', '/external-events/:externalEventId/dismiss'],
      ['get', '/conflicts'],
      ['post', '/conflicts/:conflictId/resolve'],
      ['get', '/technician-mappings'],
      ['put', '/technician-mappings'],
      ['delete', '/technician-mappings/:mappingId'],
    ] as const) {
      const pattern = new RegExp(
        `router\\.${method}\\(\\s*'${path.replace(/[/:]/g, (char) => `\\${char}`)}'`,
      );
      assert.ok(pattern.test(routeSource), `missing route: ${method.toUpperCase()} ${path}`);
    }
  });

  it('authenticates everything except the browser OAuth callback', () => {
    const callbackIndex = routeSource.indexOf("router.get('/oauth/callback'");
    const requireAuthIndex = routeSource.indexOf('router.use(requireAuth)');

    assert.ok(callbackIndex > 0);
    assert.ok(requireAuthIndex > 0);
    // The callback must be registered before the auth gate; everything else after.
    assert.ok(callbackIndex < requireAuthIndex);
    assert.ok(routeSource.includes('applyStaffOwnerGuards'));
  });

  it('gates connection management behind integrations:manage', () => {
    for (const path of [
      '/oauth/start',
      '/oauth/disconnect',
      '/calendars/refresh',
      '/calendars/:calendarId',
      '/technician-mappings',
    ]) {
      const pattern = new RegExp(
        `'${path.replace(/[/:]/g, (char) => `\\${char}`)}',\\s*\\n?\\s*requireAnyPermission\\('integrations:manage'\\)`,
      );
      assert.ok(pattern.test(routeSource), `route not gated by integrations:manage: ${path}`);
    }
  });

  it('reuses the TITAN scheduling calendar permission check rather than widening access', () => {
    assert.ok(routeSource.includes('canReadSchedulingCalendar'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
  });

  it('restricts conversion and conflict resolution to dispatch:write', () => {
    for (const path of [
      '/external-events/:externalEventId/convert',
      '/external-events/:externalEventId/dismiss',
      '/conflicts/:conflictId/resolve',
    ]) {
      const pattern = new RegExp(
        `'${path.replace(/[/:]/g, (char) => `\\${char}`)}',\\s*\\n?\\s*requireAnyPermission\\('dispatch:write'\\)`,
      );
      assert.ok(pattern.test(routeSource), `route not gated by dispatch:write: ${path}`);
    }
  });
});

describe('google calendar token safety', () => {
  it('encrypts tokens and never selects them into an API response', () => {
    assert.ok(oauthSource.includes('encryptGoogleCalendarCredentials'));
    assert.ok(oauthSource.includes('decryptGoogleCalendarCredentials'));

    // Nothing in the service or routes may surface a raw token field.
    for (const leak of ['accessToken:', 'refreshToken:', 'credentialsEncrypted:']) {
      assert.ok(
        !routeSource.includes(leak),
        `route layer must not reference credential field ${leak}`,
      );
    }
    assert.ok(!serviceSource.includes('credentials.accessToken'));
  });

  it('keeps the OAuth state single-use and hashed', () => {
    assert.ok(oauthSource.includes('hashOAuthState'));
    assert.ok(oauthSource.includes('isNull(integrationOauthStates.consumedAt)'));
    assert.ok(oauthSource.includes('consumedAt: now'));
  });

  it('requests offline access so a refresh token is issued', () => {
    assert.ok(oauthSource.includes("access_type: 'offline'"));
    assert.ok(oauthSource.includes("prompt: 'consent'"));
  });

  it('preserves an existing refresh token when Google omits a new one', () => {
    assert.ok(oauthSource.includes('tokenPayload.refresh_token ?? priorRefresh'));
  });

  it('de-duplicates concurrent refreshes per company', () => {
    assert.ok(oauthSource.includes('refreshInflight'));
  });

  it('revokes at Google and clears local tokens on disconnect', () => {
    assert.ok(oauthSource.includes('REVOKE_URL'));
    assert.ok(oauthSource.includes('credentialsEncrypted: null'));
    assert.ok(oauthSource.includes('google_calendar_oauth_disconnected'));
  });

  it('asks for re-consent instead of pretending to be connected after a revoke', () => {
    assert.ok(oauthSource.includes('markReauthRequired'));
    assert.ok(oauthSource.includes('invalid_grant'));
    assert.ok(oauthSource.includes("status: 'reauth_required'"));
  });

  it('sanitises the post-OAuth redirect so it cannot leave the app', () => {
    assert.ok(oauthSource.includes("returnPath.startsWith('//')"));
    assert.ok(oauthSource.includes('sanitizeReturnPath'));
  });
});

describe('google calendar tenant isolation and audit', () => {
  it('scopes every table by companyId', () => {
    assert.ok(serviceSource.includes('eq(googleCalendarConnections.companyId, companyId)') === false);
    // Connections are read through the OAuth service, which scopes by company.
    assert.ok(oauthSource.includes('eq(googleCalendarConnections.companyId, companyId)'));

    for (const scoped of [
      'eq(googleCalendarCalendars.companyId',
      'eq(googleCalendarExternalEvents.companyId',
      'eq(googleCalendarJobEventLinks.companyId',
      'eq(googleCalendarSyncRuns.companyId',
      'eq(googleCalendarConflicts.companyId',
      'eq(googleCalendarUserMappings.companyId',
    ]) {
      assert.ok(serviceSource.includes(scoped), `missing tenant scope: ${scoped}`);
    }
  });

  it('writes integration-category audit entries for every mutation', () => {
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes("category: 'integrations'"));

    for (const action of [
      'google_calendar_calendars_refreshed',
      'google_calendar_connection_settings_updated',
      'google_calendar_calendar_updated',
      'google_calendar_external_event_converted',
      'google_calendar_external_event_dismissed',
      'google_calendar_conflict_resolved',
      'google_calendar_technician_mapping_set',
    ]) {
      assert.ok(serviceSource.includes(action), `missing audit action: ${action}`);
    }

    assert.ok(oauthSource.includes('google_calendar_oauth_connected'));
    assert.ok(oauthSource.includes('google_calendar_oauth_failed'));
  });

  it('stores tokens only on the calendar connection, not the integration hub row', () => {
    assert.ok(oauthSource.includes('mirrorIntegrationHub'));
    assert.ok(
      oauthSource.includes('credentialsEncrypted: null,\n          config,'),
      'integration hub mirror must not carry credentials',
    );
  });
});

describe('google calendar scheduling safety', () => {
  it('never moves or reschedules a TITAN job during sync', () => {
    // Sync must never write to the jobs table; only explicit conversion inserts one.
    assert.ok(!serviceSource.includes('.update(jobs)'));
    assert.ok(!serviceSource.includes('.delete(jobs)'));

    const jobInserts = serviceSource.match(/\.insert\(jobs\)/g) ?? [];
    assert.equal(jobInserts.length, 1, 'only the explicit conversion path may create a job');

    const conversionIndex = serviceSource.indexOf('createJobFromExternalEvent');
    assert.ok(conversionIndex > 0);
    assert.ok(serviceSource.indexOf('.insert(jobs)') > conversionIndex);
    assert.ok(serviceSource.includes('hold_for_review'));
  });

  it('holds both versions for review instead of overwriting a Google edit', () => {
    assert.ok(serviceSource.includes('holdLinkForReview'));
    assert.ok(serviceSource.includes("syncState: 'conflict'"));
    assert.ok(serviceSource.includes("conflictType: 'concurrent_edit'"));
    assert.ok(serviceSource.includes('PRECONDITION_FAILED'));
  });

  it('sends If-Match so a concurrent Google edit fails loudly', () => {
    assert.ok(clientSource.includes("'If-Match'"));
    assert.ok(clientSource.includes('PRECONDITION_FAILED'));
  });

  it('flags a remotely deleted mirror without deleting the TITAN job', () => {
    assert.ok(serviceSource.includes('flagRemoteDeletion'));
    assert.ok(serviceSource.includes("conflictType: 'remote_event_deleted'"));
    assert.ok(serviceSource.includes('The TITAN job is unchanged'));
    assert.ok(!serviceSource.includes('.delete(jobs)'));
  });

  it('requires an explicit human action to convert a Google event into TITAN work', () => {
    assert.ok(serviceSource.includes('convertExternalEvent'));
    assert.ok(serviceSource.includes('CUSTOMER_REQUIRED'));
    assert.ok(serviceSource.includes('TITAN will not invent one'));
    assert.ok(serviceSource.includes('convertedByUserId: actor.userId'));
  });

  it('routes a converted booking through the scheduling engine', () => {
    assert.ok(serviceSource.includes('this.schedulingService.scheduleJob'));
  });

  it('never messages customers from the calendar sync', () => {
    for (const forbidden of [
      'sendEmail',
      'sendWhatsapp',
      'sendSms',
      'sendMessage',
      'notifyCustomer',
    ]) {
      assert.ok(!serviceSource.includes(forbidden), `sync must not message customers: ${forbidden}`);
    }
  });

  it('refuses to push to a calendar Google made read-only', () => {
    assert.ok(serviceSource.includes('canPushToCalendar'));
    assert.ok(serviceSource.includes('READ_ONLY_CALENDAR'));
  });

  it('only claims a successful sync after a clean run', () => {
    assert.ok(serviceSource.includes("...(status === 'succeeded' ? { lastSuccessfulSyncAt: now } : {})"));
  });
});

describe('google calendar sync reliability', () => {
  it('prevents overlapping runs with a database lease', () => {
    assert.ok(serviceSource.includes('acquireLease'));
    assert.ok(serviceSource.includes('leaseExpiresAt'));
    assert.ok(serviceSource.includes('Another Google Calendar sync is already running.'));
  });

  it('uses incremental sync tokens and recovers when Google expires them', () => {
    assert.ok(clientSource.includes('SYNC_TOKEN_EXPIRED'));
    assert.ok(serviceSource.includes("error.code === 'SYNC_TOKEN_EXPIRED'"));
    assert.ok(serviceSource.includes('syncToken: null'));
  });

  it('follows pagination with a page cap so a run always terminates', () => {
    assert.ok(clientSource.includes('nextPageToken'));
    assert.ok(serviceSource.includes('MAX_EVENT_PAGES_PER_CALENDAR'));
  });

  it('honours Retry-After and records rate limiting', () => {
    assert.ok(clientSource.includes('parseRetryAfter'));
    assert.ok(clientSource.includes("'Retry-After'"));
    assert.ok(serviceSource.includes('rateLimitedUntil'));
    assert.ok(serviceSource.includes("error.code === 'RATE_LIMITED'"));
  });

  it('upserts idempotently rather than duplicating events or links', () => {
    assert.ok(serviceSource.includes('onConflictDoUpdate'));
    assert.ok(serviceSource.includes('payloadHash'));
    assert.ok(serviceSource.includes('hashGoogleEventPayload'));
  });

  it('treats an already-deleted Google event as success', () => {
    assert.ok(clientSource.includes('if (response.status === 404 || response.status === 410) return;'));
  });
});

describe('google calendar privacy', () => {
  it('reduces private events to a busy window with no content', () => {
    assert.ok(serviceSource.includes('const isPrivate = privacyForced || googleMarkedPrivate'));
    assert.ok(serviceSource.includes('title: isPrivate ? null'));
    assert.ok(serviceSource.includes('location: isPrivate ? null'));
    assert.ok(serviceSource.includes('meetLink: isPrivate ? null'));
  });

  it('withholds private event details from list and conflict responses', () => {
    assert.ok(serviceSource.includes('title: row.event.isPrivate ? null : row.event.title'));
    assert.ok(serviceSource.includes('externalEventTitle: row.eventIsPrivate ? null'));
  });

  it('does not expose company Google events to a technician-scoped view', () => {
    assert.ok(serviceSource.includes("viewScope === 'own'\n        ? []"));
  });
});

describe('google calendar schema', () => {
  it('is additive and does not redefine scheduling tables', () => {
    assert.ok(schemaSource.includes("pgTable(\n  'google_calendar_connections'"));
    assert.ok(!schemaSource.includes("pgTable('jobs'"));
    assert.ok(!schemaSource.includes("pgTable('company_scheduling_settings'"));
  });

  it('scopes every table to a company and keeps tokens in one place', () => {
    const tokenColumns = schemaSource.match(/credentialsEncrypted: text\('credentials_encrypted'\)/g) ?? [];
    assert.equal(tokenColumns.length, 1, 'tokens must live on exactly one table');

    const tableCount = (schemaSource.match(/= pgTable\(/g) ?? []).length;
    const companyColumns = (schemaSource.match(/companyId: uuid\('company_id'\)/g) ?? []).length;
    assert.equal(
      companyColumns,
      tableCount,
      'every google_calendar table must carry company_id for tenant isolation',
    );
  });

  it('records sync history and conflicts as first-class tables', () => {
    assert.ok(schemaSource.includes('googleCalendarSyncRuns'));
    assert.ok(schemaSource.includes('googleCalendarConflicts'));
    assert.ok(schemaSource.includes('fingerprint'));
  });
});

describe('google calendar aura surface', () => {
  const routingSource = readFileSync(
    join(here, '../services/aura-context-routing.ts'),
    'utf8',
  );
  const contextSource = readFileSync(join(here, '../services/aura-context-build.ts'), 'utf8');

  it('routes calendar questions to the scheduling context', () => {
    const rule = routingSource.match(
      /pattern: \/\\b\(calendar\|google calendar\|[^\n]*\n\s*domains: \[([^\]]+)\]/,
    );
    assert.ok(rule, 'a calendar keyword rule must exist');
    assert.ok(rule[1].includes("'scheduling'"), 'calendar words must load the schedule');
    assert.ok(rule[1].includes("'integrations'"), 'calendar words must load connection state');
  });

  it('loads calendar context only for users with dispatch permission', () => {
    const schedulingBlock = contextSource.slice(
      contextSource.indexOf("domain: 'scheduling'"),
      contextSource.indexOf("domain: 'finance'"),
    );
    assert.ok(
      schedulingBlock.includes("hasAnyPermission(permissions, ['dispatch:read', 'dispatch:write'])"),
      'calendar context must inherit the scheduling permission gate',
    );
    assert.ok(
      schedulingBlock.includes('googleCalendarService.buildAuraContext(companyId, permissions)'),
      'Aura must receive the calendar snapshot scoped by company and permissions',
    );
  });

  it('tells Aura plainly when Google is not connected instead of implying events', () => {
    const auraBlock = serviceSource.slice(
      serviceSource.indexOf('async buildAuraContext('),
      serviceSource.indexOf('async getSettings('),
    );
    assert.ok(auraBlock.includes('Google Calendar is not connected.'));
    assert.ok(
      auraBlock.includes('do not imply Google events exist'),
      'the not-connected note must forbid inventing events',
    );
    assert.ok(
      /todayGoogleEntries: \[\]/.test(auraBlock),
      'a disconnected tenant must report zero Google entries',
    );
  });

  it('forbids Aura from claiming it moved or created TITAN work', () => {
    const auraBlock = serviceSource.slice(
      serviceSource.indexOf('async buildAuraContext('),
      serviceSource.indexOf('async getSettings('),
    );
    assert.ok(auraBlock.includes('TITAN jobs remain the scheduling authority'));
    assert.ok(auraBlock.includes('without explicit Owner confirmation'));
  });

  it('never hands Aura a private event body', () => {
    const auraBlock = serviceSource.slice(
      serviceSource.indexOf('async buildAuraContext('),
      serviceSource.indexOf('async getSettings('),
    );
    assert.ok(auraBlock.includes('isPrivate: event.isPrivate'));
    assert.ok(
      !/description|notes|margin|cost/i.test(auraBlock),
      'Aura calendar context must not carry descriptions, notes, margins or costs',
    );
  });
});
