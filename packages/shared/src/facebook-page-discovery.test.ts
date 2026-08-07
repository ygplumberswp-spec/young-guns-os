import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFacebookPageDiscoveryDiagnosis,
  mapRawFacebookAccountRow,
  resolveFacebookPageDiscoveryStatus,
  rowMatchesYoungGunsPageName,
} from './facebook-page-discovery.js';

describe('facebook page discovery (J-6.7F)', () => {
  it('accepts PROFILE_PLUS task names and rows without tasks', () => {
    const mapped = mapRawFacebookAccountRow({
      id: '123',
      name: 'Young Guns Plumbing – Cape Town',
      access_token: 'page-token',
      tasks: ['PROFILE_PLUS_MODERATE', 'PROFILE_PLUS_ANALYZE'],
    });
    assert.ok(mapped);
    assert.equal(mapped?.selectable, true);
    assert.equal(mapped?.status, 'PAGE_SELECTION_READY');
    assert.equal(mapped?.tasks.length, 2);
  });

  it('does not silently discard a Page row missing access_token', () => {
    const mapped = mapRawFacebookAccountRow({
      id: '123',
      name: 'Young Guns Plumbing – Cape Town',
      tasks: ['PROFILE_PLUS_MODERATE'],
    });
    assert.ok(mapped);
    assert.equal(mapped?.selectable, false);
    assert.equal(mapped?.status, 'META_PAGE_TOKEN_UNAVAILABLE');
    assert.equal(mapped?.diagnostics.filterReason, 'missing_access_token');
  });

  it('surfaces incomplete rows missing id', () => {
    const mapped = mapRawFacebookAccountRow({ name: 'Unnamed' });
    assert.ok(mapped);
    assert.equal(mapped?.status, 'META_PAGE_ROW_INCOMPLETE');
    assert.equal(mapped?.diagnostics.filteredOutByTitan, true);
  });

  it('classifies empty successful Meta response honestly', () => {
    const status = resolveFacebookPageDiscoveryStatus({
      rawRows: [],
      mappedPages: [],
      grantedScopes: ['pages_show_list'],
      providerFailed: false,
    });
    assert.equal(status.status, 'META_PAGE_LIST_EMPTY');
  });

  it('classifies provider failure separately from empty list', () => {
    const status = resolveFacebookPageDiscoveryStatus({
      rawRows: [],
      mappedPages: [],
      grantedScopes: ['pages_show_list'],
      providerFailed: true,
      providerErrorMessage: 'Permissions error',
    });
    assert.equal(status.status, 'META_PAGE_LIST_FAILED');
  });

  it('detects Young Guns Page name in raw rows without exposing tokens', () => {
    assert.equal(rowMatchesYoungGunsPageName('Young Guns Plumbing – Cape Town'), true);
    assert.equal(rowMatchesYoungGunsPageName('Other Business'), false);
  });

  it('builds sanitized diagnosis without secrets', () => {
    const mapped = mapRawFacebookAccountRow({
      id: '1',
      name: 'Young Guns Plumbing – Cape Town',
      access_token: 'secret-token',
    });
    assert.ok(mapped);
    const diagnosis = buildFacebookPageDiscoveryDiagnosis({
      httpStatus: 200,
      providerErrorCode: null,
      providerErrorSubcode: null,
      providerErrorType: null,
      rawRows: [{ id: '1', name: 'Young Guns Plumbing – Cape Town', access_token: 'secret-token' }],
      mappedPages: [mapped!],
      grantedScopes: ['pages_show_list'],
      configuredAppId: 'app-123',
      tokenAppId: 'app-123',
      tokenValid: true,
      tokenExpiresAt: null,
      tokenUserIdPresent: true,
      hasPaging: false,
      pagingPageCount: 1,
      appliedFilters: ['none'],
    });
    assert.equal(diagnosis.youngGunsPageSeenInRawResponse, true);
    assert.equal(diagnosis.hasPagesShowList, true);
    assert.equal(JSON.stringify(diagnosis).includes('secret-token'), false);
  });
});
