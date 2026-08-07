import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTechnicianCompletionChecklist,
  computeDurationMinutes,
  detectActiveTimeConflict,
  deriveJobCostCaptureStatus,
  hasOpenTimeEntry,
  materialLinesNeedingCostReview,
  redactProfitabilityForTechnician,
} from './job-cost-capture.js';
import { computeJobFinancialSourceFingerprintFromSources } from './job-financial-fingerprint.js';
import { computeJobProfitability } from './job-profitability.js';
import { isFinancialReviewStale } from './job-cost-control.js';
import { isFinanciallyAuthoritativeTimeEntry } from './job-profitability-source-integrity.js';
import { buildLabourRateLockMetadata } from './job-profitability-source-integrity.js';

const THRESHOLDS = { excellentMarginBps: 3500, healthyMarginBps: 2500, warningMarginBps: 1500 };

describe('JPE-004 job cost capture', () => {
  it('1 double timer start conflict detected', () => {
    const conflict = detectActiveTimeConflict(
      [{ id: 't1', entryType: 'job_time', endedAt: null, jobId: 'job-1' }],
      { entryType: 'job_time', jobId: 'job-2' },
    );
    assert.equal(conflict?.code, 'ACTIVE_JOB_TIME_EXISTS');
  });

  it('2 open time entry detection', () => {
    assert.equal(
      hasOpenTimeEntry([{ entryType: 'job_time', endedAt: null, jobId: 'job-1' }], {
        entryType: 'job_time',
      }),
      true,
    );
  });

  it('3 completed job time entry is financially authoritative when stopped', () => {
    const endedAt = new Date('2026-01-01T10:00:00.000Z');
    assert.equal(isFinanciallyAuthoritativeTimeEntry('job_time', endedAt, 60), true);
  });

  it('4 negative duration rejected', () => {
    assert.throws(() =>
      computeDurationMinutes(new Date('2026-01-01T10:00:00.000Z'), new Date('2026-01-01T09:00:00.000Z')),
    );
  });

  it('5 technician checklist hides profit but shows warnings', () => {
    const checklist = buildTechnicianCompletionChecklist({
      jobId: 'job-1',
      hasAuthoritativeLabour: false,
      materialLineCount: 1,
      materialsNeedingConfirmation: 1,
      missingReceiptCount: 1,
      photoEvidenceCount: 0,
      hasSignature: false,
    });
    assert.equal(checklist.canCompleteOperationally, true);
    assert.ok(checklist.warningCount >= 2);
    assert.ok(!JSON.stringify(checklist).match(/profit|margin|wage/i));
  });

  it('6 material unknown cost flagged via helper', () => {
    assert.equal(
      materialLinesNeedingCostReview([{ unitCostCents: 0, status: 'used' }]),
      1,
    );
  });

  it('7 capture status needs_attention when warnings exist on completed job', () => {
    assert.equal(
      deriveJobCostCaptureStatus({
        jobStatus: 'completed',
        hasAnyCapture: true,
        warningCount: 2,
        financiallyComplete: false,
      }),
      'needs_attention',
    );
  });

  it('8 technician profitability redaction strips sensitive warnings', () => {
    const profitability = computeJobProfitability({
      jobId: 'job-1',
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: THRESHOLDS,
      materialLines: [],
      purchaseOrders: [],
      invoices: [{ id: 'inv', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 0 }],
      payments: [],
      quotes: [],
      labourEntries: [],
      directCosts: [],
      adjustments: [],
      includeSensitiveCosts: true,
    });
    const redacted = redactProfitabilityForTechnician(profitability);
    assert.equal(redacted.completeness, profitability.completeness);
    assert.ok(!('summary' in redacted));
  });

  it('9 native finance chain preserves job context in fingerprint', () => {
    const fp = computeJobFinancialSourceFingerprintFromSources({
      jobId: 'job-native',
      invoices: [{ id: 'inv', status: 'sent', totalCents: 50_000, subtotalCents: 43_478, vatCents: 6522, amountPaidCents: 50_000 }],
      quotes: [{ id: 'q', status: 'accepted', totalCents: 50_000, subtotalCents: 43_478, lineItems: [] }],
      adjustments: [],
      materialLines: [],
      purchaseOrders: [],
      labourEntries: [{
        id: 'lab',
        entryType: 'job_time',
        durationMinutes: 120,
        hourlyCostCents: 8000,
        overtimeMultiplier: 1,
        metadata: buildLabourRateLockMetadata({ existingMetadata: {}, companyDefaultRateCentsPerHour: 8000 }),
      }],
      directCosts: [],
      payments: [{ id: 'pay', amountCents: 50_000, xeroPaymentStatus: 'AUTHORISED' }],
    });
    assert.match(fp, /^[a-f0-9]{64}$/);
  });

  it('10 full fixture profitability after linked sources', () => {
    const result = computeJobProfitability({
      jobId: 'job-flow',
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: THRESHOLDS,
      materialLines: [{
        id: 'm1', status: 'used', quantity: '2', fulfilledQuantity: '2', unitCostCents: 1500,
        materialSource: 'warehouse_stock', description: 'Pipe', recordedByUserId: 'u1', createdAt: '2026-01-01', supplierReference: null,
      }],
      purchaseOrders: [],
      invoices: [{ id: 'inv', status: 'paid', totalCents: 25_000, subtotalCents: 21_739, vatCents: 3261, amountPaidCents: 25_000 }],
      payments: [{ id: 'pay', amountCents: 25_000, paidAt: '2026-01-02', reference: null }],
      quotes: [{ id: 'q', status: 'accepted', totalCents: 25_000, subtotalCents: 21_739, lineItems: [] }],
      labourEntries: [{
        id: 't1', userId: 'u1', entryType: 'job_time', durationMinutes: 120,
        startedAt: '2026-01-01T08:00:00.000Z', endedAt: '2026-01-01T10:00:00.000Z', approved: true,
        hourlyCostCents: 8000, overtimeMultiplier: 1, labourRateConfidence: 'locked',
        metadata: buildLabourRateLockMetadata({ existingMetadata: {}, companyDefaultRateCentsPerHour: 8000 }),
      }],
      directCosts: [{
        id: 'dc1', category: 'fuel', description: 'Fuel', amountCents: 4500,
        sourceType: 'manual', sourceId: 'manual-1', costDate: '2026-01-01', enteredByUserId: 'u1',
        isPaid: true, notes: null,
      }],
      adjustments: [],
      includeSensitiveCosts: true,
      sourceFingerprint: 'fixture',
    });
    assert.equal(result.summary.jobRevenueCents, 25_000);
    assert.equal(result.cash.cashCollectedCents, 25_000);
    assert.ok(result.summary.totalDirectCostCents > 0);
    assert.ok(['complete', 'provisional'].includes(result.profitabilityConfidence.status));
  });

  it('11 financial review stale after source mutation fingerprint', () => {
    const before = computeJobFinancialSourceFingerprintFromSources({
      jobId: 'job-1',
      invoices: [{ id: 'inv', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 0 }],
      quotes: [], adjustments: [], materialLines: [], purchaseOrders: [], labourEntries: [], directCosts: [], payments: [],
    });
    const after = computeJobFinancialSourceFingerprintFromSources({
      jobId: 'job-1',
      invoices: [{ id: 'inv', status: 'sent', totalCents: 11_500, subtotalCents: 10_000, vatCents: 1500, amountPaidCents: 0 }],
      quotes: [], adjustments: [], materialLines: [], purchaseOrders: [], labourEntries: [], directCosts: [], payments: [],
    });
    assert.notEqual(before, after);
    assert.equal(isFinancialReviewStale(before, after, 'financially_complete'), true);
  });

  it('12 cent-exact amounts in profitability fixture', () => {
    const result = computeJobProfitability({
      jobId: 'job-cents',
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: THRESHOLDS,
      materialLines: [],
      purchaseOrders: [],
      invoices: [{ id: 'inv', status: 'sent', totalCents: 12_345, subtotalCents: 10_735, vatCents: 1610, amountPaidCents: 6172 }],
      payments: [{ id: 'pay', amountCents: 6172, paidAt: '2026-01-02', reference: null }],
      quotes: [],
      labourEntries: [],
      directCosts: [],
      adjustments: [],
      includeSensitiveCosts: true,
    });
    assert.equal(result.summary.jobRevenueCents, 12_345);
    assert.equal(result.cash.cashCollectedCents, 6172);
  });
});
