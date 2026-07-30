import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAPABILITY_MATCH_THRESHOLD,
  indicatesCapabilityCreationIntent,
  indicatesCodeBackedCapability,
  matchCapabilityKeywordRoute,
  scoreCapabilityMessageMatch,
} from './tenant-capability-routing.js';

describe('tenant capability routing', () => {
  it('matches warranty follow-up requests to customer support department', () => {
    const route = matchCapabilityKeywordRoute('Create a warranty follow-up agent for completed jobs');
    assert.ok(route);
    assert.equal(route.department, 'customers');
    assert.equal(route.baseAgentKey, 'customer_support');
  });

  it('detects code-backed capability requests', () => {
    assert.equal(indicatesCodeBackedCapability('We need a new API connector for supplier stock'), true);
    assert.equal(indicatesCodeBackedCapability('Monitor warranty follow-ups'), false);
  });

  it('detects capability creation intent in chat messages', () => {
    assert.equal(indicatesCapabilityCreationIntent('Add an agent that monitors tenders'), true);
    assert.equal(indicatesCapabilityCreationIntent('Show me overdue invoices'), false);
  });

  it('scores active capability matches above threshold', () => {
    const score = scoreCapabilityMessageMatch('Track warranty follow-ups for recent jobs', {
      name: 'Warranty Follow-up Intelligence',
      purpose: 'Follow up on warranty claims and customer satisfaction after completed jobs',
      tags: ['warranty', 'follow-up', 'customer'],
    });
    assert.ok(score >= CAPABILITY_MATCH_THRESHOLD);
  });

  it('keeps department ids aligned with capability groups', () => {
    const departments = [
      'executive',
      'finance',
      'sales',
      'marketing',
      'operations',
      'customers',
      'workforce',
      'inventory',
      'fleet',
      'legal',
      'technology',
    ];
    for (const route of [
      matchCapabilityKeywordRoute('tender monitoring'),
      matchCapabilityKeywordRoute('unpaid invoices'),
      matchCapabilityKeywordRoute('warranty follow up'),
    ]) {
      assert.ok(route);
      assert.ok(departments.includes(route.department));
    }
  });
});
