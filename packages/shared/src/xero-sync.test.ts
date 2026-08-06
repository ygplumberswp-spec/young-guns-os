import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveXeroImportJobUiStatus,
  sumXeroImportProcessedCounts,
  XERO_IMPORT_UI_STATUS_LABELS,
} from './xero-sync.js';

test('sumXeroImportProcessedCounts totals pulled records across stages', () => {
  assert.equal(
    sumXeroImportProcessedCounts({
      contacts: { createdCount: 0, updatedCount: 0, pulledCount: 682, failedCount: 0, skippedCount: 0 },
      invoices: { createdCount: 0, updatedCount: 0, pulledCount: 3, failedCount: 0, skippedCount: 0 },
      payments: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
      bankTransactions: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    }),
    685,
  );
});

test('XERO_IMPORT_UI_STATUS_LABELS covers recovery states', () => {
  assert.equal(XERO_IMPORT_UI_STATUS_LABELS.resuming, 'Resuming');
  assert.equal(XERO_IMPORT_UI_STATUS_LABELS.retrying, 'Retrying');
  assert.equal(XERO_IMPORT_UI_STATUS_LABELS.partial, 'Partial');
  assert.equal(XERO_IMPORT_UI_STATUS_LABELS.waiting, 'Waiting for next batch');
});

test('deriveXeroImportJobUiStatus returns Synced on completed jobs only', () => {
  const result = deriveXeroImportJobUiStatus({ jobStatus: 'completed' });
  assert.equal(result.uiStatus, 'completed');
  assert.equal(result.uiStatusLabel, 'Synced');
});
