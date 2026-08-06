/** Shared secure-session contracts for web + API. */

export type StaffSessionUxState =
  | 'restoring'
  | 'restored'
  | 'connection_lost'
  | 'reconnecting'
  | 'expiring_soon'
  | 'sign_in_again'
  | 'account_locked';

export type StaffSessionSummary = {
  id: string;
  userId: string;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  isTrustedDevice: boolean;
  isCurrent: boolean;
};

export const STAFF_SESSION_SYNC_CHANNEL = 'titan-staff-session';

export type StaffSessionSyncEvent =
  | { type: 'login'; accessToken: string; expiresIn: number }
  | { type: 'logout' }
  | { type: 'refresh'; accessToken: string; expiresIn: number }
  | { type: 'session_expired' };

/** Inactivity warning fires this many ms before access token expiry. */
export const SESSION_EXPIRY_WARNING_MS = 2 * 60 * 1000;

/** Cross-tab refresh lock TTL — prevents duplicate refresh races. */
export const CROSS_TAB_REFRESH_LOCK_MS = 30_000;
