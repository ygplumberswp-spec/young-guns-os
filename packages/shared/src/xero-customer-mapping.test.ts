import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCustomerMapping,
  summarizeCustomerMappingReport,
} from './xero-customer-mapping.js';

test('existing Xero Contact ID is confirmed linked', () => {
  const result = classifyCustomerMapping({
    customerId: 'c1',
    customerName: 'Acme',
    customerEmail: 'a@example.com',
    customerPhone: null,
    existingXeroContactId: 'xero-1',
    emailMatches: [],
    phoneMatches: [],
    exactNameMatches: [],
  });
  assert.equal(result.classification, 'confirmed_linked');
  assert.equal(result.reviewRequired, false);
});

test('exact email match is safe deterministic', () => {
  const result = classifyCustomerMapping({
    customerId: 'c1',
    customerName: 'Acme',
    customerEmail: 'a@example.com',
    customerPhone: null,
    existingXeroContactId: null,
    emailMatches: [
      {
        xeroContactId: 'xero-1',
        name: 'Acme Pty',
        email: 'a@example.com',
        phone: null,
        isArchived: false,
      },
    ],
    phoneMatches: [],
    exactNameMatches: [],
  });
  assert.equal(result.classification, 'safe_deterministic_match');
});

test('name-only match requires review — no fuzzy auto-merge', () => {
  const result = classifyCustomerMapping({
    customerId: 'c1',
    customerName: 'Acme Plumbing',
    customerEmail: null,
    customerPhone: null,
    existingXeroContactId: null,
    emailMatches: [],
    phoneMatches: [],
    exactNameMatches: [
      {
        xeroContactId: 'xero-1',
        name: 'acme plumbing',
        email: null,
        phone: null,
        isArchived: false,
      },
    ],
  });
  assert.equal(result.classification, 'possible_match_review_required');
  assert.equal(result.reviewRequired, true);
});

test('summarizeCustomerMappingReport counts unmapped customers', () => {
  const summary = summarizeCustomerMappingReport([
    classifyCustomerMapping({
      customerId: 'c1',
      customerName: 'Linked',
      customerEmail: null,
      customerPhone: null,
      existingXeroContactId: 'x1',
      emailMatches: [],
      phoneMatches: [],
      exactNameMatches: [],
    }),
    classifyCustomerMapping({
      customerId: 'c2',
      customerName: 'Unmapped',
      customerEmail: null,
      customerPhone: null,
      existingXeroContactId: null,
      emailMatches: [],
      phoneMatches: [],
      exactNameMatches: [],
    }),
  ]);
  assert.equal(summary.confirmedLinked, 1);
  assert.equal(summary.unmappedCustomers, 1);
});
