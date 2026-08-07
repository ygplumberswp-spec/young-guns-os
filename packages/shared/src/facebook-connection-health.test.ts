import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertFacebookPageReadOAuthUrl,
} from './facebook-business.js';
import {
  buildFacebookConnectedLimitedDetail,
  buildFacebookVerificationTimestamps,
  encodeFacebookPageReadOAuthReturnPath,
  decodeFacebookOAuthTierFromReturnPath,
  FACEBOOK_OAUTH_PAGE_READ_SCOPES,
  mergeFacebookVerificationMetadata,
  persistFacebookConnectionState,
  resolveFacebookFeatureMetricAvailability,
  resolveFacebookTokenExpiryDiagnosis,
} from './facebook-connection-health.js';

describe('facebook connection health (J-6.7F6)', () => {
  it('treats Meta expires_at = 0 as non-expiring, not expired', () => {
    const diagnosis = resolveFacebookTokenExpiryDiagnosis({
      tokenValid: true,
      expiresAtUnix: 0,
    });
    assert.equal(diagnosis.status, 'expires_at_unavailable');
    assert.equal(diagnosis.tokenValid, true);
    assert.equal(diagnosis.tokenExpired, null);
  });

  it('does not mark token expired when expiry is not supplied', () => {
    const diagnosis = resolveFacebookTokenExpiryDiagnosis({
      tokenValid: true,
      expiresAtUnix: null,
    });
    assert.equal(diagnosis.tokenExpired, null);
    assert.equal(diagnosis.status, 'expiry_not_supplied');
  });

  it('shows unavailable metrics when read permission is absent', () => {
    const metric = resolveFacebookFeatureMetricAvailability({
      grantedPermissions: ['pages_show_list', 'business_management'],
      requiredPermission: 'pages_read_engagement',
      numericValue: 0,
      label: 'New leads',
    });
    assert.equal(metric.available, false);
    assert.equal(metric.displayValue, 'Unavailable — permission required');
  });

  it('shows numeric zero only after permission is granted', () => {
    const metric = resolveFacebookFeatureMetricAvailability({
      grantedPermissions: ['pages_read_engagement'],
      requiredPermission: 'pages_read_engagement',
      numericValue: 0,
      label: 'New leads',
    });
    assert.equal(metric.displayValue, '0');
  });

  it('does not update last successful verification on failure', () => {
    const prior = new Date('2026-01-01T00:00:00.000Z');
    const merged = mergeFacebookVerificationMetadata({
      existing: {
        verification: { lastSuccessfulVerificationAt: prior.toISOString() },
      },
      attemptAt: new Date('2026-02-01T00:00:00.000Z'),
      outcome: { ok: false, message: 'permission denied' },
    });
    const verification = merged.verification as { lastSuccessfulVerificationAt?: string };
    assert.equal(verification.lastSuccessfulVerificationAt, prior.toISOString());
  });

  it('updates last successful verification only on success', () => {
    const attempt = new Date('2026-02-01T00:00:00.000Z');
    const merged = mergeFacebookVerificationMetadata({
      existing: {},
      attemptAt: attempt,
      outcome: { ok: true, message: 'ok' },
    });
    const verification = merged.verification as { lastSuccessfulVerificationAt?: string };
    assert.equal(verification.lastSuccessfulVerificationAt, attempt.toISOString());
  });

  it('builds verification timestamps from metadata without treating failed checks as success', () => {
    const timestamps = buildFacebookVerificationTimestamps({
      metadata: {
        verification: {
          lastSuccessfulVerificationAt: '2026-01-01T00:00:00.000Z',
          lastFailedVerificationAt: '2026-02-01T00:00:00.000Z',
        },
      },
      lastVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
      lastVerificationOk: false,
      lastSyncedAt: null,
    });
    assert.equal(timestamps.lastSuccessfulVerificationAt, '2026-01-01T00:00:00.000Z');
    assert.equal(timestamps.lastFailedVerificationAt, '2026-02-01T00:00:00.000Z');
  });

  it('persists connected_limited as connected in DB enum', () => {
    assert.equal(persistFacebookConnectionState('connected_limited'), 'connected');
  });

  it('encodes and decodes page-read OAuth tier return paths', () => {
    const encoded = encodeFacebookPageReadOAuthReturnPath('/facebook-business');
    const decoded = decodeFacebookOAuthTierFromReturnPath(encoded);
    assert.equal(decoded.oauthTier, 'page_read');
    assert.equal(decoded.returnPath, '/facebook-business');
  });

  it('page-read OAuth URL requests only discovery + read scopes', () => {
    const url =
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com&scope=pages_show_list,business_management,pages_read_engagement&state=abc';
    const audit = assertFacebookPageReadOAuthUrl(url);
    assert.equal(audit.ok, true);
    assert.deepEqual(FACEBOOK_OAUTH_PAGE_READ_SCOPES, [
      'pages_show_list',
      'business_management',
      'pages_read_engagement',
    ]);
  });

  it('builds connected-limited detail from Page name', () => {
    assert.match(
      buildFacebookConnectedLimitedDetail('Young Guns Plumbing – Cape Town'),
      /Young Guns Plumbing – Cape Town is connected/,
    );
  });
});
