import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'social-connections.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/social-connection.service.ts'), 'utf8');
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/social-connection.ts'),
  'utf8',
);

describe('social connections API envelope & safety (J-6.7F)', () => {
  it('requires auth and marketing/integrations permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('marketing_intelligence:manage'));
    assert.ok(routeSource.includes('integrations:manage'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('exposes OAuth start and callback routes server-side', () => {
    assert.ok(routeSource.includes("'/oauth/start'"));
    assert.ok(routeSource.includes("'/oauth/callback'"));
    assert.ok(serviceSource.includes('hashOAuthState'));
    assert.ok(serviceSource.includes('socialOauthStates'));
  });

  it('never exposes tokens in API responses', () => {
    assert.ok(routeSource.includes('accessToken: undefined'));
    assert.ok(routeSource.includes('credentials: undefined'));
    assert.ok(sharedSource.includes('redactSocialConnectionForApi'));
  });

  it('validates account selection server-side', () => {
    assert.ok(serviceSource.includes('validateSelection'));
    assert.ok(serviceSource.includes('INVALID_SELECTION'));
    assert.ok(serviceSource.includes('not returned by the authenticated provider connection'));
  });

  it('rejects OAuth state replay via consumedAt single-use consume', () => {
    assert.ok(serviceSource.includes('consumedAt'));
    assert.ok(serviceSource.includes('isNull(socialOauthStates.consumedAt)'));
  });

  it('requires Owner initiator on OAuth callback', () => {
    assert.ok(serviceSource.includes('initiatorRoleName'));
    assert.ok(serviceSource.includes('isCompanyOwnerRole'));
    assert.ok(serviceSource.includes('owner_approval.oauth_start'));
  });

  it('delegates Facebook to facebook-business canonical path', () => {
    assert.ok(serviceSource.includes('DELEGATED_TO_FACEBOOK_BUSINESS'));
    assert.ok(serviceSource.includes('fbConnections'));
  });

  it('scopes disconnect and health by companyId', () => {
    assert.ok(serviceSource.includes('eq(socialMediaConnections.companyId, actor.companyId)'));
  });

  it('denies cross-tenant access', () => {
    assert.ok(serviceSource.includes('assertTenantScope'));
    assert.ok(serviceSource.includes('Cross-tenant social connection access denied'));
  });

  it('Owner-controlled connection management', () => {
    assert.ok(serviceSource.includes('canManageSocialConnections'));
    assert.ok(serviceSource.includes('Only the Company Owner may connect'));
  });

  it('Technician and Client denied at shared layer', () => {
    assert.ok(sharedSource.includes("identity.roleName === 'Technician'"));
    assert.ok(sharedSource.includes("identity.roleName === 'Client'"));
  });

  it('does not expose publishing or scheduling', () => {
    assert.ok(routeSource.includes('publishingAvailable: false as const'));
    assert.ok(routeSource.includes('schedulingAvailable: false as const'));
    assert.ok(routeSource.includes('analyticsAvailable: false as const'));
  });

  it('writes security audit logs for connect lifecycle', () => {
    assert.ok(serviceSource.includes("action: `social_connection."));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes("'oauth.start'"));
    assert.ok(serviceSource.includes("'disconnect'"));
  });

  it('exposes exactly three social publishing providers in shared registry', () => {
    assert.ok(sharedSource.includes("SOCIAL_PUBLISHING_PROVIDERS"));
    assert.ok(sharedSource.includes("'facebook'"));
    assert.ok(sharedSource.includes("'instagram'"));
    assert.ok(sharedSource.includes("'tiktok'"));
    assert.ok(sharedSource.includes('BUSINESS_PROFILE_INTEGRATION_SOURCE'));
    assert.ok(sharedSource.includes('COMMUNICATIONS_WHATSAPP_INTEGRATION_SOURCE'));
  });

  it('rejects non-social providers at service layer', () => {
    assert.ok(serviceSource.includes('assertSocialPublishingProvider'));
    assert.ok(serviceSource.includes('NOT_SOCIAL_PUBLISHING_PROVIDER'));
  });

  it('TikTok provider review honesty', () => {
    assert.ok(sharedSource.includes('PROVIDER_REVIEW_REQUIRED'));
    assert.ok(serviceSource.includes('PROVIDER_REVIEW_REQUIRED'));
  });
});
