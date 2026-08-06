import { facebookPageNamesMatch } from './facebook-direct-page-lookup.js';
import { maskFacebookPageId } from './facebook-page-identity.js';

/** Sanitized identity agreement between /me/accounts and Page-token GET /me. */
export type FacebookPageIdentityAgreement = {
  accountsPageId: string;
  accountsPageName: string;
  tokenMePageId: string;
  tokenMePageName: string;
  idsMatch: boolean;
  namesMatch: boolean;
};

export type FacebookPageIdentityAgreementSanitized = {
  accountsPageIdMasked: string | null;
  accountsPageName: string;
  tokenMePageIdMasked: string | null;
  tokenMePageName: string;
  idsMatch: boolean;
  namesMatch: boolean;
};

export function sanitizeFacebookPageIdentityAgreement(
  agreement: FacebookPageIdentityAgreement,
): FacebookPageIdentityAgreementSanitized {
  return {
    accountsPageIdMasked: maskFacebookPageId(agreement.accountsPageId),
    accountsPageName: agreement.accountsPageName,
    tokenMePageIdMasked: maskFacebookPageId(agreement.tokenMePageId),
    tokenMePageName: agreement.tokenMePageName,
    idsMatch: agreement.idsMatch,
    namesMatch: agreement.namesMatch,
  };
}

/**
 * Requires /me/accounts row id+name to agree with Page-token GET /me?id,name identity.
 * No tokens are accepted or returned.
 */
export function assertFacebookPageIdentityAgreement(input: {
  accountsPageId: string;
  accountsPageName: string;
  tokenMePageId: string;
  tokenMePageName: string;
}):
  | { ok: true; agreement: FacebookPageIdentityAgreement }
  | { ok: false; reason: string; agreement: FacebookPageIdentityAgreement } {
  const accountsPageId = input.accountsPageId.trim();
  const accountsPageName = input.accountsPageName.trim();
  const tokenMePageId = input.tokenMePageId.trim();
  const tokenMePageName = input.tokenMePageName.trim();

  const agreement: FacebookPageIdentityAgreement = {
    accountsPageId,
    accountsPageName,
    tokenMePageId,
    tokenMePageName,
    idsMatch: accountsPageId === tokenMePageId,
    namesMatch: facebookPageNamesMatch(accountsPageName, tokenMePageName),
  };

  if (!accountsPageId || !accountsPageName) {
    return {
      ok: false,
      reason: 'Meta returned an incomplete /me/accounts Page row (missing id or name).',
      agreement,
    };
  }

  if (!tokenMePageId || !tokenMePageName) {
    return {
      ok: false,
      reason: 'Meta did not return a complete Page identity for the Page access token.',
      agreement,
    };
  }

  if (!agreement.idsMatch) {
    return {
      ok: false,
      reason:
        'The Page id from /me/accounts does not match the Page-token identity id returned by Meta.',
      agreement,
    };
  }

  if (!agreement.namesMatch) {
    return {
      ok: false,
      reason:
        'The Page name from /me/accounts does not match the Page-token identity name returned by Meta.',
      agreement,
    };
  }

  return { ok: true, agreement };
}

/** Client Page id must appear in the authenticated Meta discovery list. */
export function assertClientPageIdInMetaDiscovery(input: {
  clientPageId: string;
  listedPageIds: string[];
  businessPortfolioPageIds?: string[];
}): { allowed: true } | { allowed: false; reason: string } {
  const normalized = input.clientPageId.trim();
  if (!normalized) {
    return { allowed: false, reason: 'A Page id is required to complete selection.' };
  }

  if (input.listedPageIds.includes(normalized)) {
    return { allowed: true };
  }

  if (input.businessPortfolioPageIds?.includes(normalized)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'That Page id is not among the Pages Meta returned for this Facebook account.',
  };
}
