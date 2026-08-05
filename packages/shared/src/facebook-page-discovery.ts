import { FACEBOOK_GRAPH_VERSION } from './facebook-business.js';
import type {
  FacebookDirectPageLookupSanitized,
  FacebookPendingPageCandidate,
} from './facebook-direct-page-lookup.js';

/** Canonical Graph fields for Page discovery (Meta /me/accounts). */
export const FACEBOOK_PAGE_LIST_ENDPOINT = '/me/accounts';
export const FACEBOOK_PAGE_LIST_FIELDS = 'id,name,category,access_token,tasks';

export type FacebookPageDiscoveryStatusCode =
  | 'PAGE_SELECTION_READY'
  | 'META_PAGE_LIST_EMPTY'
  | 'META_PAGE_LIST_FAILED'
  | 'META_PAGE_ROW_INCOMPLETE'
  | 'META_PAGE_TOKEN_UNAVAILABLE'
  | 'META_TOKEN_SCOPE_MISMATCH';

export type FacebookPageDiscoveryRowDiagnostics = {
  hasId: boolean;
  hasName: boolean;
  hasAccessToken: boolean;
  hasTasks: boolean;
  taskCount: number;
  filteredOutByTitan: boolean;
  filterReason: string | null;
};

export type FacebookPageDiscoveryRow = {
  id: string;
  name: string;
  category: string | null;
  tasks: string[];
  selectable: boolean;
  status: FacebookPageDiscoveryStatusCode;
  statusDetail: string;
  diagnostics: FacebookPageDiscoveryRowDiagnostics;
};

export type FacebookPageDiscoveryDiagnosis = {
  graphVersion: string;
  endpoint: string;
  fields: string;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  rawRowCount: number;
  retainedRowCount: number;
  selectableRowCount: number;
  hasPaging: boolean;
  pagingPageCount: number;
  grantedScopes: string[];
  hasPagesShowList: boolean;
  hasBusinessManagement: boolean;
  appIdMatches: boolean;
  tokenValid: boolean | null;
  tokenExpired: boolean | null;
  authenticatedUserIdPresent: boolean;
  youngGunsPageSeenInRawResponse: boolean;
  appliedFilters: string[];
};

export type FacebookPageDiscoveryResult = {
  status: FacebookPageDiscoveryStatusCode;
  detail: string;
  pages: FacebookPageDiscoveryRow[];
  diagnosis: FacebookPageDiscoveryDiagnosis;
  /** Server-controlled candidate used for Meta GET /{page-id} fallback (J-6.7F2). */
  pendingPageCandidate: FacebookPendingPageCandidate | null;
  /** Sanitized direct Page lookup when /me/accounts is empty or unusable. */
  directLookup: FacebookDirectPageLookupSanitized | null;
};

export type RawFacebookAccountRow = {
  id?: string;
  name?: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
};

const YOUNG_GUNS_PAGE_NAME_PATTERN = /young\s*guns/i;

export function rowMatchesYoungGunsPageName(name: string | undefined): boolean {
  return Boolean(name && YOUNG_GUNS_PAGE_NAME_PATTERN.test(name));
}

function rowDiagnostics(raw: RawFacebookAccountRow): FacebookPageDiscoveryRowDiagnostics {
  const tasks = raw.tasks ?? [];
  return {
    hasId: Boolean(raw.id),
    hasName: Boolean(raw.name),
    hasAccessToken: Boolean(raw.access_token),
    hasTasks: tasks.length > 0,
    taskCount: tasks.length,
    filteredOutByTitan: false,
    filterReason: null,
  };
}

/**
 * Maps a provider row to a UI/API row without silently dropping incomplete entries.
 * PROFILE_PLUS_* and legacy task names are accepted; tasks are not required to list.
 */
export function mapRawFacebookAccountRow(
  raw: RawFacebookAccountRow,
  resolvedAccessToken?: string | null,
): FacebookPageDiscoveryRow | null {
  const diagnostics = rowDiagnostics(raw);
  const accessToken = raw.access_token ?? resolvedAccessToken ?? null;
  const tasks = raw.tasks ?? [];

  if (!raw.id) {
    return {
      id: '',
      name: raw.name ?? 'Unknown Page',
      category: raw.category ?? null,
      tasks,
      selectable: false,
      status: 'META_PAGE_ROW_INCOMPLETE',
      statusDetail: 'Meta returned a Page row without an id, so TITAN cannot select it.',
      diagnostics: {
        ...diagnostics,
        filteredOutByTitan: true,
        filterReason: 'missing_id',
      },
    };
  }

  if (!raw.name) {
    return {
      id: raw.id,
      name: 'Unnamed Page',
      category: raw.category ?? null,
      tasks,
      selectable: false,
      status: 'META_PAGE_ROW_INCOMPLETE',
      statusDetail: 'Meta returned a Page row without a name.',
      diagnostics: {
        ...diagnostics,
        filteredOutByTitan: false,
        filterReason: 'missing_name',
      },
    };
  }

  if (!accessToken) {
    return {
      id: raw.id,
      name: raw.name,
      category: raw.category ?? null,
      tasks,
      selectable: false,
      status: 'META_PAGE_TOKEN_UNAVAILABLE',
      statusDetail:
        'Meta listed this Page but did not return a Page access token. Business-linked Pages often require the business_management permission and explicit Business Integrations asset selection before Meta exposes a token.',
      diagnostics: {
        ...diagnostics,
        filteredOutByTitan: false,
        filterReason: 'missing_access_token',
      },
    };
  }

  return {
    id: raw.id,
    name: raw.name,
    category: raw.category ?? null,
    tasks,
    selectable: true,
    status: 'PAGE_SELECTION_READY',
    statusDetail: 'This Page can be selected and verified.',
    diagnostics: {
      ...diagnostics,
      hasAccessToken: true,
      filteredOutByTitan: false,
      filterReason: null,
    },
  };
}

export function resolveFacebookPageDiscoveryStatus(input: {
  rawRows: RawFacebookAccountRow[];
  mappedPages: FacebookPageDiscoveryRow[];
  grantedScopes: string[];
  providerFailed: boolean;
  providerErrorMessage?: string | null;
}): Pick<FacebookPageDiscoveryResult, 'status' | 'detail'> {
  const selectable = input.mappedPages.filter((page) => page.selectable);

  if (!input.grantedScopes.includes('pages_show_list')) {
    return {
      status: 'META_TOKEN_SCOPE_MISMATCH',
      detail:
        'The stored Facebook user token does not include pages_show_list, so Meta will not return managed Pages.',
    };
  }

  if (input.providerFailed) {
    return {
      status: 'META_PAGE_LIST_FAILED',
      detail:
        input.providerErrorMessage ??
        'Meta did not return a successful Page list. Check Business Integrations asset selection and retry.',
    };
  }

  if (input.rawRows.length === 0) {
    return {
      status: 'META_PAGE_LIST_EMPTY',
      detail:
        'Meta returned a successful but empty Page list. If the Page is linked to a Meta Business account, business_management may be required and the Owner must grant the Page under Business Integrations.',
    };
  }

  if (selectable.length > 0) {
    return {
      status: 'PAGE_SELECTION_READY',
      detail: 'Select the Young Guns Plumbing Page to finish the connection.',
    };
  }

  const incomplete = input.mappedPages.some(
    (page) => page.status === 'META_PAGE_ROW_INCOMPLETE',
  );
  if (incomplete) {
    return {
      status: 'META_PAGE_ROW_INCOMPLETE',
      detail:
        'Meta returned Page rows that TITAN could not use because required fields were missing.',
    };
  }

  return {
    status: 'META_PAGE_TOKEN_UNAVAILABLE',
    detail:
      'Meta returned Pages but no usable Page access tokens. Confirm Business Integrations grants Young Guns Plumbing – Cape Town to this app; business_management may be required for business-linked Pages.',
  };
}

export function buildFacebookPageDiscoveryDiagnosis(input: {
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  rawRows: RawFacebookAccountRow[];
  mappedPages: FacebookPageDiscoveryRow[];
  grantedScopes: string[];
  configuredAppId: string;
  tokenAppId: string | null;
  tokenValid: boolean | null;
  tokenExpiresAt: number | null;
  tokenUserIdPresent: boolean;
  hasPaging: boolean;
  pagingPageCount: number;
  appliedFilters: string[];
}): FacebookPageDiscoveryDiagnosis {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    graphVersion: FACEBOOK_GRAPH_VERSION,
    endpoint: FACEBOOK_PAGE_LIST_ENDPOINT,
    fields: FACEBOOK_PAGE_LIST_FIELDS,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorSubcode: input.providerErrorSubcode,
    providerErrorType: input.providerErrorType,
    rawRowCount: input.rawRows.length,
    retainedRowCount: input.mappedPages.length,
    selectableRowCount: input.mappedPages.filter((page) => page.selectable).length,
    hasPaging: input.hasPaging,
    pagingPageCount: input.pagingPageCount,
    grantedScopes: [...input.grantedScopes],
    hasPagesShowList: input.grantedScopes.includes('pages_show_list'),
    hasBusinessManagement: input.grantedScopes.includes('business_management'),
    appIdMatches:
      input.tokenAppId !== null && input.tokenAppId === input.configuredAppId,
    tokenValid: input.tokenValid,
    tokenExpired:
      input.tokenExpiresAt !== null ? input.tokenExpiresAt <= nowSeconds : null,
    authenticatedUserIdPresent: input.tokenUserIdPresent,
    youngGunsPageSeenInRawResponse: input.rawRows.some((row) =>
      rowMatchesYoungGunsPageName(row.name),
    ),
    appliedFilters: input.appliedFilters,
  };
}

export const FACEBOOK_PAGE_DISCOVERY_STATUS_LABELS: Record<
  FacebookPageDiscoveryStatusCode,
  string
> = {
  PAGE_SELECTION_READY: 'Page selection ready',
  META_PAGE_LIST_EMPTY: 'Meta returned no Pages',
  META_PAGE_LIST_FAILED: 'Meta Page list failed',
  META_PAGE_ROW_INCOMPLETE: 'Incomplete Page row from Meta',
  META_PAGE_TOKEN_UNAVAILABLE: 'Page token unavailable',
  META_TOKEN_SCOPE_MISMATCH: 'Token scope mismatch',
};
