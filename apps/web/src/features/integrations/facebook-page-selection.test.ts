import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  join(here, '../../pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const apiClientSource = readFileSync(
  join(here, '../../lib/facebook-business-api-client.ts'),
  'utf8',
);
const routeSource = readFileSync(
  join(here, '../../../../api/src/routes/facebook-business.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(here, '../../../../api/src/services/facebook-business.service.ts'),
  'utf8',
);
const instagramSource = readFileSync(
  join(here, '../../../../api/src/services/social-connection.service.ts'),
  'utf8',
);

describe('Facebook Page selection path (J-6.7F9 / J-6.7F10 / J-6.7F11)', () => {
  it('Use this Page button has explicit onClick and type="button"', () => {
    assert.ok(pageSource.includes('function UseThisPageButton'));
    assert.ok(pageSource.includes('onClick={() => onSelectPage(pageId)}'));
    assert.ok(pageSource.includes('type="button"'));
    assert.ok(pageSource.includes("'Use this Page'"));
  });

  it('selection uses dedicated state — not shared withAction/isBusy', () => {
    assert.ok(pageSource.includes('isSelectingPage'));
    assert.ok(pageSource.includes('Selecting Page…'));
    assert.ok(pageSource.includes('pageSelectInFlight'));
    assert.match(pageSource, /async function handleSelectPage[\s\S]*selectFacebookPage/);
    assert.equal(pageSource.includes('handleSelectPage(pageId: string) {\n    if (!accessToken || !canManage) return;\n    await withAction'), false);
  });

  it('duplicate selection guarded and button disabled while selecting', () => {
    assert.ok(pageSource.includes('if (pageSelectInFlight.current)'));
    assert.ok(pageSource.includes('pageSelectInFlight.current = true'));
    assert.ok(pageSource.includes('disabled={selectionBlocked || isThisPageSelecting}'));
    assert.ok(pageSource.includes('isThisPageSelecting ? \'Selecting Page…\''));
  });

  it('client does not gate selection on hardcoded verified Page id (J-6.7F10)', () => {
    assert.equal(
      pageSource.includes('Only the verified Young Guns Plumbing Page can be selected'),
      false,
    );
    assert.ok(pageSource.includes('pageSelectionError'));
    assert.ok(pageSource.includes('role="alert"'));
    assert.ok(pageSource.includes('pageDiscoveryRowSelectable'));
  });

  it('reconnect uses controlled wizard OAuth — not plain connect OAuth', () => {
    assert.ok(pageSource.includes('startFacebookReconnectWizardOAuth'));
    assert.ok(pageSource.includes('onReconnect={handleReconnect}'));
    assert.ok(pageSource.includes('FACEBOOK_RECONNECT_WIZARD_OAUTH_EXPLANATION'));
    assert.ok(pageSource.includes("outcome === 'reconnect-wizard'"));
    assert.ok(apiClientSource.includes('/oauth/start-reconnect-wizard'));
    assert.ok(routeSource.includes("router.post('/oauth/start-reconnect-wizard'"));
    assert.ok(serviceSource.includes('buildReconnectWizardAuthorizeUrl'));
  });

  it('basic selection uses server discovery session — verify runs after commit when read granted (J-6.7F12)', () => {
    assert.ok(pageSource.includes('pageDiscovery?.discoverySessionToken'));
    assert.ok(apiClientSource.includes('discoverySessionToken'));
    assert.ok(routeSource.includes('discoverySessionToken'));
    const selectBlock = serviceSource.slice(
      serviceSource.indexOf('async selectPage('),
      serviceSource.indexOf('private isDiscoverySessionConsumed'),
    );
    assert.equal(selectBlock.includes('verifyPageTokenViaMe'), false);
    assert.ok(selectBlock.includes('hasFacebookPageReadEngagement'));
    assert.ok(selectBlock.includes('graph.verifyPage(page.id, page.accessToken)'));
  });

  it('API client posts authenticated pageId and discoverySessionToken only', () => {
    assert.ok(apiClientSource.includes("`${BASE}/pages/select`"));
    assert.ok(apiClientSource.includes('body: { pageId, discoverySessionToken }'));
    assert.equal(apiClientSource.includes('accessToken: page.accessToken'), false);
    assert.equal(apiClientSource.includes('pageAccessToken'), false);
  });

  it('backend route contract is POST /pages/select with pageId and discoverySessionToken', () => {
    assert.ok(routeSource.includes("router.post('/pages/select'"));
    assert.ok(routeSource.includes('selectPageSchema'));
    assert.ok(routeSource.includes('discoverySessionToken'));
  });

  it('selectPage validates Meta discovery session and writes atomically', () => {
    assert.ok(serviceSource.includes('parseFacebookPageDiscoverySessionToken'));
    assert.ok(serviceSource.includes('resolveSelectableRowFromDiscoverySession'));
    assert.ok(serviceSource.includes('assertProviderPageRowMatchesSelection'));
    assert.ok(serviceSource.includes('await this.db.transaction'));
    assert.ok(serviceSource.includes('providerVerifiedPageId: page.id'));
    assert.ok(serviceSource.includes('encryptFacebookCredentials'));
  });

  it('success path refreshes connection, clears discovery panel, and clears OAuth return params', () => {
    assert.ok(pageSource.includes('setConnection(next)'));
    assert.ok(pageSource.includes('setPageDiscovery(null)'));
    assert.ok(pageSource.includes('clearFacebookOAuthReturnParams()'));
    assert.ok(pageSource.includes('oauthPagesAutoLoadDone.current = true'));
    assert.ok(pageSource.includes('await load()'));
    assert.ok(pageSource.includes("next.state === 'connected_limited'"));
    assert.ok(pageSource.includes('Grant Page read access when you are ready'));
    assert.ok(pageSource.includes('showPageDiscovery'));
  });

  it('OAuth auto-load does not rerun after page is already selected (J-6.7F12)', () => {
    assert.ok(pageSource.includes('oauthPagesAutoLoadDone'));
    assert.ok(pageSource.includes('!connection?.pageId'));
  });

  it('page-level alert surfaces selection errors outside discovery panel (J-6.7F12)', () => {
    assert.ok(pageSource.includes('Page selection failed'));
    assert.ok(pageSource.includes('pageSelectionError ?'));
  });

  it('failure path preserves credentials and shows sanitized error', () => {
    assert.ok(pageSource.includes('Your stored credentials were preserved'));
    assert.ok(pageSource.includes('setPageSelectionError'));
    assert.ok(pageSource.includes('setIsSelectingPage(false)'));
    assert.equal(pageSource.includes('disconnectFacebook'), true);
  });

  it('does not auto-start Page-read OAuth on selection success', () => {
    assert.equal(
      pageSource.includes('handleSelectPage') &&
        pageSource.includes('startFacebookPageReadOAuth') &&
        /handleSelectPage[\s\S]{0,400}startFacebookPageReadOAuth/.test(pageSource),
      false,
    );
  });

  it('Instagram/TikTok social connection service unchanged', () => {
    assert.equal(instagramSource.includes('selectFacebookPage'), false);
    assert.equal(instagramSource.includes('UseThisPageButton'), false);
  });
});
