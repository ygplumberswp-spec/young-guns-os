import { FACEBOOK_GRAPH_VERSION } from './facebook-business.js';
import { rowMatchesYoungGunsPageName } from './facebook-page-discovery.js';

/**
 * Meta documented specific-Page lookup (J-6.7F2).
 *
 * GET /{page-id}?fields=id,name,access_token,tasks
 *
 * Used when /me/accounts returns an empty list but the Owner's Page is known.
 * Page id/name are server-controlled — never accepted from the browser alone.
 */

export const YOUNG_GUNS_FACEBOOK_PAGE_ID = '394603137072407';
export const YOUNG_GUNS_FACEBOOK_PAGE_NAME = 'Young Guns Plumbing – Cape Town';

export const FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS = 'id,name,access_token,tasks';

export type FacebookDirectPageLookupStatusCode =
  | 'DIRECT_PAGE_LOOKUP_READY'
  | 'DIRECT_PAGE_TOKEN_AVAILABLE'
  | 'DIRECT_PAGE_TOKEN_UNAVAILABLE'
  | 'DIRECT_PAGE_PERMISSION_DENIED'
  | 'DIRECT_PAGE_NOT_FOUND'
  | 'DIRECT_PAGE_LOOKUP_FAILED'
  | 'PAGE_IDENTITY_MISMATCH';

export type FacebookPendingPageCandidate = {
  pageId: string;
  pageName: string;
  source: 'tenant_known_page' | 'connection_metadata';
};

export type FacebookDirectPageLookupSanitized = {
  status: FacebookDirectPageLookupStatusCode;
  detail: string;
  graphVersion: string;
  endpoint: string;
  fields: string;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  hasId: boolean;
  hasName: boolean;
  nameMatches: boolean;
  idMatches: boolean;
  hasAccessToken: boolean;
  hasTasks: boolean;
  taskCount: number;
  candidatePageId: string;
  candidatePageName: string;
  returnedPageId: string | null;
  returnedPageName: string | null;
  selectable: boolean;
};

export type FacebookDirectPageLookupRaw = {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
};

export function resolveFacebookPendingPageCandidate(input: {
  companyId: string;
  connectionMetadata?: Record<string, unknown> | null;
  isYoungGunsTenant: boolean;
}): FacebookPendingPageCandidate | null {
  const metadataCandidate = input.connectionMetadata?.pendingPageCandidate;
  if (
    metadataCandidate &&
    typeof metadataCandidate === 'object' &&
    !Array.isArray(metadataCandidate)
  ) {
    const record = metadataCandidate as Record<string, unknown>;
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : '';
    const pageName = typeof record.pageName === 'string' ? record.pageName.trim() : '';
    if (pageId && pageName) {
      return { pageId, pageName, source: 'connection_metadata' };
    }
  }

  if (input.isYoungGunsTenant) {
    return {
      pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      pageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
      source: 'tenant_known_page',
    };
  }

  return null;
}

export function facebookPageNamesMatch(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalise(expected) === normalise(actual);
}

export function assertClientPageIdMatchesPendingCandidate(input: {
  clientPageId: string;
  candidate: FacebookPendingPageCandidate | null;
  listedPageIds: string[];
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.listedPageIds.includes(input.clientPageId)) {
    return { allowed: true };
  }

  if (!input.candidate) {
    return {
      allowed: false,
      reason:
        'That Page id is not among the Pages Meta returned for this account and no server-controlled Page candidate is configured.',
    };
  }

  if (input.clientPageId !== input.candidate.pageId) {
    return {
      allowed: false,
      reason:
        'That Page id does not match the server-controlled pending Page candidate. TITAN does not accept arbitrary Page ids from the browser.',
    };
  }

  return { allowed: true };
}

export function resolveFacebookDirectPageLookupStatus(input: {
  candidate: FacebookPendingPageCandidate;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorType: string | null;
  providerFailed: boolean;
  raw: FacebookDirectPageLookupRaw | null;
}): Pick<FacebookDirectPageLookupSanitized, 'status' | 'detail' | 'selectable'> {
  const raw = input.raw;
  const hasId = Boolean(raw?.id);
  const hasName = Boolean(raw?.name);
  const idMatches = raw?.id === input.candidate.pageId;
  const nameMatches = facebookPageNamesMatch(input.candidate.pageName, raw?.name);
  const hasAccessToken = Boolean(raw?.access_token);

  if (input.providerFailed) {
    if (input.providerErrorType === 'permission' || input.httpStatus === 403) {
      return {
        status: 'DIRECT_PAGE_PERMISSION_DENIED',
        detail:
          'Meta denied direct Page lookup for this user token. This is separate from an empty /me/accounts list — review Business Integrations asset grants and whether business_management is required.',
        selectable: false,
      };
    }
    if (input.httpStatus === 404 || input.providerErrorCode === 803) {
      return {
        status: 'DIRECT_PAGE_NOT_FOUND',
        detail:
          'Meta did not find this Page id for the authenticated user token. Confirm the Page id and that the Owner granted this app access under Business Integrations.',
        selectable: false,
      };
    }
    return {
      status: 'DIRECT_PAGE_LOOKUP_FAILED',
      detail:
        'Meta did not return a successful direct Page lookup. Retry after confirming Business Integrations access; do not assume the account administers no Pages.',
      selectable: false,
    };
  }

  if (!hasId && !hasName) {
    return {
      status: 'DIRECT_PAGE_NOT_FOUND',
      detail:
        'Meta returned an empty Page node for the server-controlled candidate. The Page may not be visible to this user token.',
      selectable: false,
    };
  }

  if (!idMatches || !nameMatches) {
    return {
      status: 'PAGE_IDENTITY_MISMATCH',
      detail:
        'Meta returned a Page that does not match the server-controlled Young Guns Plumbing candidate id and name. Selection is blocked until identity matches.',
      selectable: false,
    };
  }

  if (!hasAccessToken) {
    return {
      status: 'DIRECT_PAGE_TOKEN_UNAVAILABLE',
      detail:
        'Meta returned the expected Page id and name but no Page access token. Business-linked Pages often require business_management and explicit Business Integrations asset selection before Meta exposes a token.',
      selectable: false,
    };
  }

  return {
    status: 'DIRECT_PAGE_TOKEN_AVAILABLE',
    detail: 'Meta returned the expected Page with a usable Page access token. The Owner may confirm this Page to finish the connection.',
    selectable: true,
  };
}

export function buildFacebookDirectPageLookupSanitized(input: {
  candidate: FacebookPendingPageCandidate;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  providerFailed: boolean;
  raw: FacebookDirectPageLookupRaw | null;
}): FacebookDirectPageLookupSanitized {
  const raw = input.raw;
  const tasks = raw?.tasks ?? [];
  const resolved = resolveFacebookDirectPageLookupStatus({
    candidate: input.candidate,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorType: input.providerErrorType,
    providerFailed: input.providerFailed,
    raw,
  });

  return {
    status: resolved.status,
    detail: resolved.detail,
    graphVersion: FACEBOOK_GRAPH_VERSION,
    endpoint: `/${input.candidate.pageId}`,
    fields: FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorSubcode: input.providerErrorSubcode,
    providerErrorType: input.providerErrorType,
    hasId: Boolean(raw?.id),
    hasName: Boolean(raw?.name),
    nameMatches: facebookPageNamesMatch(input.candidate.pageName, raw?.name),
    idMatches: raw?.id === input.candidate.pageId,
    hasAccessToken: Boolean(raw?.access_token),
    hasTasks: tasks.length > 0,
    taskCount: tasks.length,
    candidatePageId: input.candidate.pageId,
    candidatePageName: input.candidate.pageName,
    returnedPageId: raw?.id ?? null,
    returnedPageName: raw?.name ?? null,
    selectable: resolved.selectable,
  };
}

export function youngGunsFacebookPageCandidateForTenant(isYoungGunsTenant: boolean): FacebookPendingPageCandidate | null {
  if (!isYoungGunsTenant) return null;
  return {
    pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
    pageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
    source: 'tenant_known_page',
  };
}

export function directLookupCandidateNameMatchesYoungGuns(name: string | null | undefined): boolean {
  return rowMatchesYoungGunsPageName(name ?? undefined);
}

export const FACEBOOK_DIRECT_PAGE_LOOKUP_STATUS_LABELS: Record<
  FacebookDirectPageLookupStatusCode,
  string
> = {
  DIRECT_PAGE_LOOKUP_READY: 'Direct Page lookup ready',
  DIRECT_PAGE_TOKEN_AVAILABLE: 'Direct Page token available',
  DIRECT_PAGE_TOKEN_UNAVAILABLE: 'Direct Page token unavailable',
  DIRECT_PAGE_PERMISSION_DENIED: 'Direct Page permission denied',
  DIRECT_PAGE_NOT_FOUND: 'Direct Page not found',
  DIRECT_PAGE_LOOKUP_FAILED: 'Direct Page lookup failed',
  PAGE_IDENTITY_MISMATCH: 'Page identity mismatch',
};
