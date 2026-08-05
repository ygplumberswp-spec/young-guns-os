import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  FACEBOOK_OAUTH_BASIC_SCOPES,
  YOUNG_GUNS_FACEBOOK_PAGE_ID,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
const pageSource = readFileSync(
  join(here, '../../../web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const graphSource = readFileSync(join(here, '../lib/facebook-graph.client.ts'), 'utf8');
const instagramSource = readFileSync(join(here, 'social-connection.service.ts'), 'utf8');

describe('Facebook direct page validation fallback (J-6.7F2 / J-6.7F3)', () => {
  it('graph client exposes two-stage lookupPageDirect without tasks field', () => {
    assert.ok(graphSource.includes('lookupPageDirect'));
    assert.ok(graphSource.includes('FACEBOOK_DIRECT_PAGE_IDENTITY_FIELDS'));
    assert.ok(graphSource.includes('FACEBOOK_DIRECT_PAGE_TOKEN_FIELDS'));
    assert.ok(graphSource.includes('lookupPageDirectStage'));
    assert.equal(graphSource.includes('access_token,tasks'), false);
  });

  it('discoverPagesForSelection attempts direct lookup when list is empty', () => {
    assert.ok(serviceSource.includes('lookupPageDirect'));
    assert.ok(serviceSource.includes('buildFacebookDirectPageLookupSanitized'));
    assert.ok(serviceSource.includes('shouldAttemptDirectLookup'));
    assert.ok(serviceSource.includes('connection.direct_page_lookup'));
  });

  it('selectPage rejects arbitrary client Page id', () => {
    assert.ok(serviceSource.includes('assertClientPageIdMatchesPendingCandidate'));
    assert.ok(serviceSource.includes("'PAGE_NOT_AUTHORISED'"));
  });

  it('selectPage uses direct lookup token path for server candidate', () => {
    assert.ok(serviceSource.includes("phase: 'select_page'"));
    assert.ok(serviceSource.includes('pageAccessToken: page.accessToken'));
    assert.ok(serviceSource.includes('encryptFacebookCredentials'));
  });

  it('pending Page candidate is server-controlled from tenant/metadata', () => {
    assert.ok(serviceSource.includes('resolvePendingPageCandidateForCompany'));
    assert.ok(serviceSource.includes('pendingPageCandidate'));
    assert.ok(serviceSource.includes('isYoungGunsFinanceTenant'));
  });

  it('OAuth callback stores pending Page candidate in metadata', () => {
    assert.match(serviceSource, /metadata:[\s\S]*pendingPageCandidate/);
  });

  it('routes expose directLookup in pages response and map new error codes', () => {
    assert.ok(routeSource.includes('directLookup: discovery.directLookup'));
    assert.ok(routeSource.includes('DIRECT_PAGE_PERMISSION_DENIED'));
    assert.ok(routeSource.includes('DIRECT_PAGE_INVALID_FIELD'));
    assert.ok(routeSource.includes('DIRECT_PAGE_IDENTITY_AVAILABLE'));
    assert.ok(routeSource.includes('PAGE_NOT_AUTHORISED'));
    assert.ok(routeSource.includes('PAGE_IDENTITY_MISMATCH'));
  });

  it('UI shows two-stage direct lookup diagnosis without exposing Page tokens', () => {
    assert.ok(pageSource.includes('Direct Page lookup'));
    assert.ok(pageSource.includes('formatDirectPageLookupDiagnosis'));
    assert.ok(pageSource.includes('FACEBOOK_DIRECT_PAGE_LOOKUP_STATUS_LABELS'));
    assert.ok(pageSource.includes('Identity probe fields'));
    assert.ok(pageSource.includes('Token probe fields'));
    assert.ok(pageSource.includes('Provider message classification'));
    assert.ok(pageSource.includes('Has access_token: ${directLookup.hasAccessToken}'));
    assert.equal(pageSource.includes('does not administer any Pages'), false);
    assert.equal(pageSource.includes('directLookup.access_token'), false);
  });

  it('business_management remains absent from initial OAuth scopes', () => {
    assert.deepEqual(FACEBOOK_OAUTH_BASIC_SCOPES, ['pages_show_list']);
    assert.equal(FACEBOOK_OAUTH_BASIC_SCOPES.includes('business_management'), false);
  });

  it('known Young Guns Page id is server constant not browser input', () => {
    assert.equal(YOUNG_GUNS_FACEBOOK_PAGE_ID, '61564442420962');
    assert.ok(serviceSource.includes('resolvePendingPageCandidate'));
  });

  it('Instagram/TikTok social connection service unchanged for direct lookup', () => {
    assert.equal(instagramSource.includes('lookupPageDirect'), false);
    assert.equal(instagramSource.includes('directLookup'), false);
  });

  it('Owner-only manage connection guard remains on select and pages routes', () => {
    assert.ok(serviceSource.includes('assertManageConnection'));
    assert.ok(routeSource.includes("router.get('/pages'"));
    assert.ok(routeSource.includes("router.post('/pages/select'"));
  });
});
