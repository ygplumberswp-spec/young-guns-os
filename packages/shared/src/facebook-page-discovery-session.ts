/** Short-lived server-issued discovery session for basic Page selection (J-6.7F11). */
export const FACEBOOK_PAGE_DISCOVERY_SESSION_TTL_MS = 15 * 60 * 1000;

export type FacebookPageDiscoverySessionRow = {
  id: string;
  name: string;
  accessToken: string;
  category: string | null;
  source: 'me_accounts' | 'business_portfolio';
};

export type FacebookPageDiscoverySessionPayload = {
  version: 1;
  sessionId: string;
  companyId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  configuredAppId: string;
  tokenAppId: string | null;
  tokenValid: boolean | null;
  rows: FacebookPageDiscoverySessionRow[];
};

export type FacebookPageDiscoverySessionSanitized = {
  sessionId: string;
  issuedAt: string;
  expiresAt: string;
  rowCount: number;
  selectableRowCount: number;
  tokenAppIdPresent: boolean;
  tokenValid: boolean | null;
};

export function sanitizeFacebookPageDiscoverySession(
  payload: FacebookPageDiscoverySessionPayload,
): FacebookPageDiscoverySessionSanitized {
  return {
    sessionId: payload.sessionId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    rowCount: payload.rows.length,
    selectableRowCount: payload.rows.filter((row) => row.id && row.name && row.accessToken).length,
    tokenAppIdPresent: Boolean(payload.tokenAppId),
    tokenValid: payload.tokenValid,
  };
}

export function assertDiscoverySessionBinding(input: {
  payload: FacebookPageDiscoverySessionPayload;
  companyId: string;
  userId: string;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.now ?? new Date();
  if (input.payload.companyId !== input.companyId) {
    return { ok: false, reason: 'That Page discovery session belongs to a different company.' };
  }
  if (input.payload.userId !== input.userId) {
    return { ok: false, reason: 'That Page discovery session belongs to a different user.' };
  }
  if (new Date(input.payload.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: 'Page selection expired. Choose Page again.' };
  }
  if (input.payload.tokenValid === false) {
    return { ok: false, reason: 'The Facebook user token is no longer valid. Reconnect Facebook and try again.' };
  }
  return { ok: true };
}

export function resolveSelectableRowFromDiscoverySession(input: {
  payload: FacebookPageDiscoverySessionPayload;
  pageId: string;
}): { ok: true; row: FacebookPageDiscoverySessionRow } | { ok: false; reason: string } {
  const normalized = input.pageId.trim();
  const row = input.payload.rows.find((entry) => entry.id === normalized);
  if (!row) {
    return {
      ok: false,
      reason: 'That Page id is not among the Pages Meta returned for this Facebook account.',
    };
  }
  if (!row.name?.trim()) {
    return { ok: false, reason: 'Meta returned an incomplete /me/accounts Page row (missing name).' };
  }
  if (!row.accessToken?.trim()) {
    return {
      ok: false,
      reason: 'Meta did not return a Page access token for the selected Page row.',
    };
  }
  return { ok: true, row };
}

export const FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE =
  'Page selected from Meta discovery. Grant Page read access to verify Page details and enable read features.';
