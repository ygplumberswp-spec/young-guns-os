import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSocialConnectionSetupRequirements,
  canManageSocialConnections,
  canViewSocialConnections,
  isCompanyOwnerRole,
  mapFacebookStateToFoundationStatus,
  SOCIAL_CONNECTION_CANONICAL_SOURCES,
  SOCIAL_CONNECTION_PROVIDERS,
} from './social-connection.js';

describe('social-connection owner-gate audit (J-6.7F)', () => {
  const owner = { roleName: 'Company Owner', permissions: ['marketing:write'] };
  const adminManage = {
    roleName: 'Office Admin',
    permissions: ['marketing_intelligence:manage'],
  };
  const adminRead = { roleName: 'Office Admin', permissions: ['marketing:read'] };
  const technician = { roleName: 'Technician', permissions: ['marketing:write'] };
  const client = { roleName: 'Client', permissions: ['*'] };

  it('Owner may view and manage connections', () => {
    assert.equal(canViewSocialConnections(owner), true);
    assert.equal(canManageSocialConnections(owner), true);
    assert.equal(isCompanyOwnerRole('Company Owner'), true);
  });

  it('Admin with marketing_intelligence:manage may view but not manage', () => {
    assert.equal(canViewSocialConnections(adminManage), true);
    assert.equal(canManageSocialConnections(adminManage), false);
  });

  it('Admin with marketing:read may view but not manage', () => {
    assert.equal(canViewSocialConnections(adminRead), true);
    assert.equal(canManageSocialConnections(adminRead), false);
  });

  it('Technician denial', () => {
    assert.equal(canViewSocialConnections(technician), false);
    assert.equal(canManageSocialConnections(technician), false);
  });

  it('Client denial', () => {
    assert.equal(canViewSocialConnections(client), false);
    assert.equal(canManageSocialConnections(client), false);
  });

  it('social publishing registry contains exactly three providers', () => {
    assert.deepEqual(SOCIAL_CONNECTION_PROVIDERS, ['facebook', 'instagram', 'tiktok']);
    assert.equal(SOCIAL_CONNECTION_CANONICAL_SOURCES.facebook.table, 'fb_connections');
    assert.equal(SOCIAL_CONNECTION_CANONICAL_SOURCES.instagram.table, 'social_media_connections');
    assert.equal(SOCIAL_CONNECTION_CANONICAL_SOURCES.tiktok.table, 'social_media_connections');
  });

  it('maps Facebook partial state to account selection required', () => {
    assert.equal(mapFacebookStateToFoundationStatus('partial'), 'ACCOUNT_SELECTION_REQUIRED');
    assert.equal(mapFacebookStateToFoundationStatus('connected'), 'CONNECTED');
  });

  it('Facebook setup requirements use explicit API callback, not web APP_URL', () => {
    const webOrigin = 'https://comfortable-determination-staging.up.railway.app';
    const apiCallback =
      'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback';
    const requirements = buildSocialConnectionSetupRequirements('facebook', webOrigin, {
      facebookCallbackUrl: apiCallback,
    });
    assert.equal(requirements.callbackUrlPattern, apiCallback);
    assert.equal(requirements.callbackUrlPattern.includes('comfortable-determination'), false);
  });

  it('Instagram setup requirements still derive callback from provided base URL', () => {
    const webOrigin = 'https://comfortable-determination-staging.up.railway.app';
    const requirements = buildSocialConnectionSetupRequirements('instagram', webOrigin);
    assert.equal(
      requirements.callbackUrlPattern,
      `${webOrigin}/api/v1/social-connections/oauth/callback?provider=instagram`,
    );
  });
});
