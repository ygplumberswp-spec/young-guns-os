import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertClientPageIdMatchesPendingCandidate,
  buildFacebookDirectPageLookupSanitized,
  classifyFacebookDirectPageProviderMessage,
  facebookPageNamesMatch,
  FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS,
  FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
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

function identityProbe(overrides: Partial<Parameters<typeof buildFacebookDirectPageLookupSanitized>[0]['identityProbe']> = {}) {
  return {
    fields: FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS,
    httpStatus: 200,
    providerErrorCode: null,
    providerErrorSubcode: null,
    providerErrorType: null,
    providerFailed: false,
    providerMessageClassification: null,
    raw: {
      id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
    },
    ...overrides,
  };
}

function tokenProbe(overrides: Partial<Parameters<typeof buildFacebookDirectPageLookupSanitized>[0]['tokenProbe']> = {}) {
  return {
    fields: FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS,
    httpStatus: 200,
    providerErrorCode: null,
    providerErrorSubcode: null,
    providerErrorType: null,
    providerFailed: false,
    providerMessageClassification: null,
    raw: {
      id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
      access_token: 'page-token-secret',
    },
    skipped: false,
    ...overrides,
  };
}

describe('facebook direct page lookup (J-6.7F3)', () => {
  it('uses id,name for identity probe and id,name,access_token for token probe', () => {
    assert.equal(FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS, 'id,name');
    assert.equal(FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS, 'id,name,access_token');
    assert.equal(FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS.includes('tasks'), false);
    assert.equal(FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS.includes('tasks'), false);
  });

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

  it('classifies direct lookup success with Page token', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe(),
      tokenProbe: tokenProbe(),
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_TOKEN_AVAILABLE');
    assert.equal(sanitized.selectable, true);
    assert.equal(sanitized.hasAccessToken, true);
    assert.equal(sanitized.hasTasks, false);
    assert.equal(sanitized.taskCount, 0);
    assert.equal(JSON.stringify(sanitized).includes('page-token-secret'), false);
  });

  it('does not require tasks for selection', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe(),
      tokenProbe: tokenProbe({ raw: { id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: YOUNG_GUNS_FACEBOOK_PAGE_NAME, access_token: 'tok' } }),
    });
    assert.equal(sanitized.selectable, true);
    assert.equal(sanitized.hasTasks, false);
  });

  it('classifies Page identity success without token', () => {
    const status = resolveFacebookDirectPageLookupStatus({
      candidate: CANDIDATE,
      identityProbe: identityProbe(),
      tokenProbe: tokenProbe({
        raw: { id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: YOUNG_GUNS_FACEBOOK_PAGE_NAME },
      }),
    });
    assert.equal(status.status, 'DIRECT_PAGE_TOKEN_UNAVAILABLE');
    assert.equal(status.selectable, false);
    assert.match(status.detail, /did not return an access_token/i);
    assert.doesNotMatch(status.detail, /business_management is required/i);
  });

  it('classifies identity available when identity probe succeeds alone', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe(),
      tokenProbe: tokenProbe({
        raw: { id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: YOUNG_GUNS_FACEBOOK_PAGE_NAME },
      }),
    });
    assert.equal(sanitized.identityProbeHttpStatus, 200);
    assert.equal(sanitized.hasId, true);
    assert.equal(sanitized.hasName, true);
    assert.equal(sanitized.idMatches, true);
    assert.equal(sanitized.nameMatches, true);
  });

  it('classifies invalid-field code 100 honestly without assuming business_management', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        httpStatus: 400,
        providerErrorCode: 100,
        providerErrorType: 'invalid_request',
        providerFailed: true,
        providerMessageClassification: 'invalid_field',
        raw: null,
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_INVALID_FIELD');
    assert.equal(sanitized.providerMessageClassification, 'invalid_field');
    assert.match(sanitized.detail, /not proof that business_management is required/i);
  });

  it('classifies permission denied separately from empty list', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        httpStatus: 403,
        providerErrorCode: 200,
        providerErrorType: 'permission',
        providerFailed: true,
        providerMessageClassification: 'missing_permission_or_feature',
        raw: null,
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_PERMISSION_DENIED');
    assert.match(sanitized.detail, /does not automatically mean business_management/i);
  });

  it('classifies Page not found without assuming Page does not exist', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        httpStatus: 404,
        providerErrorCode: 803,
        providerErrorType: 'invalid_request',
        providerFailed: true,
        providerMessageClassification: 'object_not_found_or_inaccessible',
        raw: null,
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_NOT_FOUND');
    assert.match(sanitized.detail, /not automatic proof the Page does not exist/i);
  });

  it('classifies provider error', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        httpStatus: 502,
        providerErrorCode: 1,
        providerErrorType: 'provider_unavailable',
        providerFailed: true,
        raw: null,
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'DIRECT_PAGE_LOOKUP_FAILED');
  });

  it('classifies ID mismatch', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        raw: { id: '111', name: YOUNG_GUNS_FACEBOOK_PAGE_NAME },
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'PAGE_IDENTITY_MISMATCH');
    assert.equal(sanitized.idMatches, false);
  });

  it('classifies name mismatch', () => {
    const sanitized = buildFacebookDirectPageLookupSanitized({
      candidate: CANDIDATE,
      identityProbe: identityProbe({
        raw: { id: YOUNG_GUNS_FACEBOOK_PAGE_ID, name: 'Different Plumbing Co' },
      }),
      tokenProbe: tokenProbe({ skipped: true, httpStatus: 0, raw: null }),
    });
    assert.equal(sanitized.status, 'PAGE_IDENTITY_MISMATCH');
    assert.equal(sanitized.nameMatches, false);
  });

  it('classifies provider message codes', () => {
    assert.equal(
      classifyFacebookDirectPageProviderMessage({
        httpStatus: 400,
        providerErrorCode: 100,
        providerErrorType: 'invalid_request',
        providerErrorMessage: 'Nonexisting field (tasks)',
        probe: 'identity',
      }),
      'invalid_field',
    );
    assert.equal(
      classifyFacebookDirectPageProviderMessage({
        httpStatus: 403,
        providerErrorCode: 200,
        providerErrorType: 'permission',
        probe: 'token',
      }),
      'missing_permission_or_feature',
    );
    assert.equal(
      classifyFacebookDirectPageProviderMessage({
        httpStatus: 404,
        providerErrorCode: 803,
        providerErrorType: 'invalid_request',
        probe: 'identity',
      }),
      'object_not_found_or_inaccessible',
    );
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
