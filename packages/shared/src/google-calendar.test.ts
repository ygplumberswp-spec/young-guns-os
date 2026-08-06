import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  buildGoogleEventPayload,
  canPushToCalendar,
  decideGoogleEventPush,
  describeGoogleCalendarConnection,
  detectGoogleCalendarConflicts,
  findMissingCalendarScopes,
  hashGoogleEventPayload,
  mergeGoogleCalendarEntries,
  resolveGoogleCalendarCapabilities,
  type GoogleCalendarPushableJob,
} from './google-calendar.js';

const job: GoogleCalendarPushableJob = {
  jobId: 'job-1',
  jobNumber: 'JOB-0042',
  title: 'Geyser replacement',
  jobType: 'Plumbing',
  status: 'scheduled',
  scheduledAt: '2026-08-10T08:00:00.000Z',
  scheduledEndAt: '2026-08-10T10:00:00.000Z',
  assignedUserName: 'Sipho M',
  customerName: 'Acme Body Corporate',
  addressDisplay: '12 Main Road, Claremont',
  internalNotes: 'Customer disputes last invoice — do not discuss on site',
  costTotal: 4820.5,
  marginPercent: 38.2,
  customerMobile: '+27821234567',
};

describe('buildGoogleEventPayload', () => {
  it('never leaks internal notes, costs, margins or customer phone numbers', () => {
    for (const privacyMode of ['busy_only', 'limited_details', 'approved_details'] as const) {
      const payload = buildGoogleEventPayload({ job, companyId: 'company-1', privacyMode });
      const serialised = JSON.stringify(payload);

      assert.equal(serialised.includes('do not discuss'), false, privacyMode);
      assert.equal(serialised.includes('4820'), false, privacyMode);
      assert.equal(serialised.includes('38.2'), false, privacyMode);
      assert.equal(serialised.includes('+27821234567'), false, privacyMode);
    }
  });

  it('reduces a busy_only calendar to an anonymous opaque block', () => {
    const payload = buildGoogleEventPayload({
      job,
      companyId: 'company-1',
      privacyMode: 'busy_only',
    });

    assert.equal(payload.summary, 'Busy');
    assert.equal(payload.description, '');
    assert.equal(payload.location, null);
    assert.equal(payload.transparency, 'opaque');
    assert.equal(payload.visibility, 'private');
    assert.equal(JSON.stringify(payload).includes('Geyser'), false);
    assert.equal(JSON.stringify(payload).includes('Acme'), false);
  });

  it('withholds customer name and address at limited_details', () => {
    const payload = buildGoogleEventPayload({
      job,
      companyId: 'company-1',
      privacyMode: 'limited_details',
    });

    assert.equal(payload.summary, 'JOB-0042 — Geyser replacement');
    assert.equal(payload.location, null);
    assert.equal(payload.description.includes('Acme'), false);
    assert.equal(payload.description.includes('Claremont'), false);
    assert.equal(payload.description.includes('Sipho M'), true);
  });

  it('includes customer and address only at approved_details', () => {
    const payload = buildGoogleEventPayload({
      job,
      companyId: 'company-1',
      privacyMode: 'approved_details',
    });

    assert.equal(payload.location, '12 Main Road, Claremont');
    assert.equal(payload.description.includes('Acme Body Corporate'), true);
  });

  it('stamps TITAN correlation so an imported mirror is recognisable', () => {
    const payload = buildGoogleEventPayload({
      job,
      companyId: 'company-9',
      privacyMode: 'limited_details',
    });

    assert.deepEqual(payload.extendedProperties.private, {
      titanJobId: 'job-1',
      titanCompanyId: 'company-9',
      titanSource: 'titan_job',
    });
  });

  it('defaults a missing end time to one hour rather than an open-ended event', () => {
    const payload = buildGoogleEventPayload({
      job: { ...job, scheduledEndAt: null },
      companyId: 'company-1',
      privacyMode: 'limited_details',
    });

    assert.equal(payload.end.dateTime, '2026-08-10T09:00:00.000Z');
  });
});

describe('hashGoogleEventPayload', () => {
  it('is stable for identical payloads and changes when content changes', () => {
    const base = buildGoogleEventPayload({
      job,
      companyId: 'company-1',
      privacyMode: 'approved_details',
    });
    const same = buildGoogleEventPayload({
      job,
      companyId: 'company-1',
      privacyMode: 'approved_details',
    });
    const moved = buildGoogleEventPayload({
      job: { ...job, scheduledAt: '2026-08-10T11:00:00.000Z' },
      companyId: 'company-1',
      privacyMode: 'approved_details',
    });

    assert.equal(hashGoogleEventPayload(base), hashGoogleEventPayload(same));
    assert.notEqual(hashGoogleEventPayload(base), hashGoogleEventPayload(moved));
  });
});

describe('decideGoogleEventPush', () => {
  const baseInput = {
    jobStatus: 'scheduled',
    jobScheduledAt: '2026-08-10T08:00:00.000Z',
    jobUpdatedAt: '2026-08-09T12:00:00.000Z',
    privacyMode: 'limited_details' as const,
    canPush: true,
    nextPayloadHash: 'aaaa1111',
  };

  it('refuses to push to a read-only calendar', () => {
    const decision = decideGoogleEventPush({ ...baseInput, canPush: false, link: null });
    assert.equal(decision.action, 'skip');
    assert.match(decision.reason, /read-only/);
  });

  it('creates when no Google event exists', () => {
    assert.equal(decideGoogleEventPush({ ...baseInput, link: null }).action, 'create');
  });

  it('skips when Google already matches TITAN', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:01.000Z',
        googleUpdatedAt: '2026-08-09T12:00:01.000Z',
        titanUpdatedAt: '2026-08-09T12:00:00.000Z',
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'skip');
  });

  it('updates when only TITAN changed', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      nextPayloadHash: 'bbbb2222',
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:01.000Z',
        googleUpdatedAt: '2026-08-09T12:00:01.000Z',
        titanUpdatedAt: '2026-08-09T12:00:00.000Z',
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'update');
  });

  it('holds for review rather than overwriting an edit made in Google', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      nextPayloadHash: 'bbbb2222',
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: '2026-08-09T15:00:00.000Z',
        titanUpdatedAt: '2026-08-09T12:00:00.000Z',
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'hold_for_review');
    assert.match(decision.reason, /Both TITAN and Google/);
  });

  it('holds for review when Google alone changed, so the remote edit survives', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: '2026-08-09T15:00:00.000Z',
        titanUpdatedAt: '2026-08-09T12:00:00.000Z',
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'hold_for_review');
  });

  it('does not treat our own write as a remote edit', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      nextPayloadHash: 'bbbb2222',
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: '2026-08-09T12:00:01.500Z',
        titanUpdatedAt: '2026-08-09T12:00:00.000Z',
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'update');
  });

  it('keeps holding once a conflict is already recorded', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'zzzz',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: null,
        titanUpdatedAt: null,
        syncState: 'conflict',
      },
    });

    assert.equal(decision.action, 'hold_for_review');
  });

  it('deletes the mirror when a job is cancelled', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      jobStatus: 'cancelled',
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: null,
        titanUpdatedAt: null,
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'delete');
  });

  it('deletes the mirror when a job loses its scheduled time', () => {
    const decision = decideGoogleEventPush({
      ...baseInput,
      jobScheduledAt: null,
      link: {
        googleEventId: 'evt-1',
        payloadHash: 'aaaa1111',
        lastPushedAt: '2026-08-09T12:00:00.000Z',
        googleUpdatedAt: null,
        titanUpdatedAt: null,
        syncState: 'synced',
      },
    });

    assert.equal(decision.action, 'delete');
  });

  it('does nothing for an unscheduled job that was never pushed', () => {
    const decision = decideGoogleEventPush({ ...baseInput, jobScheduledAt: null, link: null });
    assert.equal(decision.action, 'skip');
  });
});

describe('detectGoogleCalendarConflicts', () => {
  const jobs = [
    {
      jobId: 'job-1',
      jobNumber: 'JOB-0042',
      title: 'Geyser replacement',
      scheduledAt: '2026-08-10T08:00:00.000Z',
      scheduledEndAt: '2026-08-10T10:00:00.000Z',
      assignedUserName: 'Sipho M',
    },
  ];

  it('flags a real overlap without moving anything', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs,
      busyBlocks: [
        {
          externalEventId: 'evt-9',
          title: 'Dentist',
          startAt: '2026-08-10T09:00:00.000Z',
          endAt: '2026-08-10T09:30:00.000Z',
          isPrivate: false,
          showsAsBusy: true,
          titanJobId: null,
        },
      ],
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflictType, 'job_overlaps_google_event');
    assert.equal(conflicts[0].windowStart, '2026-08-10T09:00:00.000Z');
    assert.equal(conflicts[0].windowEnd, '2026-08-10T09:30:00.000Z');
    assert.match(conflicts[0].message, /has not moved anything/);
  });

  it('does not conflict a job with its own Google mirror', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs,
      busyBlocks: [
        {
          externalEventId: 'evt-mirror',
          title: 'JOB-0042 — Geyser replacement',
          startAt: '2026-08-10T08:00:00.000Z',
          endAt: '2026-08-10T10:00:00.000Z',
          isPrivate: false,
          showsAsBusy: true,
          titanJobId: 'job-1',
        },
      ],
    });

    assert.deepEqual(conflicts, []);
  });

  it('ignores events marked free', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs,
      busyBlocks: [
        {
          externalEventId: 'evt-free',
          title: 'Optional webinar',
          startAt: '2026-08-10T09:00:00.000Z',
          endAt: '2026-08-10T09:30:00.000Z',
          isPrivate: false,
          showsAsBusy: false,
          titanJobId: null,
        },
      ],
    });

    assert.deepEqual(conflicts, []);
  });

  it('describes a private clash without revealing its title', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs,
      busyBlocks: [
        {
          externalEventId: 'evt-private',
          title: 'Divorce lawyer',
          startAt: '2026-08-10T09:00:00.000Z',
          endAt: '2026-08-10T09:30:00.000Z',
          isPrivate: true,
          showsAsBusy: true,
          titanJobId: null,
        },
      ],
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].message.includes('Divorce'), false);
    assert.match(conflicts[0].message, /private Google event \(Busy\)/);
  });

  it('treats back-to-back bookings as no conflict', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs,
      busyBlocks: [
        {
          externalEventId: 'evt-after',
          title: 'Next thing',
          startAt: '2026-08-10T10:00:00.000Z',
          endAt: '2026-08-10T11:00:00.000Z',
          isPrivate: false,
          showsAsBusy: true,
          titanJobId: null,
        },
      ],
    });

    assert.deepEqual(conflicts, []);
  });

  it('assumes one hour for a job with no end time', () => {
    const conflicts = detectGoogleCalendarConflicts({
      jobs: [{ ...jobs[0], scheduledEndAt: null }],
      busyBlocks: [
        {
          externalEventId: 'evt-mid',
          title: 'Standup',
          startAt: '2026-08-10T08:30:00.000Z',
          endAt: '2026-08-10T08:45:00.000Z',
          isPrivate: false,
          showsAsBusy: true,
          titanJobId: null,
        },
      ],
    });

    assert.equal(conflicts.length, 1);
  });
});

describe('mergeGoogleCalendarEntries', () => {
  const jobs = [
    {
      jobId: 'job-1',
      jobNumber: 'JOB-0042',
      title: 'Geyser replacement',
      scheduledAt: '2026-08-10T08:00:00.000Z',
      scheduledEndAt: '2026-08-10T10:00:00.000Z',
      assignedUserName: 'Sipho M',
    },
  ];

  it('shows the TITAN schedule even with no Google events', () => {
    const entries = mergeGoogleCalendarEntries({ jobs, externalEvents: [] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'titan_job');
    assert.equal(entries[0].title, 'JOB-0042 — Geyser replacement');
  });

  it('does not duplicate a job that TITAN mirrored into Google', () => {
    const entries = mergeGoogleCalendarEntries({
      jobs,
      externalEvents: [
        {
          externalEventId: 'evt-mirror',
          title: 'JOB-0042 — Geyser replacement',
          calendarSummary: 'Work',
          startAt: '2026-08-10T08:00:00.000Z',
          endAt: '2026-08-10T10:00:00.000Z',
          isAllDay: false,
          isPrivate: false,
          showsAsBusy: true,
          meetLink: null,
          titanJobId: 'job-1',
        },
      ],
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'titan_job');
  });

  it('renders a private Google event as Busy with no title or meet link', () => {
    const entries = mergeGoogleCalendarEntries({
      jobs: [],
      externalEvents: [
        {
          externalEventId: 'evt-private',
          title: 'Therapy',
          calendarSummary: 'Personal',
          startAt: '2026-08-10T12:00:00.000Z',
          endAt: '2026-08-10T13:00:00.000Z',
          isAllDay: false,
          isPrivate: true,
          showsAsBusy: true,
          meetLink: 'https://meet.google.com/abc-defg-hij',
          titanJobId: null,
        },
      ],
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'private_busy');
    assert.equal(entries[0].title, 'Busy');
    assert.equal(entries[0].meetLink, null);
  });

  it('sorts merged entries chronologically and marks conflicts', () => {
    const entries = mergeGoogleCalendarEntries({
      jobs,
      externalEvents: [
        {
          externalEventId: 'evt-early',
          title: 'Early call',
          calendarSummary: 'Work',
          startAt: '2026-08-10T06:00:00.000Z',
          endAt: '2026-08-10T06:30:00.000Z',
          isAllDay: false,
          isPrivate: false,
          showsAsBusy: true,
          meetLink: null,
          titanJobId: null,
        },
      ],
      conflictJobIds: ['job-1'],
      conflictExternalEventIds: ['evt-early'],
    });

    assert.deepEqual(
      entries.map((entry) => entry.key),
      ['gcal:evt-early', 'job:job-1'],
    );
    assert.equal(entries.every((entry) => entry.hasConflict), true);
  });

  it('drops Google events with no start time instead of guessing one', () => {
    const entries = mergeGoogleCalendarEntries({
      jobs: [],
      externalEvents: [
        {
          externalEventId: 'evt-broken',
          title: 'No start',
          calendarSummary: 'Work',
          startAt: null,
          endAt: null,
          isAllDay: false,
          isPrivate: false,
          showsAsBusy: true,
          meetLink: null,
          titanJobId: null,
        },
      ],
    });

    assert.deepEqual(entries, []);
  });
});

describe('canPushToCalendar', () => {
  it('allows writer and owner only', () => {
    assert.equal(canPushToCalendar('owner'), true);
    assert.equal(canPushToCalendar('writer'), true);
    assert.equal(canPushToCalendar('reader'), false);
    assert.equal(canPushToCalendar('freeBusyReader'), false);
    assert.equal(canPushToCalendar(null), false);
  });
});

describe('findMissingCalendarScopes', () => {
  it('reports nothing missing for a full grant', () => {
    assert.deepEqual(findMissingCalendarScopes([...GOOGLE_CALENDAR_OAUTH_SCOPES]), []);
  });

  it('names the scopes Google withheld', () => {
    const missing = findMissingCalendarScopes([
      'https://www.googleapis.com/auth/calendar.readonly',
    ]);
    assert.equal(missing.includes('https://www.googleapis.com/auth/calendar.events'), true);
  });
});

describe('describeGoogleCalendarConnection', () => {
  it('says awaiting configuration when the API has no OAuth client', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: false,
      state: 'disconnected',
      googleAccountEmail: null,
      selectedCalendarCount: 0,
      lastSuccessfulSyncAt: null,
      lastError: null,
      missingScopes: [],
    });

    assert.match(message, /Awaiting configuration/);
    assert.match(message, /GOOGLE_CLIENT_ID/);
  });

  it('distinguishes a configured app from a connected tenant', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: true,
      state: 'disconnected',
      googleAccountEmail: null,
      selectedCalendarCount: 0,
      lastSuccessfulSyncAt: null,
      lastError: null,
      missingScopes: [],
    });

    assert.match(message, /Not connected/);
    assert.equal(message.includes('Awaiting configuration'), false);
  });

  it('does not claim a sync that never happened', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: true,
      state: 'connected',
      googleAccountEmail: 'ops@youngguns.co.za',
      selectedCalendarCount: 2,
      lastSuccessfulSyncAt: null,
      lastError: null,
      missingScopes: [],
    });

    assert.match(message, /No successful sync yet/);
  });

  it('tells the Owner that selecting no calendar means nothing syncs', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: true,
      state: 'connected',
      googleAccountEmail: 'ops@youngguns.co.za',
      selectedCalendarCount: 0,
      lastSuccessfulSyncAt: null,
      lastError: null,
      missingScopes: [],
    });

    assert.match(message, /nothing syncs until you do/);
  });

  it('asks for re-consent when Google revoked the grant', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: true,
      state: 'reauth_required',
      googleAccountEmail: 'ops@youngguns.co.za',
      selectedCalendarCount: 1,
      lastSuccessfulSyncAt: '2026-08-01T10:00:00.000Z',
      lastError: null,
      missingScopes: [],
    });

    assert.match(message, /Reconnect Google Calendar/);
  });

  it('surfaces a partial scope grant rather than reporting healthy', () => {
    const message = describeGoogleCalendarConnection({
      oauthConfigured: true,
      state: 'connected',
      googleAccountEmail: 'ops@youngguns.co.za',
      selectedCalendarCount: 1,
      lastSuccessfulSyncAt: '2026-08-01T10:00:00.000Z',
      lastError: null,
      missingScopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    assert.match(message, /did not grant all calendar permissions/);
  });
});

describe('resolveGoogleCalendarCapabilities', () => {
  it('gives an owner every capability', () => {
    const capabilities = resolveGoogleCalendarCapabilities(['*']);
    assert.equal(capabilities.includes('view_company_calendar'), true);
    assert.equal(capabilities.includes('manage_connection'), true);
    assert.equal(capabilities.includes('resolve_conflicts'), true);
    assert.equal(capabilities.includes('convert_external_event'), true);
  });

  it('lets a dispatcher run the calendar but not the connection', () => {
    const capabilities = resolveGoogleCalendarCapabilities([
      'dispatch:read',
      'dispatch:write',
    ]);

    assert.equal(capabilities.includes('view_company_calendar'), true);
    assert.equal(capabilities.includes('resolve_conflicts'), true);
    assert.equal(capabilities.includes('manage_connection'), false);
    assert.equal(capabilities.includes('trigger_sync'), false);
  });

  it('limits a technician to their own calendar', () => {
    const capabilities = resolveGoogleCalendarCapabilities(['mobile:read', 'jobs:read']);

    assert.deepEqual(capabilities, ['view_own_calendar']);
  });

  it('gives a client-portal user no calendar access', () => {
    assert.deepEqual(resolveGoogleCalendarCapabilities(['portal.jobs:read']), []);
  });
});
