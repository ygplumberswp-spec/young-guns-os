import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countQuotesAwaitingCustomerApproval,
  countQuotesFollowUpDue,
  isQuoteAwaitingCustomerApproval,
  isQuoteFollowUpDue,
} from './dashboard-quote-metrics.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');

describe('dashboard quote metrics', () => {
  it('counts awaiting customer approval only for sent/viewed active quotes', () => {
    const rows = [
      { status: 'sent', issuedAt: '2026-08-01T00:00:00.000Z', validUntil: null },
      { status: 'viewed', issuedAt: '2026-08-02T00:00:00.000Z', validUntil: '2026-09-01T00:00:00.000Z' },
      { status: 'internal_review', issuedAt: null, validUntil: null },
      { status: 'approved_for_sending', issuedAt: null, validUntil: null },
      { status: 'accepted', issuedAt: '2026-08-01T00:00:00.000Z', validUntil: null },
      { status: 'sent', issuedAt: '2026-08-01T00:00:00.000Z', validUntil: '2026-08-01T00:00:00.000Z' },
      { status: 'sent', issuedAt: null, validUntil: null },
    ];

    assert.equal(countQuotesAwaitingCustomerApproval(rows, { now: NOW }), 2);
  });

  it('counts follow-ups due independently from awaiting approval', () => {
    const rows = [
      {
        status: 'sent',
        issuedAt: '2026-07-20T00:00:00.000Z',
        validUntil: null,
        scheduledFollowUpAt: null,
        responseStatus: 'none',
      },
      {
        status: 'sent',
        issuedAt: '2026-08-05T00:00:00.000Z',
        validUntil: null,
        scheduledFollowUpAt: '2026-08-06T08:00:00.000Z',
        responseStatus: 'awaiting',
      },
      {
        status: 'viewed',
        issuedAt: '2026-08-05T00:00:00.000Z',
        validUntil: null,
        scheduledFollowUpAt: null,
        responseStatus: 'none',
      },
      {
        status: 'sent',
        issuedAt: '2026-07-20T00:00:00.000Z',
        validUntil: null,
        scheduledFollowUpAt: null,
        responseStatus: 'responded',
      },
    ];

    assert.equal(countQuotesAwaitingCustomerApproval(rows, { now: NOW }), 4);
    assert.equal(countQuotesFollowUpDue(rows, { now: NOW, staleQuoteDays: 7 }), 2);
    assert.notEqual(
      countQuotesAwaitingCustomerApproval(rows, { now: NOW }),
      countQuotesFollowUpDue(rows, { now: NOW, staleQuoteDays: 7 }),
    );
  });

  it('excludes quotes without a real follow-up condition', () => {
    const recent = {
      status: 'sent',
      issuedAt: '2026-08-05T00:00:00.000Z',
      validUntil: null,
      scheduledFollowUpAt: null,
      responseStatus: 'none',
    };
    assert.equal(isQuoteFollowUpDue(recent, { now: NOW, staleQuoteDays: 7 }), false);
    assert.equal(isQuoteAwaitingCustomerApproval(recent, { now: NOW }), true);
  });

  it('uses scheduled follow-up date when present', () => {
    const due = {
      status: 'viewed',
      issuedAt: '2026-08-05T00:00:00.000Z',
      validUntil: null,
      scheduledFollowUpAt: '2026-08-06T08:00:00.000Z',
      responseStatus: 'awaiting',
    };
    assert.equal(isQuoteFollowUpDue(due, { now: NOW }), true);
  });
});
