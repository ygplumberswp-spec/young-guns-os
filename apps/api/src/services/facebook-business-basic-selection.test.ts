import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
const pageSource = readFileSync(
  join(here, '../../../web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const apiClientSource = readFileSync(
  join(here, '../../../web/src/lib/facebook-business-api-client.ts'),
  'utf8',
);
const instagramSource = readFileSync(join(here, 'social-connection.service.ts'), 'utf8');

describe('Facebook basic Page selection without pages_read_engagement (J-6.7F11)', () => {
  it('selectPage does not call Page-object or Page-token /me verification during basic selection', () => {
    const selectBlock = serviceSource.slice(
      serviceSource.indexOf('async selectPage('),
      serviceSource.indexOf('private isDiscoverySessionConsumed'),
    );
    assert.equal(selectBlock.includes('verifyPageTokenViaMe'), false);
    assert.equal(selectBlock.includes('verifyPage('), false);
    assert.equal(selectBlock.includes('lookupPageDirect'), false);
    assert.equal(selectBlock.includes('assertFacebookPageIdentityAgreement'), false);
  });

  it('selectPage requires encrypted discovery session token and resolves server-side row', () => {
    assert.ok(serviceSource.includes('parseFacebookPageDiscoverySessionToken'));
    assert.ok(serviceSource.includes('resolveSelectableRowFromDiscoverySession'));
    assert.ok(serviceSource.includes('assertDiscoverySessionBinding'));
    assert.ok(serviceSource.includes('discoverySessionToken: string'));
    assert.ok(routeSource.includes('discoverySessionToken'));
    assert.ok(apiClientSource.includes('discoverySessionToken'));
    assert.ok(pageSource.includes('pageDiscovery?.discoverySessionToken'));
  });

  it('basic selection stores provider row atomically and defers Page-details verification', () => {
    const selectBlock = serviceSource.slice(
      serviceSource.indexOf('async selectPage('),
      serviceSource.indexOf('private isDiscoverySessionConsumed'),
    );
    assert.ok(selectBlock.includes('pageDetailsVerificationPending: true'));
    assert.ok(selectBlock.includes('FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE'));
    assert.ok(selectBlock.includes('await this.db.transaction'));
    assert.ok(selectBlock.includes('providerVerifiedPageId: page.id'));
    assert.ok(selectBlock.includes('pageIdentityVerified: false'));
  });

  it('checkConnection skips Page-object verification until pages_read_engagement', () => {
    const checkBlock = serviceSource.slice(
      serviceSource.indexOf('async checkConnection('),
      serviceSource.indexOf('async disconnect('),
    );
    assert.ok(checkBlock.includes('hasFacebookPageReadEngagement'));
    assert.match(checkBlock, /if \(!hasFacebookPageReadEngagement[\s\S]*return this\.getConnection/);
  });

  it('page-read OAuth callback performs Page-details verification after permission grant', () => {
    assert.ok(serviceSource.includes("oauthTier === 'page_read'"));
    assert.ok(serviceSource.includes('graph.verifyPage(existing.pageId'));
  });

  it('browser submits pageId and discoverySessionToken only — never Page tokens', () => {
    assert.ok(apiClientSource.includes('body: { pageId, discoverySessionToken }'));
    assert.equal(apiClientSource.includes('pageAccessToken'), false);
    assert.equal(pageSource.includes('accessToken: page.accessToken'), false);
  });

  it('Instagram/TikTok social connection service unchanged', () => {
    assert.equal(instagramSource.includes('discoverySessionToken'), false);
    assert.equal(instagramSource.includes('verifyPageTokenViaMe'), false);
  });
});
