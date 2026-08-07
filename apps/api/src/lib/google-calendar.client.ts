/**
 * Thin Google Calendar v3 client.
 *
 * Never invents calendars or events: a failed call raises, an empty account
 * returns empty. Handles the three things Google actually makes us handle —
 * Retry-After / rate limits, page tokens, and syncToken expiry (410 GONE).
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
};

export type GoogleCalendarEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  transparency?: string;
  visibility?: string;
  sequence?: number;
  updated?: string;
  recurringEventId?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
};

export type GoogleCalendarEventsPage = {
  events: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

export type GoogleCalendarUserInfo = {
  email: string;
  sub?: string;
};

export class GoogleCalendarClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    /** Seconds Google asked us to wait, when it told us. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GoogleCalendarClientError';
  }
}

type FetchLike = typeof fetch;

export class GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getUserInfo(): Promise<GoogleCalendarUserInfo> {
    const payload = await this.requestJson<{ email?: string; sub?: string }>(
      'https://openidconnect.googleapis.com/v1/userinfo',
    );
    if (!payload.email?.trim()) {
      throw new GoogleCalendarClientError(
        'USERINFO_MISSING',
        'Google did not return the account email for this grant.',
      );
    }
    return { email: payload.email.trim(), sub: payload.sub };
  }

  /** Every calendar the grant can see, following pageToken to the end. */
  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const entries: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ maxResults: '250', showHidden: 'false' });
      if (pageToken) params.set('pageToken', pageToken);

      const payload = await this.requestJson<{
        items?: GoogleCalendarListEntry[];
        nextPageToken?: string;
      }>(`${CALENDAR_API_BASE}/users/me/calendarList?${params}`);

      entries.push(...(payload.items ?? []));
      pageToken = payload.nextPageToken;
    } while (pageToken);

    return entries;
  }

  /**
   * One page of events. Pass `syncToken` for an incremental pull, or a
   * `timeMin`/`timeMax` window for the first full pull. Google rejects combining
   * a syncToken with a time window, so callers pick one.
   */
  async listEvents(input: {
    calendarId: string;
    syncToken?: string | null;
    timeMin?: string;
    timeMax?: string;
    pageToken?: string;
    maxResults?: number;
  }): Promise<GoogleCalendarEventsPage> {
    const params = new URLSearchParams({
      maxResults: String(input.maxResults ?? 250),
      singleEvents: 'true',
      showDeleted: 'true',
    });

    if (input.syncToken) {
      params.set('syncToken', input.syncToken);
    } else {
      if (input.timeMin) params.set('timeMin', input.timeMin);
      if (input.timeMax) params.set('timeMax', input.timeMax);
      params.set('orderBy', 'startTime');
    }
    if (input.pageToken) params.set('pageToken', input.pageToken);

    const payload = await this.requestJson<{
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(input.calendarId)}/events?${params}`,
    );

    return {
      events: payload.items ?? [],
      nextPageToken: payload.nextPageToken,
      nextSyncToken: payload.nextSyncToken,
    };
  }

  async getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEvent> {
    return this.requestJson<GoogleCalendarEvent>(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  async createEvent(calendarId: string, body: unknown): Promise<GoogleCalendarEvent> {
    return this.requestJson<GoogleCalendarEvent>(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /**
   * Patch an existing event. `etag` becomes an If-Match precondition so a
   * concurrent Google edit fails loudly (412) instead of being overwritten.
   */
  async patchEvent(
    calendarId: string,
    eventId: string,
    body: unknown,
    etag?: string | null,
  ): Promise<GoogleCalendarEvent> {
    return this.requestJson<GoogleCalendarEvent>(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: etag ? { 'If-Match': etag } : undefined,
      },
    );
  }

  /** Delete is idempotent here: an already-gone event is treated as success. */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const response = await this.request(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );

    if (response.status === 404 || response.status === 410) return;
    if (!response.ok) {
      await this.raiseForResponse(response);
    }
  }

  private async requestJson<T>(
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const response = await this.request(url, init);
    if (!response.ok) {
      await this.raiseForResponse(response);
    }

    if (response.status === 204) {
      return {} as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new GoogleCalendarClientError(
        'INVALID_RESPONSE',
        'Google Calendar returned a response that was not valid JSON.',
        response.status,
      );
    }
  }

  private async request(
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
        body: init.body,
      });
    } catch (error) {
      throw new GoogleCalendarClientError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Google Calendar',
      );
    }
  }

  private async raiseForResponse(response: Response): Promise<never> {
    const text = await response.text().catch(() => '');
    const detail = text ? `: ${text.slice(0, 300)}` : '';

    if (response.status === 401) {
      throw new GoogleCalendarClientError(
        'UNAUTHENTICATED',
        `Google rejected the access token${detail}`,
        401,
      );
    }

    if (response.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(text)) {
      throw new GoogleCalendarClientError(
        'RATE_LIMITED',
        `Google Calendar rate limit reached${detail}`,
        403,
        parseRetryAfter(response),
      );
    }

    if (response.status === 403) {
      throw new GoogleCalendarClientError(
        'FORBIDDEN',
        `Google denied this calendar operation${detail}`,
        403,
      );
    }

    if (response.status === 404) {
      throw new GoogleCalendarClientError('NOT_FOUND', `Google Calendar resource not found${detail}`, 404);
    }

    // Google signals an expired syncToken with 410 GONE — the caller must resync fully.
    if (response.status === 410) {
      throw new GoogleCalendarClientError(
        'SYNC_TOKEN_EXPIRED',
        'Google expired the incremental sync token. A full resync is required.',
        410,
      );
    }

    if (response.status === 412) {
      throw new GoogleCalendarClientError(
        'PRECONDITION_FAILED',
        'The Google event changed since TITAN last read it, so the update was refused.',
        412,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw new GoogleCalendarClientError(
        response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
        `Google Calendar request failed (${response.status})${detail}`,
        response.status,
        parseRetryAfter(response),
      );
    }

    throw new GoogleCalendarClientError(
      'REQUEST_FAILED',
      `Google Calendar request failed (${response.status})${detail}`,
      response.status,
    );
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers?.get?.('Retry-After');
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;

  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return undefined;
}

/** Google `start`/`end` -> absolute instants, flagging all-day entries. */
export function parseGoogleEventWindow(event: GoogleCalendarEvent): {
  startAt: Date | null;
  endAt: Date | null;
  isAllDay: boolean;
} {
  const startDateTime = event.start?.dateTime;
  const endDateTime = event.end?.dateTime;

  if (startDateTime) {
    const startAt = new Date(startDateTime);
    const endAt = endDateTime ? new Date(endDateTime) : null;
    return {
      startAt: Number.isNaN(startAt.getTime()) ? null : startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      isAllDay: false,
    };
  }

  const startDate = event.start?.date;
  if (startDate) {
    const startAt = new Date(`${startDate}T00:00:00.000Z`);
    // Google's all-day `end.date` is exclusive, so it already points at the next day.
    const endAt = event.end?.date ? new Date(`${event.end.date}T00:00:00.000Z`) : null;
    return {
      startAt: Number.isNaN(startAt.getTime()) ? null : startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      isAllDay: true,
    };
  }

  return { startAt: null, endAt: null, isAllDay: false };
}

/** Prefer the Meet link Google puts on conferenceData, falling back to hangoutLink. */
export function extractGoogleMeetLink(event: GoogleCalendarEvent): string | null {
  const entryPoint = event.conferenceData?.entryPoints?.find(
    (point) => point.entryPointType === 'video' && point.uri,
  );
  return entryPoint?.uri ?? event.hangoutLink ?? null;
}
