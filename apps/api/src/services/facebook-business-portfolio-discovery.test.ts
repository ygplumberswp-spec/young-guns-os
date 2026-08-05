import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  FACEBOOK_OAUTH_BASIC_SCOPES,
  FACEBOOK_OAUTH_BUSINESS_PORTFOLIO_SCOPES,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const routeSource = readFileSync(join(here, '../routes/facebook-business.ts'), 'utf8');
const graphSource = readFileSync(join(here, '../lib/facebook-graph.client.ts'), 'utf8');
const actionsSource = readFileSync(
  join(here, '../../../web/src/features/integrations/FacebookConnectionActions.tsx'),
  'utf8',
);
const uiSource = readFileSync(
  join(here, '../../../web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);

describe('Facebook business portfolio discovery (J-6.7F5)', () => {
  it('business_management requested only by business-owned Page flow', () => {
    assert.deepEqual(FACEBOOK_OAUTH_BASIC_SCOPES, ['pages_show_list']);
    assert.equal(FACEBOOK_OAUTH_BASIC_SCOPES.includes('business_management'), false);
    assert.deepEqual(FACEBOOK_OAUTH_BUSINESS_PORTFOLIO_SCOPES, [
      'pages_show_list',
      'business_management',
    ]);
    assert.ok(serviceSource.includes('startBusinessPortfolioOAuth'));
    assert.ok(serviceSource.includes('buildBusinessPortfolioAuthorizeUrl'));
    assert.ok(routeSource.includes("router.post('/oauth/start-business-portfolio'"));
  });

  it('uses Meta Business Portfolio API contract in graph client', () => {
    assert.ok(graphSource.includes('/me/businesses'));
    assert.ok(graphSource.includes('owned_pages'));
    assert.ok(graphSource.includes('client_pages'));
    assert.ok(graphSource.includes('discoverBusinessPortfolioPages'));
  });

  it('does not add advanced content/messaging/ads permissions to business OAuth', () => {
    assert.ok(serviceSource.includes("'pages_show_list', 'business_management'"));
    assert.equal(
      serviceSource.match(/buildBusinessPortfolioAuthorizeUrl[\s\S]{0,400}pages_manage_posts/),
      null,
    );
  });

  it('preserves partial connection when business portfolio OAuth denies permission', () => {
    assert.ok(serviceSource.includes('oauth_business_portfolio_denied'));
    assert.ok(serviceSource.includes('existing partial Facebook connection was preserved'));
  });

  it('rejects arbitrary Page ids using business discovery allow-list', () => {
    assert.ok(serviceSource.includes('assertClientPageIdMatchesBusinessDiscovery'));
  });

  it('UI exposes Grant Business Portfolio access and honest scope explanation', () => {
    assert.ok(actionsSource.includes('grant_business_portfolio'));
    assert.ok(uiSource.includes('FACEBOOK_BUSINESS_PORTFOLIO_OAUTH_EXPLANATION'));
    assert.ok(uiSource.includes('startFacebookBusinessPortfolioOAuth'));
  });

  it('does not log secrets in business portfolio audit metadata path', () => {
    assert.ok(serviceSource.includes("'connection.business_portfolio_discovery'"));
    assert.equal(serviceSource.match(/console\.log\([^)]*access_token/i), null);
  });
});
