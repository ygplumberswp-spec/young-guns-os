import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertClientPageIdMatchesBusinessDiscovery,
  decodeFacebookOAuthReturnPath,
  encodeFacebookBusinessPortfolioOAuthReturnPath,
  FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION,
  FACEBOOK_OAUTH_BUSINESS_PORTFOLIO_SCOPES,
  mapRawBusinessPortfolioPageRow,
  needsFacebookBusinessPortfolioAccess,
  resolveFacebookBusinessPortfolioDiscoveryStatus,
} from './facebook-business-portfolio-discovery.js';
import { assertFacebookBusinessPortfolioOAuthUrl } from './facebook-business.js';
import {
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
  YOUNG_GUNS_FACEBOOK_PAGE_NAME,
} from './facebook-direct-page-lookup.js';

const CANDIDATE = {
  pageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
  pageName: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
  source: 'tenant_known_page' as const,
};

describe('facebook business portfolio discovery (J-6.7F5)', () => {
  it('requests business_management only for business portfolio OAuth flow', () => {
    assert.deepEqual(FACEBOOK_OAUTH_BUSINESS_PORTFOLIO_SCOPES, [
      'pages_show_list',
      'business_management',
    ]);
  });

  it('validates business portfolio OAuth URL excludes advanced permissions', () => {
    const url =
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&scope=pages_show_list,business_management&state=x';
    const result = assertFacebookBusinessPortfolioOAuthUrl(url);
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);

    const badUrl =
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&scope=pages_show_list,business_management,pages_manage_posts&state=x';
    const bad = assertFacebookBusinessPortfolioOAuthUrl(badUrl);
    assert.equal(bad.ok, false);
    assert.ok(bad.violations.some((entry: string) => entry.includes('pages_manage_posts')));
  });

  it('encodes and decodes business portfolio OAuth return path without migration', () => {
    const encoded = encodeFacebookBusinessPortfolioOAuthReturnPath('/facebook-business');
    assert.ok(encoded.includes('business_portfolio'));
    const decoded = decodeFacebookOAuthReturnPath(encoded);
    assert.equal(decoded.oauthTier, 'business_portfolio');
    assert.equal(decoded.returnPath, '/facebook-business');
  });

  it('detects when business portfolio access is required', () => {
    assert.equal(
      needsFacebookBusinessPortfolioAccess({
        grantedScopes: ['pages_show_list', 'public_profile'],
        meAccountsEmpty: true,
        directLookupStatus: 'FACEBOOK_PAGE_OBJECT_INACCESSIBLE',
      }),
      true,
    );
    assert.equal(
      needsFacebookBusinessPortfolioAccess({
        grantedScopes: ['pages_show_list', 'business_management'],
        meAccountsEmpty: true,
        directLookupStatus: 'FACEBOOK_PAGE_OBJECT_INACCESSIBLE',
      }),
      false,
    );
  });

  it('resolves portfolio not found honestly', () => {
    const resolved = resolveFacebookBusinessPortfolioDiscoveryStatus({
      grantedScopes: ['pages_show_list', 'business_management'],
      portfolios: [],
      pages: [],
      candidate: CANDIDATE,
      providerFailed: false,
    });
    assert.equal(resolved.status, 'BUSINESS_PORTFOLIO_NOT_FOUND');
  });

  it('resolves verified Page discovered through portfolio', () => {
    const resolved = resolveFacebookBusinessPortfolioDiscoveryStatus({
      grantedScopes: ['pages_show_list', 'business_management'],
      portfolios: [{ id: 'biz-1', name: 'Young Guns Business' }],
      pages: [
        {
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          businessPortfolioId: 'biz-1',
          businessPortfolioName: 'Young Guns Business',
          source: 'owned',
          accessToken: 'page-token',
          selectable: true,
          status: 'BUSINESS_PAGE_DISCOVERED',
          statusDetail: 'ok',
        },
      ],
      candidate: CANDIDATE,
      providerFailed: false,
    });
    assert.equal(resolved.status, 'BUSINESS_PAGE_DISCOVERED');
    assert.match(resolved.detail, /Young Guns Plumbing/i);
  });

  it('blocks verified Page not assigned to accessible portfolios', () => {
    const resolved = resolveFacebookBusinessPortfolioDiscoveryStatus({
      grantedScopes: ['pages_show_list', 'business_management'],
      portfolios: [{ id: 'biz-1', name: 'Other Business' }],
      pages: [
        {
          id: '999',
          name: 'Other Page',
          businessPortfolioId: 'biz-1',
          businessPortfolioName: 'Other Business',
          source: 'owned',
          accessToken: 'tok',
          selectable: true,
          status: 'BUSINESS_PAGE_DISCOVERED',
          statusDetail: 'ok',
        },
      ],
      candidate: CANDIDATE,
      providerFailed: false,
    });
    assert.equal(resolved.status, 'BUSINESS_PAGE_NOT_ASSIGNED');
  });

  it('maps owned portfolio Page rows with token', () => {
    const mapped = mapRawBusinessPortfolioPageRow({
      raw: {
        id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
        name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
        access_token: 'secret-token',
      },
      businessPortfolioId: 'biz-1',
      businessPortfolioName: 'Portfolio',
      source: 'owned',
    });
    assert.ok(mapped);
    assert.equal(mapped?.selectable, true);
    assert.equal(mapped?.accessToken, 'secret-token');
    assert.equal(mapped?.statusDetail.includes('secret-token'), false);
  });

  it('rejects arbitrary business Page ids from browser', () => {
    const result = assertClientPageIdMatchesBusinessDiscovery({
      clientPageId: '999999',
      businessPages: [],
      listedPageIds: [],
    });
    assert.equal(result.allowed, false);
  });

  it('allows server-fetched business Page rows', () => {
    const result = assertClientPageIdMatchesBusinessDiscovery({
      clientPageId: YOUNG_GUNS_FACEBOOK_PAGE_ID,
      businessPages: [
        {
          id: YOUNG_GUNS_FACEBOOK_PAGE_ID,
          name: YOUNG_GUNS_FACEBOOK_PAGE_NAME,
          businessPortfolioId: 'biz-1',
          businessPortfolioName: 'Portfolio',
          source: 'assigned',
          accessToken: 'tok',
          selectable: true,
          status: 'BUSINESS_PAGE_DISCOVERED',
          statusDetail: 'ok',
        },
      ],
      listedPageIds: [],
    });
    assert.equal(result.allowed, true);
  });

  it('shows honest OAuth explanation copy', () => {
    assert.match(FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION, /does not grant publishing/i);
    assert.match(FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION, /Business Portfolio/i);
  });
});
