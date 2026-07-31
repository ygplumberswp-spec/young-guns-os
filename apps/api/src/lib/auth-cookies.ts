import type { CookieOptions } from 'express';

/**
 * Refresh-token cookie options for staff/portal auth.
 *
 * Staging/production web is served behind a same-origin `/api` nginx proxy, so the
 * browser stores this cookie on the web host. `SameSite=Lax` is correct for that
 * first-party model and avoids third-party/`SameSite=None` cookie restrictions
 * that drop `titan_refresh_token` before `/auth/refresh` can run.
 */
export function buildRefreshCookieOptions(
  isProduction: boolean,
  path: string,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
