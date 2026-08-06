import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_OVERVIEW_STATUS_WORDS } from './enterprise-connection-status';
import {
  mapBooleanConnectionToEnterpriseLabel,
  mapFleetConnectionDisplayToEnterpriseLabel,
  mapSocialMediaFoundationStatusLabel,
} from './enterprise-overview-status';

const here = dirname(fileURLToPath(import.meta.url));

test('social foundation connected (credentials only) never maps to enterprise Connected', () => {
  assert.equal(mapSocialMediaFoundationStatusLabel('connected'), 'Action required');
  assert.equal(mapSocialMediaFoundationStatusLabel('not_configured'), 'Not connected');
  assert.equal(mapSocialMediaFoundationStatusLabel('disconnected'), 'Not connected');
});

test('fleet display labels map to enterprise overview vocabulary', () => {
  assert.equal(mapFleetConnectionDisplayToEnterpriseLabel('Connected'), 'Connected');
  assert.equal(mapFleetConnectionDisplayToEnterpriseLabel('Disconnected'), 'Not connected');
  assert.equal(mapFleetConnectionDisplayToEnterpriseLabel('Stale sync'), 'Action required');
});

test('boolean overview stat cards use Not connected not Disconnected', () => {
  assert.equal(mapBooleanConnectionToEnterpriseLabel(true), 'Connected');
  assert.equal(mapBooleanConnectionToEnterpriseLabel(false), 'Not connected');
});

test('overview integration surfaces forbid Synced and legacy Attention labels', () => {
  const paths = [
    'features/dashboard/ConnectionsPanel.tsx',
    'features/dashboard/FleetOverviewPanel.tsx',
    'features/dashboard/LiveOperationsPanel.tsx',
    'pages/fleet-intelligence/FleetIntelligencePage.tsx',
    'pages/social-media-integrations/SocialMediaIntegrationsPage.tsx',
    'pages/communications-hub/CommunicationsHubPage.tsx',
    'features/integrations/IntegrationOverviewCard.tsx',
    'features/integrations/HubProviderOverviewCard.tsx',
    'features/integrations/SocialProviderOverviewCard.tsx',
  ];

  for (const relativePath of paths) {
    const source = readFileSync(join(here, '../../', relativePath), 'utf8');
    assert.doesNotMatch(source, /\bSynced\b/, `${relativePath} must not contain Synced`);
    assert.doesNotMatch(source, /\bAttention\b/, `${relativePath} must not contain Attention`);
    assert.doesNotMatch(source, /integration-honesty/, `${relativePath} must not use integration-honesty`);
    for (const word of FORBIDDEN_OVERVIEW_STATUS_WORDS) {
      if (word === 'Failed' && relativePath.includes('LiveOperationsPanel')) {
        continue;
      }
      if (word === 'Partial' && relativePath.includes('FleetIntelligence')) {
        continue;
      }
      assert.doesNotMatch(source, new RegExp(`\\b${word}\\b`), `${relativePath} must not contain ${word}`);
    }
  }
});
