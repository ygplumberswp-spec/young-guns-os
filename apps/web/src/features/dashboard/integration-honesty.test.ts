import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENTERPRISE_CONNECTION_STATUS_LABELS,
  deriveHubEnterpriseConnectionStatus,
} from '../integrations/enterprise-connection-status.js';
import {
  buildHubDashboardConnectionRow,
  DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS,
} from './dashboard-connection-overview.js';
import { pickOwnerDashboardProviders } from './integration-honesty.js';

/** @deprecated Legacy honesty helpers — dashboard now uses enterprise-connection-status. */
describe('integration-honesty legacy (deprecated)', () => {
  it('dashboard audit provider keys cover core hub and social providers', () => {
    assert.ok(DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS.includes('xero'));
    assert.ok(DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS.includes('facebook'));
    assert.equal(DASHBOARD_CONNECTION_OVERVIEW_PROVIDER_KEYS.length, 9);
  });

  it('pickOwnerDashboardProviders remains stable for hub subset', () => {
    const picked = pickOwnerDashboardProviders([
      {
        provider: 'cartrack',
        name: 'Cartrack',
        description: '',
        category: 'fleet',
        availability: 'available',
        settingsPath: '/integrations/cartrack',
        supportsSync: true,
        supportsWebhooks: false,
        connectionId: null,
        connectionStatus: 'disconnected',
        isConfigured: false,
        lastSyncAt: null,
        lastError: null,
        connectedAt: null,
        capabilityState: 'connected_usable',
        capabilityLabel: 'Connected',
        canConnect: true,
        canSend: false,
      },
    ]);
    assert.equal(picked.length, 1);
    assert.equal(picked[0]?.provider, 'cartrack');
  });

  it('enterprise mapper replaces legacy Attention label with Action required', () => {
    const row = buildHubDashboardConnectionRow({
      provider: 'xero',
      name: 'Xero',
      description: '',
      category: 'accounting',
      availability: 'available',
      settingsPath: '/integrations/xero',
      supportsSync: true,
      supportsWebhooks: false,
      connectionId: '1',
      connectionStatus: 'error',
      isConfigured: true,
      lastSyncAt: null,
      lastError: null,
      connectedAt: null,
      capabilityState: 'failed_degraded',
      capabilityLabel: 'Degraded',
      canConnect: true,
      canSend: false,
    });
    assert.equal(row.statusLabel, ENTERPRISE_CONNECTION_STATUS_LABELS.attention_required);
    assert.equal(
      deriveHubEnterpriseConnectionStatus({
        provider: 'xero',
        name: 'Xero',
        description: '',
        category: 'accounting',
        availability: 'available',
        settingsPath: '/integrations/xero',
        supportsSync: true,
        supportsWebhooks: false,
        connectionId: '1',
        connectionStatus: 'error',
        isConfigured: true,
        lastSyncAt: null,
        lastError: null,
        connectedAt: null,
        capabilityState: 'failed_degraded',
        capabilityLabel: 'Degraded',
        canConnect: true,
        canSend: false,
      }),
      'attention_required',
    );
  });
});
