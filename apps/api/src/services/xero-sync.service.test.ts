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

test('createInitialImportJobState starts at contacts page 1', () => {
  const state = createInitialImportJobState();
  assert.equal(state.checkpoint.stage, 'contacts');
  assert.equal(state.checkpoint.contactsPage, 1);
  assert.deepEqual(state.completedStages, []);
});

test('isStageComplete detects partial and final contact pages', () => {
  const checkpoint = createInitialImportJobState().checkpoint;
  assert.equal(isStageComplete('contacts', checkpoint, XERO_PAGE_SIZE), false);
  assert.equal(isStageComplete('contacts', checkpoint, XERO_PAGE_SIZE - 1), true);
  assert.equal(isStageComplete('contacts', checkpoint, 0), true);
});

test('advanceToNextStage marks contacts complete and moves to invoices', () => {
  const state = createInitialImportJobState();
  const hasNext = advanceToNextStage(state);
  assert.equal(hasNext, true);
  assert.deepEqual(state.completedStages, ['contacts']);
  assert.equal(state.checkpoint.stage, 'invoices');
});

test('advanceToNextStage completes final bank_transactions stage', () => {
  const state = createInitialImportJobState({
    checkpoint: {
      stage: 'bank_transactions',
      contactsPage: 2,
      invoicesPage: 1,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
  });
  const hasNext = advanceToNextStage(state);
  assert.equal(hasNext, false);
  assert.deepEqual(state.completedStages, ['bank_transactions']);
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
      invoicesPage: 7,
      paymentsPage: 7,
      bankTransactionsPage: 34,
    },
  });
  state.completedStages = ['contacts', 'invoices', 'payments', 'bank_transactions'];
  state.contacts.failedCount = 673;
  state.invoices.failedCount = 585;
  state.bankTransactions.createdCount = 3062;
  state.bankTransactions.updatedCount = 16;
  state.bankTransactions.pulledCount = 3078;

  clearStaleStageFailuresOnResume(state);

  assert.equal(state.contacts.failedCount, 0);
  assert.equal(state.invoices.failedCount, 0);
  assert.equal(state.payments.failedCount, 0);
  assert.equal(sumImportFailureCounts(state), 0);

  const result = buildImportSyncResult(state, 'job-id', new Date().toISOString());
  assert.equal(result.success, true);
  assert.match(result.message, /Xero sync complete/);
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
