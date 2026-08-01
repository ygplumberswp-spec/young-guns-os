import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildXeroImportSyncMessage,
} from './xero-import-job.shared.js';
import { resolveImportedInvoiceNumber, buildImportedInvoiceFinancialFields, buildSyncedInvoiceMappingLookup } from './xero-sync.service.js';
import {
  XERO_IMPORT_BATCH_BUDGET_MS,
  XERO_IMPORT_STALE_JOB_MS,
  parseImportJobState,
} from './xero-import-job.processor.js';
import { XERO_REQUEST_TIMEOUT_MS } from '../lib/xero.client.js';

test('buildImportedInvoiceFinancialFields maps Xero totals to cents columns', () => {
  const fields = buildImportedInvoiceFinancialFields({
    total: 2472.5,
    subtotal: 2150,
    totalTax: 322.5,
    amountPaid: 0,
  });
  assert.equal(fields.totalCents, 247250);
  assert.equal(fields.amountCents, 247250);
  assert.equal(fields.subtotalCents, 215000);
  assert.equal(fields.vatCents, 32250);
});

test('buildImportedInvoiceFinancialFields falls back to subtotal plus tax when total is zero', () => {
  const fields = buildImportedInvoiceFinancialFields({
    total: 0,
    subtotal: 1000,
    totalTax: 150,
    amountPaid: 0,
  });
  assert.equal(fields.totalCents, 115000);
  assert.equal(fields.amountCents, 115000);
});

test('resolveImportedInvoiceNumber prefers Xero invoice number', () => {
  assert.equal(
    resolveImportedInvoiceNumber('INV-1001', '11111111-2222-3333-4444-555555555555'),
    'INV-1001',
  );
});

test('resolveImportedInvoiceNumber falls back to stable Xero id suffix', () => {
  assert.equal(
    resolveImportedInvoiceNumber(null, '11111111-2222-3333-4444-555555555555'),
    'XERO-11111111',
  );
});

test('buildSyncedInvoiceMappingLookup indexes synced rows by xero invoice id', () => {
  const invoice = {
    id: 'inv-1',
    currency: 'ZAR',
    amountPaidCents: 0,
    amountCents: 10_000,
    status: 'sent' as const,
    invoiceNumber: 'INV-001',
  };
  const lookup = buildSyncedInvoiceMappingLookup([
    {
      invoiceId: 'inv-1',
      xeroInvoiceId: 'xero-a',
      invoice,
    },
    {
      invoiceId: 'inv-2',
      xeroInvoiceId: null,
      invoice: { ...invoice, id: 'inv-2' },
    },
  ]);

  assert.equal(lookup.size, 1);
  assert.equal(lookup.get('xero-a')?.invoiceId, 'inv-1');
  assert.equal(lookup.has('xero-b'), false);
});

test('loadSyncedInvoiceMappingsForPayments select avoids undeployed mapping columns', () => {
  const source = readFileSync(
    new URL('./xero-sync.service.ts', import.meta.url),
    'utf8',
  );
  const fnStart = source.indexOf('private async loadSyncedInvoiceMappingsForPayments');
  const fnEnd = source.indexOf('function emptySyncStatus', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  assert.doesNotMatch(fn, /mapping:\s*xeroInvoiceMappings/);
  assert.match(fn, /invoiceId:\s*xeroInvoiceMappings\.invoiceId/);
  assert.doesNotMatch(fn, /conflictMetadata|conflict_metadata/);
});

test('buildXeroImportSyncMessage reports success counts', () => {
  const message = buildXeroImportSyncMessage({
    success: true,
    contacts: { createdCount: 2, updatedCount: 1, pulledCount: 3, failedCount: 0, skippedCount: 0 },
    invoices: { createdCount: 4, updatedCount: 2, pulledCount: 6, failedCount: 0, skippedCount: 0 },
    payments: { createdCount: 1, updatedCount: 0, pulledCount: 1, failedCount: 0, skippedCount: 0 },
    bankTransactions: {
      createdCount: 5,
      updatedCount: 1,
      pulledCount: 6,
      failedCount: 0,
      skippedCount: 0,
    },
  });

  assert.match(message, /Xero sync complete/);
  assert.match(message, /Contacts 2 new \/ 1 updated/);
  assert.match(message, /invoices 4 new \/ 2 updated/);
});

test('buildXeroImportSyncMessage reports partial failure', () => {
  const message = buildXeroImportSyncMessage({
    success: false,
    contacts: { createdCount: 1, updatedCount: 0, pulledCount: 2, failedCount: 1, skippedCount: 0 },
    invoices: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    payments: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    bankTransactions: {
      createdCount: 0,
      updatedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  });

  assert.match(message, /finished with 1 failed record/);
});

test('buildXeroImportSyncMessage reports failed stage without financial detail', () => {
  const message = buildXeroImportSyncMessage({
    success: false,
    failedStage: 'payments',
    stageError: 'Xero API timed out during payments',
    contacts: { createdCount: 3, updatedCount: 0, pulledCount: 3, failedCount: 0, skippedCount: 0 },
    invoices: { createdCount: 2, updatedCount: 0, pulledCount: 2, failedCount: 0, skippedCount: 0 },
    payments: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    bankTransactions: {
      createdCount: 0,
      updatedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  });

  assert.match(message, /failed during payments/);
  assert.match(message, /timed out during payments/);
  assert.match(message, /Last sync was not updated/);
  assert.doesNotMatch(message, /amount|\$|ZAR|invoice number/i);
});

test('parseImportJobState preserves failedStage and checkpoint for auto-resume eligibility', () => {
  const restored = parseImportJobState({
    failedStage: 'payments',
    stageError: 'Failed query: lateral join',
    checkpoint: {
      stage: 'payments',
      contactsPage: 8,
      invoicesPage: 7,
      paymentsPage: 1,
      bankTransactionsPage: 1,
    },
    completedStages: ['contacts', 'invoices'],
    contacts: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    invoices: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    payments: { createdCount: 0, updatedCount: 0, pulledCount: 0, failedCount: 0, skippedCount: 0 },
    bankTransactions: {
      createdCount: 0,
      updatedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  });

  assert.equal(restored.failedStage, 'payments');
  assert.equal(restored.checkpoint.stage, 'payments');
  assert.deepEqual(restored.completedStages, ['contacts', 'invoices']);
});

test('timeout constants are finite and ordered for safe sync budgets', () => {
  assert.equal(XERO_REQUEST_TIMEOUT_MS, 20_000);
  assert.equal(XERO_IMPORT_BATCH_BUDGET_MS, 45_000);
  assert.equal(XERO_IMPORT_STALE_JOB_MS, 15 * 60_000);
  assert.ok(XERO_REQUEST_TIMEOUT_MS < XERO_IMPORT_BATCH_BUDGET_MS);
  assert.ok(XERO_IMPORT_BATCH_BUDGET_MS < XERO_IMPORT_STALE_JOB_MS);
});
