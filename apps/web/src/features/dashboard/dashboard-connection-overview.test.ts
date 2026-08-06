import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type {
  IntegrationProviderAutoSyncStatus,
  IntegrationProviderStatus,
  SocialConnectionProviderCard,
} from '@titan/shared';
import {
  FORBIDDEN_OVERVIEW_STATUS_WORDS,
  deriveHubEnterpriseConnectionStatus,
} from '../integrations/enterprise-connection-status';
import {
  buildDashboardConnectionOverviewRows,
  buildHubDashboardConnectionRow,
  dashboardConnectionsFooterState,
} from './dashboard-connection-overview.js';

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

function socialCard(
  overrides: Partial<SocialConnectionProviderCard> = {},
): SocialConnectionProviderCard {
  return {
    provider: 'facebook',
    label: 'Facebook',
    foundationStatus: 'NOT_CONFIGURED',
    facebookConnectionState: 'disconnected',
    statusLabel: 'Not connected',
    selectedAccountLabel: null,
    oauthAppConfigured: true,
    authorizeUrlAvailable: true,
    hasCredentials: false,
    liveProviderVerified: false,
    lastHealthCheckAt: null,
    lastError: null,
    safeErrorMessage: null,
    setupRequirementCategory: null,
    canConnect: true,
    canCompleteAccountSelection: false,
    canReconnect: false,
    canDisconnect: false,
    canViewSetupRequirements: false,
    connectionId: null,
    updatedAt: null,
    disconnectedAt: null,
    delegatedTo: 'facebook_business',
    managementPath: '/facebook-business',
    ...overrides,
  };
}

describe('dashboard connection overview', () => {
  it('maps disconnected hub providers to Not connected', () => {
    const row = buildHubDashboardConnectionRow(hubProvider({ provider: 'gmail', name: 'Gmail' }));
    assert.equal(row.status, 'not_connected');
    assert.equal(row.statusLabel, 'Not connected');
    assert.equal(row.actionLabel, 'Connect');
  });

  it('never marks not_configured providers as Connected', () => {
    for (const key of ['gmail', 'cartrack', 'yoco', 'whatsapp', 'google_maps'] as const) {
      const status = deriveHubEnterpriseConnectionStatus(
        hubProvider({ provider: key, capabilityState: 'not_configured', isConfigured: true }),
      );
      assert.notEqual(status, 'connected', `${key} must not appear Connected without hub evidence`);
    }
  });

  it('maps limited access consistently with integrations overview', () => {
    const hubRow = buildHubDashboardConnectionRow(
      hubProvider({ capabilityState: 'connected_usable', connectionStatus: 'connected' }),
      autoSync({ uiState: 'permission_incomplete', scopeProblems: ['accounting.attachments.read'] }),
    );
    const integrationsStatus = deriveHubEnterpriseConnectionStatus(
      hubProvider({ capabilityState: 'connected_usable', connectionStatus: 'connected' }),
      autoSync({ uiState: 'permission_incomplete', scopeProblems: ['accounting.attachments.read'] }),
    );
    assert.equal(hubRow.status, integrationsStatus);
    assert.equal(hubRow.statusLabel, 'Connected — limited access');
    assert.equal(hubRow.actionLabel, 'Review');
  });

  it('maps action required and temporarily unavailable', () => {
    const attention = buildHubDashboardConnectionRow(
      hubProvider({ capabilityState: 'failed_degraded', connectionStatus: 'error' }),
    );
    assert.equal(attention.status, 'attention_required');
    assert.equal(attention.statusLabel, 'Action required');

    const unavailable = buildHubDashboardConnectionRow(
      hubProvider({ capabilityState: 'temporarily_unavailable' }),
    );
    assert.equal(unavailable.status, 'temporarily_unavailable');
    assert.equal(unavailable.statusLabel, 'Temporarily unavailable');
  });

  it('includes social providers in stable audit order', () => {
    const rows = buildDashboardConnectionOverviewRows({
      hubProviders: [
        hubProvider({ provider: 'xero', name: 'Xero', capabilityState: 'connected_usable' }),
        hubProvider({ provider: 'cartrack', name: 'Cartrack' }),
      ],
      autoSyncByProvider: new Map(),
      socialCards: [
        socialCard({ provider: 'facebook', label: 'Facebook' }),
        socialCard({ provider: 'instagram', label: 'Instagram' }),
        socialCard({ provider: 'tiktok', label: 'TikTok' }),
      ],
    });
    assert.deepEqual(
      rows.map((row) => row.providerKey),
      ['xero', 'facebook', 'cartrack', 'instagram', 'tiktok'],
    );
  });

  it('uses needs_setup footer state instead of Partial when providers need attention', () => {
    assert.equal(
      dashboardConnectionsFooterState([
        buildHubDashboardConnectionRow(
          hubProvider({ capabilityState: 'connected_usable', connectionStatus: 'connected' }),
        ),
        buildHubDashboardConnectionRow(hubProvider({ provider: 'gmail', name: 'Gmail' })),
      ]),
      'needs_setup',
    );
  });

  it('dashboard and integrations sources share enterprise mapper and forbid Synced on overview', () => {
    const connectionsSource = readFileSync(join(here, 'ConnectionsPanel.tsx'), 'utf8');
    const hubCardSource = readFileSync(
      join(here, '../integrations/HubProviderOverviewCard.tsx'),
      'utf8',
    );

    assert.match(connectionsSource, /buildDashboardConnectionOverviewRows/);
    assert.match(connectionsSource, /EnterpriseConnectionStatusLine/);
    assert.match(hubCardSource, /deriveHubEnterpriseConnectionStatus/);
    assert.doesNotMatch(connectionsSource, /\bSynced\b/);
    assert.doesNotMatch(connectionsSource, /integration-honesty/);

    for (const word of FORBIDDEN_OVERVIEW_STATUS_WORDS) {
      assert.doesNotMatch(connectionsSource, new RegExp(`\\b${word}\\b`));
    }
  });
});
