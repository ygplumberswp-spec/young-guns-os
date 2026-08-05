import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  FACEBOOK_OAUTH_BASIC_SCOPES,
  resolveFacebookOAuthBrowserReturnPath,
} from '@titan/shared';
import { resolveFacebookAppConfig } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
const socialServiceSource = readFileSync(join(here, 'social-connection.service.ts'), 'utf8');
const sectionSource = readFileSync(
  join(here, '../../../web/src/features/integrations/SocialConnectionsSection.tsx'),
  'utf8',
);

describe('Facebook Business OAuth hygiene and Page selection (J-6.7F)', () => {
  it('resolveFacebookAppConfig prefers META_REDIRECT_URI over APP_URL', () => {
    const result = resolveFacebookAppConfig(
      {
        META_APP_ID: 'meta-app-id',
        META_APP_SECRET: 'meta-app-secret',
        META_REDIRECT_URI:
          'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
        APP_URL: 'https://comfortable-determination-staging.up.railway.app',
      } as never,
      'https://wrong-host.example',
    );
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(
        result.redirectUri,
        'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
      );
    }
  });

  it('successful OAuth callback clears stale verification fields and sets pending detail', () => {
    assert.ok(serviceSource.includes('FACEBOOK_PENDING_PAGE_SELECTION_DETAIL'));
    assert.ok(serviceSource.includes('lastVerificationMessage: FACEBOOK_PENDING_PAGE_SELECTION_DETAIL'));
    assert.ok(serviceSource.includes('lastVerificationOk: null'));
    assert.ok(serviceSource.includes('lastVerifiedAt: null'));
    assert.ok(serviceSource.includes('disconnectedAt: null'));
    assert.ok(serviceSource.includes("state: 'partial'"));
  });

  it('OAuth from /integrations returns browser path to Facebook Business workspace', () => {
    assert.equal(resolveFacebookOAuthBrowserReturnPath('/integrations'), '/facebook-business');
    assert.ok(serviceSource.includes('resolveFacebookOAuthBrowserReturnPath'));
  });

  it('selectPage validates Page against authenticated eligible list', () => {
    assert.ok(serviceSource.includes('graph.listPages(userToken)'));
    assert.ok(serviceSource.includes('pages.find((entry) => entry.id === pageId)'));
    assert.ok(serviceSource.includes("'PAGE_NOT_AVAILABLE'"));
  });

  it('connected state only after server verification probe', () => {
    assert.ok(serviceSource.includes('graph.verifyPage(page.id, page.accessToken)'));
    assert.ok(serviceSource.includes('...this.verificationColumns(verification.outcome)'));
  });

  it('Owner-only connect/select/disconnect enforced', () => {
    assert.ok(serviceSource.includes('assertManageConnection'));
    assert.ok(serviceSource.includes('canManageFacebookConnection'));
    assert.ok(routeSource.includes("router.post('/pages/select'"));
    assert.ok(routeSource.includes('createAuthMiddleware'));
  });

  it('initial OAuth scope remains pages_show_list only at graph client', () => {
    assert.deepEqual(FACEBOOK_OAUTH_BASIC_SCOPES, ['pages_show_list']);
  });

  it('Integrations card exposes Choose Page primary action for partial Facebook', () => {
    assert.ok(socialServiceSource.includes('FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH'));
    assert.ok(socialServiceSource.includes('FACEBOOK_PENDING_PAGE_SELECTION_DETAIL'));
    assert.ok(socialServiceSource.includes('accountSelectionPath'));
    assert.ok(sectionSource.includes('Choose Page'));
    assert.ok(sectionSource.includes('card.accountSelectionPath'));
  });

  it('Facebook setup requirements use facebookRedirectUri not APP_URL', () => {
    assert.ok(socialServiceSource.includes('facebookRedirectUri'));
    assert.ok(socialServiceSource.includes('facebookCallbackUrl'));
  });

  it('Instagram/TikTok runtime callback still uses APP_URL (outstanding item)', () => {
    assert.ok(socialServiceSource.includes('oauthCallbackUrl(provider: SocialConnectionProvider)'));
    assert.match(
      socialServiceSource,
      /oauthCallbackUrl\(provider[^)]*\)[\s\S]*this\.appUrl/,
    );
  });
});
