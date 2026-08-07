import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHistoricalDocumentMatchProposal,
  buildHistoricalIdempotencyKey,
  buildJob360DigitalFileRollup,
  decideHistoricalMatchAction,
  deriveJob360HistoricalCompleteness,
  extractDocumentNumberHint,
  filterHistoricalInternalFinanceForClient,
  historicalQuoteRetainsOriginalNumber,
  isPhysicalStockImportCandidate,
  job360RemainsSearchable,
  normalizeHistoricalSourceProvider,
  normalizeSupplierNameForMatch,
  parseHistoricalAmountToCents,
  paymentImportCreatesLedgerEntry,
  preferXeroCanonicalRecord,
  previewInventoryStockImpact,
  scoreEquipmentHistoricalMatch,
  scoreHistoricalRecordMatch,
  toDbSourceProvider,
} from './historical-import.js';

describe('historical import provenance + matching', () => {
  it('retains original quote/invoice numbers (no renumber check)', () => {
    assert.equal(historicalQuoteRetainsOriginalNumber('Q-1045', 'Q-1045'), true);
    assert.equal(historicalQuoteRetainsOriginalNumber('Q-1045', 'Q-0001'), false);
    assert.equal(historicalQuoteRetainsOriginalNumber('INV-88', 'INV-88'), true);
  });

  it('maps source formats to provenance providers', () => {
    assert.equal(normalizeHistoricalSourceProvider('XERO'), 'XERO');
    assert.equal(normalizeHistoricalSourceProvider(null, 'csv'), 'CSV');
    assert.equal(normalizeHistoricalSourceProvider(null, 'excel'), 'XLSX');
    assert.equal(toDbSourceProvider('XERO'), 'xero');
    assert.equal(toDbSourceProvider('MANUAL_UPLOAD'), 'manual_upload');
  });

  it('prefers existing Xero invoice over CSV duplicate candidate', () => {
    const chosen = preferXeroCanonicalRecord([
      { sourceProvider: 'csv', id: 'a' },
      { sourceProvider: 'xero', id: 'b' },
    ]);
    assert.equal(chosen?.id, 'b');
  });

  it('idempotency keys prefer external id then document number', () => {
    assert.equal(
      buildHistoricalIdempotencyKey({
        entityType: 'invoice',
        sourceProvider: 'xero',
        sourceExternalId: 'INV-EXT-1',
        documentNumber: 'INV-1',
      }),
      'invoice:xero:INV-EXT-1',
    );
    assert.equal(
      buildHistoricalIdempotencyKey({
        entityType: 'quote',
        documentNumber: 'Q-1045',
      }),
      'quote:number:Q-1045',
    );
  });

  it('low-confidence match requires review', () => {
    const scored = scoreHistoricalRecordMatch({
      signals: { customerMatch: true },
    });
    assert.equal(scored.confidence, 'low');
    assert.equal(scored.requiresHumanReview, true);
    assert.equal(decideHistoricalMatchAction('low', true), 'REVIEW');
  });

  it('high confidence number+customer+amount can match', () => {
    const scored = scoreHistoricalRecordMatch({
      signals: { numberMatch: true, customerMatch: true, amountMatch: true },
    });
    assert.equal(scored.confidence, 'high');
    assert.equal(scored.requiresHumanReview, false);
    assert.equal(decideHistoricalMatchAction('high', true), 'MATCHED');
  });

  it('uploaded payment proof does not automatically mark paid', () => {
    assert.equal(paymentImportCreatesLedgerEntry('PROOF_OF_PAYMENT_DOCUMENT', true), false);
    assert.equal(paymentImportCreatesLedgerEntry('PROOF_OF_PAYMENT_DOCUMENT', false), false);
    assert.equal(paymentImportCreatesLedgerEntry('PAYMENT_RECORD', false), false);
    assert.equal(paymentImportCreatesLedgerEntry('PAYMENT_RECORD', true), true);
  });

  it('document upload proposes matches without silent low-confidence link', () => {
    const proposal = buildHistoricalDocumentMatchProposal({
      fileName: 'Q-1045.pdf',
      candidates: [
        {
          entityType: 'quote',
          entityId: 'q1',
          label: 'Quote Q-1045',
          customerName: 'Royal Cape Yacht Club',
          documentNumber: 'Q-1045',
          amountCents: 125000,
          confidence: 'medium',
          score: 60,
          reasons: ['number', 'customer'],
          requiresHumanReview: true,
        },
      ],
    });
    assert.equal(proposal.detectedNumber, 'Q-1045');
    assert.equal(proposal.detectedEntityHint, 'quote');
    assert.equal(proposal.allowSilentLink, false);
    assert.equal(proposal.recommendedAction, 'CHOOSE_DIFFERENT');
  });

  it('extracts invoice/job hints from filenames', () => {
    assert.equal(extractDocumentNumberHint('INV-2201.pdf').detectedEntityHint, 'invoice');
    assert.equal(extractDocumentNumberHint('JOB-000123-photos.zip').detectedEntityHint, 'job');
    assert.equal(extractDocumentNumberHint('proof_of_payment.png').detectedEntityHint, 'payment_proof');
  });

  it('parses amounts without inventing values', () => {
    assert.equal(parseHistoricalAmountToCents('R 1,250.00'), 125000);
    assert.equal(parseHistoricalAmountToCents('125000'), 125000);
    assert.equal(parseHistoricalAmountToCents(''), null);
    assert.equal(parseHistoricalAmountToCents('n/a'), null);
  });

  it('missing photos/payment proof produce truthful partial states', () => {
    const completeness = deriveJob360HistoricalCompleteness({
      isHistorical: true,
      quoteCount: 1,
      invoiceCount: 0,
      paymentCount: 0,
      photoCount: 0,
      hasPaymentProof: false,
      hasCoc: false,
      hasJobCard: false,
    });
    assert.ok(completeness.partialStates.includes('HISTORICAL_PARTIAL_RECORD'));
    assert.ok(completeness.partialStates.includes('NO_PHOTOS_IMPORTED'));
    assert.ok(completeness.partialStates.includes('PAYMENT_PROOF_NOT_AVAILABLE'));
    assert.ok(completeness.partialStates.includes('NO_COC_IMPORTED'));
    assert.equal(completeness.searchableWhenCompleted, true);
  });

  it('Job 360 preserves multiple quotes/invoices/payments counts', () => {
    const completeness = deriveJob360HistoricalCompleteness({
      isHistorical: true,
      quoteCount: 2,
      invoiceCount: 3,
      paymentCount: 2,
      photoCount: 4,
      hasPaymentProof: true,
      hasCoc: true,
      hasJobCard: true,
      hasReport: true,
      hasSignature: true,
    });
    assert.equal(completeness.quoteCount, 2);
    assert.equal(completeness.invoiceCount, 3);
    assert.equal(completeness.paymentCount, 2);
  });

  it('client DTO filter strips internal historical finance', () => {
    const filtered = filterHistoricalInternalFinanceForClient({
      quoteNumber: 'Q-1045',
      totalCents: 100,
      estimatedCostCents: 40,
      grossProfitCents: 60,
      markupBps: 5000,
      marginBps: 4000,
      unitCostCents: 10,
      jpe: { profit: 1 },
      profit: { marginBps: 4000 },
      internalNotes: 'secret',
      status: 'accepted',
    });
    assert.equal(filtered.quoteNumber, 'Q-1045');
    assert.equal(filtered.totalCents, 100);
    assert.equal(filtered.status, 'accepted');
    assert.equal('estimatedCostCents' in filtered, false);
    assert.equal('jpe' in filtered, false);
    assert.equal('internalNotes' in filtered, false);
  });

  it('rejects labour/service as physical stock; accepts fittings', () => {
    assert.equal(isPhysicalStockImportCandidate({ name: 'Call-out fee' }).accepted, false);
    assert.equal(isPhysicalStockImportCandidate({ name: 'Labour hourly' }).accepted, false);
    assert.equal(isPhysicalStockImportCandidate({ name: '15mm copper fitting' }).accepted, true);
  });

  it('inventory stock preview never overwrites existing qty without replace', () => {
    const preview = previewInventoryStockImpact({
      sku: 'FIT-1',
      itemExists: true,
      existingQuantityOnHand: 12,
      proposedQuantity: 40,
      locationName: 'Main Warehouse',
    });
    assert.equal(preview.willWriteStock, false);
    assert.equal(preview.action, 'skip_existing_qty');
    assert.equal(
      previewInventoryStockImpact({
        sku: 'FIT-1',
        itemExists: true,
        existingQuantityOnHand: 12,
        proposedQuantity: -1,
      }).warning?.includes('Negative'),
      true,
    );
  });

  it('price-book style catalogue create does not imply stock write', () => {
    const preview = previewInventoryStockImpact({
      sku: 'PB-1',
      itemExists: false,
      proposedQuantity: null,
    });
    assert.equal(preview.willWriteStock, false);
  });

  it('supplier name normalisation tolerates Pty/Ltd formatting', () => {
    assert.equal(
      normalizeSupplierNameForMatch('Plumblink (Pty) Ltd'),
      normalizeSupplierNameForMatch('Plumblink'),
    );
  });

  it('equipment low-confidence match requires review', () => {
    const scored = scoreEquipmentHistoricalMatch({ customerMatch: true });
    assert.equal(scored.requiresHumanReview, true);
    assert.equal(decideHistoricalMatchAction(scored.confidence, true), 'REVIEW');
  });

  it('completed/paid/archived jobs remain searchable', () => {
    assert.equal(job360RemainsSearchable({ status: 'completed', invoicePaid: true }), true);
    assert.equal(job360RemainsSearchable({ status: 'cancelled', warrantyExpired: true }), true);
    assert.equal(
      job360RemainsSearchable({
        status: 'completed',
        customerInactive: true,
        technicianRemoved: true,
      }),
      true,
    );
  });

  it('Job 360 digital file preserves multi quote/invoice/payment and quality unavailable', () => {
    const rollup = buildJob360DigitalFileRollup({
      hasCustomer: true,
      hasProperty: true,
      quoteCount: 2,
      invoiceCount: 3,
      paymentCount: 2,
      paymentProofCount: 1,
      photoCount: 4,
      documentCount: 5,
      visitCount: 2,
      materialLineCount: 6,
      equipmentCount: 1,
      timelineEventCount: 10,
      hasJobCard: true,
      canViewFinance: true,
    });
    assert.equal(rollup.counts.quotes, 2);
    assert.equal(rollup.counts.invoices, 3);
    assert.equal(rollup.counts.payments, 2);
    assert.equal(rollup.counts.paymentProofDocuments, 1);
    assert.equal(rollup.quality, 'unavailable');
    assert.equal(rollup.qualityModuleImplemented, false);
    assert.equal(rollup.retention.archiveIsNotDeletion, true);
  });
});
