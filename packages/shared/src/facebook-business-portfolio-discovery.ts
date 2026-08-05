import { FACEBOOK_GRAPH_VERSION } from './facebook-business.js';
import {
  facebookPageNamesMatch,
  type FacebookPendingPageCandidate,
} from './facebook-direct-page-lookup.js';
import {
  mapRawFacebookAccountRow,
  type FacebookPageDiscoveryResult,
} from './facebook-page-discovery.js';

/**
 * Meta Business Portfolio Page discovery (J-6.7F5).
 *
 * Contract (Graph API v21.0):
 * - GET /me/businesses?fields=id,name — accessible Business Portfolios
 * - GET /{business-id}/owned_pages?fields=id,name,access_token — owned Pages
 * - GET /{business-id}/client_pages?fields=id,name,access_token — assigned Pages
 *
 * Used when /me/accounts is empty and direct Page lookup returns object inaccessible
 * (code 100, subcode 33) for business-linked Pages.
 */

export const FACEBOOK_BUSINESS_PORTFOLIO_LIST_ENDPOINT = '/me/businesses';
export const FACEBOOK_BUSINESS_PORTFOLIO_LIST_FIELDS = 'id,name';
export const FACEBOOK_BUSINESS_OWNED_PAGES_FIELDS = 'id,name,access_token';
export const FACEBOOK_BUSINESS_CLIENT_PAGES_FIELDS = 'id,name,access_token';

export { FACEBOOK_OAUTH_BUSINESS_PORTFOLIO_SCOPES } from './facebook-business.js';

export const FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION =
  'TITAN needs permission to view the Pages assigned to your Meta Business Portfolio. This does not grant publishing, messaging, advertising or payment access.';

/** Prefix stored in fb_oauth_states.returnPath to mark business-portfolio OAuth tier (no migration). */
export const FACEBOOK_OAUTH_TIER_BUSINESS_PORTFOLIO_PREFIX = '__titan_oauth_tier=business_portfolio__';

export type FacebookBusinessPortfolioProviderStatusCode =
  | 'BUSINESS_PERMISSION_REQUIRED'
  | 'BUSINESS_AUTHORIZATION_READY'
  | 'BUSINESS_PORTFOLIO_NOT_FOUND'
  | 'BUSINESS_PORTFOLIO_FOUND'
  | 'BUSINESS_PAGE_NOT_ASSIGNED'
  | 'BUSINESS_PAGE_DISCOVERED'
  | 'BUSINESS_PAGE_TOKEN_UNAVAILABLE'
  | 'BUSINESS_PAGE_CONNECTED'
  | 'META_APP_REVIEW_REQUIRED'
  | 'META_PROVIDER_FAILED';

export type FacebookBusinessPortfolioSummary = {
  id: string;
  name: string;
};

export type FacebookBusinessPortfolioPageSource = 'owned' | 'assigned';

export type FacebookBusinessPortfolioPageRow = {
  id: string;
  name: string;
  businessPortfolioId: string;
  businessPortfolioName: string;
  source: FacebookBusinessPortfolioPageSource;
  accessToken: string | null;
  selectable: boolean;
  status: FacebookBusinessPortfolioProviderStatusCode;
  statusDetail: string;
};

export type FacebookBusinessPortfolioDiscoveryDiagnosis = {
  graphVersion: string;
  portfolioListEndpoint: string;
  portfolioListFields: string;
  ownedPagesFields: string;
  clientPagesFields: string;
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  portfolioCount: number;
  rawPageCount: number;
  selectablePageCount: number;
  grantedScopes: string[];
  hasPagesShowList: boolean;
  hasBusinessManagement: boolean;
  verifiedPageId: string | null;
  verifiedPageName: string | null;
  verifiedPageFound: boolean;
  verifiedPageIdMatches: boolean;
  verifiedPageNameMatches: boolean;
};

export type FacebookBusinessPortfolioDiscoveryResult = {
  status: FacebookBusinessPortfolioProviderStatusCode;
  detail: string;
  portfolios: FacebookBusinessPortfolioSummary[];
  pages: FacebookBusinessPortfolioPageRow[];
  diagnosis: FacebookBusinessPortfolioDiscoveryDiagnosis;
  pendingPageCandidate: FacebookPendingPageCandidate | null;
};

export type FacebookCombinedPageDiscoveryResult = FacebookPageDiscoveryResult & {
  businessPortfolio: FacebookBusinessPortfolioDiscoveryResult | null;
  needsBusinessPortfolioAccess: boolean;
};

export type RawFacebookBusinessPortfolioRow = {
  id?: string;
  name?: string;
};

export type RawFacebookBusinessPageRow = {
  id?: string;
  name?: string;
  access_token?: string;
};

export function encodeFacebookBusinessPortfolioOAuthReturnPath(returnPath: string): string {
  const normalised = returnPath.startsWith('/') ? returnPath : '/facebook-business';
  return `${FACEBOOK_OAUTH_TIER_BUSINESS_PORTFOLIO_PREFIX}${normalised}`;
}

export function decodeFacebookOAuthReturnPath(storedReturnPath: string | null | undefined): {
  oauthTier: 'basic' | 'business_portfolio';
  returnPath: string;
} {
  const fallback = '/facebook-business';
  if (!storedReturnPath?.trim()) {
    return { oauthTier: 'basic', returnPath: fallback };
  }
  if (storedReturnPath.startsWith(FACEBOOK_OAUTH_TIER_BUSINESS_PORTFOLIO_PREFIX)) {
    const path = storedReturnPath.slice(FACEBOOK_OAUTH_TIER_BUSINESS_PORTFOLIO_PREFIX.length);
    return {
      oauthTier: 'business_portfolio',
      returnPath: path.startsWith('/') ? path : fallback,
    };
  }
  return { oauthTier: 'basic', returnPath: storedReturnPath };
}

export function needsFacebookBusinessPortfolioAccess(input: {
  grantedScopes: readonly string[];
  meAccountsEmpty: boolean;
  directLookupStatus?: string | null;
}): boolean {
  if (input.grantedScopes.includes('business_management')) return false;
  if (!input.grantedScopes.includes('pages_show_list')) return false;
  if (!input.meAccountsEmpty) return false;
  return (
    input.directLookupStatus === 'FACEBOOK_PAGE_OBJECT_INACCESSIBLE' ||
    input.directLookupStatus === 'DIRECT_PAGE_PERMISSION_DENIED' ||
    input.directLookupStatus === 'DIRECT_PAGE_TOKEN_UNAVAILABLE' ||
    input.directLookupStatus === 'DIRECT_PAGE_NOT_FOUND'
  );
}

export function mapRawBusinessPortfolioPageRow(input: {
  raw: RawFacebookBusinessPageRow;
  businessPortfolioId: string;
  businessPortfolioName: string;
  source: FacebookBusinessPortfolioPageSource;
}): FacebookBusinessPortfolioPageRow | null {
  const mapped = mapRawFacebookAccountRow(input.raw);
  if (!mapped) return null;

  const accessToken = input.raw.access_token ?? null;
  const selectable = mapped.selectable;

  let status: FacebookBusinessPortfolioProviderStatusCode = 'BUSINESS_PAGE_DISCOVERED';
  let statusDetail = 'This Page is accessible through your Business Portfolio.';

  if (!input.raw.id) {
    status = 'META_PROVIDER_FAILED';
    statusDetail = 'Meta returned a Page row without an id.';
  } else if (!input.raw.name) {
    status = 'META_PROVIDER_FAILED';
    statusDetail = 'Meta returned a Page row without a name.';
  } else if (!accessToken) {
    status = 'BUSINESS_PAGE_TOKEN_UNAVAILABLE';
    statusDetail =
      'Meta listed this Page under your Business Portfolio but did not return a Page access token.';
  }

  return {
    id: input.raw.id ?? '',
    name: input.raw.name ?? 'Unnamed Page',
    businessPortfolioId: input.businessPortfolioId,
    businessPortfolioName: input.businessPortfolioName,
    source: input.source,
    accessToken,
    selectable,
    status,
    statusDetail,
  };
}

export function resolveFacebookBusinessPortfolioDiscoveryStatus(input: {
  grantedScopes: readonly string[];
  portfolios: FacebookBusinessPortfolioSummary[];
  pages: FacebookBusinessPortfolioPageRow[];
  candidate: FacebookPendingPageCandidate | null;
  providerFailed: boolean;
  providerErrorMessage?: string | null;
  appReviewRequired?: boolean;
}): Pick<FacebookBusinessPortfolioDiscoveryResult, 'status' | 'detail'> {
  if (!input.grantedScopes.includes('business_management')) {
    return {
      status: 'BUSINESS_PERMISSION_REQUIRED',
      detail: FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION,
    };
  }

  if (input.appReviewRequired) {
    return {
      status: 'META_APP_REVIEW_REQUIRED',
      detail:
        'Meta requires App Review before business_management can be granted to users outside the app role. Complete Meta App Review before outside customers can connect business-owned Pages.',
    };
  }

  if (!input.grantedScopes.includes('pages_show_list')) {
    return {
      status: 'META_PROVIDER_FAILED',
      detail: 'The stored token is missing pages_show_list.',
    };
  }

  if (input.providerFailed) {
    return {
      status: 'META_PROVIDER_FAILED',
      detail:
        input.providerErrorMessage ??
        'Meta did not return a successful Business Portfolio list. Retry after confirming Business Integrations access.',
    };
  }

  if (input.portfolios.length === 0) {
    return {
      status: 'BUSINESS_PORTFOLIO_NOT_FOUND',
      detail:
        'No accessible Meta Business Portfolio was returned for this account. Confirm the Page is assigned to a Business Portfolio you administer.',
    };
  }

  const selectable = input.pages.filter((page) => page.selectable);

  if (input.candidate) {
    const matched = input.pages.find(
      (page) =>
        page.id === input.candidate!.pageId &&
        facebookPageNamesMatch(input.candidate!.pageName, page.name),
    );

    if (matched?.selectable) {
      return {
        status: 'BUSINESS_PAGE_DISCOVERED',
        detail: `Meta returned ${matched.name} through Business Portfolio ${matched.businessPortfolioName}. Confirm this Page to finish the connection.`,
      };
    }

    if (matched && !matched.selectable) {
      return {
        status: 'BUSINESS_PAGE_TOKEN_UNAVAILABLE',
        detail: matched.statusDetail,
      };
    }

    const idOnly = input.pages.find((page) => page.id === input.candidate!.pageId);
    if (idOnly && !facebookPageNamesMatch(input.candidate!.pageName, idOnly.name)) {
      return {
        status: 'META_PROVIDER_FAILED',
        detail:
          'Meta returned a Page with the expected id but a different name. Selection is blocked until identity matches.',
      };
    }

    return {
      status: 'BUSINESS_PAGE_NOT_ASSIGNED',
      detail:
        'The verified Young Guns Plumbing Page was not found among Pages assigned to your accessible Business Portfolios.',
    };
  }

  if (selectable.length > 0) {
    return {
      status: 'BUSINESS_PORTFOLIO_FOUND',
      detail: 'Select a Page from your accessible Business Portfolio to finish the connection.',
    };
  }

  return {
    status: 'BUSINESS_PAGE_TOKEN_UNAVAILABLE',
    detail:
      'Meta returned Business Portfolio Pages but no usable Page access tokens. Confirm Business Integrations asset selection for this app.',
  };
}

export function buildFacebookBusinessPortfolioDiscoveryDiagnosis(input: {
  httpStatus: number;
  providerErrorCode: number | null;
  providerErrorSubcode: number | null;
  providerErrorType: string | null;
  portfolios: FacebookBusinessPortfolioSummary[];
  pages: FacebookBusinessPortfolioPageRow[];
  grantedScopes: readonly string[];
  candidate: FacebookPendingPageCandidate | null;
}): FacebookBusinessPortfolioDiscoveryDiagnosis {
  const candidate = input.candidate;
  const matchedPage = candidate
    ? input.pages.find((page) => page.id === candidate.pageId)
    : null;

  return {
    graphVersion: FACEBOOK_GRAPH_VERSION,
    portfolioListEndpoint: FACEBOOK_BUSINESS_PORTFOLIO_LIST_ENDPOINT,
    portfolioListFields: FACEBOOK_BUSINESS_PORTFOLIO_LIST_FIELDS,
    ownedPagesFields: FACEBOOK_BUSINESS_OWNED_PAGES_FIELDS,
    clientPagesFields: FACEBOOK_BUSINESS_CLIENT_PAGES_FIELDS,
    httpStatus: input.httpStatus,
    providerErrorCode: input.providerErrorCode,
    providerErrorSubcode: input.providerErrorSubcode,
    providerErrorType: input.providerErrorType,
    portfolioCount: input.portfolios.length,
    rawPageCount: input.pages.length,
    selectablePageCount: input.pages.filter((page) => page.selectable).length,
    grantedScopes: [...input.grantedScopes],
    hasPagesShowList: input.grantedScopes.includes('pages_show_list'),
    hasBusinessManagement: input.grantedScopes.includes('business_management'),
    verifiedPageId: candidate?.pageId ?? null,
    verifiedPageName: candidate?.pageName ?? null,
    verifiedPageFound: Boolean(matchedPage),
    verifiedPageIdMatches: matchedPage?.id === candidate?.pageId,
    verifiedPageNameMatches: candidate
      ? facebookPageNamesMatch(candidate.pageName, matchedPage?.name)
      : false,
  };
}

export function assertClientPageIdMatchesBusinessDiscovery(input: {
  clientPageId: string;
  candidate: FacebookPendingPageCandidate | null;
  businessPages: readonly FacebookBusinessPortfolioPageRow[];
  listedPageIds: string[];
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.listedPageIds.includes(input.clientPageId)) {
    return { allowed: true };
  }

  const businessPage = input.businessPages.find(
    (page) => page.id === input.clientPageId && page.selectable,
  );
  if (businessPage) {
    if (
      input.candidate &&
      (businessPage.id !== input.candidate.pageId ||
        !facebookPageNamesMatch(input.candidate.pageName, businessPage.name))
    ) {
      return {
        allowed: false,
        reason:
          'That Page id does not match the server-controlled pending Page candidate id and name.',
      };
    }
    return { allowed: true };
  }

  if (input.candidate && input.clientPageId === input.candidate.pageId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      'That Page id is not among the Pages Meta returned for this account and no server-controlled Page candidate matches.',
  };
}

export const FACEBOOK_BUSINESS_PORTFOLIO_STATUS_LABELS: Record<
  FacebookBusinessPortfolioProviderStatusCode,
  string
> = {
  BUSINESS_PERMISSION_REQUIRED: 'Business Portfolio permission required',
  BUSINESS_AUTHORIZATION_READY: 'Business Portfolio authorization ready',
  BUSINESS_PORTFOLIO_NOT_FOUND: 'No accessible Business Portfolio',
  BUSINESS_PORTFOLIO_FOUND: 'Business Portfolio found',
  BUSINESS_PAGE_NOT_ASSIGNED: 'Page not assigned to Portfolio',
  BUSINESS_PAGE_DISCOVERED: 'Business Page discovered',
  BUSINESS_PAGE_TOKEN_UNAVAILABLE: 'Business Page token unavailable',
  BUSINESS_PAGE_CONNECTED: 'Business Page connected',
  META_APP_REVIEW_REQUIRED: 'Meta App Review required',
  META_PROVIDER_FAILED: 'Meta provider failed',
};
