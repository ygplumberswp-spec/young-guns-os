import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeXeroScopes,
  buildXeroConnectionHealthSummary,
  classifyXeroAttachmentRootCause,
  parseScopeString,
  redactXeroSecrets,
  XERO_REQUESTED_SCOPES,
} from './xero-connection-health.js';

test('parseScopeString normalizes OAuth scope response', () => {
  assert.deepEqual(parseScopeString('openid email accounting.contacts'), [
    'accounting.contacts',
    'email',
    'openid',
  ]);
});

test('analyzeXeroScopes identifies missing attachment read scope', () => {
  const analysis = analyzeXeroScopes({
    grantedScopes: ['accounting.contacts', 'accounting.invoices'],
    requestedScopes: XERO_REQUESTED_SCOPES,
  });
  assert.ok(analysis.missingOptionalScopes.includes('accounting.attachments.read'));
  assert.equal(analysis.attachmentsReadGranted, false);
});

test('buildXeroConnectionHealthSummary marks limited permissions when attachment scope missing', () => {
  const health = buildXeroConnectionHealthSummary({
    organisationName: 'Young Guns Plumbing',
    tenantId: 'tenant-1',
    connectedAt: '2026-08-01T00:00:00.000Z',
    lastSuccessfulTokenRefreshAt: null,
    tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    lastConnectionCheckAt: '2026-08-06T00:00:00.000Z',
    hasCredentials: true,
    connectionStatus: 'connected',
    reconnectRequired: false,
    grantedScopes: [
      'accounting.settings',
      'accounting.contacts',
      'accounting.invoices',
      'accounting.payments',
      'accounting.banktransactions',
    ],
    lastError: null,
  });
  assert.equal(health.healthState, 'connected_limited');
  assert.ok(health.reconnectReason?.includes('attachments.read'));
});

test('classifyXeroAttachmentRootCause detects stale token missing scope', () => {
  const scopeAnalysis = analyzeXeroScopes({
    grantedScopes: ['accounting.contacts'],
  });
  const cause = classifyXeroAttachmentRootCause({
    attachmentCount: 0,
    scopeAnalysis,
    stageErrorCode: 'AUTH_FAILED',
    stageError: 'Verify the tenant ID and granted scopes',
    tenantIdPresent: true,
  });
  assert.equal(cause, 'stale_token_missing_scope');
});

test('secrets are not echoed in redact helper', () => {
  const redacted = redactXeroSecrets('Bearer abc123 refresh_token=secret');
  assert.ok(redacted?.includes('[REDACTED]'));
  assert.ok(!redacted?.includes('abc123'));
});
