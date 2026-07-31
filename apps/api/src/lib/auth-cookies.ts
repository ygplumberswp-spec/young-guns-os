import type { CookieOptions } from 'express';

/**
 * Refresh-token cookie options for staff/portal auth.
 *
 * Railway (and other split web/API hosts) are cross-site. Browsers reject
 * `SameSite=Strict`/`Lax` cookies on credentialed cross-origin responses, so
 * production must use `SameSite=None; Secure` or session restore always fails.
 */
export function buildRefreshCookieOptions(
  isProduction: boolean,
  path: string,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
