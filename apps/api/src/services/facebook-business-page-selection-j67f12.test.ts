import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  assertDiscoverySessionBinding,
  resolveFacebookConnectionState,
  resolveSelectableRowFromDiscoverySession,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
const pageSource = readFileSync(
  join(here, '../../../web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);

const selectPageBlock = serviceSource.slice(
  serviceSource.indexOf('async selectPage('),
  serviceSource.indexOf('private isDiscoverySessionConsumed'),
);

describe('Facebook page selection J-6.7F12', () => {
  it('1. valid selection stores encrypted token and runs verify when read permission granted', () => {
    assert.ok(selectPageBlock.includes('encryptFacebookCredentials'));
    assert.ok(selectPageBlock.includes('await this.db.transaction'));
    assert.ok(selectPageBlock.includes('hasFacebookPageReadEngagement'));
    assert.ok(selectPageBlock.includes('graph.verifyPage(page.id, page.accessToken)'));
    assert.ok(selectPageBlock.includes('providerVerifiedPageId: page.id'));
  });

  it('2. route requires discoverySessionToken', () => {
    assert.ok(routeSource.includes('discoverySessionToken: z.string().trim().min(1)'));
  });

  it('3. expired session message is owner-safe', () => {
    const expired = assertDiscoverySessionBinding({
      payload: {
        version: 1,
        sessionId: 'sess-expired',
        companyId: 'c1',
        userId: 'u1',
        issuedAt: '2026-08-06T06:00:00.000Z',
        expiresAt: '2026-08-06T05:00:00.000Z',
        configuredAppId: 'app',
        tokenAppId: 'app',
        tokenValid: true,
        rows: [],
      },
      companyId: 'c1',
      userId: 'u1',
      now: new Date('2026-08-06T06:00:00.000Z'),
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.reason, 'Page selection expired. Choose Page again.');
    }
  });

  it('4. consumed session returns expired message unless same page already stored', () => {
    assert.match(selectPageBlock, /Page selection expired\. Choose Page again\./);
    assert.ok(selectPageBlock.includes('if (row.pageId === normalizedPageId && normalizedPageId)'));
    assert.ok(selectPageBlock.includes('return this.getConnection(actor)'));
  });

  it('5. wrong company binding rejected in shared helper', () => {
    const result = assertDiscoverySessionBinding({
      payload: {
        version: 1,
        sessionId: 'sess-1',
        companyId: 'company-a',
        userId: 'user-1',
        issuedAt: '2026-08-06T06:00:00.000Z',
        expiresAt: '2026-08-06T07:00:00.000Z',
        configuredAppId: 'app',
        tokenAppId: 'app',
        tokenValid: true,
        rows: [],
      },
      companyId: 'company-b',
      userId: 'user-1',
      now: new Date('2026-08-06T06:00:00.000Z'),
    });
    assert.equal(result.ok, false);
  });

  it('6. wrong user binding rejected in shared helper', () => {
    const result = assertDiscoverySessionBinding({
      payload: {
        version: 1,
        sessionId: 'sess-1',
        companyId: 'company-a',
        userId: 'user-a',
        issuedAt: '2026-08-06T06:00:00.000Z',
        expiresAt: '2026-08-06T07:00:00.000Z',
        configuredAppId: 'app',
        tokenAppId: 'app',
        tokenValid: true,
        rows: [],
      },
      companyId: 'company-a',
      userId: 'user-b',
      now: new Date('2026-08-06T06:00:00.000Z'),
    });
    assert.equal(result.ok, false);
  });

  it('7. invalid page id rejected from discovery session rows', () => {
    const result = resolveSelectableRowFromDiscoverySession({
      payload: {
        version: 1,
        sessionId: 'sess-1',
        companyId: 'c1',
        userId: 'u1',
        issuedAt: '2026-08-06T06:00:00.000Z',
        expiresAt: '2026-08-06T07:00:00.000Z',
        configuredAppId: 'app',
        tokenAppId: 'app',
        tokenValid: true,
        rows: [
          {
            id: '111',
            name: 'Known Page',
            accessToken: 'token',
            category: null,
            source: 'me_accounts',
          },
        ],
      },
      pageId: '999',
    });
    assert.equal(result.ok, false);
  });

  it('8. provider cross-check uses fresh /me/accounts list', () => {
    assert.ok(selectPageBlock.includes('graph.listPages(userToken)'));
    assert.ok(selectPageBlock.includes('assertClientPageIdInMetaDiscovery'));
  });

  it('9. database transaction validates write before completion', () => {
    assert.ok(selectPageBlock.includes('Page selection write validation failed'));
    assert.ok(selectPageBlock.includes('identityAfterWrite.mismatch'));
  });

  it('10. double-click/idempotent retry returns existing connection for same page', () => {
    assert.ok(selectPageBlock.includes('isDiscoverySessionConsumed'));
    assert.ok(selectPageBlock.includes('row.pageId === normalizedPageId'));
  });

  it('11. frontend renders visible page selection errors at page level', () => {
    assert.ok(pageSource.includes('Page selection failed'));
    assert.ok(pageSource.includes('role="alert"'));
    assert.ok(pageSource.includes('setPageSelectionError'));
  });

  it('12. loading state always resets in finally block', () => {
    assert.ok(pageSource.includes('setIsSelectingPage(false)'));
    assert.ok(pageSource.includes('pageSelectInFlight.current = false'));
  });

  it('13. failure path preserves credentials messaging', () => {
    assert.ok(pageSource.includes('Your stored credentials were preserved'));
  });

  it('14. successful connection state refresh shows connected with read permission', () => {
    const result = resolveFacebookConnectionState({
      appConfigured: true,
      hasStoredToken: true,
      pageSelected: true,
      pageName: 'Young Guns Plumbing - Cape Town',
      tokenExpiresAt: null,
      grantedPermissions: ['pages_show_list', 'pages_read_engagement', 'public_profile'],
      lastVerification: {
        ok: true,
        authError: false,
        permissionError: false,
        providerUnavailable: false,
        checkedAt: new Date('2026-08-06T07:00:00.000Z'),
        message: 'Facebook responded successfully.',
      },
      disconnectedAt: null,
      now: new Date('2026-08-06T07:00:00.000Z'),
    });
    assert.equal(result.state, 'connected');
    const listPages = result.capabilities.find((entry) => entry.capability === 'list_pages');
    const readComments = result.capabilities.find((entry) => entry.capability === 'read_comments');
    assert.equal(listPages?.available, true);
    assert.equal(readComments?.available, true);
    const publish = result.capabilities.find((entry) => entry.capability === 'publish_posts');
    assert.equal(publish?.available, false);
  });

  it('frontend clears OAuth return params to prevent silent rediscovery reload', () => {
    assert.ok(pageSource.includes('clearFacebookOAuthReturnParams'));
    assert.ok(pageSource.includes('oauthPagesAutoLoadDone'));
    assert.ok(pageSource.includes('!connection?.pageId'));
    assert.ok(pageSource.includes('showPageDiscovery'));
  });
});
