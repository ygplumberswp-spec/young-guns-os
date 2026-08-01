import { toAppAbsoluteHref } from './nested-routing.js';
import { appendStaffAuthReturnQuery } from './staff-auth-return-routing.js';

/** Query param on `/auth/login` that shows the session-expired banner. */
export const SESSION_EXPIRED_LOGIN_REASON = 'session_expired';

export const SESSION_EXPIRED_LOGIN_PATH = `/auth/login?reason=${SESSION_EXPIRED_LOGIN_REASON}`;
export const PLAIN_LOGIN_PATH = '/auth/login';
export const SESSION_EXPIRED_PAGE_PATH = '/auth/session-expired';

export type StaffSessionBootstrapRedirect =
  | 'loading'
  | 'authenticated'
  | 'missing'
  | 'expired'
  | 'unreachable';

/**
 * Protected staff routes redirect here when bootstrap finishes unauthenticated.
 * Only true refresh rejections carry the session-expired reason — first visits stay plain.
 */
export function staffLoginRedirectPath(
  sessionBootstrap: StaffSessionBootstrapRedirect,
  returnPath?: string | null,
): string {
  const base = sessionBootstrap === 'expired' ? SESSION_EXPIRED_LOGIN_PATH : PLAIN_LOGIN_PATH;
  return returnPath ? appendStaffAuthReturnQuery(base, returnPath) : base;
}

export function staffLoginRedirectHref(
  sessionBootstrap: StaffSessionBootstrapRedirect,
  returnPath?: string | null,
): string {
  return toAppAbsoluteHref(staffLoginRedirectPath(sessionBootstrap, returnPath));
}

export function isSessionExpiredLoginReason(reason: string | null | undefined): boolean {
  return reason === SESSION_EXPIRED_LOGIN_REASON;
}
