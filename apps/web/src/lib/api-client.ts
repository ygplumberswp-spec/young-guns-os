import type { ApiResponse, AuthSession, AuthUser } from '@titan/shared';
import { isApiError } from '@titan/shared';
import { resolveApiBase } from './runtime-env';

const API_BASE = resolveApiBase();

type RequestOptions = {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
  signal?: AbortSignal | null;
  timeoutMs?: number;
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

let refreshPromise: Promise<AuthSession | null> | null = null;

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

  const signal = combineSignals([
    options.signal,
    options.timeoutMs ? timeoutSignal(options.timeoutMs) : undefined,
  ]);

  const url = `${API_BASE}${path}`;
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
      API_BASE.startsWith('/')
        ? 'Cannot reach the API from this UI deploy. Set VITE_API_BASE_URL to the public API origin and rebuild the web app.'
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
      'API returned an unexpected response. Confirm VITE_API_BASE_URL points at the Railway API service.',
      response.status || 0,
      'INVALID_API_RESPONSE',
    );
  }
}

async function refreshAccessToken(): Promise<AuthSession | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          return null;
        }

        const data = await parseResponse<{ user: AuthUser; session: AuthSession }>(response);
        return data.session;
      } catch {
        return null;
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

export async function login(body: { email: string; password: string }): Promise<AuthPayload> {
  return request<AuthPayload>('/auth/login', {
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

export async function restoreSession(): Promise<AuthPayload | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  return parseResponse<AuthPayload>(response);
}
