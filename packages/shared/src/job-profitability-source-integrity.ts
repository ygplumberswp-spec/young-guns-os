/**
 * JPE-001D — Source integrity helpers for labour locking, tax basis, and confidence.
 */

export const LABOUR_COST_LOCK_CALCULATION_VERSION = 1;

export type LabourRateConfidence =
  | 'locked'
  | 'historical_effective_rate'
  | 'fallback_current_rate'
  | 'missing';

export type TaxBasis = 'exclusive' | 'inclusive' | 'zero_rated' | 'exempt' | 'unknown';

export type ProfitabilityConfidenceStatus = 'complete' | 'provisional' | 'incomplete';

export type ProfitabilityConfidenceIssueType =
  | 'LABOUR_RATE_NOT_LOCKED'
  | 'UNLOCKED_LABOUR_COST'
  | 'INCOMPLETE_TAX_BASIS'
  | 'INCOMPLETE_CASH_SETTLEMENT'
  | 'MISSING_REVENUE'
  | 'CREDIT_NOTE_NOT_LINKED';

export type ProfitabilityConfidenceIssue = {
  type: ProfitabilityConfidenceIssueType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  sourceId?: string;
};

export type ProfitabilityConfidence = {
  status: ProfitabilityConfidenceStatus;
  issues: ProfitabilityConfidenceIssue[];
};

export type CashSpentCompleteness = 'complete_boolean' | 'partial_unsupported' | 'unknown';

export type CostTaxInput = {
  amountCents: number;
  taxBasis?: TaxBasis | null;
  taxRateBps?: number | null;
  taxAmountCents?: number | null;
  /** Catalogue/storage convention — still flagged as assumed when no explicit tax fields. */
  assumedExVatCatalogue?: boolean;
};

export type ResolvedCostTax = {
  taxBasis: TaxBasis;
  economicAmountCents: number;
  cashAmountCents: number;
  taxAmountCents: number | null;
  isAssumed: boolean;
};

export type SourceProvenanceSummary = {
  labour: Array<{
    timeEntryId: string;
    rateCentsPerHour: number;
    rateSource: string;
    labourRateConfidence: LabourRateConfidence;
    locked: boolean;
    durationMinutes: number;
  }>;
  materials: Array<{
    sourceId: string;
    amountCents: number;
    economicAmountCents: number;
    taxBasis: TaxBasis;
    taxAssumed: boolean;
  }>;
  directCosts: Array<{
    sourceId: string;
    amountCents: number;
    economicAmountCents: number;
    taxBasis: TaxBasis;
    isPaid: boolean;
    sourceType: string;
  }>;
  revenue: {
    source: string;
    amountCents: number;
    economicAmountCents: number;
    taxBasis: TaxBasis;
    adjustmentCount: number;
  };
};

/** Billable mobile time entry types that contribute to job labour cost. */
const BILLABLE_TIME_ENTRY_TYPES = new Set(['job_time', 'travel']);

export function isFinanciallyAuthoritativeTimeEntry(
  entryType: string,
  endedAt: Date | string | null | undefined,
  durationMinutes: number | null | undefined,
): boolean {
  if (!BILLABLE_TIME_ENTRY_TYPES.has(entryType)) return false;
  if (!endedAt) return false;
  if (!durationMinutes || durationMinutes <= 0) return false;
  return true;
}

export function isLabourRateLocked(metadata: Record<string, unknown> | null | undefined): boolean {
  const meta = metadata ?? {};
  return typeof meta.hourlyCostLockedAt === 'string' && meta.hourlyCostLockedAt.length > 0;
}

/**
 * Provisional rate hierarchy before/at lock — does not imply historical authority.
 */
export function resolveProvisionalLabourHourlyCostCents(
  metadata: Record<string, unknown> | null | undefined,
  companyDefaultRateCentsPerHour: number,
): number {
  const meta = metadata ?? {};
  for (const key of ['hourlyCostCents', 'internalRateCentsPerHour', 'labourRateCentsPerHour'] as const) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }
  return companyDefaultRateCentsPerHour;
}

export function resolveLabourRateSource(metadata: Record<string, unknown> | null | undefined): string {
  const meta = metadata ?? {};
  if (typeof meta.hourlyCostSource === 'string' && meta.hourlyCostSource.trim()) {
    return meta.hourlyCostSource;
  }
  if (meta.internalRateCentsPerHour != null) return 'employee_rate';
  if (meta.labourRateCentsPerHour != null) return 'entry_rate';
  if (meta.hourlyCostCents != null) return 'entry_rate';
  return 'company_default';
}

export function assessLabourRateConfidence(
  metadata: Record<string, unknown> | null | undefined,
  entryType: string,
  durationMinutes: number,
  endedAt: string | null,
): LabourRateConfidence {
  if (durationMinutes <= 0 || !BILLABLE_TIME_ENTRY_TYPES.has(entryType)) {
    return 'missing';
  }
  const meta = metadata ?? {};
  if (isLabourRateLocked(meta)) return 'locked';

  for (const key of ['hourlyCostCents', 'internalRateCentsPerHour', 'labourRateCentsPerHour']) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return 'historical_effective_rate';
    }
  }

  if (endedAt) return 'fallback_current_rate';
  return 'missing';
}

/** Lock labour rate at source — never overwrites an existing lock. */
export function buildLabourRateLockMetadata(input: {
  existingMetadata?: Record<string, unknown> | null;
  companyDefaultRateCentsPerHour: number;
  lockedAt?: string;
}): Record<string, unknown> {
  const existing = { ...(input.existingMetadata ?? {}) };
  if (isLabourRateLocked(existing)) {
    return existing;
  }

  const rate = resolveProvisionalLabourHourlyCostCents(existing, input.companyDefaultRateCentsPerHour);
  let source = 'company_default';
  if (existing.internalRateCentsPerHour != null) source = 'employee_rate';
  else if (existing.labourRateCentsPerHour != null || existing.hourlyCostCents != null) {
    source = 'entry_rate';
  }

  return {
    ...existing,
    hourlyCostCents: rate,
    hourlyCostSource: source,
    hourlyCostLockedAt: input.lockedAt ?? new Date().toISOString(),
    hourlyCostCalculationVersion: LABOUR_COST_LOCK_CALCULATION_VERSION,
  };
}

/** Audited manual correction — preserves correction history in metadata. */
export function applyAuditedLabourRateCorrection(
  existingMetadata: Record<string, unknown> | null | undefined,
  input: {
    newHourlyCostCents: number;
    correctedByUserId: string;
    reason: string;
    correctedAt?: string;
  },
): Record<string, unknown> {
  const existing = { ...(existingMetadata ?? {}) };
  const priorCorrections = Array.isArray(existing.labourRateCorrections)
    ? [...(existing.labourRateCorrections as unknown[])]
    : [];

  priorCorrections.push({
    previousHourlyCostCents: existing.hourlyCostCents ?? null,
    newHourlyCostCents: Math.round(input.newHourlyCostCents),
    correctedByUserId: input.correctedByUserId,
    reason: input.reason.trim(),
    correctedAt: input.correctedAt ?? new Date().toISOString(),
  });

  return {
    ...existing,
    hourlyCostCents: Math.round(input.newHourlyCostCents),
    hourlyCostSource: 'manual_correction',
    hourlyCostLockedAt: existing.hourlyCostLockedAt ?? input.correctedAt ?? new Date().toISOString(),
    hourlyCostCalculationVersion: LABOUR_COST_LOCK_CALCULATION_VERSION,
    labourRateCorrections: priorCorrections,
  };
}

export function resolveCostTaxBasis(input: CostTaxInput): ResolvedCostTax {
  const amount = input.amountCents;

  if (input.taxBasis === 'exclusive') {
    return {
      taxBasis: 'exclusive',
      economicAmountCents: amount,
      cashAmountCents: amount + (input.taxAmountCents ?? 0),
      taxAmountCents: input.taxAmountCents ?? null,
      isAssumed: false,
    };
  }

  if (input.taxBasis === 'inclusive') {
    if (input.taxAmountCents != null && input.taxAmountCents >= 0) {
      return {
        taxBasis: 'inclusive',
        economicAmountCents: amount - input.taxAmountCents,
        cashAmountCents: amount,
        taxAmountCents: input.taxAmountCents,
        isAssumed: false,
      };
    }
    if (input.taxRateBps != null && input.taxRateBps > 0) {
      const tax = Math.round((amount * input.taxRateBps) / (10_000 + input.taxRateBps));
      return {
        taxBasis: 'inclusive',
        economicAmountCents: amount - tax,
        cashAmountCents: amount,
        taxAmountCents: tax,
        isAssumed: false,
      };
    }
    return {
      taxBasis: 'unknown',
      economicAmountCents: amount,
      cashAmountCents: amount,
      taxAmountCents: null,
      isAssumed: true,
    };
  }

  if (input.taxBasis === 'zero_rated' || input.taxBasis === 'exempt') {
    return {
      taxBasis: input.taxBasis,
      economicAmountCents: amount,
      cashAmountCents: amount,
      taxAmountCents: 0,
      isAssumed: false,
    };
  }

  if (input.taxBasis === 'unknown') {
    return {
      taxBasis: 'unknown',
      economicAmountCents: amount,
      cashAmountCents: amount,
      taxAmountCents: null,
      isAssumed: true,
    };
  }

  if (input.assumedExVatCatalogue) {
    return {
      taxBasis: 'exclusive',
      economicAmountCents: amount,
      cashAmountCents: amount,
      taxAmountCents: null,
      isAssumed: true,
    };
  }

  return {
    taxBasis: 'unknown',
    economicAmountCents: amount,
    cashAmountCents: amount,
    taxAmountCents: null,
    isAssumed: true,
  };
}

export function resolveInvoiceRevenueTaxBasis(invoice: {
  totalCents: number;
  subtotalCents: number;
  vatCents: number;
}): ResolvedCostTax {
  if (invoice.subtotalCents > 0) {
    return {
      taxBasis: 'exclusive',
      economicAmountCents: invoice.subtotalCents,
      cashAmountCents: invoice.totalCents,
      taxAmountCents: invoice.vatCents,
      isAssumed: false,
    };
  }
  return resolveCostTaxBasis({ amountCents: invoice.totalCents, taxBasis: 'unknown' });
}

export function assessCashSpentCompleteness(
  directCosts: Array<{ isPaid: boolean; amountPaidCents?: number | null; amountCents?: number }>,
): CashSpentCompleteness {
  const hasPartial = directCosts.some((row) => {
    const paid =
      row.amountPaidCents != null && row.amountPaidCents > 0
        ? row.amountPaidCents
        : row.isPaid
          ? (row.amountCents ?? 0)
          : 0;
    const total = row.amountCents ?? 0;
    return paid > 0 && paid < total;
  });
  if (hasPartial) return 'partial_unsupported';
  if (directCosts.length === 0) return 'unknown';
  return 'complete_boolean';
}

export function assessProfitabilityConfidence(input: {
  hasRevenue: boolean;
  labourConfidences: LabourRateConfidence[];
  taxBasisIssueCount: number;
  cashSpentCompleteness: CashSpentCompleteness;
  dataCompleteness: string;
}): ProfitabilityConfidence {
  const issues: ProfitabilityConfidenceIssue[] = [];

  if (!input.hasRevenue) {
    issues.push({
      type: 'MISSING_REVENUE',
      severity: 'critical',
      message: 'No invoice, accepted quote, or revenue adjustment establishes job revenue.',
    });
  }

  const unlockedLabour = input.labourConfidences.filter(
    (c) => c === 'fallback_current_rate' || c === 'historical_effective_rate',
  );
  if (unlockedLabour.some((c) => c === 'fallback_current_rate')) {
    issues.push({
      type: 'LABOUR_RATE_NOT_LOCKED',
      severity: 'warning',
      message: 'One or more labour entries use the current company default rate (not historically locked).',
    });
  } else if (unlockedLabour.some((c) => c === 'historical_effective_rate')) {
    issues.push({
      type: 'UNLOCKED_LABOUR_COST',
      severity: 'warning',
      message: 'One or more labour entries have a rate but it was not locked at capture.',
    });
  }

  if (input.taxBasisIssueCount > 0) {
    issues.push({
      type: 'INCOMPLETE_TAX_BASIS',
      severity: 'warning',
      message: `${input.taxBasisIssueCount} cost source(s) have unknown or assumed tax basis.`,
    });
  }

  if (input.cashSpentCompleteness === 'partial_unsupported') {
    issues.push({
      type: 'INCOMPLETE_CASH_SETTLEMENT',
      severity: 'warning',
      message: 'Partial payment amounts exist but are not yet supported for cash profit precision.',
    });
  } else if (input.cashSpentCompleteness === 'complete_boolean') {
    issues.push({
      type: 'INCOMPLETE_CASH_SETTLEMENT',
      severity: 'info',
      message:
        'Cash spent uses paid/unpaid flags only — bank reconciliation not yet linked. See knownRealisedCashProfit.',
    });
  }

  let status: ProfitabilityConfidenceStatus = 'complete';
  if (!input.hasRevenue || issues.some((i) => i.severity === 'critical')) {
    status = 'incomplete';
  } else if (issues.some((i) => i.severity === 'warning')) {
    status = 'provisional';
  }

  return { status, issues };
}

/**
 * Native TITAN credit/refund integration contract (JPE-001D Part 4).
 * Xero credit notes are NOT consumed here — see xero_credit_notes for future wiring.
 */
export const NATIVE_CREDIT_REFUND_CONTRACT = {
  supportedSources: ['job_profitability_adjustments.kind=revenue (negative amount)'] as const,
  unsupportedSources: [
    'xero_credit_notes (no job_id — requires Xero→TITAN linkage before JPE consumption)',
    'xero_credit_note_allocations (invoice-scoped only)',
  ] as const,
  invariant:
    'Economic revenue = authoritative base + sum(revenue adjustments) exactly once. Negative adjustments represent native credits/refunds.',
  futureIntegration:
    'When Xero credit notes are linked to TITAN jobs/invoices, map to job_profitability_adjustments or a native credit_note table with job_id before JPE consumption.',
} as const;
