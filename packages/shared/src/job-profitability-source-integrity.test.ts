import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAuditedLabourRateCorrection,
  assessLabourRateConfidence,
  buildLabourRateLockMetadata,
  isFinanciallyAuthoritativeTimeEntry,
  isLabourRateLocked,
  NATIVE_CREDIT_REFUND_CONTRACT,
  resolveCostTaxBasis,
} from './job-profitability-source-integrity.js';
import {
  computeJobProfitability,
  computeLabourCostCents,
  resolveLabourHourlyCostCents,
} from './job-profitability.js';

const DEFAULT_THRESHOLDS = {
  excellentMarginBps: 3500,
  healthyMarginBps: 2500,
  warningMarginBps: 1500,
};

function baseInput(
  overrides: Partial<Parameters<typeof computeJobProfitability>[0]> = {},
): Parameters<typeof computeJobProfitability>[0] {
  return {
    jobId: 'job-1',
    currency: 'ZAR',
    jobStatus: 'completed',
    labourRateCentsPerHour: 8000,
    thresholds: DEFAULT_THRESHOLDS,
    materialLines: [],
    purchaseOrders: [],
    invoices: [],
    payments: [],
    quotes: [],
    labourEntries: [],
    directCosts: [],
    adjustments: [],
    includeSensitiveCosts: true,
    ...overrides,
  };
}

describe('JPE-001D source integrity', () => {
  describe('labour rate locking', () => {
    it('1-3 locks R100/hr and survives company default change to R150/hr', () => {
      const lockedMeta = buildLabourRateLockMetadata({
        existingMetadata: {},
        companyDefaultRateCentsPerHour: 10_000,
        lockedAt: '2026-01-01T10:00:00.000Z',
      });
      assert.equal(lockedMeta.hourlyCostCents, 10_000);
      assert.ok(isLabourRateLocked(lockedMeta));

      const rateAfterChange = resolveLabourHourlyCostCents({ metadata: lockedMeta }, 15_000);
      assert.equal(rateAfterChange, 10_000);

      const result = computeJobProfitability(
        baseInput({
          labourRateCentsPerHour: 15_000,
          invoices: [
            {
              id: 'inv-1',
              status: 'sent',
              totalCents: 11_500,
              subtotalCents: 10_000,
              vatCents: 1500,
              amountPaidCents: 0,
            },
          ],
          labourEntries: [
            {
              id: 't1',
              userId: 'u1',
              entryType: 'job_time',
              durationMinutes: 60,
              startedAt: '2026-01-01T08:00:00.000Z',
              endedAt: '2026-01-01T09:00:00.000Z',
              approved: true,
              metadata: lockedMeta,
              labourRateConfidence: 'locked',
              hourlyCostCents: rateAfterChange,
              overtimeMultiplier: 1,
            },
          ],
        }),
      );

      assert.equal(result.summary.labourCostCents, 10_000);
      assert.equal(result.profitabilityConfidence.status, 'complete');
    });

    it('4 new entry uses new company default when not locked', () => {
      const newRate = resolveLabourHourlyCostCents({}, 15_000);
      assert.equal(newRate, 15_000);
      const cost = computeLabourCostCents([
        {
          id: 't-new',
          userId: 'u1',
          durationMinutes: 60,
          startedAt: '2026-02-01T08:00:00.000Z',
          endedAt: '2026-02-01T09:00:00.000Z',
          approved: true,
          hourlyCostCents: newRate,
          overtimeMultiplier: 1,
        },
      ]);
      assert.equal(cost.labourCostCents, 15_000);
    });

    it('5 two workers with different locked rates', () => {
      const metaA = buildLabourRateLockMetadata({
        existingMetadata: { internalRateCentsPerHour: 8000 },
        companyDefaultRateCentsPerHour: 12_000,
      });
      const metaB = buildLabourRateLockMetadata({
        existingMetadata: { internalRateCentsPerHour: 11_000 },
        companyDefaultRateCentsPerHour: 12_000,
      });
      assert.equal(metaA.hourlyCostCents, 8000);
      assert.equal(metaB.hourlyCostCents, 11_000);
    });

    it('6 overtime retains locked base rate', () => {
      const lockedMeta = buildLabourRateLockMetadata({
        existingMetadata: {},
        companyDefaultRateCentsPerHour: 10_000,
      });
      const cost = computeLabourCostCents([
        {
          id: 't1',
          userId: 'u1',
          durationMinutes: 60,
          startedAt: '2026-01-01T08:00:00.000Z',
          endedAt: '2026-01-01T09:00:00.000Z',
          approved: true,
          hourlyCostCents: resolveLabourHourlyCostCents({ metadata: lockedMeta }, 15_000),
          overtimeMultiplier: 1.5,
        },
      ]);
      assert.equal(cost.labourCostCents, 15_000);
    });

    it('does not overwrite already locked metadata', () => {
      const first = buildLabourRateLockMetadata({
        existingMetadata: {},
        companyDefaultRateCentsPerHour: 10_000,
        lockedAt: '2026-01-01T00:00:00.000Z',
      });
      const second = buildLabourRateLockMetadata({
        existingMetadata: first,
        companyDefaultRateCentsPerHour: 20_000,
        lockedAt: '2026-06-01T00:00:00.000Z',
      });
      assert.equal(second.hourlyCostCents, 10_000);
      assert.equal(second.hourlyCostLockedAt, '2026-01-01T00:00:00.000Z');
    });

    it('7 authorised manual correction updates rate with audit trail', () => {
      const locked = buildLabourRateLockMetadata({
        existingMetadata: {},
        companyDefaultRateCentsPerHour: 10_000,
      });
      const corrected = applyAuditedLabourRateCorrection(locked, {
        newHourlyCostCents: 12_500,
        correctedByUserId: 'owner-1',
        reason: 'Union rate correction',
      });
      assert.equal(corrected.hourlyCostCents, 12_500);
      assert.equal(corrected.hourlyCostSource, 'manual_correction');
      assert.ok(Array.isArray(corrected.labourRateCorrections));
    });

    it('8 unapproved fallback marks provisional confidence', () => {
      const confidence = assessLabourRateConfidence({}, 'job_time', 60, '2026-01-01T09:00:00.000Z');
      assert.equal(confidence, 'fallback_current_rate');

      const result = computeJobProfitability(
        baseInput({
          invoices: [
            {
              id: 'inv-1',
              status: 'sent',
              totalCents: 10_000,
              subtotalCents: 8696,
              vatCents: 1304,
              amountPaidCents: 0,
            },
          ],
          labourEntries: [
            {
              id: 't1',
              userId: 'u1',
              entryType: 'job_time',
              durationMinutes: 60,
              startedAt: '2026-01-01T08:00:00.000Z',
              endedAt: '2026-01-01T09:00:00.000Z',
              approved: true,
              hourlyCostCents: 8000,
              overtimeMultiplier: 1,
              labourRateConfidence: 'fallback_current_rate',
            },
          ],
        }),
      );
      assert.equal(result.profitabilityConfidence.status, 'provisional');
      assert.ok(
        result.profitabilityConfidence.issues.some((i) => i.type === 'LABOUR_RATE_NOT_LOCKED'),
      );
    });

    it('financially authoritative requires billable type with duration', () => {
      assert.equal(isFinanciallyAuthoritativeTimeEntry('job_time', '2026-01-01', 60), true);
      assert.equal(isFinanciallyAuthoritativeTimeEntry('clock_in', '2026-01-01', 60), false);
      assert.equal(isFinanciallyAuthoritativeTimeEntry('job_time', null, 60), false);
    });
  });

  describe('tax basis', () => {
    it('9 ex-VAT source passes through unchanged', () => {
      const resolved = resolveCostTaxBasis({ amountCents: 5000, taxBasis: 'exclusive' });
      assert.equal(resolved.economicAmountCents, 5000);
      assert.equal(resolved.isAssumed, false);
    });

    it('10 VAT-inclusive source with explicit tax derives ex-VAT economic amount', () => {
      const resolved = resolveCostTaxBasis({
        amountCents: 11_500,
        taxBasis: 'inclusive',
        taxAmountCents: 1500,
      });
      assert.equal(resolved.economicAmountCents, 10_000);
      assert.equal(resolved.taxBasis, 'inclusive');
    });

    it('11 zero-rated source', () => {
      const resolved = resolveCostTaxBasis({ amountCents: 3000, taxBasis: 'zero_rated' });
      assert.equal(resolved.economicAmountCents, 3000);
      assert.equal(resolved.taxAmountCents, 0);
    });

    it('12 unknown source does not silently convert inclusive without tax data', () => {
      const resolved = resolveCostTaxBasis({ amountCents: 11_500, taxBasis: 'inclusive' });
      assert.equal(resolved.taxBasis, 'unknown');
      assert.equal(resolved.economicAmountCents, 11_500);
      assert.equal(resolved.isAssumed, true);
    });

    it('12b unknown tax basis marks profit provisional', () => {
      const result = computeJobProfitability(
        baseInput({
          invoices: [
            {
              id: 'inv-1',
              status: 'sent',
              totalCents: 20_000,
              subtotalCents: 17_391,
              vatCents: 2609,
              amountPaidCents: 0,
            },
          ],
          materialLines: [
            {
              id: 'm1',
              status: 'used',
              quantity: '1',
              fulfilledQuantity: '1',
              unitCostCents: 5000,
              materialSource: 'warehouse_stock',
              description: 'Unknown VAT material',
              recordedByUserId: 'u1',
              createdAt: '2026-01-01T00:00:00.000Z',
              supplierReference: null,
            },
          ],
        }),
      );
      assert.equal(result.profitabilityConfidence.status, 'provisional');
      assert.ok(
        result.profitabilityConfidence.issues.some((i) => i.type === 'INCOMPLETE_TAX_BASIS'),
      );
    });
  });

  describe('credits', () => {
    it('13 native revenue adjustment credit affects revenue once', () => {
      const result = computeJobProfitability(
        baseInput({
          invoices: [
            {
              id: 'inv-1',
              status: 'sent',
              totalCents: 10_000,
              subtotalCents: 8696,
              vatCents: 1304,
              amountPaidCents: 0,
            },
          ],
          adjustments: [
            {
              id: 'adj-1',
              kind: 'revenue',
              amountCents: -2000,
              reason: 'Native credit',
              createdAt: '2026-01-02T00:00:00.000Z',
              createdByUserId: 'u1',
            },
          ],
        }),
      );
      assert.equal(result.summary.jobRevenueCents, 8000);
      assert.equal(result.explainability.revenue.adjustments.length, 1);
      assert.ok(NATIVE_CREDIT_REFUND_CONTRACT.supportedSources.length > 0);
      assert.ok(NATIVE_CREDIT_REFUND_CONTRACT.unsupportedSources.some((s) => s.includes('xero')));
    });
  });

  describe('cash spent', () => {
    it('14 known paid cost counted in cash spent', () => {
      const result = computeJobProfitability(
        baseInput({
          invoices: [{ id: 'i', status: 'sent', totalCents: 5000, subtotalCents: 4348, vatCents: 652, amountPaidCents: 0 }],
          directCosts: [
            {
              id: 'd1',
              category: 'fuel',
              description: 'Fuel',
              amountCents: 1500,
              sourceType: 'manual',
              sourceId: 'm1',
              costDate: null,
              enteredByUserId: 'u1',
              isPaid: true,
              notes: null,
            },
          ],
        }),
      );
      assert.equal(result.cash.cashSpentCents, 1500);
    });

    it('15 unpaid cost excluded from cash spent', () => {
      const result = computeJobProfitability(
        baseInput({
          directCosts: [
            {
              id: 'd1',
              category: 'fuel',
              description: 'Fuel',
              amountCents: 1500,
              sourceType: 'manual',
              sourceId: 'm1',
              costDate: null,
              enteredByUserId: 'u1',
              isPaid: false,
              notes: null,
            },
          ],
        }),
      );
      assert.equal(result.cash.cashSpentCents, 0);
    });

    it('16 partial payment field marks limited cash completeness', () => {
      const result = computeJobProfitability(
        baseInput({
          directCosts: [
            {
              id: 'd1',
              category: 'fuel',
              description: 'Fuel',
              amountCents: 2000,
              amountPaidCents: 1000,
              sourceType: 'manual',
              sourceId: 'm1',
              costDate: null,
              enteredByUserId: 'u1',
              isPaid: true,
              notes: null,
            },
          ],
        }),
      );
      assert.equal(result.cash.cashSpentCompleteness, 'partial_unsupported');
    });

    it('17 boolean-only cash source exposes completeness metadata', () => {
      const result = computeJobProfitability(baseInput());
      assert.equal(result.cash.cashSpentCompleteness, 'unknown');
      assert.equal(result.cash.knownRealisedCashProfitCents, result.cash.realisedCashProfitCents);
    });
  });

  describe('precision', () => {
    it('18 cent-exact totals remain deterministic at calculation v4', () => {
      const result = computeJobProfitability(
        baseInput({
          invoices: [
            {
              id: 'inv-1',
              status: 'sent',
              totalCents: 11_500,
              subtotalCents: 10_000,
              vatCents: 1500,
              amountPaidCents: 0,
            },
          ],
          materialLines: [
            {
              id: 'm1',
              status: 'used',
              quantity: '3',
              fulfilledQuantity: '3',
              unitCostCents: 1234,
              taxBasis: 'exclusive',
              materialSource: 'warehouse_stock',
              description: 'Parts',
              recordedByUserId: 'u1',
              createdAt: '2026-01-01T00:00:00.000Z',
              supplierReference: null,
            },
          ],
          labourEntries: [
            {
              id: 't1',
              userId: 'u1',
              entryType: 'job_time',
              durationMinutes: 7,
              startedAt: '2026-01-01T08:00:00.000Z',
              endedAt: '2026-01-01T08:07:00.000Z',
              approved: true,
              metadata: buildLabourRateLockMetadata({
                existingMetadata: {},
                companyDefaultRateCentsPerHour: 10_000,
              }),
              labourRateConfidence: 'locked',
              hourlyCostCents: 10_000,
              overtimeMultiplier: 1.5,
            },
          ],
        }),
      );

      assert.equal(result.summary.materialCostCents, 3702);
      assert.equal(result.summary.labourCostCents, Math.round((7 / 60) * 10_000 * 1.5));
      assert.equal(result.summary.grossProfitCents, 10_000 - 3702 - result.summary.labourCostCents);
      assert.equal(result.snapshot.calculationVersion, 4);
    });
  });
});
