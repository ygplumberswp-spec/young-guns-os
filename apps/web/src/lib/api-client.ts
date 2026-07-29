import type { ApiResponse, AuthSession, AuthUser } from '@titan/shared';
import { isApiError } from '@titan/shared';

const API_BASE = '/api/v1';

type RequestOptions = {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<AuthSession | null> | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload) ? payload.error.message : 'Request failed';
    throw new ApiClientError(message, response.status, isApiError(payload) ? payload.error.code : 'REQUEST_FAILED');
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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

  return parseResponse<T>(response);
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
