import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPageIdMatchesVerifiedCandidate,
  assertProviderPageRowMatchesSelection,
  buildFacebookPageIdentityDisplay,
  FACEBOOK_SELECTED_PAGE_MISMATCH,
  FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE,
  facebookPageIdentityAllowsConnectedLimited,
  facebookPageIdentityAllowsPageReadOAuth,
  maskFacebookPageId,
  resolveFacebookPageIdentity,
} from './facebook-page-identity.js';
import {
  resolveFacebookConnectionState,
  type FacebookConnectionStateInput,
} from './facebook-business.js';
import {
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
  YOUNG_GUNS_FACEBOOK_PAGE_NAME,
} from './facebook-direct-page-lookup.js';

const OLD_WRONG_PAGE_ID = '394603137072407';
const NOW = new Date('2026-08-04T10:00:00.000Z');

const historicalReference = {
  pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
  pageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
  source: 'historical_diagnostic' as const,
};

function connectionInput(
  overrides: Partial<FacebookConnectionStateInput> = {},
): FacebookConnectionStateInput {
  return {
    appConfigured: true,
    hasStoredToken: true,
    pageSelected: true,
    pageName: 'Young Guns Plumbing - Cape Town',
    tokenExpiresAt: null,
    grantedPermissions: ['pages_show_list', 'business_management'],
    lastVerification: null,
    disconnectedAt: null,
    now: NOW,
    ...overrides,
  };
}

describe('facebook page identity (J-6.7F7 / J-6.7F10)', () => {
  it('masks Page id suffix for Owner-facing UI', () => {
    assert.equal(maskFacebookPageId(YOUNG_GUNS_FACEBOOK_PAGE_ID), '···420962');
    assert.equal(maskFacebookPageId(OLD_WRONG_PAGE_ID), '···072407');
  });

  it('detects mismatch between stored and historical Page ids when no provider binding', () => {
    const identity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    assert.equal(identity.mismatch, true);
    assert.equal(identity.idsMatch, false);
    assert.equal(identity.mismatchReason, FACEBOOK_SELECTED_PAGE_MISMATCH);
    assert.equal(identity.internallyConsistent, true);
  });

  it('provider-verified Page id clears historical mismatch after reconnect wizard selection', () => {
    const identity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      providerVerifiedPageId: OLD_WRONG_PAGE_ID,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    assert.equal(identity.mismatch, false);
    assert.equal(identity.idsMatch, true);
  });

  it('stored mismatch resolves to partial — never connected_limited', () => {
    const pageIdentity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    const result = resolveFacebookConnectionState(
      connectionInput({
        pageIdentity,
        grantedPermissions: ['pages_show_list', 'business_management'],
      }),
    );
    assert.equal(result.state, 'partial');
    assert.equal(result.mismatchReason, FACEBOOK_SELECTED_PAGE_MISMATCH);
    assert.equal(result.usable, false);
    assert.notEqual(result.state, 'connected_limited');
    assert.notEqual(result.state, 'connected');
    assert.notEqual(result.state, 'reauthorisation_required');
    assert.match(result.detail, /different stored Facebook Page/);
  });

  it('mismatch blocks connected_limited eligibility helpers', () => {
    const identity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    assert.equal(facebookPageIdentityAllowsConnectedLimited(identity), false);
    assert.equal(facebookPageIdentityAllowsPageReadOAuth(identity), false);
  });

  it('correct Page with missing pages_read_engagement resolves to connected_limited', () => {
    const pageIdentity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      providerVerifiedPageId: OLD_WRONG_PAGE_ID,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    const result = resolveFacebookConnectionState(
      connectionInput({
        pageName: 'Young Guns Plumbing - Cape Town',
        pageIdentity,
        grantedPermissions: ['pages_show_list', 'business_management'],
      }),
    );
    assert.equal(result.state, 'connected_limited');
    assert.equal(result.mismatchReason, null);
  });

  it('correct Page with read permission and successful verification resolves to connected', () => {
    const pageIdentity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      providerVerifiedPageId: OLD_WRONG_PAGE_ID,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    const result = resolveFacebookConnectionState(
      connectionInput({
        pageName: 'Young Guns Plumbing - Cape Town',
        pageIdentity,
        grantedPermissions: [
          'pages_show_list',
          'business_management',
          'pages_read_engagement',
        ],
        lastVerification: {
          ok: true,
          authError: false,
          permissionError: false,
          providerUnavailable: false,
          checkedAt: NOW,
          message: 'ok',
        },
      }),
    );
    assert.equal(result.state, 'connected');
    assert.equal(result.usable, true);
  });

  it('builds mismatch display without full Page ids', () => {
    const identity = resolveFacebookPageIdentity({
      storedPageId: OLD_WRONG_PAGE_ID,
      storedPageName: 'Young Guns Plumbing - Cape Town',
      historicalReference,
      hasStoredCredentials: true,
      pageAccessToken: 'page-token',
    });
    const display = buildFacebookPageIdentityDisplay(identity);
    assert.ok(display);
    assert.equal(display?.message, FACEBOOK_SELECTED_PAGE_MISMATCH_MESSAGE);
    assert.equal(display?.expectedPageName, YOUNG_GUNS_FACEBOOK_PAGE_NAME);
    assert.equal(display?.expectedPageIdMasked, '···420962');
    assert.equal(display?.storedPageIdMasked, '···072407');
    assert.equal(JSON.stringify(display).includes(OLD_WRONG_PAGE_ID), false);
    assert.equal(JSON.stringify(display).includes('page-token'), false);
  });

  it('assertPageIdMatchesVerifiedCandidate is deprecated and always allows (J-6.7F10)', () => {
    const result = assertPageIdMatchesVerifiedCandidate({
      pageId: OLD_WRONG_PAGE_ID,
      candidate: { pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID },
    });
    assert.equal(result.ok, true);
  });

  it('assertProviderPageRowMatchesSelection rejects cross-assigned Page token', () => {
    const result = assertProviderPageRowMatchesSelection({
      requestedPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      providerPageId: OLD_WRONG_PAGE_ID,
      providerPageName: 'Wrong Page',
      providerAccessToken: 'token-for-wrong-page',
    });
    assert.equal(result.ok, false);
  });

  it('assertProviderPageRowMatchesSelection requires provider token', () => {
    const result = assertProviderPageRowMatchesSelection({
      requestedPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      providerPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      providerPageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
      providerAccessToken: null,
    });
    assert.equal(result.ok, false);
  });

  it('assertProviderPageRowMatchesSelection accepts matching provider row', () => {
    const result = assertProviderPageRowMatchesSelection({
      requestedPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      providerPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      providerPageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
      providerAccessToken: 'page-token',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.pageId, YOUNG_GUNS_FACEBOOK_PAGE_ID);
      assert.equal(result.accessToken, 'page-token');
    }
  });
});
