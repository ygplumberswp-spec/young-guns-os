import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGeneralPlatformQuestion,
  resolveAuraContextDomains,
  shouldLoadTenantCapabilities,
} from './aura-context-routing.js';

test('detects general platform overview questions', () => {
  assert.equal(
    isGeneralPlatformQuestion('Give me a brief overview of what TITAN can help me manage.'),
    true,
  );
  assert.equal(isGeneralPlatformQuestion('Show overdue invoices for Acme'), false);
});

test('routes overview questions to minimal agents context only', () => {
  const { domains, agentsMinimal } = resolveAuraContextDomains(
    'Give me a brief overview of what TITAN can help me manage.',
  );

  assert.equal(agentsMinimal, true);
  assert.deepEqual([...domains], ['agents']);
});

test('loads page-scoped domains when customer context is active', () => {
  const { domains, agentsMinimal } = resolveAuraContextDomains('Summarize this account', {
    customerId: '00000000-0000-4000-8000-000000000001',
  });

  assert.equal(agentsMinimal, false);
  assert.ok(domains.has('crm'));
  assert.ok(domains.has('communications'));
  assert.ok(domains.has('documents'));
});

test('skips tenant capability enrichment for routine chat', () => {
  assert.equal(
    shouldLoadTenantCapabilities('Give me a brief overview of what TITAN can help me manage.'),
    false,
  );
  assert.equal(shouldLoadTenantCapabilities('Create a new capability for tender monitoring'), true);
});
