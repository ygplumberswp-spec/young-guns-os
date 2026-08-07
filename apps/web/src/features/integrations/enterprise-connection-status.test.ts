import test from 'node:test';
import assert from 'node:assert/strict';
import type { IntegrationProviderAutoSyncStatus, IntegrationProviderStatus } from '@titan/shared';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveHubEnterpriseConnectionStatus,
  deriveSocialEnterpriseConnectionStatus,
  ENTERPRISE_CONNECTION_ACTION_LABELS,
  ENTERPRISE_CONNECTION_STATUS_LABELS,
  FORBIDDEN_OVERVIEW_STATUS_WORDS,
} from './enterprise-connection-status';

const here = dirname(fileURLToPath(import.meta.url));

function hubProvider(
  overrides: Partial<IntegrationProviderStatus> = {},
): IntegrationProviderStatus {
  return {
    provider: 'xero',
    name: 'Xero',
    description: 'Accounting',
    category: 'accounting',
    availability: 'available',
    settingsPath: '/integrations/xero',
    supportsSync: true,
    supportsWebhooks: false,
    connectionId: null,
    connectionStatus: 'disconnected',
    isConfigured: false,
    lastSyncAt: null,
    lastError: null,
    connectedAt: null,
    capabilityState: 'not_configured',
    capabilityLabel: 'Implemented Not Connected',
    canConnect: true,
    canSend: false,
    ...overrides,
  };
}

function autoSync(
  overrides: Partial<IntegrationProviderAutoSyncStatus> = {},
): IntegrationProviderAutoSyncStatus {
  return {
    provider: 'xero',
    integrationProvider: 'xero',
    displayName: 'Xero',
    implementation: 'full',
    uiState: 'connected',
    uiStateLabel: 'Connected',
    connectionStatus: 'connected',
    autoSyncEnabled: true,
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    nextScheduledSyncAt: null,
    recordsProcessed: null,
    failureCount: 0,
    consecutiveFailures: 0,
    retryStatus: 'idle',
    retryAt: null,
    scopeProblems: [],
    lastError: null,
    correctiveAction: null,
    syncInProgress: false,
    connectorId: null,
    ...overrides,
  };
}

test('connected hub provider maps to Connected with Manage action', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    hubProvider({ capabilityState: 'connected_usable', connectionStatus: 'connected', isConfigured: true }),
    autoSync({ uiState: 'synced', uiStateLabel: 'Synced' }),
  );
  assert.equal(status, 'connected');
  assert.equal(ENTERPRISE_CONNECTION_STATUS_LABELS[status], 'Connected');
  assert.equal(ENTERPRISE_CONNECTION_ACTION_LABELS[status], 'Manage');
});

test('permission incomplete maps to Connected — limited access', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    hubProvider({ capabilityState: 'connected_usable', connectionStatus: 'connected', isConfigured: true }),
    autoSync({ uiState: 'permission_incomplete', scopeProblems: ['accounting.attachments.read'] }),
  );
  assert.equal(status, 'connected_limited');
  assert.equal(ENTERPRISE_CONNECTION_STATUS_LABELS[status], 'Connected — limited access');
  assert.equal(ENTERPRISE_CONNECTION_ACTION_LABELS[status], 'Review');
});

test('disconnected hub provider maps to Not connected with Connect action', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    hubProvider({ capabilityState: 'not_configured' }),
  );
  assert.equal(status, 'not_connected');
  assert.equal(ENTERPRISE_CONNECTION_ACTION_LABELS[status], 'Connect');
});

test('degraded capability maps to Action required', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    hubProvider({ capabilityState: 'failed_degraded', connectionStatus: 'error' }),
  );
  assert.equal(status, 'attention_required');
  assert.equal(ENTERPRISE_CONNECTION_ACTION_LABELS[status], 'Review');
});

test('temporarily unavailable maps to Temporarily unavailable', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    hubProvider({ capabilityState: 'temporarily_unavailable' }),
  );
  assert.equal(status, 'temporarily_unavailable');
  assert.equal(ENTERPRISE_CONNECTION_ACTION_LABELS[status], 'View status');
});

test('Facebook connected maps to Connected', () => {
  const status = deriveSocialEnterpriseConnectionStatus({
    provider: 'facebook',
    label: 'Facebook',
    foundationStatus: 'CONNECTED',
    facebookConnectionState: 'connected',
    statusLabel: 'Connected',
    selectedAccountLabel: null,
    oauthAppConfigured: true,
    authorizeUrlAvailable: true,
    hasCredentials: true,
    liveProviderVerified: true,
    lastHealthCheckAt: null,
    lastError: null,
    safeErrorMessage: null,
    setupRequirementCategory: null,
    canConnect: false,
    canCompleteAccountSelection: false,
    canReconnect: false,
    canDisconnect: true,
    canViewSetupRequirements: false,
    connectionId: '1',
    updatedAt: null,
    disconnectedAt: null,
    delegatedTo: 'facebook_business',
    managementPath: '/facebook-business',
  });
  assert.equal(status, 'connected');
});

test('Facebook connected_limited maps to Connected — limited access', () => {
  const status = deriveSocialEnterpriseConnectionStatus({
    provider: 'facebook',
    label: 'Facebook',
    foundationStatus: 'CONNECTED',
    facebookConnectionState: 'connected_limited',
    statusLabel: 'Connected — limited permissions',
    selectedAccountLabel: null,
    oauthAppConfigured: true,
    authorizeUrlAvailable: true,
    hasCredentials: true,
    liveProviderVerified: true,
    lastHealthCheckAt: null,
    lastError: null,
    safeErrorMessage: null,
    setupRequirementCategory: null,
    canConnect: false,
    canCompleteAccountSelection: false,
    canReconnect: false,
    canDisconnect: true,
    canViewSetupRequirements: false,
    connectionId: '1',
    updatedAt: null,
    disconnectedAt: null,
    delegatedTo: 'facebook_business',
    managementPath: '/facebook-business',
  });
  assert.equal(status, 'connected_limited');
});

test('integrations overview source does not render Synced on cards', () => {
  const cardSource = readFileSync(join(here, 'IntegrationOverviewCard.tsx'), 'utf8');
  const hubSource = readFileSync(join(here, 'HubProviderOverviewCard.tsx'), 'utf8');
  const socialSource = readFileSync(join(here, 'SocialConnectionsSection.tsx'), 'utf8');

  assert.doesNotMatch(hubSource, /uiStateLabel/);
  assert.doesNotMatch(hubSource, /status-pill/);
  assert.doesNotMatch(socialSource, /status-pill/);
  assert.doesNotMatch(socialSource, /card\.statusLabel/);
  assert.match(hubSource, /IntegrationOverviewCard/);
  assert.match(socialSource, /IntegrationOverviewSection/);
  assert.match(cardSource, /EnterpriseConnectionStatusLine/);

  for (const word of FORBIDDEN_OVERVIEW_STATUS_WORDS) {
    assert.doesNotMatch(cardSource, new RegExp(`['"]${word}['"]`));
  }
});
