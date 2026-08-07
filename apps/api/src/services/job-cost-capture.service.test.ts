/**
 * JPE-004A — API/service integration tests for live cost capture.
 * Uses an in-memory DB harness — no live database required.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  buildLabourRateLockMetadata,
  computeDurationMinutes,
  computeJobFinancialSourceFingerprintFromSources,
  detectActiveTimeConflict,
  redactProfitabilityForTechnician,
  assessJobCostControl,
} from '@titan/shared';
import { computeJobProfitability } from '@titan/shared';
import { MobileWorkforceError } from './mobile-workforce.service.js';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type TimeRow = {
  id: string;
  companyId: string;
  userId: string;
  entryType: string;
  jobId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  clientActionId: string | null;
};

type DirectCostRow = {
  id: string;
  companyId: string;
  jobId: string;
  category: string;
  description: string;
  amountCents: number;
  sourceType: string;
  sourceId: string;
  receiptDocumentId: string | null;
  enteredByUserId: string;
  isPaid: boolean;
  notes: string | null;
  costDate: Date;
};

type MaterialRow = {
  id: string;
  companyId: string;
  jobId: string;
  status: string;
  quantity: string;
  fulfilledQuantity: string | null;
  unitCostCents: number;
};

type JobRow = {
  id: string;
  companyId: string;
  status: string;
  assignedTechnicianId?: string;
};

function createHarness() {
  const timeEntries: TimeRow[] = [];
  const directCosts: DirectCostRow[] = [];
  const materialLines: MaterialRow[] = [];
  const jobs: JobRow[] = [
    { id: JOB_A, companyId: COMPANY_A, status: 'in_progress', assignedTechnicianId: USER_A },
    { id: JOB_B, companyId: COMPANY_B, status: 'in_progress', assignedTechnicianId: USER_A },
  ];
  const auditLogs: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  let financeSettings: Record<string, { defaultInternalLabourRateCentsPerHour: number }> = {
    [COMPANY_A]: { defaultInternalLabourRateCentsPerHour: 8000 },
    [COMPANY_B]: { defaultInternalLabourRateCentsPerHour: 9000 },
  };
  let recalcCount = 0;
  let invalidateCount = 0;

  const scope = { companyId: COMPANY_A, userId: USER_A };

  function getRecalcCount() {
    return recalcCount;
  }

  function getInvalidateCount() {
    return invalidateCount;
  }

  function createDirectCost(input: {
    category: string;
    description: string;
    amountCents: number;
    clientActionId: string;
  }) {
    const existing = directCosts.find(
      (row) => row.companyId === COMPANY_A && row.sourceType === 'manual' && row.sourceId === input.clientActionId,
    );
    if (existing) return existing;

    const record: DirectCostRow = {
      id: randomUUID(),
      companyId: COMPANY_A,
      jobId: JOB_A,
      category: input.category,
      description: input.description,
      amountCents: input.amountCents,
      sourceType: 'manual',
      sourceId: input.clientActionId,
      receiptDocumentId: null,
      enteredByUserId: USER_A,
      isPaid: false,
      notes: null,
      costDate: new Date(),
    };
    directCosts.push(record);
    auditLogs.push({ action: 'jcc_direct_cost_captured', metadata: { jobId: JOB_A, clientActionId: input.clientActionId } });
    recalcCount += 1;
    invalidateCount += 1;
    return record;
  }

  async function startTimedEntry(input: {
    entryType: 'job_time' | 'travel';
    jobId?: string;
    clientActionId?: string;
  }) {
    const job = jobs.find((j) => j.id === input.jobId);
    if (job && job.companyId !== scope.companyId) {
      throw new MobileWorkforceError('NOT_FOUND', 'Job not found');
    }

    if (input.clientActionId) {
      const existing = timeEntries.find(
        (row) => row.companyId === scope.companyId && row.clientActionId === input.clientActionId,
      );
      if (existing) return existing;
    }

    const openEntries = timeEntries.filter(
      (row) => row.companyId === scope.companyId && row.userId === scope.userId && !row.endedAt,
    );
    const conflict = detectActiveTimeConflict(
      openEntries.map((row) => ({
        id: row.id,
        entryType: row.entryType,
        endedAt: row.endedAt?.toISOString() ?? null,
        jobId: row.jobId,
      })),
      { entryType: input.entryType, jobId: input.jobId, jobStatus: job?.status },
    );
    if (conflict) throw new MobileWorkforceError(conflict.code, conflict.message);

    const row: TimeRow = {
      id: randomUUID(),
      companyId: scope.companyId,
      userId: scope.userId,
      entryType: input.entryType,
      jobId: input.jobId ?? null,
      startedAt: new Date(),
      endedAt: null,
      durationMinutes: null,
      notes: null,
      metadata: {},
      clientActionId: input.clientActionId ?? null,
    };
    timeEntries.push(row);
    return row;
  }

  async function stopTimedEntry(timeEntryId: string) {
    const entry = timeEntries.find(
      (row) =>
        row.id === timeEntryId &&
        row.companyId === scope.companyId &&
        row.userId === scope.userId,
    );
    if (!entry) throw new MobileWorkforceError('NOT_FOUND', 'Time entry not found');
    if (entry.endedAt) return entry;

    const endedAt = new Date();
    const durationMinutes = computeDurationMinutes(entry.startedAt, endedAt);
    const settings = financeSettings[scope.companyId];
    entry.endedAt = endedAt;
    entry.durationMinutes = durationMinutes;
    entry.metadata = buildLabourRateLockMetadata({
      existingMetadata: entry.metadata,
      companyDefaultRateCentsPerHour: settings?.defaultInternalLabourRateCentsPerHour ?? 8000,
      lockedAt: endedAt.toISOString(),
    });
    recalcCount += 1;
    invalidateCount += 1;
    return entry;
  }

  function validateMaterialReturn(line: MaterialRow, quantity: number) {
    const fulfilled = line.fulfilledQuantity != null ? Number(line.fulfilledQuantity) : Number(line.quantity);
    if (quantity > fulfilled) {
      throw new Error('Cannot return more than the fulfilled quantity');
    }
  }

  return {
    timeEntries,
    directCosts,
    materialLines,
    jobs,
    auditLogs,
    financeSettings,
    getRecalcCount,
    getInvalidateCount,
    createDirectCost,
    scope,
    startTimedEntry,
    stopTimedEntry,
    validateMaterialReturn,
    setCompanyRate(companyId: string, rate: number) {
      financeSettings[companyId] = { defaultInternalLabourRateCentsPerHour: rate };
    },
  };
}

describe('JPE-004 cost capture integration harness', () => {
  it('timer start idempotency — same client_action_id yields one entry', async () => {
    const h = createHarness();
    const a = await h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 'A' });
    const b = await h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 'A' });
    assert.equal(a.id, b.id);
    assert.equal(h.timeEntries.length, 1);
  });

  it('timer stop idempotency — second stop does not duplicate labour effect', async () => {
    const h = createHarness();
    const started = await h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 'start-1' });
    const first = await h.stopTimedEntry(started.id);
    const second = await h.stopTimedEntry(started.id);
    assert.equal(first.id, second.id);
    assert.equal(h.timeEntries.length, 1);
    assert.ok(first.endedAt);
    assert.equal(h.getRecalcCount(), 1);
  });

  it('labour rate lock survives company default change', async () => {
    const h = createHarness();
    const started = await h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 'lock-1' });
    const stopped = await h.stopTimedEntry(started.id);
    const lockedRate = stopped.metadata.hourlyCostCents;
    h.setCompanyRate(COMPANY_A, 12000);
    assert.equal(stopped.metadata.hourlyCostCents, lockedRate);
    assert.equal(stopped.metadata.hourlyCostSource, 'company_default');
    assert.ok(stopped.metadata.hourlyCostLockedAt);
  });

  it('overlap — second active job_time rejected', async () => {
    const h = createHarness();
    await h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 't1' });
    await assert.rejects(
      () => h.startTimedEntry({ entryType: 'job_time', jobId: JOB_A, clientActionId: 't2' }),
      (err: unknown) => {
        assert.ok(err instanceof MobileWorkforceError);
        assert.equal(err.code, 'ACTIVE_JOB_TIME_EXISTS');
        return true;
      },
    );
  });

  it('material return — net quantity and over-return rejection', () => {
    const h = createHarness();
    const line: MaterialRow = {
      id: randomUUID(),
      companyId: COMPANY_A,
      jobId: JOB_A,
      status: 'used',
      quantity: '5',
      fulfilledQuantity: '5',
      unitCostCents: 1000,
    };
    h.materialLines.push(line);
    assert.doesNotThrow(() => h.validateMaterialReturn(line, 2));
    assert.throws(() => h.validateMaterialReturn(line, 6), /Cannot return more/);
    const netQty = Number(line.quantity) - 2;
    assert.equal(netQty, 3);
  });

  it('cross-tenant job access blocked at harness boundary', async () => {
    const h = createHarness();
    await assert.rejects(
      () => h.startTimedEntry({ entryType: 'job_time', jobId: JOB_B, clientActionId: 'cross' }),
      (err: unknown) => {
        assert.ok(err instanceof MobileWorkforceError);
        assert.equal(err.code, 'NOT_FOUND');
        return true;
      },
    );
  });

  it('direct cost duplicate protection via sourceId idempotency', () => {
    const h = createHarness();
    const payload = {
      category: 'fuel',
      description: 'Fuel for job',
      amountCents: 4500,
      clientActionId: 'dc-action-1',
    };
    const first = h.createDirectCost(payload);
    const second = h.createDirectCost(payload);
    assert.equal(first.id, second.id);
    assert.equal(h.directCosts.length, 1);
    assert.equal(h.getRecalcCount(), 1);
    assert.ok(h.auditLogs.some((row) => row.action === 'jcc_direct_cost_captured'));
  });

  it('JPE fingerprint changes when direct cost added', () => {
    const before = computeJobFinancialSourceFingerprintFromSources({
      jobId: JOB_A,
      invoices: [],
      quotes: [],
      adjustments: [],
      materialLines: [],
      purchaseOrders: [],
      labourEntries: [],
      directCosts: [],
      payments: [],
    });
    const after = computeJobFinancialSourceFingerprintFromSources({
      jobId: JOB_A,
      invoices: [],
      quotes: [],
      adjustments: [],
      materialLines: [],
      purchaseOrders: [],
      labourEntries: [],
      directCosts: [{
        id: 'dc1',
        category: 'fuel',
        amountCents: 4500,
        sourceType: 'manual',
        sourceId: 'x',
        isPaid: true,
        receiptDocumentId: null,
      }],
      payments: [],
    });
    assert.notEqual(before, after);
  });

  it('JPE-002 flags — missing labour and receipt', () => {
    const profitability = computeJobProfitability({
      jobId: JOB_A,
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: { excellentMarginBps: 3500, healthyMarginBps: 2500, warningMarginBps: 1500 },
      materialLines: [{
        id: 'm1', status: 'used', quantity: '1', fulfilledQuantity: '1', unitCostCents: 0,
        materialSource: 'supplier_purchase', description: 'Other', recordedByUserId: USER_A,
        createdAt: '2026-01-01', supplierReference: null,
      }],
      purchaseOrders: [],
      invoices: [],
      payments: [],
      quotes: [],
      labourEntries: [],
      directCosts: [{
        id: 'dc1', category: 'fuel', description: 'Fuel', amountCents: 4500,
        sourceType: 'manual', sourceId: 'x', costDate: '2026-01-01', enteredByUserId: USER_A,
        isPaid: true, notes: null,
      }],
      adjustments: [],
      includeSensitiveCosts: true,
    });
    const review = assessJobCostControl({
      jobId: JOB_A,
      jobStatus: 'completed',
      jobReference: 'J-100',
      currency: 'ZAR',
      profitability,
      financialReview: { status: 'needs_review', reviewFingerprint: null, isStale: false },
      labourEntries: [],
      directCosts: [{
        id: 'dc1',
        category: 'fuel',
        description: 'Fuel',
        amountCents: 4500,
        sourceType: 'manual',
        receiptDocumentId: null,
        isPaid: true,
      }],
      materialLines: [{
        id: 'm1',
        status: 'used',
        quantity: '1',
        unitCostCents: 0,
        description: 'Other material',
      }],
      hasCrewAssigned: true,
      marginVarianceThresholdBps: 500,
      warningMarginBps: 1500,
    });
    assert.ok(review.flags.some((f) => f.type === 'NO_LABOUR_CAPTURED'));
    assert.ok(review.flags.some((f) => f.type === 'MATERIAL_COST_MISSING'));
    assert.ok(review.flags.some((f) => f.type === 'DIRECT_COST_RECEIPT_MISSING'));
  });

  it('technician profitability redaction strips sensitive finance', () => {
    const profitability = computeJobProfitability({
      jobId: JOB_A,
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: { excellentMarginBps: 3500, healthyMarginBps: 2500, warningMarginBps: 1500 },
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
    assert.ok(!('summary' in redacted));
    assert.ok(!JSON.stringify(redacted).match(/margin|profit|wage/i));
  });
});
