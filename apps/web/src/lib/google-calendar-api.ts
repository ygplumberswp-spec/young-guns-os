import type {
  GoogleCalendarCalendarSummary,
  GoogleCalendarConflictSummary,
  GoogleCalendarConnectionStatus,
  GoogleCalendarConvertEventRequest,
  GoogleCalendarExternalEventSummary,
  GoogleCalendarSettingsResponse,
  GoogleCalendarSyncRunSummary,
  GoogleCalendarTechnicianMapping,
  GoogleCalendarUnifiedCalendarResponse,
  GoogleCalendarUpdateCalendarRequest,
  GoogleCalendarUpdateConnectionRequest,
} from '@titan/shared';
import { request } from './api-client';

export type GoogleCalendarSyncOutcome = {
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

export async function fetchGoogleCalendarStatus(
  accessToken: string,
): Promise<GoogleCalendarConnectionStatus> {
  return request<GoogleCalendarConnectionStatus>('/google-calendar/status', { accessToken });
}

export async function fetchGoogleCalendarSettings(
  accessToken: string,
): Promise<GoogleCalendarSettingsResponse> {
  return request<GoogleCalendarSettingsResponse>('/google-calendar/settings', { accessToken });
}

export async function updateGoogleCalendarSettings(
  accessToken: string,
  body: GoogleCalendarUpdateConnectionRequest,
): Promise<GoogleCalendarConnectionStatus> {
  return request<GoogleCalendarConnectionStatus>('/google-calendar/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
}

export async function startGoogleCalendarOAuth(
  accessToken: string,
  returnPath?: string | null,
): Promise<{ authorizationUrl: string }> {
  return request<{ authorizationUrl: string }>('/google-calendar/oauth/start', {
    method: 'POST',
    accessToken,
    body: { returnPath: returnPath ?? null },
  });
}

export async function disconnectGoogleCalendar(
  accessToken: string,
): Promise<GoogleCalendarConnectionStatus> {
  return request<GoogleCalendarConnectionStatus>('/google-calendar/oauth/disconnect', {
    method: 'POST',
    accessToken,
  });
}

export async function refreshGoogleCalendarList(
  accessToken: string,
): Promise<GoogleCalendarCalendarSummary[]> {
  const data = await request<{ calendars: GoogleCalendarCalendarSummary[] }>(
    '/google-calendar/calendars/refresh',
    { method: 'POST', accessToken },
  );
  return data.calendars;
}

export async function updateGoogleCalendarCalendar(
  accessToken: string,
  calendarId: string,
  body: GoogleCalendarUpdateCalendarRequest,
): Promise<GoogleCalendarCalendarSummary> {
  const data = await request<{ calendar: GoogleCalendarCalendarSummary }>(
    `/google-calendar/calendars/${calendarId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.calendar;
}

export async function syncGoogleCalendarNow(
  accessToken: string,
): Promise<GoogleCalendarSyncOutcome> {
  return request<GoogleCalendarSyncOutcome>('/google-calendar/sync', {
    method: 'POST',
    accessToken,
  });
}

export async function fetchGoogleCalendarSyncRuns(
  accessToken: string,
  limit = 20,
): Promise<GoogleCalendarSyncRunSummary[]> {
  const data = await request<{ runs: GoogleCalendarSyncRunSummary[] }>(
    `/google-calendar/sync-runs?limit=${limit}`,
    { accessToken },
  );
  return data.runs;
}

export async function fetchUnifiedCalendar(
  accessToken: string,
  from: string,
  to: string,
): Promise<GoogleCalendarUnifiedCalendarResponse> {
  const params = new URLSearchParams({ from, to });
  return request<GoogleCalendarUnifiedCalendarResponse>(
    `/google-calendar/calendar?${params.toString()}`,
    { accessToken },
  );
}

export async function fetchGoogleExternalEvents(
  accessToken: string,
  input: { from?: string; to?: string; includeConverted?: boolean } = {},
): Promise<GoogleCalendarExternalEventSummary[]> {
  const params = new URLSearchParams();
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  if (input.includeConverted) params.set('includeConverted', 'true');

  const query = params.toString();
  const data = await request<{ events: GoogleCalendarExternalEventSummary[] }>(
    `/google-calendar/external-events${query ? `?${query}` : ''}`,
    { accessToken },
  );
  return data.events;
}

export async function convertGoogleExternalEvent(
  accessToken: string,
  externalEventId: string,
  body: GoogleCalendarConvertEventRequest,
): Promise<GoogleCalendarExternalEventSummary> {
  const data = await request<{ event: GoogleCalendarExternalEventSummary }>(
    `/google-calendar/external-events/${externalEventId}/convert`,
    { method: 'POST', accessToken, body },
  );
  return data.event;
}

export async function dismissGoogleExternalEvent(
  accessToken: string,
  externalEventId: string,
): Promise<void> {
  await request<void>(`/google-calendar/external-events/${externalEventId}/dismiss`, {
    method: 'POST',
    accessToken,
  });
}

export async function fetchGoogleCalendarConflicts(
  accessToken: string,
  includeResolved = false,
): Promise<GoogleCalendarConflictSummary[]> {
  const data = await request<{ conflicts: GoogleCalendarConflictSummary[] }>(
    `/google-calendar/conflicts${includeResolved ? '?includeResolved=true' : ''}`,
    { accessToken },
  );
  return data.conflicts;
}

export async function resolveGoogleCalendarConflict(
  accessToken: string,
  conflictId: string,
  body: { status: 'acknowledged' | 'resolved' | 'dismissed'; note?: string | null },
): Promise<GoogleCalendarConflictSummary> {
  const data = await request<{ conflict: GoogleCalendarConflictSummary }>(
    `/google-calendar/conflicts/${conflictId}/resolve`,
    { method: 'POST', accessToken, body },
  );
  return data.conflict;
}

export async function setGoogleCalendarTechnicianMapping(
  accessToken: string,
  body: { userId: string; calendarId: string; pushAssignedJobs?: boolean },
): Promise<GoogleCalendarTechnicianMapping[]> {
  const data = await request<{ mappings: GoogleCalendarTechnicianMapping[] }>(
    '/google-calendar/technician-mappings',
    { method: 'PUT', accessToken, body },
  );
  return data.mappings;
}

export async function removeGoogleCalendarTechnicianMapping(
  accessToken: string,
  mappingId: string,
): Promise<GoogleCalendarTechnicianMapping[]> {
  const data = await request<{ mappings: GoogleCalendarTechnicianMapping[] }>(
    `/google-calendar/technician-mappings/${mappingId}`,
    { method: 'DELETE', accessToken },
  );
  return data.mappings;
}
