import type { FacebookPendingPageCandidate } from './facebook-direct-page-lookup.js';

/** Machine-readable reason when stored Page id differs from the verified tenant Page. */
export const FACEBOOK_SELECTED_PAGE_MISMATCH = 'FACEBOOK_SELECTED_PAGE_MISMATCH';

export const FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE =
  'TITAN found a different stored Facebook Page than the verified Young Guns Plumbing Page. Select the correct Page before granting additional permissions.';

/** Masks a Meta Page id for Owner-facing UI — shows suffix only. */
export function maskFacebookPageId(pageId: string | null | undefined): string | null {
  if (!pageId?.trim()) return null;
  const trimmed = pageId.trim();
  if (trimmed.length <= 6) return `···${trimmed}`;
  return `···${trimmed.slice(-6)}`;
}

export type FacebookPageIdentityDiagnosis = {
  storedPageId: string | null;
  storedPageName: string | null;
  verifiedCandidatePageId: string | null;
  verifiedCandidatePageName: string | null;
  storedPageIdMasked: string | null;
  verifiedCandidatePageIdMasked: string | null;
  idsMatch: boolean;
  hasUserAccessToken: boolean;
  hasPageAccessToken: boolean;
  pageAccessTokenPending: boolean;
  internallyConsistent: boolean;
  mismatch: boolean;
  mismatchReason: typeof FACEBOOK_SELECTED_PAGE_MISMATCH | null;
};

export type FacebookPageIdentityDisplay = {
  mismatchReason: typeof FACEBOOK_SELECTED_PAGE_MISMATCH | null;
  message: string;
  storedPageName: string | null;
  storedPageIdMasked: string | null;
  expectedPageName: string | null;
  expectedPageIdMasked: string | null;
};

export function resolveFacebookPageIdentity(input: {
  storedPageId: string | null | undefined;
  storedPageName: string | null | undefined;
  verifiedCandidate: FacebookPendingPageCandidate | null;
  hasStoredCredentials: boolean;
  pageAccessToken: string | null | undefined;
}): FacebookPageIdentityDiagnosis {
  const storedPageId = input.storedPageId?.trim() || null;
  const storedPageName = input.storedPageName?.trim() || null;
  const verifiedCandidatePageId = input.verifiedCandidate?.pageId?.trim() || null;
  const verifiedCandidatePageName = input.verifiedCandidate?.pageName?.trim() || null;

  const pageAccessTokenPending = Boolean(
    input.pageAccessToken?.startsWith('pending:') || input.pageAccessToken === '',
  );
  const hasPageAccessToken = Boolean(
    input.pageAccessToken && !pageAccessTokenPending,
  );

  const mismatch = Boolean(
    storedPageId && verifiedCandidatePageId && storedPageId !== verifiedCandidatePageId,
  );

  const internallyConsistent = Boolean(storedPageId && storedPageName && hasPageAccessToken);

  return {
    storedPageId,
    storedPageName,
    verifiedCandidatePageId,
    verifiedCandidatePageName,
    storedPageIdMasked: maskFacebookPageId(storedPageId),
    verifiedCandidatePageIdMasked: maskFacebookPageId(verifiedCandidatePageId),
    idsMatch: !mismatch,
    hasUserAccessToken: input.hasStoredCredentials,
    hasPageAccessToken,
    pageAccessTokenPending,
    internallyConsistent,
    mismatch,
    mismatchReason: mismatch ? FACEBOOK_SELECTED_PAGE_MISMATCH : null,
  };
}

export function buildFacebookPageIdentityDisplay(
  identity: FacebookPageIdentityDiagnosis,
): FacebookPageIdentityDisplay | null {
  if (!identity.mismatch) return null;
  return {
    mismatchReason: FACEBOOK_SELECTED_PAGE_MISMATCH,
    message: FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE,
    storedPageName: identity.storedPageName,
    storedPageIdMasked: identity.storedPageIdMasked,
    expectedPageName: identity.verifiedCandidatePageName,
    expectedPageIdMasked: identity.verifiedCandidatePageIdMasked,
  };
}

/** CONNECTED_LIMITED requires verified Page identity binding when a candidate exists. */
export function facebookPageIdentityAllowsConnectedLimited(
  identity: FacebookPageIdentityDiagnosis,
): boolean {
  if (identity.mismatch) return false;
  return identity.internallyConsistent;
}

/** Page-read OAuth requires a bound, verified Page selection. */
export function facebookPageIdentityAllowsPageReadOAuth(
  identity: FacebookPageIdentityDiagnosis,
): boolean {
  return facebookPageIdentityAllowsConnectedLimited(identity) && identity.idsMatch;
}

export function assertPageIdMatchesVerifiedCandidate(input: {
  pageId: string;
  candidate: FacebookPendingPageCandidate | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.candidate) return { ok: true };
  if (input.pageId.trim() !== input.candidate.pageId) {
    return {
      ok: false,
      reason: `Only the verified Page (${maskFacebookPageId(input.candidate.pageId)}) can be selected for this company.`,
    };
  }
  return { ok: true };
}

/** Page token must belong to the provider row being stored — never cross-assign ids. */
export function assertProviderPageRowMatchesSelection(input: {
  requestedPageId: string;
  providerPageId: string;
  providerPageName: string;
  providerAccessToken: string | null | undefined;
}): { ok: true; pageId: string; pageName: string; accessToken: string } | { ok: false; reason: string } {
  if (input.requestedPageId.trim() !== input.providerPageId.trim()) {
    return {
      ok: false,
      reason: 'The provider Page row id does not match the requested selection.',
    };
  }
  if (!input.providerAccessToken?.trim()) {
    return {
      ok: false,
      reason: 'Meta did not return a Page access token for the selected Page row.',
    };
  }
  return {
    ok: true,
    pageId: input.providerPageId.trim(),
    pageName: input.providerPageName.trim(),
    accessToken: input.providerAccessToken.trim(),
  };
}
