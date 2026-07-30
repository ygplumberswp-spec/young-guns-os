import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiRoutingCache,
  buildTenantSnapshotCacheKey,
  resilienceConfigVersion,
} from './ai-routing-cache.js';

test('aiRoutingCache stores allowance summaries until TTL expires', () => {
  aiRoutingCache.invalidateAll();

  const summary = {
    unlimited: false,
    titanLimitsEnforced: true,
    subscriptionRequired: false,
    allowed: true,
    reason: null,
    monthlyTokenLimit: 1000,
    monthlyTokensUsed: 10,
    monthlyCostCents: 0,
    hardSpendingLimitEnabled: false,
    hardSpendingLimitCents: null,
  };

  aiRoutingCache.setAllowance('tenant-a', summary);
  assert.deepEqual(aiRoutingCache.getAllowance('tenant-a'), summary);
});

test('aiRoutingCache invalidates tenant-scoped entries without affecting other tenants', () => {
  aiRoutingCache.invalidateAll();

  const unlimitedSummary = {
    unlimited: true,
    titanLimitsEnforced: false,
    subscriptionRequired: false,
    allowed: true,
    reason: null,
    monthlyTokenLimit: null,
    monthlyTokensUsed: 0,
    monthlyCostCents: 0,
    hardSpendingLimitEnabled: false,
    hardSpendingLimitCents: null,
  };

  aiRoutingCache.setAllowance('tenant-a', unlimitedSummary);
  aiRoutingCache.setAllowance('tenant-b', unlimitedSummary);
  aiRoutingCache.invalidateTenant('tenant-a');

  assert.equal(aiRoutingCache.getAllowance('tenant-a'), null);
  assert.notEqual(aiRoutingCache.getAllowance('tenant-b'), null);
});

test('buildTenantSnapshotCacheKey includes routing category', () => {
  assert.equal(buildTenantSnapshotCacheKey('tenant-a', 'summarization'), 'tenant-a:summarization');
  assert.equal(buildTenantSnapshotCacheKey('tenant-a', undefined), 'tenant-a:none');
});

test('resilienceConfigVersion derives from updatedAt and policy fields', () => {
  const version = resilienceConfigVersion({
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    fallbackOrder: [{ providerKey: 'openai' }],
    blockedCategories: ['coding'],
    taskRoutingEnabled: true,
  } as never);

  assert.match(version, /2026-01-01T00:00:00.000Z/);
  assert.match(version, /1/);
});
