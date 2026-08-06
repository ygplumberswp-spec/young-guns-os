import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_OVERVIEW_STATUS_WORDS,
  deriveHubEnterpriseConnectionStatus,
} from './enterprise-connection-status';
import {
  INTEGRATION_OVERVIEW_PROVIDER_COPY,
  resolveIntegrationOverviewDescription,
} from './integration-overview-copy';

const here = dirname(fileURLToPath(import.meta.url));

test('overview copy avoids technical backend wording', () => {
  for (const copy of Object.values(INTEGRATION_OVERVIEW_PROVIDER_COPY)) {
    for (const text of [copy.connected, copy.notConnected]) {
      assert.doesNotMatch(text, /sync|oauth|token|scope|webhook|api/i);
      for (const word of FORBIDDEN_OVERVIEW_STATUS_WORDS) {
        assert.doesNotMatch(text, new RegExp(`\\b${word}\\b`, 'i'));
      }
    }
  }
});

test('attention and limited statuses use non-technical explanations', () => {
  assert.match(
    resolveIntegrationOverviewDescription({ providerKey: 'xero', status: 'attention_required' }),
    /review/i,
  );
  assert.match(
    resolveIntegrationOverviewDescription({ providerKey: 'xero', status: 'connected_limited' }),
    /permission/i,
  );
});

test('connected xero uses business-friendly connected copy', () => {
  const description = resolveIntegrationOverviewDescription({
    providerKey: 'xero',
    status: 'connected',
  });
  assert.match(description, /invoices/i);
  assert.doesNotMatch(description, /verification and future/i);
});

test('integrations overview uses unified IntegrationOverviewCard component', () => {
  const dashboardSource = readFileSync(
    join(here, '../../pages/integrations/IntegrationsDashboardPage.tsx'),
    'utf8',
  );
  const socialSource = readFileSync(join(here, 'SocialConnectionsSection.tsx'), 'utf8');
  const cardSource = readFileSync(join(here, 'IntegrationOverviewCard.tsx'), 'utf8');
  const cssSource = readFileSync(join(here, '../../index.css'), 'utf8');

  assert.match(dashboardSource, /HubProviderOverviewCard/);
  assert.match(dashboardSource, /IntegrationOverviewSection/);
  assert.match(dashboardSource, /loading/);
  assert.match(socialSource, /SocialProviderOverviewCard/);
  assert.match(cardSource, /IntegrationProviderMark/);
  assert.match(cardSource, /integration-overview-card/);
  assert.match(cssSource, /\.integration-overview-grid/);
  assert.match(cssSource, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(dashboardSource, /SimpleProviderRow/);
});

test('hub enterprise status never surfaces Synced label on overview cards', () => {
  const status = deriveHubEnterpriseConnectionStatus(
    {
      provider: 'xero',
      name: 'Xero',
      description: 'raw backend description',
      category: 'accounting',
      availability: 'available',
      settingsPath: '/integrations/xero',
      supportsSync: true,
      supportsWebhooks: false,
      connectionId: '1',
      connectionStatus: 'connected',
      isConfigured: true,
      lastSyncAt: null,
      lastError: null,
      connectedAt: null,
      capabilityState: 'connected_usable',
      capabilityLabel: 'Connected',
      canConnect: true,
      canSend: false,
    },
    {
      provider: 'xero',
      integrationProvider: 'xero',
      displayName: 'Xero',
      implementation: 'full',
      uiState: 'synced',
      uiStateLabel: 'Synced',
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
    },
  );

  assert.equal(status, 'connected');
});
