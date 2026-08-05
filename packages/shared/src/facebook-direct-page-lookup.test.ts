import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertClientPageIdMatchesPendingCandidate,
  buildFacebookDirectPageLookupSanitized,
  facebookPageNamesMatch,
  resolveFacebookDirectPageLookupStatus,
  resolveFacebookPendingPageCandidate,
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
  YOUNG_GUNS_FACEBOOK_PAGE_NAME,
} from './facebook-direct-page-lookup.js';

const CANDIDATE = {
  pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
  pageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
  source: 'tenant_known_page' as const,
};

describe('facebook direct page lookup (J-6.7F2)', () => {
  it('resolves Young Guns pending candidate for verified tenant', () => {
    const candidate = resolveFacebookPendingPageCandidate({
      companyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
      connectionMetadata: null,
      isYoungGunsTenant: true,
    });
    assert.ok(candidate);
    assert.equal(candidate?.pageId, YOUNG_GUNS_FACEBOOK_PAGE_ID);
    assert.equal(candidate?.pageName, YOUNG_GUNS_FACEBOOK_PAGE_NAME);
  });

  it('prefers connection metadata candidate over tenant default', () => {
    const candidate = resolveFacebookPendingPageCandidate({
      companyId: 'other',
      connectionMetadata: {
        pendingPageCandidate: { pageId: '999', pageName: 'Stored Candidate' },
      },
      isYoungGunsTenant: true,
    });
    assert.equal(candidate?.pageId, '999');
    assert.equal(candidate?.source, 'connection_metadata');
  });

  it('returns null pending candidate for non-Young-Guns tenant without metadata', () => {
    const candidate = resolveFacebookPendingPageCandidate({
      companyId: 'other',
      connectionMetadata: null,
      isYoungGunsTenant: false,
    });
    assert.equal(candidate, null);
  });

  it('classifies direct lookup success with Page token', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 200,
      providerErrorCode: null,
      providerErrorSubcode: null,
      providerErrorType: null,
      providerFailed: false,
      raw: {
        id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
        name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
        access_token: 'page-token-secret',
        tasks: ['MODERATE'],
      },
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_TOKEN_AVAILABLE');
    assert.equal(sanitized.selectable, true);
    assert.equal(sanitized.hasAccessToken, true);
    assert.equal(JSON.stringify(sanitized).includes('page-token-secret'), false);
  });

  it('classifies Page exists without Page token', () => {
    const status = resolveFacebookDirectPageLookupStatus({
      candidate: CANDIDATE,
      httpStatus: 200,
      providerErrorCode: null,
      providerErrorType: null,
      providerFailed: false,
      raw: {
        id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
        name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
        tasks: ['MODERATE'],
      },
    });
    assert.equal(status.status, 'DIRECT_PAGE_TOKEN_UNAVAILABLE');
    assert.equal(status.selectable, false);
  });

  it('classifies permission denied separately from empty list', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 403,
      providerErrorCode: 200,
      providerErrorSubcode: null,
      providerErrorType: 'permission',
      providerFailed: true,
      raw: null,
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_PERMISSION_DENIED');
    assert.match(sanitized.detail, /separate from an empty/i);
  });

  it('classifies Page not found', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 404,
      providerErrorCode: 803,
      providerErrorSubcode: null,
      providerErrorType: 'invalid_request',
      providerFailed: true,
      raw: null,
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_NOT_FOUND');
  });

  it('classifies provider error', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 502,
      providerErrorCode: 1,
      providerErrorSubcode: null,
      providerErrorType: 'provider_unavailable',
      providerFailed: true,
      raw: null,
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_LOOKUP_FAILED');
    assert.match(sanitized.detail, /do not assume the account administers no Pages/i);
  });

  it('classifies ID mismatch', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 200,
      providerErrorCode: null,
      providerErrorSubcode: null,
      providerErrorType: null,
      providerFailed: false,
      raw: {
        id: '111',
        name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
        access_token: 'tok',
      },
    });
    assert.equal(sanitized.status, 'PAGE_IDENTITY_MISMATCH');
    assert.equal(sanitized.idMatches, false);
  });

  it('classifies name mismatch', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      httpStatus: 200,
      providerErrorCode: null,
      providerErrorSubcode: null,
      providerErrorType: null,
      providerFailed: false,
      raw: {
        id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
        name: 'Different Plumbing Co',
        access_token: 'tok',
      },
    });
    assert.equal(sanitized.status, 'PAGE_IDENTITY_MISMATCH');
    assert.equal(sanitized.nameMatches, false);
  });

  it('rejects arbitrary client Page id when not listed and not candidate', () => {
    const result = assertClientPageIdMatchesPendingCandidate({
      clientPageId: '999999',
      candidate: CANDIDATE,
      listedPageIds: [],
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.match(result.reason, /does not accept arbitrary Page ids/i);
    }
  });

  it('allows listed Page id without matching candidate', () => {
    const result = assertClientPageIdMatchesPendingCandidate({
      clientPageId: 'listed-page',
      candidate: CANDIDATE,
      listedPageIds: ['listed-page'],
    });
    assert.equal(result.allowed, true);
  });

  it('allows candidate Page id for direct lookup path', () => {
    const result = assertClientPageIdMatchesPendingCandidate({
      clientPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      candidate: CANDIDATE,
      listedPageIds: [],
    });
    assert.equal(result.allowed, true);
  });

  it('matches Page names with normalised whitespace', () => {
    assert.equal(
      facebookPageNamesMatch(
        'Young Guns Plumbing – Cape Town',
        '  Young   Guns Plumbing – Cape Town ',
      ),
      true,
    );
  });
});
