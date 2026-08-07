/**
 * Historical Import + Job 360 — focused service-level proofs.
 * No demo Royal Cape data; fixtures are isolated to this test file.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDuplicateKey,
  findDuplicates,
} from './enterprise-data-migration-validation.service.js';
import {
  buildDmHistoricalMigrationReport,
  buildHistoricalDocumentMatchProposal,
  buildHistoricalIdempotencyKey,
  decideHistoricalMatchAction,
  deriveJob360HistoricalCompleteness,
  filterHistoricalInternalFinanceForClient,
  historicalQuoteRetainsOriginalNumber,
  paymentImportCreatesLedgerEntry,
  preferXeroCanonicalRecord,
  scoreHistoricalRecordMatch,
  YOUNG_GUNS_FULL_HISTORY_POLICY,
} from '@titan/shared';

describe('historical import duplicate keys', () => {
  it('detects customer / property / job / quote / invoice / payment duplicates', () => {
    assert.equal(
      buildDuplicateKey('customer', { name: 'Acme', email: 'a@example.com' }),
      'customer:a@example.com',
    );
    assert.equal(
      buildDuplicateKey('property', {
        customerName: 'Acme',
        propertyName: 'Main Site',
      }),
      'property:acme|main site',
    );
    assert.equal(
      buildDuplicateKey('job', { jobNumber: 'JOB-000100', customerName: 'Acme', title: 'Leak' }),
      'job:JOB-000100|acme',
    );
    assert.equal(buildDuplicateKey('quote', { quoteNumber: 'Q-1045' }), 'quote:Q-1045');
    assert.equal(buildDuplicateKey('invoice', { invoiceNumber: 'INV-9' }), 'invoice:INV-9');
    assert.equal(
      buildDuplicateKey('payment', {
        invoiceNumber: 'INV-9',
        reference: 'EFT-1',
        amountCents: '5000',
      }),
      'payment:INV-9|eft-1',
    );
  });

  it('findDuplicates is idempotent-friendly and attaches existing entity ids', () => {
    const keys = new Set(['quote:Q-1045']);
    const map = new Map([['quote:Q-1045', 'existing-quote-id']]);
    const dupes = findDuplicates(
      'quote',
      [{ quoteNumber: 'Q-1045', customerName: 'Acme', amountCents: '100' }],
      keys,
      map,
    );
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0]?.existingEntityId, 'existing-quote-id');
  });
});

describe('historical commercial identity + Xero prefer-match', () => {
  it('retains original quote and invoice numbers', () => {
    assert.equal(historicalQuoteRetainsOriginalNumber('Q-1045', 'Q-1045'), true);
    assert.equal(historicalQuoteRetainsOriginalNumber('INV-2201', 'INV-2201'), true);
  });

  it('prefers Xero invoice over CSV twin', () => {
    const chosen = preferXeroCanonicalRecord([
      { id: 'csv', sourceProvider: 'csv' },
      { id: 'xero', sourceProvider: 'xero' },
    ]);
    assert.equal(chosen?.id, 'xero');
  });

  it('idempotency key stabilises re-runs', () => {
    const first = buildHistoricalIdempotencyKey({
      entityType: 'invoice',
      sourceProvider: 'xero',
      sourceExternalId: 'xero-inv-1',
    });
    const second = buildHistoricalIdempotencyKey({
      entityType: 'invoice',
      sourceProvider: 'xero',
      sourceExternalId: 'xero-inv-1',
      documentNumber: 'INV-1',
    });
    assert.equal(first, second);
  });
});

describe('historical match confidence + document upload', () => {
  it('low confidence requires review; does not silent-link', () => {
    const scored = scoreHistoricalRecordMatch({ signals: { customerMatch: true } });
    assert.equal(decideHistoricalMatchAction(scored.confidence, true), 'REVIEW');
    const proposal = buildHistoricalDocumentMatchProposal({
      fileName: 'Q-1045.pdf',
      candidates: [
        {
          entityType: 'quote',
          entityId: 'q1',
          label: 'Quote Q-1045',
          confidence: 'low',
          score: 30,
          reasons: ['customer only'],
          requiresHumanReview: true,
        },
      ],
    });
    assert.equal(proposal.allowSilentLink, false);
  });

  it('payment proof never auto-marks paid', () => {
    assert.equal(paymentImportCreatesLedgerEntry('PROOF_OF_PAYMENT_DOCUMENT', true), false);
  });
});

describe('Job 360 historical chain honesty', () => {
  it('preserves multiple quotes/invoices/partial payments and truthful gaps', () => {
    const completeness = deriveJob360HistoricalCompleteness({
      isHistorical: true,
      quoteCount: 2,
      invoiceCount: 2,
      paymentCount: 1,
      photoCount: 0,
      hasPaymentProof: false,
      hasCoc: false,
      hasJobCard: false,
    });
    assert.equal(completeness.quoteCount, 2);
    assert.equal(completeness.invoiceCount, 2);
    assert.equal(completeness.paymentCount, 1);
    assert.ok(completeness.partialStates.includes('NO_PHOTOS_IMPORTED'));
    assert.ok(completeness.partialStates.includes('PAYMENT_PROOF_NOT_AVAILABLE'));
    assert.equal(completeness.searchableWhenCompleted, true);
  });

  it('client DTO excludes internal historical finance', () => {
    const safe = filterHistoricalInternalFinanceForClient({
      totalCents: 100,
      estimatedCostCents: 40,
      jpe: { x: 1 },
      internalNotes: 'no',
      quoteNumber: 'Q-1',
    });
    assert.equal(safe.quoteNumber, 'Q-1');
    assert.equal('jpe' in safe, false);
    assert.equal('estimatedCostCents' in safe, false);
  });

  it('full-history DM report includes required Owner fields and known gaps', () => {
    assert.equal(YOUNG_GUNS_FULL_HISTORY_POLICY.noArbitraryDateCutoff, true);
    const report = buildDmHistoricalMigrationReport({
      entityType: 'invoice',
      sourceProvider: 'CSV',
      executable: true,
      linkedRowNumbers: [2],
      results: [
        {
          outcome: 'imported',
          mutation: 'created',
          sourceData: { issuedAt: '2016-02-01', invoiceNumber: 'INV-1' },
        },
        {
          outcome: 'imported',
          mutation: 'unchanged',
          sourceData: { issuedAt: '2025-12-01', invoiceNumber: 'INV-2' },
        },
        { outcome: 'failed', sourceData: { issuedAt: '2015-01-01' } },
        { outcome: 'skipped', sourceData: {} },
      ],
    });
    assert.equal(report.syncMode, 'FULL_HISTORY');
    assert.equal(report.noDateFloorApplied, true);
    assert.equal(report.oldestRecordDateImported?.slice(0, 10), '2015-01-01');
    assert.equal(report.newestRecordDateImported?.slice(0, 10), '2025-12-01');
    assert.equal(report.totalRecordsDiscovered, 4);
    assert.equal(report.createdCount, 1);
    assert.equal(report.unchangedCount, 1);
    assert.equal(report.failedCount, 1);
    assert.equal(report.skippedCount, 1);
    assert.ok(report.providerLimitations.length > 0);
  });
});
