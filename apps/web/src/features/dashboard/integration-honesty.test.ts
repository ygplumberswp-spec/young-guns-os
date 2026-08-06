import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IntegrationProviderStatus } from '@titan/shared';
import {
  formatOwnerIntegrationHonesty,
  ownerHonestyCtaLabel,
  pickOwnerDashboardProviders,
  toOwnerIntegrationHonesty,
} from './integration-honesty.js';

function stubProvider(
  provider: string,
  capabilityState: IntegrationProviderStatus['capabilityState'],
): IntegrationProviderStatus {
  return {
    provider: provider as IntegrationProviderStatus['provider'],
    name: provider,
    description: '',
    category: 'communications',
    availability: 'available',
    settingsPath: `/integrations/${provider}`,
    supportsSync: false,
    supportsWebhooks: false,
    connectionId: null,
    connectionStatus: 'disconnected',
    isConfigured: false,
    lastSyncAt: null,
    lastError: null,
    connectedAt: null,
    capabilityState,
    capabilityLabel: 'Disconnected',
    canConnect: true,
    canSend: false,
  };
}

describe('owner dashboard integration honesty', () => {
  it('maps capability states to Connected / Attention / Not connected', () => {
    assert.equal(toOwnerIntegrationHonesty('connected_usable'), 'connected');
    assert.equal(toOwnerIntegrationHonesty('failed_degraded'), 'attention');
    assert.equal(toOwnerIntegrationHonesty('temporarily_unavailable'), 'attention');
    assert.equal(toOwnerIntegrationHonesty('configured_unverified'), 'attention');
    assert.equal(toOwnerIntegrationHonesty('disconnected'), 'not_connected');
    assert.equal(toOwnerIntegrationHonesty('not_configured'), 'not_connected');
    assert.equal(toOwnerIntegrationHonesty('not_implemented'), 'not_connected');
  });

  it('formats owner-facing labels', () => {
    assert.equal(formatOwnerIntegrationHonesty('connected'), 'Connected');
    assert.equal(formatOwnerIntegrationHonesty('attention'), 'Attention');
    assert.equal(formatOwnerIntegrationHonesty('not_connected'), 'Not connected');
  });

  it('picks core providers in stable order from hub data', () => {
    const picked = pickOwnerDashboardProviders([
      stubProvider('cartrack', 'connected_usable'),
      stubProvider('gmail', 'not_configured'),
      stubProvider('n8n', 'connected_usable'),
      stubProvider('xero', 'failed_degraded'),
    ]);
    assert.deepEqual(
      picked.map((p) => p.provider),
      ['gmail', 'xero', 'cartrack'],
    );
  });

  it('uses Connect / Review / Manage CTAs by honesty bucket', () => {
    assert.equal(ownerHonestyCtaLabel('not_connected', true), 'Connect');
    assert.equal(ownerHonestyCtaLabel('attention', true), 'Review');
    assert.equal(ownerHonestyCtaLabel('connected', true), 'Manage');
  });
});
