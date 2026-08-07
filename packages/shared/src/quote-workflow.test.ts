import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditQuote, canIssueQuote, nextQuoteApprovalAction } from './finance.js';

test('quote approval workflow transitions', () => {
  assert.deepEqual(nextQuoteApprovalAction('draft'), {
    label: 'Submit For Internal Review',
    nextStatus: 'internal_review',
  });
  assert.deepEqual(nextQuoteApprovalAction('internal_review'), {
    label: 'Approve For Sending',
    nextStatus: 'approved_for_sending',
  });
  assert.equal(nextQuoteApprovalAction('approved_for_sending'), null);
});

test('canIssueQuote requires approved_for_sending', () => {
  assert.equal(canIssueQuote({ isImmutable: false, status: 'approved_for_sending' }), true);
  assert.equal(canIssueQuote({ isImmutable: false, status: 'draft' }), false);
  assert.equal(canIssueQuote({ isImmutable: true, status: 'approved_for_sending' }), false);
});

test('canEditQuote allows draft through approved_for_sending', () => {
  assert.equal(canEditQuote({ isImmutable: false, status: 'draft' }), true);
  assert.equal(canEditQuote({ isImmutable: false, status: 'sent' }), false);
});
