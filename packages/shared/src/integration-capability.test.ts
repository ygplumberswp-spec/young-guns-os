import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveIntegrationCapabilityState,
  formatCapabilityStateLabel,
  HONESTY_ONLY_PROVIDERS,
} from './integration-capability.js';

describe('deriveIntegrationCapabilityState', () => {
  it('returns not_implemented when the backend does not exist', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'connected',
        isConfigured: true,
        backendImplemented: false,
      }),
      'not_implemented',
    );
  });

  it('returns not_implemented for planned providers even when marked configured', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'planned',
        connectionStatus: 'disconnected',
        isConfigured: true,
      }),
      'not_implemented',
    );
  });

  it('returns failed_degraded when the connection is in error, regardless of config', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'error',
        isConfigured: true,
        backendImplemented: true,
      }),
      'failed_degraded',
    );
  });

  it('returns connected_usable only when connected AND configured', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'connected',
        isConfigured: true,
        backendImplemented: true,
      }),
      'connected_usable',
    );
  });

  it('returns configured_unverified when connected but not configured', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'connected',
        isConfigured: false,
        backendImplemented: true,
      }),
      'configured_unverified',
    );
  });

  it('returns configured_unverified when pending', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'pending',
        isConfigured: false,
        backendImplemented: true,
      }),
      'configured_unverified',
    );
  });

  it('returns configured_unverified when disconnected but has stored config', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'disconnected',
        isConfigured: true,
        backendImplemented: true,
      }),
      'configured_unverified',
    );
  });

  it('returns not_configured when disconnected with no config at all', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'disconnected',
        isConfigured: false,
        backendImplemented: true,
      }),
      'not_configured',
    );
  });

  it('defaults backendImplemented to true for available providers (no forced not_implemented)', () => {
    assert.equal(
      deriveIntegrationCapabilityState({
        availability: 'available',
        connectionStatus: 'connected',
        isConfigured: true,
      }),
      'connected_usable',
    );
  });
});

describe('formatCapabilityStateLabel', () => {
  it('maps every capability state to its Decision 4 label', () => {
    assert.equal(formatCapabilityStateLabel('connected_usable'), 'Connected');
    assert.equal(formatCapabilityStateLabel('configured_unverified'), 'Setup Required');
    assert.equal(formatCapabilityStateLabel('disconnected'), 'Disconnected');
    assert.equal(formatCapabilityStateLabel('not_configured'), 'Implemented Not Connected');
    assert.equal(formatCapabilityStateLabel('not_implemented'), 'Not Implemented');
    assert.equal(formatCapabilityStateLabel('temporarily_unavailable'), 'Temporarily Unavailable');
    assert.equal(formatCapabilityStateLabel('failed_degraded'), 'Degraded');
  });
});

describe('HONESTY_ONLY_PROVIDERS', () => {
  it('never claims a usable capability state for synthetic providers', () => {
    assert.equal(HONESTY_ONLY_PROVIDERS.length, 0);
  });

  it('no longer lists gmail as honesty-only (real OAuth connector); n8n is Automation-owned', () => {
    assert.equal(HONESTY_ONLY_PROVIDERS.length, 0);
  });
});
