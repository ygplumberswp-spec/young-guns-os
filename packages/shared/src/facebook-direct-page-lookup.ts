import { FACEBOOK_GRAPH_VERSION } from './facebook-business.js';
import { rowMatchesYoungGunsPageName } from './facebook-page-discovery.js';

/**
 * Meta documented specific-Page lookup (J-6.7F3).
 *
 * Identity probe:  GET /{page-id}?fields=id,name
 * Page-token probe: GET /{page-id}?fields=id,name,access_token
 *
 * The `tasks` field belongs to /me/accounts list responses and must not be
 * requested on direct Page-object lookups.
 */

export const YOUNG_GUNS_FACEBOOK_PAGE_ID = '61564442420962';
export const YOUNG_GUNS_FACEBOOK_PAGE_NAME = 'Young Guns Plumbing – Cape Town';

/** Stage 1 — confirm Page object identity only. */
export const FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS = 'id,name';

/** Stage 2 — request Page access token (documented Meta contract). */
export const FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS = 'id,name,access_token';

/** @deprecated Use FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS — kept for import compatibility. */
export const FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS = FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS;

export type FacebookDirectPageLookupStatusCode =
  | 'DIRECT_PAGE_LOOKUP_READY'
  | 'DIRECT_PAGE_IDENTITY_AVAILABLE'
  | 'DIRECT_PAGE_TOKEN_AVAILABLE'
  | 'DIRECT_PAGE_TOKEN_UNAVAILABLE'
  | 'DIRECT_PAGE_PERMISSION_DENIED'
  | 'DIRECT_PAGE_NOT_FOUND'
  | 'DIRECT_PAGE_INVALID_FIELD'
  | 'FACEBOOK_PAGE_OBJECT_INACCESSIBLE'
  | 'DIRECT_PAGE_LOOKUP_FAILED'
  | 'PAGE_IDENTITY_MISMATCH';

export type FacebookDirectPageProviderMessageClassification =
  | 'unsupported_request'
  | 'invalid_field'
  | 'missing_permission_or_feature'
  | 'object_not_found_or_inaccessible'
  | 'object_inaccessible'
  | 'unknown_invalid_request';

/** Meta Graph error subcode when a Page object exists but is inaccessible to the user token. */
export const FACEBOOK_PAGE_OBJECT_INACCESSIBLE_SUBCODE = 33;

export type FacebookPendingPageCandidate = {
  pageId: string;
  pageName: string;
  source: 'tenant_known_page' | 'connection_metadata';
};

export type FacebookDirectPageLookupProbeResult = {
  fields: string;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  providerFailed: boolean;
  providerMessageClassification: FacebookDirectPageProviderMessageClassification | null;
  raw: FacebookDirectPageLookupRaw | null;
  skipped?: boolean;
};

export type FacebookDirectPageLookupSanitized = {
  status: FacebookDirectPageLookupStatusCode;
  detail: string;
  graphVersion: string;
  endpoint: string;
  /** Token-probe fields (legacy `fields` key). */
  fields: string;
  identityProbeFields: string;
  tokenProbeFields: string;
  identityProbeHttpStatus: number;
  tokenProbeHttpStatus: number | null;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  providerMessageClassification: FacebookDirectPageProviderMessageClassification | null;
  hasId: boolean;
  hasName: boolean;
  nameMatches: boolean;
  idMatches: boolean;
  hasAccessToken: boolean;
  /** True only when Meta returned tasks from /me/accounts — never from direct lookup. */
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
  /** Populated only when merged from /me/accounts — not requested on direct lookup. */
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

export function isFacebookPageObjectInaccessibleError(input: {
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
}): boolean {
  return (
    input.providerErrorCode === 100 &&
    input.providerErrorSubcode === FACEBOOK_PAGE_OBJECT_INACCESSIBLE_SUBCODE
  );
}

export function classifyFacebookDirectPageProviderMessage(input: {
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode?: number | null;
  providerErrorType: string | null;
  providerErrorMessage?: string | null;
  probe: 'identity' | 'token';
}): FacebookDirectPageProviderMessageClassification {
  const message = (input.providerErrorMessage ?? '').toLowerCase();
  const code = input.providerErrorCode;
  const subcode = input.providerErrorSubcode ?? null;

  if (isFacebookPageObjectInaccessibleError({ providerErrorCode: code, providerErrorSubcode: subcode })) {
    return 'object_inaccessible';
  }

  if (code === 803 || input.httpStatus === 404) {
    return 'object_not_found_or_inaccessible';
  }

  if (
    input.providerErrorType === 'permission' ||
    (code !== null && (code === 10 || (code >= 200 && code <= 299))) ||
    input.httpStatus === 403
  ) {
    return 'missing_permission_or_feature';
  }

  if (code === 100) {
    if (
      message.includes('nonexisting field') ||
      message.includes('unknown field') ||
      message.includes('invalid field') ||
      message.includes('field') ||
      input.probe === 'token'
    ) {
      return 'invalid_field';
    }
    return 'unknown_invalid_request';
  }

  if (message.includes('unsupported get request') || message.includes('unsupported post request')) {
    return 'unsupported_request';
  }

  if (input.httpStatus === 400 || input.providerErrorType === 'invalid_request') {
    return 'unknown_invalid_request';
  }

  return 'unknown_invalid_request';
}

function resolveProbeFailureStatus(input: {
  candidate: FacebookPendingPageCandidate;
  probe: FacebookDirectPageLookupProbeResult;
  stage: 'identity' | 'token';
}): Pick<FacebookDirectPageLookupSanitized, 'status' | 'detail' | 'selectable'> | null {
  if (!input.probe.providerFailed) return null;

  const classification = input.probe.providerMessageClassification;
  const code = input.probe.providerErrorCode;

  if (
    classification === 'object_inaccessible' ||
    isFacebookPageObjectInaccessibleError({
      providerErrorCode: code,
      providerErrorSubcode: input.probe.providerErrorSubcode,
    })
  ) {
    return {
      status: 'FACEBOOK_PAGE_OBJECT_INACCESSIBLE',
      detail:
        'Meta could not load this Page using the current user token. The Page may belong to a Business Portfolio that has not been granted to TITAN.',
      selectable: false,
    };
  }

  if (classification === 'invalid_field') {
    return {
      status: 'DIRECT_PAGE_INVALID_FIELD',
      detail:
        input.stage === 'identity'
          ? 'Meta rejected a field on the identity probe (id,name). This is not proof that business_management is required, that the user does not administer the Page, or that the Page does not exist.'
          : 'Meta rejected a field on the Page-token probe (id,name,access_token). The access_token field may require additional Meta approval — this is separate from an invalid Page id.',
      selectable: false,
    };
  }

  if (code === 100) {
    return {
      status: 'DIRECT_PAGE_LOOKUP_FAILED',
      detail:
        'Meta returned an invalid request for this Page lookup. Retry after confirming Business Integrations access.',
      selectable: false,
    };
  }

  if (
    classification === 'missing_permission_or_feature' ||
    input.probe.providerErrorType === 'permission' ||
    input.probe.httpStatus === 403
  ) {
    return {
      status: 'DIRECT_PAGE_PERMISSION_DENIED',
      detail:
        input.stage === 'token'
          ? 'Meta denied the access_token field on direct Page lookup. Review Business Integrations asset grants — this does not automatically mean business_management is required.'
          : 'Meta denied direct Page identity lookup for this user token. Review Business Integrations access for this app — this does not automatically mean business_management is required.',
      selectable: false,
    };
  }

  if (classification === 'object_not_found_or_inaccessible' || code === 803 || input.probe.httpStatus === 404) {
    return {
      status: 'DIRECT_PAGE_NOT_FOUND',
      detail:
        'Meta did not return the Page object for this id with the authenticated user token. Confirm the Page id and Business Integrations access — this is not automatic proof the Page does not exist.',
      selectable: false,
    };
  }

  if (classification === 'unsupported_request') {
    return {
      status: 'DIRECT_PAGE_LOOKUP_FAILED',
      detail:
        'Meta returned an unsupported request for this Page lookup. Retry after confirming Business Integrations access.',
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

export function resolveFacebookDirectPageLookupStatus(input: {
  candidate: FacebookPendingPageCandidate;
  identityProbe: FacebookDirectPageLookupProbeResult;
  tokenProbe: FacebookDirectPageLookupProbeResult;
}): Pick<FacebookDirectPageLookupSanitized, 'status' | 'detail' | 'selectable'> {
  const identityFailure = resolveProbeFailureStatus({
    candidate: input.candidate,
    probe: input.identityProbe,
    stage: 'identity',
  });
  if (identityFailure) return identityFailure;

  const identityRaw = input.identityProbe.raw;
  const hasId = Boolean(identityRaw?.id);
  const hasName = Boolean(identityRaw?.name);
  const idMatches = identityRaw?.id === input.candidate.pageId;
  const nameMatches = facebookPageNamesMatch(input.candidate.pageName, identityRaw?.name);

  if (!hasId && !hasName) {
    return {
      status: 'DIRECT_PAGE_NOT_FOUND',
      detail:
        'Meta returned an empty Page node on the identity probe. The Page may not be visible to this user token.',
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

  if (input.tokenProbe.skipped) {
    return {
      status: 'DIRECT_PAGE_LOOKUP_FAILED',
      detail:
        'Meta identity probe did not complete successfully enough to run the Page-token probe.',
      selectable: false,
    };
  }

  const tokenFailure = resolveProbeFailureStatus({
    candidate: input.candidate,
    probe: input.tokenProbe,
    stage: 'token',
  });
  if (tokenFailure) return tokenFailure;

  const tokenRaw = input.tokenProbe.raw;
  const hasAccessToken = Boolean(tokenRaw?.access_token);

  if (!hasAccessToken) {
    return {
      status: 'DIRECT_PAGE_TOKEN_UNAVAILABLE',
      detail:
        'Meta confirmed the expected Page id and name, but the Page-token probe did not return an access_token. Review Business Integrations asset selection before assuming any additional permission is required.',
      selectable: false,
    };
  }

  const tokenIdMatches = tokenRaw?.id === input.candidate.pageId;
  const tokenNameMatches = facebookPageNamesMatch(input.candidate.pageName, tokenRaw?.name);
  if (!tokenIdMatches || !tokenNameMatches) {
    return {
      status: 'PAGE_IDENTITY_MISMATCH',
      detail:
        'Meta returned a Page token response that does not match the server-controlled candidate id and name. Selection is blocked.',
      selectable: false,
    };
  }

  return {
    status: 'DIRECT_PAGE_TOKEN_AVAILABLE',
    detail: 'Meta returned the expected Page with a usable Page access token. The Owner may confirm this Page to finish the connection.',
    selectable: true,
  };
}

function enrichProbe(
  probe: Omit<FacebookDirectPageLookupProbeResult, 'providerMessageClassification'> & {
    providerMessageClassification?: FacebookDirectPageProviderMessageClassification | null;
  },
  stage: 'identity' | 'token',
): FacebookDirectPageLookupProbeResult {
  return {
    ...probe,
    providerMessageClassification:
      probe.providerMessageClassification ??
      (probe.providerFailed
        ? classifyFacebookDirectPageProviderMessage({
            httpStatus: probe.httpStatus,
            providerErrorCode: probe.providerErrorCode,
            providerErrorSubcode: probe.providerErrorSubcode,
            providerErrorType: probe.providerErrorType,
            probe: stage,
          })
        : null),
  };
}

export function buildFacebookDirectPageLookupSanitized(input: {
  candidate: FacebookPendingPageCandidate;
  identityProbe: FacebookDirectPageLookupProbeResult;
  tokenProbe: FacebookDirectPageLookupProbeResult;
}): FacebookDirectPageLookupSanitized {
  const identityProbe = enrichProbe(input.identityProbe, 'identity');
  const tokenProbe = enrichProbe(input.tokenProbe, 'token');

  const mergedRaw: FacebookDirectPageLookupRaw | null = tokenProbe.raw ?? identityProbe.raw;
  const resolved = resolveFacebookDirectPageLookupStatus({
    candidate: input.candidate,
    identityProbe,
    tokenProbe,
  });

  const primaryProbe = tokenProbe.skipped ? identityProbe : tokenProbe;
  const classification =
    primaryProbe.providerMessageClassification ??
    identityProbe.providerMessageClassification ??
    tokenProbe.providerMessageClassification;

  return {
    status: resolved.status,
    detail: resolved.detail,
    graphVersion: FACEBOOK_GRAPH_VERSION,
    endpoint: `/${input.candidate.pageId}`,
    fields: FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
    identityProbeFields: identityProbe.fields,
    tokenProbeFields: tokenProbe.fields,
    identityProbeHttpStatus: identityProbe.httpStatus,
    tokenProbeHttpStatus: tokenProbe.skipped ? null : tokenProbe.httpStatus,
    httpStatus: primaryProbe.httpStatus,
    providerErrorCode: primaryProbe.providerErrorCode,
    providerErrorSubcode: primaryProbe.providerErrorSubcode,
    providerErrorType: primaryProbe.providerErrorType,
    providerMessageClassification: classification,
    hasId: Boolean(mergedRaw?.id),
    hasName: Boolean(mergedRaw?.name),
    nameMatches: facebookPageNamesMatch(input.candidate.pageName, mergedRaw?.name),
    idMatches: mergedRaw?.id === input.candidate.pageId,
    hasAccessToken: Boolean(tokenProbe.raw?.access_token),
    hasTasks: false,
    taskCount: 0,
    candidatePageId: input.candidate.pageId,
    candidatePageName: input.candidate.pageName,
    returnedPageId: mergedRaw?.id ?? null,
    returnedPageName: mergedRaw?.name ?? null,
    selectable: resolved.selectable,
  };
}

/** @deprecated Use buildFacebookDirectPageLookupSanitized with identityProbe + tokenProbe. */
export function buildFacebookDirectPageLookupSanitizedLegacy(input: {
  candidate: FacebookPendingPageCandidate;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  providerFailed: boolean;
  raw: FacebookDirectPageLookupRaw | null;
}): FacebookDirectPageLookupSanitized {
  const identityProbe: FacebookDirectPageLookupProbeResult = {
    fields: FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorSubcode: input.providerErrorSubcode,
    providerErrorType: input.providerErrorType,
    providerFailed: input.providerFailed,
    providerMessageClassification: input.providerFailed
      ? classifyFacebookDirectPageProviderMessage({
          httpStatus: input.httpStatus,
          providerErrorCode: input.providerErrorCode,
          providerErrorType: input.providerErrorType,
          probe: 'identity',
        })
      : null,
    raw: input.raw ? { id: input.raw.id, name: input.raw.name } : null,
  };

  const tokenProbe: FacebookDirectPageLookupProbeResult = {
    fields: FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorSubcode: input.providerErrorSubcode,
    providerErrorType: input.providerErrorType,
    providerFailed: input.providerFailed,
    providerMessageClassification: input.providerFailed
      ? classifyFacebookDirectPageProviderMessage({
          httpStatus: input.httpStatus,
          providerErrorCode: input.providerErrorCode,
          providerErrorType: input.providerErrorType,
          probe: 'token',
        })
      : null,
    raw: input.raw,
    skipped: input.providerFailed,
  };

  return buildFacebookDirectPageLookupSanitized({
    candidate: input.candidate,
    identityProbe,
    tokenProbe,
  });
}

export function mapFacebookGraphDirectLookupToProbes(input: {
  identityProbe: {
    raw: FacebookDirectPageLookupRaw | null;
    httpStatus: number;
    fields: string;
    providerError: {
      code: number | null;
      subcode: number | null;
      type: string | null;
      message: string;
    } | null;
  };
  tokenProbe: {
    raw: FacebookDirectPageLookupRaw | null;
    httpStatus: number;
    fields: string;
    skipped: boolean;
    providerError: {
      code: number | null;
      subcode: number | null;
      type: string | null;
      message: string;
    } | null;
  };
}): {
  identityProbe: FacebookDirectPageLookupProbeResult;
  tokenProbe: FacebookDirectPageLookupProbeResult;
} {
  const toProbe = (
    stage: 'identity' | 'token',
    probe: {
      raw: FacebookDirectPageLookupRaw | null;
      httpStatus: number;
      fields: string;
      providerError: {
        code: number | null;
        subcode: number | null;
        type: string | null;
        message: string;
      } | null;
      skipped?: boolean;
    },
  ): FacebookDirectPageLookupProbeResult => {
    const providerFailed = Boolean(probe.providerError);
    return {
      fields: probe.fields,
      httpStatus: probe.httpStatus,
      providerErrorCode: probe.providerError?.code ?? null,
      providerErrorSubcode: probe.providerError?.subcode ?? null,
      providerErrorType: probe.providerError?.type ?? null,
      providerFailed,
      providerMessageClassification: providerFailed
        ? classifyFacebookDirectPageProviderMessage({
            httpStatus: probe.httpStatus,
            providerErrorCode: probe.providerError?.code ?? null,
            providerErrorSubcode: probe.providerError?.subcode ?? null,
            providerErrorType: probe.providerError?.type ?? null,
            providerErrorMessage: probe.providerError?.message ?? null,
            probe: stage,
          })
        : null,
      raw: probe.raw,
      skipped: probe.skipped,
    };
  };

  return {
    identityProbe: toProbe('identity', input.identityProbe),
    tokenProbe: toProbe('token', input.tokenProbe),
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
  DIRECT_PAGE_IDENTITY_AVAILABLE: 'Direct Page identity available',
  DIRECT_PAGE_TOKEN_AVAILABLE: 'Direct Page token available',
  DIRECT_PAGE_TOKEN_UNAVAILABLE: 'Direct Page token unavailable',
  DIRECT_PAGE_PERMISSION_DENIED: 'Direct Page permission denied',
  DIRECT_PAGE_NOT_FOUND: 'Direct Page not found',
  DIRECT_PAGE_INVALID_FIELD: 'Direct Page invalid field',
  FACEBOOK_PAGE_OBJECT_INACCESSIBLE: 'Page object inaccessible',
  DIRECT_PAGE_LOOKUP_FAILED: 'Direct Page lookup failed',
  PAGE_IDENTITY_MISMATCH: 'Page identity mismatch',
};
