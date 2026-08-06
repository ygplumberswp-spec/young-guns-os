import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCustomerDuplicateCandidate,
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
  orderCustomerPairIds,
  scoreCustomerDuplicateEvidence,
  type CustomerDuplicateMatchEvidence,
} from './customer-duplicate-merge.js';

describe('customer-duplicate-merge helpers', () => {
  it('normalizes names by lowercasing and stripping punctuation', () => {
    assert.equal(normalizeCustomerNameKey('  Acme (Pty) Ltd. '), 'acme pty ltd');
    assert.equal(normalizeCustomerNameKey('   '), null);
  });

  it('ignores placeholder emails and normalizes phones', () => {
    assert.equal(normalizeCustomerEmailKey('noreply@example.com'), null);
    assert.equal(normalizeCustomerEmailKey('Owner@Acme.co.za'), 'owner@acme.co.za');
    assert.equal(normalizeCustomerPhoneKey('082 555 0101'), '+27825550101');
  });

  it('orders pair ids stably', () => {
    assert.deepEqual(orderCustomerPairIds('b', 'a'), ['a', 'b']);
  });

  it('scores evidence and thresholds candidates', () => {
    const weak: CustomerDuplicateMatchEvidence[] = [
      { reason: 'normalized_name', detail: 'name', weight: 20 },
    ];
    assert.equal(scoreCustomerDuplicateEvidence(weak), 20);
    assert.equal(isCustomerDuplicateCandidate(weak), false);

    const phone: CustomerDuplicateMatchEvidence[] = [
      { reason: 'phone', detail: 'phone', weight: 40 },
    ];
    assert.equal(isCustomerDuplicateCandidate(phone), true);

    const stacked: CustomerDuplicateMatchEvidence[] = [
      { reason: 'normalized_name', detail: 'name', weight: 20 },
      { reason: 'address_overlap', detail: 'addr', weight: 25 },
    ];
    assert.equal(isCustomerDuplicateCandidate(stacked), true);
  });
});
