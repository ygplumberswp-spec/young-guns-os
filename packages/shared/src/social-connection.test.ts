import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSelectedAccountLabel,
  canAccessSocialConnections,
  canManageSocialConnections,
  formatSocialConnectionFoundationStatus,
  hasCompleteAccountSelection,
  resolveSocialConnectionFoundationStatus,
  SOCIAL_CONNECTION_PROVIDERS,
} from './social-connection.js';

describe('social-connection foundation (J-6.7F)', () => {
  const owner = { roleName: 'Company Owner', permissions: ['marketing:write'] };
  const adminManage = {
    roleName: 'Office Admin',
    permissions: ['marketing_intelligence:manage'],
  };
  const adminRead = { roleName: 'Office Admin', permissions: ['marketing:write'] };
  const technician = { roleName: 'Technician', permissions: ['marketing:write'] };
  const client = { roleName: 'Client', permissions: ['*'] };

  it('exposes five J-6.7F providers', () => {
    assert.deepEqual(SOCIAL_CONNECTION_PROVIDERS, [
      'facebook',
      'instagram',
      'google_business',
      'whatsapp_business',
      'tiktok',
    ]);
  });

  it('Owner connection access', () => {
    assert.equal(canAccessSocialConnections(owner), true);
    assert.equal(canManageSocialConnections(owner), true);
  });

  it('Admin permission boundaries — manage requires Owner-level approval', () => {
    assert.equal(canAccessSocialConnections(adminManage), true);
    assert.equal(canManageSocialConnections(adminManage), true);
    assert.equal(canAccessSocialConnections(adminRead), true);
    assert.equal(canManageSocialConnections(adminRead), false);
  });

  it('Technician denial', () => {
    assert.equal(canAccessSocialConnections(technician), false);
    assert.equal(canManageSocialConnections(technician), false);
  });

  it('Client denial', () => {
    assert.equal(canAccessSocialConnections(client), false);
    assert.equal(canManageSocialConnections(client), false);
  });

  it('resolves NOT_CONFIGURED without encryption key', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'facebook',
      oauthAppConfigured: true,
      encryptionKeyConfigured: false,
      hasCredentials: false,
      hasAccountSelection: false,
    });
    assert.equal(status, 'NOT_CONFIGURED');
  });

  it('resolves READY_TO_CONNECT when configured but no credentials', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'facebook',
      oauthAppConfigured: true,
      encryptionKeyConfigured: true,
      hasCredentials: false,
      hasAccountSelection: false,
    });
    assert.equal(status, 'READY_TO_CONNECT');
  });

  it('resolves ACCOUNT_SELECTION_REQUIRED with credentials but no selection', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'instagram',
      oauthAppConfigured: true,
      encryptionKeyConfigured: true,
      hasCredentials: true,
      hasAccountSelection: false,
    });
    assert.equal(status, 'ACCOUNT_SELECTION_REQUIRED');
  });

  it('resolves CONNECTED only with credentials and validated selection', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'google_business',
      oauthAppConfigured: true,
      encryptionKeyConfigured: true,
      hasCredentials: true,
      hasAccountSelection: true,
    });
    assert.equal(status, 'CONNECTED');
  });

  it('never resolves CONNECTED without account selection', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'facebook',
      oauthAppConfigured: true,
      encryptionKeyConfigured: true,
      hasCredentials: true,
      hasAccountSelection: false,
    });
    assert.notEqual(status, 'CONNECTED');
  });

  it('TikTok reports PROVIDER_REVIEW_REQUIRED when flagged', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'tiktok',
      oauthAppConfigured: false,
      encryptionKeyConfigured: true,
      hasCredentials: false,
      hasAccountSelection: false,
      providerReviewRequired: true,
    });
    assert.equal(status, 'PROVIDER_REVIEW_REQUIRED');
  });

  it('RECONNECT_REQUIRED when token expired', () => {
    const status = resolveSocialConnectionFoundationStatus({
      provider: 'facebook',
      oauthAppConfigured: true,
      encryptionKeyConfigured: true,
      hasCredentials: true,
      hasAccountSelection: true,
      tokenExpired: true,
    });
    assert.equal(status, 'RECONNECT_REQUIRED');
  });

  it('validates account selection per provider', () => {
    assert.equal(
      hasCompleteAccountSelection('facebook', { selectedFacebookPageId: 'page-1' }),
      true,
    );
    assert.equal(
      hasCompleteAccountSelection('google_business', {
        selectedGoogleBusinessAccountId: 'acc',
        selectedGoogleBusinessLocationId: 'loc',
      }),
      true,
    );
    assert.equal(
      hasCompleteAccountSelection('whatsapp_business', {
        selectedWhatsappBusinessAccountId: 'waba',
        selectedWhatsappPhoneNumberId: 'phone',
      }),
      true,
    );
  });

  it('builds selected account label safely', () => {
    const label = buildSelectedAccountLabel('facebook', {
      selectedFacebookPageName: 'Young Guns Plumbing',
    });
    assert.equal(label, 'Young Guns Plumbing');
  });

  it('formats foundation status labels', () => {
    assert.equal(formatSocialConnectionFoundationStatus('ACCOUNT_SELECTION_REQUIRED'), 'Account selection required');
    assert.equal(formatSocialConnectionFoundationStatus('PROVIDER_REVIEW_REQUIRED'), 'Provider review required');
  });
});
