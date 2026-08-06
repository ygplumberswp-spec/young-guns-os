import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceToNextStage,
  buildImportSyncResult,
  clearStaleStageFailuresOnResume,
  createInitialImportJobState,
  isStageComplete,
  parseImportJobState,
  sumImportFailureCounts,
  XERO_IMPORT_BATCH_BUDGET_MS,
  XERO_IMPORT_MAX_PAGES_PER_BATCH,
} from './xero-import-job.processor.js';
import { XERO_PAGE_SIZE } from '../lib/xero.client.js';

test('createInitialImportJobState starts at the first stage with every page at 1', () => {
  const state = createInitialImportJobState();
  // Reference data leads the pipeline so line items resolve to real accounts and tracking.
  assert.equal(state.checkpoint.stage, 'accounts');
  assert.equal(state.checkpoint.contactsPage, 1);
  assert.equal(state.checkpoint.billsPage, 1);
  assert.equal(state.checkpoint.creditNotesPage, 1);
  assert.equal(state.checkpoint.attachmentsOffset, 0);
  assert.deepEqual(state.completedStages, []);
});

test('isStageComplete detects partial and final contact pages', () => {
  const checkpoint = createInitialImportJobState().checkpoint;
  assert.equal(isStageComplete('contacts', checkpoint, XERO_PAGE_SIZE), false);
  assert.equal(isStageComplete('contacts', checkpoint, XERO_PAGE_SIZE - 1), true);
  assert.equal(isStageComplete('contacts', checkpoint, 0), true);
});

test('advanceToNextStage marks contacts complete and moves to quotes', () => {
  const state = createInitialImportJobState({ checkpoint: { stage: 'contacts' } });
  const hasNext = advanceToNextStage(state);
  assert.equal(hasNext, true);
  assert.deepEqual(state.completedStages, ['contacts']);
  assert.equal(state.checkpoint.stage, 'quotes');
});

test('advanceToNextStage completes the final attachments stage', () => {
  const state = createInitialImportJobState({ checkpoint: { stage: 'attachments' } });
  const hasNext = advanceToNextStage(state);
  assert.equal(hasNext, false);
  assert.deepEqual(state.completedStages, ['attachments']);
});

test('bank_transactions is no longer the final stage', () => {
  const state = createInitialImportJobState({ checkpoint: { stage: 'bank_transactions' } });
  assert.equal(advanceToNextStage(state), true);
  assert.equal(state.checkpoint.stage, 'attachments');
});

test('parseImportJobState restores checkpoint for resume', () => {
  const restored = parseImportJobState({
    checkpoint: {
      stage: 'invoices',
      contactsPage: 3,
      invoicesPage: 2,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
    completedStages: ['contacts'],
    contacts: { createdCount: 10, updatedCount: 2, pulledCount: 12, failedCount: 0, skippedCount: 0 },
  });

  assert.equal(restored.checkpoint.stage, 'invoices');
  assert.equal(restored.checkpoint.contactsPage, 3);
  assert.equal(restored.contacts.createdCount, 10);
  assert.deepEqual(restored.completedStages, ['contacts']);
});

test('batch budgets avoid whole-sync 90s wall clock', () => {
  assert.equal(XERO_IMPORT_BATCH_BUDGET_MS, 45_000);
  assert.ok(XERO_IMPORT_BATCH_BUDGET_MS < 90_000);
  assert.ok(XERO_IMPORT_MAX_PAGES_PER_BATCH >= 1);
});

test('clearStaleStageFailuresOnResume drops failures from completed earlier stages', () => {
  const state = createInitialImportJobState({
    checkpoint: {
      stage: 'bank_transactions',
      contactsPage: 8,
      quotesPage: 2,
      invoicesPage: 7,
      paymentsPage: 7,
      bankTransactionsPage: 34,
    },
  });
  state.completedStages = ['contacts', 'quotes', 'invoices', 'payments', 'bank_transactions'];
  state.contacts.failedCount = 673;
  state.quotes.failedCount = 2;
  state.invoices.failedCount = 585;
  state.bankTransactions.createdCount = 3062;
  state.bankTransactions.updatedCount = 16;
  state.bankTransactions.pulledCount = 3078;

  clearStaleStageFailuresOnResume(state);

  assert.equal(state.contacts.failedCount, 0);
  assert.equal(state.quotes.failedCount, 0);
  assert.equal(state.invoices.failedCount, 0);
  assert.equal(state.payments.failedCount, 0);
  assert.equal(sumImportFailureCounts(state), 0);

  // The records are still missing, so the resumed run reports what it did not cover.
  assert.equal(state.carriedFailureCount, 1260);
  const result = buildImportSyncResult(state, 'job-id', null);
  assert.match(result.message, /1260 record\(s\) failed in stages this run resumed past/);
});

test('clearStaleStageFailuresOnResume keeps failures for the active checkpoint stage', () => {
  const state = createInitialImportJobState({
    checkpoint: {
      stage: 'invoices',
      contactsPage: 8,
      invoicesPage: 3,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
  });
  state.completedStages = ['contacts'];
  state.contacts.failedCount = 12;
  state.invoices.failedCount = 4;

  clearStaleStageFailuresOnResume(state);

  assert.equal(state.contacts.failedCount, 0);
  assert.equal(state.invoices.failedCount, 4);
  assert.equal(sumImportFailureCounts(state), 4);
});
