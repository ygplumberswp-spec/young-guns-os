/**
 * Row 105 — Multi-Job Supplier Invoice Allocation
 *
 * Allocate one legitimate supplier invoice across Jobs/PO lines without
 * inventing source truth or duplicating JPE costs. Reuses Row103/104.
 * Rows 106–107 not started. Row118 remains OPEN. Staging Xero writes = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { assertCanonicalJobLink, projectXeroBillLinkage } from './job-procurement-chain.js';

export const MULTI_JOB_SUPPLIER_INVOICE_ALLOCATION_KEY =
  'multi-job-supplier-invoice-allocation' as const;

export const MULTI_JOB_ALLOC_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type MultiJobAllocWarning =
  | 'ALLOCATED'
  | 'PARTIALLY_ALLOCATED'
  | 'UNALLOCATED'
  | 'OVER_ALLOCATED'
  | 'REVIEW_REQUIRED'
  | 'RECONCILED'
  | 'PO_LINK_MISSING'
  | 'PO_AMOUNT_MISMATCH'
  | 'PO_QUANTITY_MISMATCH'
  | 'SUPPLIER_MISMATCH'
  | 'INVOICE_EXCEEDS_PO'
  | 'MULTIPLE_PO_CANDIDATES'
  | 'XERO_BILL_NOT_LINKED'
  | 'FREE_TEXT_JOB_LINK_ONLY'
  | 'WRONG_JOB'
  | 'CROSS_TENANT_ALLOCATION'
  | 'MISSING_SOURCE_AMOUNT'
  | 'MISSING_VAT'
  | 'VAT_UNKNOWN'
  | 'DUPLICATE_JPE_BLOCKED'
  | 'FULL_INVOICE_JPE_BLOCKED'
  | 'AMBIGUOUS_CREDIT_REVIEW_REQUIRED'
  | 'CREDIT_ALLOCATION_ADJUSTED'
  | 'SOURCE_INVOICE_IMMUTABLE'
  | 'ROUNDING_ALLOCATION_EXPLICIT'
  | 'ROW106_107_NOT_STARTED';

export type SourceInvoiceLine = {
  lineId: string;
  lineOrder: number;
  itemCode: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  netAmountCents: number | null;
  vatAmountCents: number | null;
  vatBasis: string | null;
  grossAmountCents: number | null;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
};

export type SourceInvoiceTruth = {
  companyId: string;
  supplierInvoiceId: string;
  supplierId: string | null;
  sourceDocumentRef: string | null;
  sourceDocumentHash: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  netAmountCents: number | null;
  vatAmountCents: number | null;
  vatBasis: string | null;
  grossAmountCents: number | null;
  knownXeroBillId: string | null;
  knownXeroInvoiceId: string | null;
  lines: SourceInvoiceLine[];
  /** Frozen snapshot marker — never rewritten by allocation. */
  immutable: true;
};

export type JobAllocationDraft = {
  allocationKey: string;
  supplierInvoiceId: string;
  invoiceLineId: string | null;
  jobId: string | null;
  jobReference?: string | null;
  expectedJobId?: string | null;
  expectedJobCompanyId: string;
  companyId: string;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  allocationNetCents: number | null;
  allocationVatCents: number | null;
  allocationGrossCents: number | null;
  allocationQuantity: number | null;
  reason: string | null;
  reviewStatus: 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'BLOCKED';
  actorUserId: string | null;
  occurredAt: string;
  invoiceSupplierId?: string | null;
  poNetAmountCents?: number | null;
  poQuantity?: number | null;
  poSupplierId?: string | null;
  multiplePoCandidates?: boolean;
};

export type ValidatedJobAllocation = {
  allocationKey: string;
  supplierInvoiceId: string;
  invoiceLineId: string | null;
  jobId: string;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  allocationNetCents: number;
  allocationVatCents: number | null;
  allocationGrossCents: number | null;
  allocationQuantity: number | null;
  reason: string | null;
  reviewStatus: 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'BLOCKED';
  warnings: MultiJobAllocWarning[];
  jpeSourceId: string;
};

export type AllocationBalanceResult = {
  status:
    | 'ALLOCATED'
    | 'PARTIALLY_ALLOCATED'
    | 'UNALLOCATED'
    | 'OVER_ALLOCATED'
    | 'REVIEW_REQUIRED'
    | 'RECONCILED'
    | 'INCOMPLETE';
  warnings: MultiJobAllocWarning[];
  sourceNetCents: number | null;
  allocatedNetCents: number;
  unallocatedNetCents: number | null;
  sourceVatCents: number | null;
  allocatedVatCents: number | null;
  sourceGrossCents: number | null;
  allocatedGrossCents: number | null;
  exact: boolean;
  sourceInvoiceImmutable: true;
};

/**
 * Deterministic remainder-to-last allocation for net cents splits.
 * Explicit and auditable — never hides residual cents.
 */
export function allocateNetCentsDeterministic(
  totalNetCents: number,
  weights: number[],
): { shares: number[]; roundingApplied: boolean; remainderToIndex: number | null } {
  if (!Number.isInteger(totalNetCents) || totalNetCents < 0) {
    throw new Error('totalNetCents must be a non-negative integer');
  }
  if (weights.length === 0) {
    return { shares: [], roundingApplied: false, remainderToIndex: null };
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (!(weightSum > 0) || weights.some((w) => !(w >= 0))) {
    throw new Error('weights must be non-negative with positive sum');
  }
  const raw = weights.map((w) => (totalNetCents * w) / weightSum);
  const floors = raw.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);
  let remainder = totalNetCents - assigned;
  const shares = [...floors];
  // Deterministic: assign leftover cents from the end (last index first).
  let idx = shares.length - 1;
  const lastTouched = remainder > 0 ? shares.length - 1 : null;
  while (remainder > 0 && idx >= 0) {
    shares[idx] += 1;
    remainder -= 1;
    assigned += 1;
    idx -= 1;
  }
  return {
    shares,
    roundingApplied: Boolean(lastTouched != null && shares.some((s, i) => s !== floors[i])),
    remainderToIndex: lastTouched,
  };
}

export function validateJobAllocation(draft: JobAllocationDraft): {
  ok: boolean;
  warnings: MultiJobAllocWarning[];
  allocation: ValidatedJobAllocation | null;
} {
  const warnings: MultiJobAllocWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: draft.companyId,
    jobId: draft.jobId,
    jobReference: draft.jobReference,
    expectedJobCompanyId: draft.expectedJobCompanyId,
    expectedJobId: draft.expectedJobId,
  });
  if (!jobLink.ok) {
    for (const w of jobLink.warnings) {
      if (w === 'CROSS_TENANT_LINK_BLOCKED') warnings.push('CROSS_TENANT_ALLOCATION');
      else if (w === 'FREE_TEXT_JOB_LINK_REJECTED') warnings.push('FREE_TEXT_JOB_LINK_ONLY');
      else if (w === 'JOB_LINK_CONFLICT') warnings.push('WRONG_JOB');
      else warnings.push('REVIEW_REQUIRED');
    }
    return { ok: false, warnings, allocation: null };
  }

  if (draft.allocationNetCents == null || !Number.isInteger(draft.allocationNetCents)) {
    warnings.push('MISSING_SOURCE_AMOUNT', 'REVIEW_REQUIRED');
    return { ok: false, warnings, allocation: null };
  }
  if (draft.allocationNetCents < 0) {
    warnings.push('REVIEW_REQUIRED');
    return { ok: false, warnings, allocation: null };
  }

  if (draft.allocationVatCents == null) {
    warnings.push('VAT_UNKNOWN', 'MISSING_VAT');
  }

  warnings.push(
    ...reconcilePoAllocation({
      invoiceSupplierId: draft.invoiceSupplierId ?? null,
      poSupplierId: draft.poSupplierId ?? null,
      allocationNetCents: draft.allocationNetCents,
      poNetAmountCents: draft.poNetAmountCents ?? null,
      allocationQuantity: draft.allocationQuantity,
      poQuantity: draft.poQuantity ?? null,
      purchaseOrderId: draft.purchaseOrderId,
      multiplePoCandidates: draft.multiplePoCandidates,
    }),
  );

  const blocked =
    warnings.includes('CROSS_TENANT_ALLOCATION') ||
    warnings.includes('WRONG_JOB') ||
    warnings.includes('FREE_TEXT_JOB_LINK_ONLY') ||
    warnings.includes('MULTIPLE_PO_CANDIDATES') ||
    warnings.includes('SUPPLIER_MISMATCH');

  const jpeSourceId = allocationJpeSourceKey(draft.allocationKey);

  return {
    ok: !blocked,
    warnings,
    allocation: blocked
      ? null
      : {
          allocationKey: draft.allocationKey,
          supplierInvoiceId: draft.supplierInvoiceId,
          invoiceLineId: draft.invoiceLineId,
          jobId: jobLink.jobId,
          purchaseOrderId: draft.purchaseOrderId,
          purchaseOrderLineId: draft.purchaseOrderLineId,
          allocationNetCents: draft.allocationNetCents,
          allocationVatCents: draft.allocationVatCents,
          allocationGrossCents: draft.allocationGrossCents,
          allocationQuantity: draft.allocationQuantity,
          reason: draft.reason,
          reviewStatus: warnings.includes('REVIEW_REQUIRED') ? 'DRAFT' : draft.reviewStatus,
          warnings,
          jpeSourceId,
        },
  };
}

export function reconcilePoAllocation(input: {
  invoiceSupplierId: string | null;
  poSupplierId: string | null;
  allocationNetCents: number | null;
  poNetAmountCents: number | null;
  allocationQuantity: number | null;
  poQuantity: number | null;
  purchaseOrderId: string | null;
  multiplePoCandidates?: boolean;
}): MultiJobAllocWarning[] {
  const warnings: MultiJobAllocWarning[] = [];
  if (!input.purchaseOrderId) warnings.push('PO_LINK_MISSING');
  if (input.multiplePoCandidates) warnings.push('MULTIPLE_PO_CANDIDATES', 'REVIEW_REQUIRED');
  if (
    input.invoiceSupplierId &&
    input.poSupplierId &&
    input.invoiceSupplierId !== input.poSupplierId
  ) {
    warnings.push('SUPPLIER_MISMATCH', 'REVIEW_REQUIRED');
  }
  if (
    input.allocationNetCents != null &&
    input.poNetAmountCents != null &&
    input.allocationNetCents !== input.poNetAmountCents
  ) {
    warnings.push('PO_AMOUNT_MISMATCH');
    if (input.allocationNetCents > input.poNetAmountCents) {
      warnings.push('INVOICE_EXCEEDS_PO', 'REVIEW_REQUIRED');
    }
  }
  if (
    input.allocationQuantity != null &&
    input.poQuantity != null &&
    input.allocationQuantity !== input.poQuantity
  ) {
    warnings.push('PO_QUANTITY_MISMATCH');
  }
  return warnings;
}

export function resolveAllocationBalance(input: {
  source: SourceInvoiceTruth;
  allocations: Array<{
    allocationNetCents: number;
    allocationVatCents: number | null;
    allocationGrossCents: number | null;
  }>;
}): AllocationBalanceResult {
  const warnings: MultiJobAllocWarning[] = ['SOURCE_INVOICE_IMMUTABLE'];
  const sourceNet = input.source.netAmountCents;
  const sourceVat = input.source.vatAmountCents;
  const sourceGross = input.source.grossAmountCents;

  const allocatedNet = input.allocations.reduce((s, a) => s + a.allocationNetCents, 0);
  const vatKnown = input.allocations.every((a) => a.allocationVatCents != null);
  const allocatedVat = vatKnown
    ? input.allocations.reduce((s, a) => s + (a.allocationVatCents as number), 0)
    : null;
  const grossKnown = input.allocations.every((a) => a.allocationGrossCents != null);
  const allocatedGross = grossKnown
    ? input.allocations.reduce((s, a) => s + (a.allocationGrossCents as number), 0)
    : null;

  if (sourceNet == null) {
    warnings.push('MISSING_SOURCE_AMOUNT', 'REVIEW_REQUIRED');
    return {
      status: 'INCOMPLETE',
      warnings,
      sourceNetCents: null,
      allocatedNetCents: allocatedNet,
      unallocatedNetCents: null,
      sourceVatCents: sourceVat,
      allocatedVatCents: allocatedVat,
      sourceGrossCents: sourceGross,
      allocatedGrossCents: allocatedGross,
      exact: false,
      sourceInvoiceImmutable: true,
    };
  }

  if (sourceVat == null || input.source.vatBasis == null || input.source.vatBasis === 'UNKNOWN') {
    warnings.push('VAT_UNKNOWN', 'MISSING_VAT');
  }

  const unallocated = sourceNet - allocatedNet;
  let status: AllocationBalanceResult['status'] = 'REVIEW_REQUIRED';
  let exact = false;

  if (input.allocations.length === 0) {
    status = 'UNALLOCATED';
    warnings.push('UNALLOCATED');
  } else if (allocatedNet > sourceNet) {
    status = 'OVER_ALLOCATED';
    warnings.push('OVER_ALLOCATED', 'REVIEW_REQUIRED');
  } else if (allocatedNet === sourceNet) {
    exact = true;
    if (sourceVat != null && allocatedVat != null && allocatedVat !== sourceVat) {
      status = 'REVIEW_REQUIRED';
      warnings.push('REVIEW_REQUIRED');
    } else if (warnings.includes('VAT_UNKNOWN')) {
      status = 'ALLOCATED';
      warnings.push('ALLOCATED', 'RECONCILED');
    } else {
      status = 'RECONCILED';
      warnings.push('ALLOCATED', 'RECONCILED');
    }
  } else {
    status = 'PARTIALLY_ALLOCATED';
    warnings.push('PARTIALLY_ALLOCATED', 'UNALLOCATED');
  }

  return {
    status,
    warnings,
    sourceNetCents: sourceNet,
    allocatedNetCents: allocatedNet,
    unallocatedNetCents: unallocated,
    sourceVatCents: sourceVat,
    allocatedVatCents: allocatedVat,
    sourceGrossCents: sourceGross,
    allocatedGrossCents: allocatedGross,
    exact,
    sourceInvoiceImmutable: true,
  };
}

export function allocationJpeSourceKey(allocationKey: string): string {
  return `supplier_invoice_alloc:${allocationKey}`;
}

export function fullInvoiceJpeSourceKey(supplierInvoiceId: string): string {
  return `supplier_invoice:${supplierInvoiceId}`;
}

/**
 * Exactly-once JPE for an allocation slice — never posts full invoice to each Job.
 */
export function resolveAllocationJpePosting(input: {
  allocationKey: string;
  supplierInvoiceId: string;
  jobId: string;
  amountCents: number | null;
  existingJpeSourceKeys: string[];
}): {
  shouldPost: boolean;
  duplicateBlocked: boolean;
  jpeSourceType: 'supplier_invoice' | null;
  jpeSourceId: string | null;
  amountCents: number | null;
  warnings: MultiJobAllocWarning[];
} {
  const warnings: MultiJobAllocWarning[] = [];
  if (input.amountCents == null) {
    return {
      shouldPost: false,
      duplicateBlocked: false,
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: null,
      warnings: ['MISSING_SOURCE_AMOUNT', 'REVIEW_REQUIRED'],
    };
  }
  const allocKey = allocationJpeSourceKey(input.allocationKey);
  const fullKey = fullInvoiceJpeSourceKey(input.supplierInvoiceId);
  if (input.existingJpeSourceKeys.includes(fullKey)) {
    warnings.push('FULL_INVOICE_JPE_BLOCKED', 'DUPLICATE_JPE_BLOCKED');
    return {
      shouldPost: false,
      duplicateBlocked: true,
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: input.amountCents,
      warnings,
    };
  }
  if (input.existingJpeSourceKeys.includes(allocKey)) {
    warnings.push('DUPLICATE_JPE_BLOCKED');
    return {
      shouldPost: false,
      duplicateBlocked: true,
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: input.amountCents,
      warnings,
    };
  }
  return {
    shouldPost: true,
    duplicateBlocked: false,
    jpeSourceType: 'supplier_invoice',
    jpeSourceId: allocKey,
    amountCents: input.amountCents,
    warnings,
  };
}

export function resolveCreditAgainstAllocations(input: {
  creditAmountCents: number;
  relatedAllocationKeys: string[];
  existingJpeSourceKeys: string[];
  ambiguous: boolean;
}): {
  ok: boolean;
  warnings: MultiJobAllocWarning[];
  adjustments: Array<{ allocationKey: string; jpeSourceId: string; amountCents: number }>;
} {
  if (input.ambiguous || input.relatedAllocationKeys.length === 0) {
    return {
      ok: false,
      warnings: ['AMBIGUOUS_CREDIT_REVIEW_REQUIRED', 'REVIEW_REQUIRED'],
      adjustments: [],
    };
  }
  if (input.relatedAllocationKeys.length !== 1) {
    return {
      ok: false,
      warnings: ['AMBIGUOUS_CREDIT_REVIEW_REQUIRED', 'REVIEW_REQUIRED'],
      adjustments: [],
    };
  }
  const key = input.relatedAllocationKeys[0]!;
  const jpeSourceId = `supplier_invoice_alloc_credit:${key}`;
  if (input.existingJpeSourceKeys.includes(jpeSourceId)) {
    return {
      ok: true,
      warnings: ['DUPLICATE_JPE_BLOCKED'],
      adjustments: [],
    };
  }
  // Also block if return+credit already adjusted same economic event via Row104 key
  const returnKey = `supplier_return_credit:${key}`;
  if (input.existingJpeSourceKeys.includes(returnKey)) {
    return {
      ok: true,
      warnings: ['DUPLICATE_JPE_BLOCKED'],
      adjustments: [],
    };
  }
  return {
    ok: true,
    warnings: ['CREDIT_ALLOCATION_ADJUSTED'],
    adjustments: [
      {
        allocationKey: key,
        jpeSourceId,
        amountCents: -Math.abs(input.creditAmountCents),
      },
    ],
  };
}

export type AllocationCorrection = {
  correctionKey: string;
  priorAllocationKey: string;
  newAllocationKey: string | null;
  reverseAmountCents: number;
  reason: string;
  preservesHistory: true;
};

export function buildAllocationCorrection(input: {
  priorAllocationKey: string;
  priorAmountCents: number;
  newAllocationKey: string | null;
  reason: string;
}): AllocationCorrection {
  return {
    correctionKey: `corr:${input.priorAllocationKey}:${input.newAllocationKey ?? 'void'}`,
    priorAllocationKey: input.priorAllocationKey,
    newAllocationKey: input.newAllocationKey,
    reverseAmountCents: -Math.abs(input.priorAmountCents),
    reason: input.reason,
    preservesHistory: true,
  };
}

export function linkXeroBillForAllocation(input: {
  companyId?: string;
  supplierInvoiceId: string;
  knownXeroBillId: string | null;
  knownXeroInvoiceId: string | null;
  xeroWrites?: number;
}): {
  xeroWrites: 0;
  status: 'LINKED' | 'XERO_BILL_NOT_LINKED';
  xeroBillId: string | null;
  xeroInvoiceId: string | null;
  warning: MultiJobAllocWarning | null;
} {
  const projected = projectXeroBillLinkage({
    companyId: input.companyId ?? 'staging',
    supplierInvoiceEvidenceId: input.supplierInvoiceId,
    knownXeroBillId: input.knownXeroBillId,
    knownXeroInvoiceId: input.knownXeroInvoiceId,
    xeroWrites: input.xeroWrites ?? 0,
  });
  return {
    xeroWrites: 0,
    status: projected.projection.status,
    xeroBillId: projected.projection.xeroBillId,
    xeroInvoiceId: projected.projection.xeroInvoiceId,
    warning: projected.warning === 'XERO_BILL_NOT_LINKED' ? 'XERO_BILL_NOT_LINKED' : null,
  };
}

export function canManageMultiJobInvoiceAllocation(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write') || perms.includes('procurement:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoMultiJobAllocClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoMultiJobAllocClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'multiJobAllocInternal',
    'supplierInvoiceAllocation',
    'allocationNetCents',
    'allocationVatCents',
    'xeroBillProjection',
    'jpeProfitCents',
    'lineCostCents',
    'unitPriceCents',
    'supplierInvoiceCost',
    'jobProcurementChain',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Multi-job allocation internal field leaked at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoMultiJobAllocClientLeak(v, `${path}.${k}`);
  }
}

export function projectTechSafeAllocationView(input: {
  jobId: string;
  allocationQuantity: number | null;
}): {
  jobId: string;
  allocationQuantity: number | null;
  pricesVisible: false;
  xeroBillVisible: false;
  jpeVisible: false;
} {
  return {
    jobId: input.jobId,
    allocationQuantity: input.allocationQuantity,
    pricesVisible: false,
    xeroBillVisible: false,
    jpeVisible: false,
  };
}

export function assertRow106107NotStartedDuringRow105(started: boolean): void {
  if (started) throw new Error('Row 106/107 must not start during Row 105');
}

export function assertRow105SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row106107Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row106107NotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  rows103104Preserved: true;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow106107NotStartedDuringRow105(input.row106107Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 105 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 105 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 105 requires production writes = 0');
  return {
    row92Off: true,
    row106107NotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    rows103104Preserved: true,
  };
}

export function assertRoyalCapeUnchangedForRow105(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== MULTI_JOB_ALLOC_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== MULTI_JOB_ALLOC_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function freezeSourceInvoice(input: Omit<SourceInvoiceTruth, 'immutable'>): SourceInvoiceTruth {
  return { ...input, immutable: true };
}
