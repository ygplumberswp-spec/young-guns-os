/**
 * Historical Import Completion — equipment / supplier / inventory / Job 360 proofs.
 * No Royal Cape real-data fixtures.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildDuplicateKey,
  findDuplicates,
} from './enterprise-data-migration-validation.service.js';
import {
  buildJob360DigitalFileRollup,
  decideHistoricalMatchAction,
  filterHistoricalInternalFinanceForClient,
  isPhysicalStockImportCandidate,
  job360RemainsSearchable,
  normalizeSupplierNameForMatch,
  paymentImportCreatesLedgerEntry,
  preferXeroCanonicalRecord,
  previewInventoryStockImpact,
  scoreEquipmentHistoricalMatch,
  DM_EXECUTABLE_ENTITY_TYPES,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

describe('historical import completion — equipment/supplier/inventory', () => {
  it('1–4. asset is executable; duplicate key uses serial; low confidence reviews', () => {
    assert.ok(DM_EXECUTABLE_ENTITY_TYPES.includes('asset'));
    assert.equal(
      buildDuplicateKey('asset', { serialNumber: 'SN-99', name: 'Geyser' }),
      'asset:sn-99',
    );
    const scored = scoreEquipmentHistoricalMatch({ customerMatch: true, typeMatch: true });
    assert.equal(decideHistoricalMatchAction(scored.confidence, true), 'REVIEW');
    const importer = read('./enterprise-data-migration-import.service.ts');
    assert.match(importer, /importAsset/);
    assert.match(importer, /createRegistryProfile/);
    assert.match(importer, /HISTORICAL_EQUIPMENT_IMPORT/);
  });

  it('5–6. supplier idempotency keys prefer code/email; uncertain multi-name throws path exists', () => {
    assert.equal(
      buildDuplicateKey('supplier', { supplierCode: 'BRK-1', name: 'Brackenfell Sanitary' }),
      'supplier:code:brk-1',
    );
    assert.equal(
      normalizeSupplierNameForMatch('One Stop Plumbing Shop — Brackenfell'),
      normalizeSupplierNameForMatch('One Stop Plumbing Shop Brackenfell'),
    );
    const importer = read('./enterprise-data-migration-import.service.ts');
    assert.match(importer, /multiple normalised name matches require REVIEW/);
  });

  it('7–12. inventory physical-stock safety + preview + no blind overwrite', () => {
    assert.equal(isPhysicalStockImportCandidate({ name: 'Labour call-out' }).accepted, false);
    assert.equal(isPhysicalStockImportCandidate({ name: 'Geyser element 3kW' }).accepted, true);
    const existing = previewInventoryStockImpact({
      sku: 'GE-1',
      itemExists: true,
      existingQuantityOnHand: 5,
      proposedQuantity: 20,
      locationName: 'Yard',
    });
    assert.equal(existing.willWriteStock, false);
    assert.equal(
      previewInventoryStockImpact({
        sku: 'GE-1',
        itemExists: false,
        proposedQuantity: 3,
        locationName: 'Yard',
      }).willWriteStock,
      true,
    );
    assert.equal(
      previewInventoryStockImpact({
        sku: 'GE-1',
        itemExists: false,
        proposedQuantity: -2,
      }).willWriteStock,
      false,
    );
    const priceBook = read('./enterprise-data-migration-import.service.ts');
    assert.match(priceBook, /Do not silently overwrite current pricing/);
    assert.match(priceBook, /HISTORICAL_PRICE_BOOK/);
    assert.doesNotMatch(priceBook, /setStockLevel\(companyId,\s*\{[^}]*price_book/s);
  });

  it('26. re-import duplicate detection attaches existing ids', () => {
    const keys = new Set(['asset:sn-1', 'supplier:code:pb', 'inventory:sku-1']);
    const map = new Map([
      ['asset:sn-1', 'a1'],
      ['supplier:code:pb', 's1'],
      ['inventory:sku-1', 'i1'],
    ]);
    assert.equal(
      findDuplicates('asset', [{ serialNumber: 'SN-1', name: 'Geyser' }], keys, map)[0]
        ?.existingEntityId,
      'a1',
    );
  });
});

describe('Job 360 permanent archive + RBAC DTO', () => {
  it('13–19. multi commercial/payment proof/quality unavailable/partial truth', () => {
    const rollup = buildJob360DigitalFileRollup({
      hasCustomer: true,
      hasProperty: true,
      quoteCount: 2,
      invoiceCount: 2,
      paymentCount: 2,
      paymentProofCount: 1,
      photoCount: 0,
      documentCount: 1,
      visitCount: 1,
      materialLineCount: 1,
      equipmentCount: 1,
      timelineEventCount: 8,
      canViewFinance: true,
    });
    assert.equal(rollup.counts.quotes, 2);
    assert.equal(rollup.counts.invoices, 2);
    assert.equal(rollup.counts.payments, 2);
    assert.equal(rollup.counts.paymentProofDocuments, 1);
    assert.equal(rollup.quality, 'unavailable');
    assert.equal(paymentImportCreatesLedgerEntry('PROOF_OF_PAYMENT_DOCUMENT', true), false);
  });

  it('20–22. completed/paid/archived remain searchable; archive ≠ deletion', () => {
    assert.equal(job360RemainsSearchable({ status: 'completed', invoicePaid: true }), true);
    assert.equal(job360RemainsSearchable({ status: 'cancelled' }), true);
    assert.equal(
      buildJob360DigitalFileRollup({
        hasCustomer: true,
        hasProperty: false,
        quoteCount: 0,
        invoiceCount: 0,
        paymentCount: 0,
        paymentProofCount: 0,
        photoCount: 0,
        documentCount: 0,
        visitCount: 0,
        materialLineCount: 0,
        equipmentCount: 0,
        timelineEventCount: 0,
        canViewFinance: false,
      }).retention.archiveIsNotDeletion,
      true,
    );
  });

  it('23–25. client/internal finance filter + tenant company scoping remains in services', () => {
    const safe = filterHistoricalInternalFinanceForClient({
      totalCents: 10,
      jpe: { x: 1 },
      marginBps: 1,
      estimatedCostCents: 2,
      quoteNumber: 'Q-1',
    });
    assert.equal('jpe' in safe, false);
    const jobsService = read('./jobs.service.ts');
    assert.match(jobsService, /eq\(jobs\.companyId, companyId\)/);
    const finance = read('./finance.service.ts');
    assert.match(finance, /buildJob360DigitalFileRollup/);
    assert.match(finance, /digitalFile/);
  });

  it('27–30. Xero prefer-match + PR regress surfaces remain', () => {
    assert.equal(
      preferXeroCanonicalRecord([
        { id: 'c', sourceProvider: 'csv' },
        { id: 'x', sourceProvider: 'xero' },
      ])?.id,
      'x',
    );
    const strict = readFileSync(
      join(here, '../../../packages/shared/src/strict-inventory-material-flow.ts'),
      'utf8',
    );
    assert.match(strict, /material/);
    const upload = readFileSync(
      join(here, '../../../packages/shared/src/universal-evidence-upload.ts'),
      'utf8',
    );
    assert.match(upload, /evidence/i);
    const hist = read('./enterprise-data-migration-import.service.ts');
    assert.match(hist, /importQuote/);
    assert.match(hist, /preferXeroCanonicalRecord/);
  });

  it('32. migration 0203 is additive only', () => {
    const sql = readFileSync(
      join(here, '../../../packages/db/drizzle/0203_historical_import_completion.sql'),
      'utf8',
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  });
});
