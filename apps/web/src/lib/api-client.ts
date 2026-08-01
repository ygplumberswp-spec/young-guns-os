import type { ApiResponse, AuthSession, AuthUser, StaffSessionSummary } from '@titan/shared';
import { isApiError } from '@titan/shared';
import { resolveApiBase } from './runtime-env';
import { publishStaffSessionEvent, withCrossTabRefreshLock } from './session-sync';

/** Resolve per-call so `/runtime-config.js` can force same-origin `/api/v1`. */
function apiBase(): string {
  return resolveApiBase();
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

function combineSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal != null);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  return controller.signal;
}

type RefreshOutcome =
  | { status: 'refreshed'; session: AuthSession; user: AuthUser }
  | { status: 'expired' }
  | { status: 'unreachable' }
  | { status: 'missing' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload) ? payload.error.message : 'Request failed';
    throw new ApiClientError(
      message,
      response.status,
      isApiError(payload) ? payload.error.code : 'REQUEST_FAILED',
    );
  }

  return payload.data;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const body = options.body ? JSON.stringify(options.body) : undefined;
  // Only set Content-Type when sending a body — otherwise every GET triggers a CORS preflight.
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const signal = combineSignals([
    options.signal,
    options.timeoutMs ? timeoutSignal(options.timeoutMs) : undefined,
  ]);

  const base = apiBase();
  const url = `${base}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body,
      signal,
    });
  } catch (error) {
    const aborted =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError');
    if (aborted) {
      throw new ApiClientError('Request timed out', 408, 'REQUEST_TIMEOUT');
    }
    throw new ApiClientError(
      base.startsWith('/')
        ? 'Cannot reach the API from this UI deploy. Set API_PROXY_UPSTREAM on the web service (or VITE_API_BASE_URL) and redeploy.'
        : 'Cannot reach the TITAN API. Check VITE_API_BASE_URL, API uptime, and that API APP_URL matches this web origin (CORS).',
      0,
      'NETWORK_ERROR',
    );
  }

  if (response.status === 401 && !options.skipAuthRefresh && options.accessToken) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return request<T>(path, {
        ...options,
        accessToken: refreshed.accessToken,
        skipAuthRefresh: true,
      });
    }
  }

  try {
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      'API returned an unexpected response. Confirm the web /api proxy or VITE_API_BASE_URL points at the API service.',
      response.status || 0,
      'INVALID_API_RESPONSE',
    );
  }
}

async function executeRefreshRequest(): Promise<RefreshOutcome> {
  try {
    const response = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.status === 401) {
      let code = '';
      try {
        const payload = (await response.json()) as { error?: { code?: string } };
        code = String(payload?.error?.code ?? '');
      } catch {
        code = '';
      }
      if (code === 'SESSION_MISSING') {
        return { status: 'missing' };
      }
      publishStaffSessionEvent({ type: 'session_expired' });
      return { status: 'expired' };
    }

    if (response.status >= 500) {
      return { status: 'unreachable' };
    }

    if (!response.ok) {
      publishStaffSessionEvent({ type: 'session_expired' });
      return { status: 'expired' };
    }

    const data = await parseResponse<{ user: AuthUser; session: AuthSession }>(response);
    publishStaffSessionEvent({
      type: 'refresh',
      accessToken: data.session.accessToken,
      expiresIn: data.session.expiresIn,
    });
    return { status: 'refreshed', session: data.session, user: data.user };
  } catch {
    return { status: 'unreachable' };
  }
}

export type ProactiveRefreshResult = RefreshOutcome['status'];

async function refreshAccessToken(): Promise<AuthSession | null> {
  const result = await proactiveRefreshSession();
  return result.status === 'refreshed' ? result.session : null;
}

/** Cookie-based refresh with explicit outcome for silent renewal and session UX. */
export async function proactiveRefreshSession(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const session = await withCrossTabRefreshLock(async () => {
          const outcome = await executeRefreshRequest();
          return outcome.status === 'refreshed' ? outcome.session : null;
        });
        if (session) {
          return { status: 'refreshed' as const, session, user: {} as AuthUser };
        }
        return executeRefreshRequest();
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export type AuthPayload = {
  user: AuthUser;
  session: AuthSession;
};

export type LoginMfaChallenge = {
  mfaRequired: true;
  mfaChallengeToken: string;
  expiresIn: number;
};

export type LoginResponse = AuthPayload | LoginMfaChallenge;

export function isLoginMfaChallenge(value: LoginResponse): value is LoginMfaChallenge {
  return (
    'mfaRequired' in value &&
    value.mfaRequired === true &&
    typeof value.mfaChallengeToken === 'string' &&
    value.mfaChallengeToken.length > 0
  );
}

export const MFA_CHALLENGE_STORAGE_KEY = 'titan_mfa_challenge';
export const MFA_LOGIN_REDIRECT_PATH = '/auth/mfa?required=1';

export type RestoreSessionResult =
  | { status: 'authenticated'; payload: AuthPayload }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'unreachable' };

/**
 * Maps `/auth/refresh` HTTP outcomes to bootstrap state for ProtectedRoute.
 * Keeps first visits (`SESSION_MISSING`) distinct from true expiry rejections.
 */
export function classifyRestoreSessionRefresh(
  httpStatus: number,
  errorCode?: string | null,
): Exclude<RestoreSessionResult, { status: 'authenticated' }>['status'] {
  if (httpStatus === 401) {
    return errorCode === 'SESSION_MISSING' ? 'missing' : 'expired';
  }
  if (httpStatus >= 500) {
    return 'unreachable';
  }
  return 'expired';
}

export async function signup(body: {
  companyName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthPayload> {
  return request<AuthPayload>('/auth/signup', {
    method: 'POST',
    body,
    skipAuthRefresh: true,
  });
}

export async function login(body: { email: string; password: string }): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body,
    skipAuthRefresh: true,
  });
}

export async function completeLoginMfa(body: {
  mfaChallengeToken: string;
  code: string;
}): Promise<AuthPayload> {
  return request<AuthPayload>('/auth/login/mfa', {
    method: 'POST',
    body,
    skipAuthRefresh: true,
  });
}

export async function logout(): Promise<void> {
  await request<{ success: boolean }>('/auth/logout', {
    method: 'POST',
    skipAuthRefresh: true,
  });
}

export async function fetchCurrentUser(accessToken?: string | null): Promise<AuthUser | null> {
  try {
    if (!accessToken) {
      const refreshed = await refreshAccessToken();

      if (!refreshed) {
        return null;
      }

      accessToken = refreshed.accessToken;
    }

    const data = await request<{ user: AuthUser }>('/auth/me', {
      accessToken,
      skipAuthRefresh: true,
    });

    return data.user;
  } catch {
    return null;
  }
}

/**
 * Attempt cookie-based session restore.
 * Distinguishes missing cookie vs rejected/expired token vs network failure so
 * ProtectedRoute does not mislabel first visits as "session expired".
 */
export async function restoreSession(): Promise<RestoreSessionResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    return { status: 'unreachable' };
  }

  if (response.status === 401) {
    let code = '';
    try {
      const payload = (await response.json()) as { error?: { code?: string } };
      code = String(payload?.error?.code ?? '');
    } catch {
      code = '';
    }
    return { status: classifyRestoreSessionRefresh(response.status, code) };
  }

  if (!response.ok) {
    return { status: classifyRestoreSessionRefresh(response.status) };
  }

  try {
    const payload = await parseResponse<AuthPayload>(response);
    publishStaffSessionEvent({
      type: 'refresh',
      accessToken: payload.session.accessToken,
      expiresIn: payload.session.expiresIn,
    });
    return { status: 'authenticated', payload };
  } catch {
    return { status: 'expired' };
  }
}

export async function fetchMySessions(accessToken: string): Promise<StaffSessionSummary[]> {
  const data = await request<{ sessions: StaffSessionSummary[] }>('/auth/sessions', { accessToken });
  return data.sessions;
}

export async function revokeMySession(accessToken: string, sessionId: string): Promise<void> {
  await request<{ success: boolean }>(`/auth/sessions/${sessionId}/revoke`, {
    method: 'POST',
    accessToken,
    skipAuthRefresh: true,
  });
}

export async function revokeAllOtherMySessions(accessToken: string): Promise<number> {
  const data = await request<{ success: boolean; revokedCount: number }>('/auth/sessions/revoke-others', {
    method: 'POST',
    accessToken,
    skipAuthRefresh: true,
  });
  return data.revokedCount;
}

export async function confirmStepUp(accessToken: string, password: string): Promise<{ stepUpToken: string; expiresIn: number }> {
  return request<{ stepUpToken: string; expiresIn: number }>('/auth/step-up', {
    method: 'POST',
    accessToken,
    body: { password },
    skipAuthRefresh: true,
  });
}
