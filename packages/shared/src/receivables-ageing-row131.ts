/**
 * Row 131 — Receivables ageing
 *
 * Buckets: Current, 1–7, 8–30, 31–60, 61–90, 90+
 * Uses due date + outstanding balance. No false R0.
 * Preserves partial payments, unallocated amounts, promises/plans, next action, follow-up owner.
 */

import { formatFinanceTruthDisplay, type FinanceTruthAvailability } from './finance-page-truth.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const RECEIVABLES_AGEING_ROW131_KEY = 'receivables-ageing-row131' as const;

export const RECEIVABLES_AGEING_BUCKETS = [
  'Current',
  '1-7',
  '8-30',
  '31-60',
  '61-90',
  '90+',
] as const;

export type ReceivablesAgeingBucket = (typeof RECEIVABLES_AGEING_BUCKETS)[number];

export type ReceivablesAgeingInvoice = {
  id: string;
  dueDate: string | null;
  outstandingCents: number | null;
  status?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  jobId?: string | null;
  /** Unallocated cash against customer/job not yet applied to this invoice. */
  unallocatedCents?: number | null;
  hasPromiseToPay?: boolean;
  hasPaymentPlan?: boolean;
  nextAction?: string | null;
  followUpOwnerUserId?: string | null;
  followUpOwnerName?: string | null;
};

export type ReceivablesAgeingBucketTotal = {
  bucket: ReceivablesAgeingBucket;
  count: number;
  outstandingCents: number | null;
  availability: FinanceTruthAvailability;
  invoiceIds: string[];
};

export type ReceivablesAgeingRow = {
  invoiceId: string;
  bucket: ReceivablesAgeingBucket | null;
  outstandingCents: number | null;
  partialPaymentPreserved: boolean;
  unallocatedCents: number;
  hasPromiseToPay: boolean;
  hasPaymentPlan: boolean;
  nextAction: string | null;
  followUpOwnerUserId: string | null;
  followUpOwnerName: string | null;
  daysPastDue: number | null;
};

function daysPastDue(dueDate: string, asOfDate: string): number {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00.000Z`);
  const asOf = Date.parse(`${asOfDate.slice(0, 10)}T00:00:00.000Z`);
  return Math.floor((asOf - due) / 86_400_000);
}

export function resolveReceivablesAgeingBucket(
  daysPast: number | null,
): ReceivablesAgeingBucket | null {
  if (daysPast == null) return null;
  if (daysPast <= 0) return 'Current';
  if (daysPast <= 7) return '1-7';
  if (daysPast <= 30) return '8-30';
  if (daysPast <= 60) return '31-60';
  if (daysPast <= 90) return '61-90';
  return '90+';
}

export function projectReceivablesAgeing(input: {
  invoices: ReceivablesAgeingInvoice[];
  asOfDate: string;
  /** When source list is unknown/not connected. */
  sourceAvailability?: FinanceTruthAvailability;
}): {
  availability: FinanceTruthAvailability;
  buckets: ReceivablesAgeingBucketTotal[];
  rows: ReceivablesAgeingRow[];
  totalOutstandingCents: number | null;
  displayTotal: string;
} {
  if (input.sourceAvailability === 'NOT_CONNECTED') {
    const emptyBuckets = RECEIVABLES_AGEING_BUCKETS.map((bucket) => ({
      bucket,
      count: 0,
      outstandingCents: null as number | null,
      availability: 'NOT_CONNECTED' as FinanceTruthAvailability,
      invoiceIds: [] as string[],
    }));
    return {
      availability: 'NOT_CONNECTED',
      buckets: emptyBuckets,
      rows: [],
      totalOutstandingCents: null,
      displayTotal: 'NOT CONNECTED',
    };
  }

  if (input.invoices.length === 0) {
    const emptyBuckets = RECEIVABLES_AGEING_BUCKETS.map((bucket) => ({
      bucket,
      count: 0,
      outstandingCents: 0 as number | null,
      availability: 'EMPTY' as FinanceTruthAvailability,
      invoiceIds: [] as string[],
    }));
    return {
      availability: 'EMPTY',
      buckets: emptyBuckets,
      rows: [],
      totalOutstandingCents: 0,
      displayTotal: '0',
    };
  }

  const rows: ReceivablesAgeingRow[] = [];
  let missingBalances = 0;
  let total = 0;

  for (const inv of input.invoices) {
    if (inv.status === 'cancelled' || inv.status === 'voided' || inv.status === 'draft') continue;
    const outstanding = inv.outstandingCents;
    if (outstanding == null || !Number.isFinite(outstanding)) {
      missingBalances += 1;
      rows.push({
        invoiceId: inv.id,
        bucket: null,
        outstandingCents: null,
        partialPaymentPreserved: true,
        unallocatedCents: inv.unallocatedCents ?? 0,
        hasPromiseToPay: Boolean(inv.hasPromiseToPay),
        hasPaymentPlan: Boolean(inv.hasPaymentPlan),
        nextAction: inv.nextAction ?? null,
        followUpOwnerUserId: inv.followUpOwnerUserId ?? null,
        followUpOwnerName: inv.followUpOwnerName ?? null,
        daysPastDue: null,
      });
      continue;
    }
    if (outstanding <= 0) continue;
    total += outstanding;
    const days = inv.dueDate ? daysPastDue(inv.dueDate, input.asOfDate) : null;
    const bucket = resolveReceivablesAgeingBucket(days);
    rows.push({
      invoiceId: inv.id,
      bucket,
      outstandingCents: outstanding,
      partialPaymentPreserved: true,
      unallocatedCents: inv.unallocatedCents ?? 0,
      hasPromiseToPay: Boolean(inv.hasPromiseToPay),
      hasPaymentPlan: Boolean(inv.hasPaymentPlan),
      nextAction: inv.nextAction ?? null,
      followUpOwnerUserId: inv.followUpOwnerUserId ?? null,
      followUpOwnerName: inv.followUpOwnerName ?? null,
      daysPastDue: days,
    });
  }

  const buckets: ReceivablesAgeingBucketTotal[] = RECEIVABLES_AGEING_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    const incomplete = inBucket.some((r) => r.outstandingCents == null);
    const sum = inBucket.reduce((s, r) => s + (r.outstandingCents ?? 0), 0);
    return {
      bucket,
      count: inBucket.length,
      outstandingCents: incomplete ? null : sum,
      availability: incomplete ? 'INCOMPLETE' : 'AVAILABLE',
      invoiceIds: inBucket.map((r) => r.invoiceId),
    };
  });

  const availability: FinanceTruthAvailability =
    missingBalances > 0 ? 'INCOMPLETE' : 'AVAILABLE';

  return {
    availability,
    buckets,
    rows,
    totalOutstandingCents: missingBalances > 0 ? null : total,
    displayTotal: formatFinanceTruthDisplay({
      availability,
      amountCents: missingBalances > 0 ? null : total,
      reconciledToSources: missingBalances === 0,
      sourceCount: rows.length,
      label: 'Receivables ageing',
      reason: missingBalances > 0 ? 'Some outstanding balances unknown' : null,
    }),
  };
}

export function assertRow131SafetyGates(input: {
  row92AutomationEnabled: boolean;
  falseR0?: boolean;
}): { row92Off: true; falseR0: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.falseR0) throw new Error('Row 131 forbids false R0');
  return { row92Off: true, falseR0: false };
}
