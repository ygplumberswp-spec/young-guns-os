/**
 * Row 104 — Material Quantity Reconciliation + Supplier Returns/Credits
 *
 * Evidence-backed qty truth over Row103 chain. Missing stays UNKNOWN.
 * Exactly-once cost adjustments. No Row105–107. Row118 remains OPEN.
 * Staging: Xero writes = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { assertCanonicalJobLink } from './job-procurement-chain.js';

export const MATERIAL_QUANTITY_RECONCILIATION_KEY = 'material-quantity-reconciliation' as const;

export const MATERIAL_QTY_RECON_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type MaterialQtyWarning =
  | 'OVER_RECEIVED'
  | 'UNDER_RECEIVED'
  | 'OVER_USED'
  | 'RETURN_EXCEEDS_AVAILABLE'
  | 'WASTE_EXCEEDS_AVAILABLE'
  | 'UNACCOUNTED_QUANTITY'
  | 'UNIT_MISMATCH'
  | 'SOURCE_MISSING'
  | 'DUPLICATE_EVENT_BLOCKED'
  | 'REVIEW_REQUIRED'
  | 'RECONCILED'
  | 'SUPPLIER_CREDIT_NOT_LINKED'
  | 'JOB_LINK_CONFLICT'
  | 'CROSS_TENANT_LINK_BLOCKED'
  | 'UNKNOWN_QUANTITY'
  | 'QUOTE_BASELINE_PRESERVED';

export type QtyEvidence = {
  value: number | null;
  unit: string | null;
  sourceId: string | null;
  sourceType: string | null;
  known: boolean;
};

export type MaterialQtyInputs = {
  companyId: string;
  jobId: string;
  expectedJobCompanyId: string;
  chainLinkId: string | null;
  materialKey: string;
  quoted: QtyEvidence;
  ordered: QtyEvidence;
  received: QtyEvidence;
  used: QtyEvidence;
  returnedToSupplier: QtyEvidence;
  returnedToStock: QtyEvidence;
  wasted: QtyEvidence;
};

export type MaterialQtyReconciliation = {
  ok: boolean;
  status: 'RECONCILED' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INCOMPLETE';
  warnings: MaterialQtyWarning[];
  unit: string | null;
  quoted: number | null;
  ordered: number | null;
  received: number | null;
  used: number | null;
  returnedToSupplier: number | null;
  returnedToStock: number | null;
  wasted: number | null;
  /** received - used - returnedToSupplier - returnedToStock - wasted when all known */
  unaccounted: number | null;
  remaining: number | null;
  quoteBaselineUnchanged: true;
  row103ChainPreserved: true;
};

function normUnit(u: string | null | undefined): string | null {
  if (u == null) return null;
  const t = u.trim().toLowerCase();
  if (!t) return null;
  if (['ea', 'each', 'nr', 'no', 'unit'].includes(t)) return 'each';
  if (['m', 'metre', 'meter', 'metres', 'meters'].includes(t)) return 'm';
  return t;
}

function collectUnits(input: MaterialQtyInputs): {
  unit: string | null;
  mismatch: boolean;
} {
  const units = [
    input.quoted,
    input.ordered,
    input.received,
    input.used,
    input.returnedToSupplier,
    input.returnedToStock,
    input.wasted,
  ]
    .filter((q) => q.known && q.unit)
    .map((q) => normUnit(q.unit));
  const uniq = [...new Set(units.filter(Boolean))];
  if (uniq.length > 1) return { unit: uniq[0] ?? null, mismatch: true };
  return { unit: uniq[0] ?? null, mismatch: false };
}

export function resolveMaterialQuantityReconciliation(
  input: MaterialQtyInputs,
): MaterialQtyReconciliation {
  const warnings: MaterialQtyWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.expectedJobCompanyId,
    expectedJobId: input.jobId,
  });
  if (!jobLink.ok) {
    return {
      ok: false,
      status: 'BLOCKED',
      warnings: jobLink.warnings as MaterialQtyWarning[],
      unit: null,
      quoted: input.quoted.value,
      ordered: input.ordered.value,
      received: input.received.value,
      used: input.used.value,
      returnedToSupplier: input.returnedToSupplier.value,
      returnedToStock: input.returnedToStock.value,
      wasted: input.wasted.value,
      unaccounted: null,
      remaining: null,
      quoteBaselineUnchanged: true,
      row103ChainPreserved: true,
    };
  }

  const { unit, mismatch } = collectUnits(input);
  if (mismatch) {
    warnings.push('UNIT_MISMATCH', 'REVIEW_REQUIRED');
  }

  const sources = [
    input.quoted,
    input.ordered,
    input.received,
    input.used,
    input.returnedToSupplier,
    input.returnedToStock,
    input.wasted,
  ];
  for (const s of sources) {
    if (!s.known) warnings.push('UNKNOWN_QUANTITY');
    if (s.known && s.value == null) warnings.push('SOURCE_MISSING');
  }

  const ordered = input.ordered.known ? input.ordered.value : null;
  const received = input.received.known ? input.received.value : null;
  const used = input.used.known ? input.used.value : null;
  const retSup = input.returnedToSupplier.known ? input.returnedToSupplier.value : null;
  const retStock = input.returnedToStock.known ? input.returnedToStock.value : null;
  const wasted = input.wasted.known ? input.wasted.value : null;
  const quoted = input.quoted.known ? input.quoted.value : null;

  if (ordered != null && received != null) {
    if (received > ordered) warnings.push('OVER_RECEIVED');
    if (received < ordered) warnings.push('UNDER_RECEIVED');
  }

  if (received != null && used != null && used > received) {
    warnings.push('OVER_USED', 'REVIEW_REQUIRED');
  }

  let unaccounted: number | null = null;
  let remaining: number | null = null;
  if (
    received != null &&
    used != null &&
    retSup != null &&
    retStock != null &&
    wasted != null
  ) {
    unaccounted = received - used - retSup - retStock - wasted;
    remaining = unaccounted;
    if (Math.abs(unaccounted) > 1e-9) warnings.push('UNACCOUNTED_QUANTITY');
  } else {
    warnings.push('REVIEW_REQUIRED');
  }

  warnings.push('QUOTE_BASELINE_PRESERVED');

  const unique = [...new Set(warnings)];
  const blocked = unique.includes('UNIT_MISMATCH') || unique.includes('OVER_USED');
  const incomplete =
    unique.includes('UNKNOWN_QUANTITY') ||
    unique.includes('SOURCE_MISSING') ||
    unique.includes('REVIEW_REQUIRED');
  const reconciled =
    !blocked &&
    !incomplete &&
    (unaccounted == null || Math.abs(unaccounted) < 1e-9) &&
    !unique.includes('OVER_RECEIVED') &&
    !unique.includes('UNDER_RECEIVED');

  if (reconciled) unique.push('RECONCILED');

  return {
    ok: !blocked,
    status: blocked ? 'BLOCKED' : reconciled ? 'RECONCILED' : incomplete ? 'INCOMPLETE' : 'REVIEW_REQUIRED',
    warnings: unique,
    unit,
    quoted,
    ordered,
    received,
    used,
    returnedToSupplier: retSup,
    returnedToStock: retStock,
    wasted,
    unaccounted,
    remaining,
    quoteBaselineUnchanged: true,
    row103ChainPreserved: true,
  };
}

export type SupplierReturnInput = {
  companyId: string;
  jobId: string;
  expectedJobId: string;
  expectedJobCompanyId: string;
  supplierId: string | null;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  supplierInvoiceEvidenceId: string | null;
  deliveryEvidenceId: string | null;
  materialKey: string;
  quantity: number | null;
  unit: string | null;
  availableQuantity: number | null;
  reason: string | null;
  sourceDocumentRef: string | null;
  actorUserId: string | null;
  occurredAt: string;
  existingEventKeys: string[];
  clientActionId: string | null;
};

export function validateSupplierReturn(input: SupplierReturnInput): {
  ok: boolean;
  warnings: MaterialQtyWarning[];
  event: {
    quantity: number;
    unit: string | null;
    idempotencyKey: string;
    deletesOriginalReceipt: false;
  } | null;
} {
  const warnings: MaterialQtyWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.expectedJobCompanyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) {
    return { ok: false, warnings: jobLink.warnings as MaterialQtyWarning[], event: null };
  }
  if (input.quantity == null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, warnings: ['SOURCE_MISSING', 'REVIEW_REQUIRED'], event: null };
  }
  if (input.availableQuantity == null) {
    return { ok: false, warnings: ['UNKNOWN_QUANTITY', 'REVIEW_REQUIRED'], event: null };
  }
  if (input.quantity > input.availableQuantity + 1e-9) {
    return {
      ok: false,
      warnings: ['RETURN_EXCEEDS_AVAILABLE', 'REVIEW_REQUIRED'],
      event: null,
    };
  }
  const idempotencyKey =
    input.clientActionId ??
    `supplier_return:${input.purchaseOrderLineId ?? 'none'}:${input.quantity}:${input.occurredAt}`;
  if (input.existingEventKeys.includes(idempotencyKey)) {
    return { ok: false, warnings: ['DUPLICATE_EVENT_BLOCKED'], event: null };
  }
  return {
    ok: true,
    warnings,
    event: {
      quantity: input.quantity,
      unit: input.unit,
      idempotencyKey,
      deletesOriginalReceipt: false,
    },
  };
}

export type SupplierCreditInput = {
  companyId: string;
  jobId: string;
  expectedJobId: string;
  expectedJobCompanyId: string;
  supplierId: string | null;
  creditNoteRef: string | null;
  sourceDocumentRef: string | null;
  relatedReturnEventId: string | null;
  relatedInvoiceEvidenceId: string | null;
  purchaseOrderId: string | null;
  amountCents: number | null;
  vatBasis: string | null;
  creditDate: string | null;
  knownXeroCreditNoteId: string | null;
  xeroWrites: number;
  existingEventKeys: string[];
  clientActionId: string | null;
};

export function validateSupplierCredit(input: SupplierCreditInput): {
  ok: boolean;
  warnings: MaterialQtyWarning[];
  xeroWrites: 0;
  event: {
    amountCents: number;
    creditNoteRef: string | null;
    xeroCreditNoteId: string | null;
    xeroStatus: 'LINKED' | 'SUPPLIER_CREDIT_NOT_LINKED';
    idempotencyKey: string;
  } | null;
} {
  if ((input.xeroWrites ?? 0) !== 0) {
    throw new Error('Row 104 requires real Xero writes = 0');
  }
  const warnings: MaterialQtyWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.expectedJobCompanyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) {
    return {
      ok: false,
      warnings: jobLink.warnings as MaterialQtyWarning[],
      xeroWrites: 0,
      event: null,
    };
  }
  if (input.amountCents == null || !Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return {
      ok: false,
      warnings: ['SOURCE_MISSING', 'REVIEW_REQUIRED'],
      xeroWrites: 0,
      event: null,
    };
  }
  const xeroStatus = input.knownXeroCreditNoteId?.trim()
    ? ('LINKED' as const)
    : ('SUPPLIER_CREDIT_NOT_LINKED' as const);
  if (xeroStatus === 'SUPPLIER_CREDIT_NOT_LINKED') warnings.push('SUPPLIER_CREDIT_NOT_LINKED');

  const idempotencyKey =
    input.clientActionId ??
    `supplier_credit:${input.relatedReturnEventId ?? input.relatedInvoiceEvidenceId ?? 'none'}:${input.amountCents}`;
  if (input.existingEventKeys.includes(idempotencyKey)) {
    return { ok: false, warnings: ['DUPLICATE_EVENT_BLOCKED'], xeroWrites: 0, event: null };
  }
  return {
    ok: true,
    warnings,
    xeroWrites: 0,
    event: {
      amountCents: input.amountCents,
      creditNoteRef: input.creditNoteRef,
      xeroCreditNoteId: input.knownXeroCreditNoteId,
      xeroStatus,
      idempotencyKey,
    },
  };
}

export type WasteInput = {
  companyId: string;
  jobId: string;
  expectedJobId: string;
  expectedJobCompanyId: string;
  materialKey: string;
  quantity: number | null;
  unit: string | null;
  availableQuantity: number | null;
  reason: string | null;
  actorUserId: string | null;
  occurredAt: string;
  existingEventKeys: string[];
  clientActionId: string | null;
};

export function validateWasteEvent(input: WasteInput): {
  ok: boolean;
  warnings: MaterialQtyWarning[];
  event: { quantity: number; unit: string | null; idempotencyKey: string } | null;
} {
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.expectedJobCompanyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) {
    return { ok: false, warnings: jobLink.warnings as MaterialQtyWarning[], event: null };
  }
  if (input.quantity == null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, warnings: ['SOURCE_MISSING', 'REVIEW_REQUIRED'], event: null };
  }
  if (input.availableQuantity == null) {
    return { ok: false, warnings: ['UNKNOWN_QUANTITY', 'REVIEW_REQUIRED'], event: null };
  }
  if (input.quantity > input.availableQuantity + 1e-9) {
    return {
      ok: false,
      warnings: ['WASTE_EXCEEDS_AVAILABLE', 'REVIEW_REQUIRED'],
      event: null,
    };
  }
  const idempotencyKey =
    input.clientActionId ??
    `waste:${input.materialKey}:${input.quantity}:${input.occurredAt}`;
  if (input.existingEventKeys.includes(idempotencyKey)) {
    return { ok: false, warnings: ['DUPLICATE_EVENT_BLOCKED'], event: null };
  }
  return {
    ok: true,
    warnings: [],
    event: { quantity: input.quantity, unit: input.unit, idempotencyKey },
  };
}

export type CostAdjustmentPath =
  | 'direct_job_return_credit'
  | 'stock_receipt_no_job_cost'
  | 'stock_use'
  | 'return_to_stock'
  | 'suppressed_duplicate';

/**
 * Exactly-once cost adjustment authority for returns/credits/waste/stock paths.
 */
export function resolveMaterialCostAdjustment(input: {
  path:
    | 'DIRECT_JOB_PURCHASE'
    | 'DIRECT_JOB_RETURN_CREDIT'
    | 'STOCK_RECEIPT'
    | 'STOCK_USE'
    | 'RETURN_TO_STOCK'
    | 'SUPPLIER_RETURN_AND_CREDIT';
  amountCents: number | null;
  sourceKey: string;
  existingJpeSourceKeys: string[];
  /** When both return and credit keys would apply to same economic event */
  pairedCreditKey?: string | null;
}): {
  shouldAdjust: boolean;
  duplicateBlocked: boolean;
  costAuthority: CostAdjustmentPath;
  jpeSourceId: string | null;
  amountCents: number | null;
  warnings: MaterialQtyWarning[];
} {
  const warnings: MaterialQtyWarning[] = [];
  if (input.amountCents == null) {
    return {
      shouldAdjust: false,
      duplicateBlocked: false,
      costAuthority: 'suppressed_duplicate',
      jpeSourceId: null,
      amountCents: null,
      warnings: ['SOURCE_MISSING'],
    };
  }

  if (input.path === 'STOCK_RECEIPT') {
    return {
      shouldAdjust: false,
      duplicateBlocked: false,
      costAuthority: 'stock_receipt_no_job_cost',
      jpeSourceId: null,
      amountCents: input.amountCents,
      warnings: [],
    };
  }

  if (input.existingJpeSourceKeys.includes(input.sourceKey)) {
    return {
      shouldAdjust: false,
      duplicateBlocked: true,
      costAuthority: 'suppressed_duplicate',
      jpeSourceId: null,
      amountCents: input.amountCents,
      warnings: ['DUPLICATE_EVENT_BLOCKED'],
    };
  }

  // supplier return + credit: only one economic adjustment
  if (
    input.path === 'SUPPLIER_RETURN_AND_CREDIT' &&
    input.pairedCreditKey &&
    input.existingJpeSourceKeys.includes(input.pairedCreditKey)
  ) {
    return {
      shouldAdjust: false,
      duplicateBlocked: true,
      costAuthority: 'suppressed_duplicate',
      jpeSourceId: null,
      amountCents: input.amountCents,
      warnings: ['DUPLICATE_EVENT_BLOCKED'],
    };
  }

  const authority: CostAdjustmentPath =
    input.path === 'DIRECT_JOB_RETURN_CREDIT' || input.path === 'SUPPLIER_RETURN_AND_CREDIT'
      ? 'direct_job_return_credit'
      : input.path === 'STOCK_USE'
        ? 'stock_use'
        : input.path === 'RETURN_TO_STOCK'
          ? 'return_to_stock'
          : 'direct_job_return_credit';

  return {
    shouldAdjust: true,
    duplicateBlocked: false,
    costAuthority: authority,
    jpeSourceId: input.sourceKey,
    amountCents: input.amountCents,
    warnings,
  };
}

export function qtyEvidence(
  value: number | null,
  unit: string | null,
  sourceType: string | null,
  sourceId: string | null,
  known = true,
): QtyEvidence {
  return { value, unit, sourceType, sourceId, known };
}

export function canManageMaterialQtyReconciliation(input: {
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

/** Tech: operational quantities only — no cost/credit amounts. */
export function projectTechOperationalQtyView(input: {
  jobId: string;
  ordered: number | null;
  received: number | null;
  used: number | null;
}): {
  jobId: string;
  ordered: number | null;
  received: number | null;
  used: number | null;
  supplierCostVisible: false;
  creditAmountVisible: false;
  jpeVisible: false;
} {
  return {
    jobId: input.jobId,
    ordered: input.ordered,
    received: input.received,
    used: input.used,
    supplierCostVisible: false,
    creditAmountVisible: false,
    jpeVisible: false,
  };
}

export function assertNoMaterialQtyReconClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoMaterialQtyReconClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'materialQtyReconInternal',
    'supplierCreditAmountCents',
    'unitPriceCents',
    'lineCostCents',
    'jpeProfitCents',
    'marginCents',
    'expectedSupplierCostCents',
    'jobProcurementChain',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Material qty recon internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoMaterialQtyReconClientLeak(value, `${path}.${key}`);
    }
  }
}

export function assertRow105NotStartedDuringRow104(started: boolean): void {
  if (started) throw new Error('Row 105+ must not start during Row 104');
}

export function assertRow106107NotStartedDuringRow104(started: boolean): void {
  if (started) throw new Error('Row 106/107 must not start during Row 104');
}

export function assertRow104SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row105Started?: boolean;
  row106107Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row105NotStarted: true;
  row106107NotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow105NotStartedDuringRow104(input.row105Started === true);
  assertRow106107NotStartedDuringRow104(input.row106107Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 104 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 104 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 104 requires production writes = 0');
  return {
    row92Off: true,
    row105NotStarted: true,
    row106107NotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow104(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== MATERIAL_QTY_RECON_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== MATERIAL_QTY_RECON_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function materialEventIdempotencyKey(parts: string[]): string {
  return parts.join(':');
}
