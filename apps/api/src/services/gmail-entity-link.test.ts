import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractEmailsFromHeader,
  normalizeEmail,
  resolveConfidentGmailEntityLink,
  type GmailEntityLinkLookups,
} from './gmail-entity-link.js';

function emptyLookups(overrides: Partial<GmailEntityLinkLookups> = {}): GmailEntityLinkLookups {
  return {
    customersByEmail: new Map(),
    leadsByEmail: new Map(),
    jobsByCustomerId: new Map(),
    quotesByCustomerId: new Map(),
    invoicesByEmail: new Map(),
    invoicesByCustomerId: new Map(),
    ...overrides,
  };
}

describe('gmail entity linking (confident matches only)', () => {
  it('extracts and normalizes emails from headers', () => {
    assert.deepEqual(
      extractEmailsFromHeader('Jane Doe <jane@example.com>, other@test.co.za'),
      ['jane@example.com', 'other@test.co.za'],
    );
    assert.equal(normalizeEmail('Name <JANE@Example.com>'), 'jane@example.com');
  });

  it('links unique customer email confidently', () => {
    const link = resolveConfidentGmailEntityLink(
      ['jane@example.com'],
      emptyLookups({
        customersByEmail: new Map([['jane@example.com', ['cust-1']]]),
      }),
    );
    assert.deepEqual(link, {
      linkTargetType: 'customer',
      linkTargetId: 'cust-1',
      participantKind: 'customer',
      confidence: 'exact_email',
    });
  });

  it('prefers unique job when customer has exactly one job', () => {
    const link = resolveConfidentGmailEntityLink(
      ['jane@example.com'],
      emptyLookups({
        customersByEmail: new Map([['jane@example.com', ['cust-1']]]),
        jobsByCustomerId: new Map([['cust-1', ['job-9']]]),
      }),
    );
    assert.equal(link?.linkTargetType, 'job');
    assert.equal(link?.linkTargetId, 'job-9');
  });

  it('does not invent a link when multiple customers match', () => {
    const link = resolveConfidentGmailEntityLink(
      ['shared@example.com'],
      emptyLookups({
        customersByEmail: new Map([['shared@example.com', ['cust-1', 'cust-2']]]),
      }),
    );
    assert.equal(link, null);
  });

  it('links unique lead email when no customer match', () => {
    const link = resolveConfidentGmailEntityLink(
      ['lead@example.com'],
      emptyLookups({
        leadsByEmail: new Map([['lead@example.com', ['lead-1']]]),
      }),
    );
    assert.equal(link?.linkTargetType, 'lead');
    assert.equal(link?.linkTargetId, 'lead-1');
  });
});
