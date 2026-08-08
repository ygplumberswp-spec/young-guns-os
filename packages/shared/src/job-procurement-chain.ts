/**
 * Row 103 — Job-linked Supplier / PO / Material Chain
 *
 * Traceability layer over existing PO + inventory + JPE engines.
 * Does NOT rebuild procurement or profitability.
 * Rows 104–107 not started. Row 118 not closed.
 * Staging: Xero writes = 0, customer sends = 0, production writes = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const JOB_PROCUREMENT_CHAIN_KEY = 'job-procurement-chain' as const;

export const JOB_PROCUREMENT_CHAIN_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type JobProcurementChainWarning =
  | 'JOB_LINK_MISSING'
  | 'BOQ_SOURCE_MISSING'
  | 'SUPPLIER_EVIDENCE_MISSING'
  | 'PO_LINK_MISSING'
  | 'DELIVERY_EVIDENCE_MISSING'
  | 'SUPPLIER_INVOICE_LINK_MISSING'
  | 'XERO_BILL_NOT_LINKED'
  | 'MATERIAL_COST_NOT_POSTED'
  | 'JOB_LINK_CONFLICT'
  | 'CROSS_TENANT_LINK_BLOCKED'
  | 'DUPLICATE_COST_BLOCKED'
  | 'REVIEW_REQUIRED'
  | 'FREE_TEXT_JOB_LINK_REJECTED'
  | 'UNREVIEWED_PROPOSAL_BLOCKED'
  | 'MISSING_PRICE'
  | 'MISSING_QUANTITY'
  | 'MISSING_VAT'
  | 'INSPECTION_REQUIRED'
  | 'INSPECTION_REJECTED'
  | 'AP_PAYMENT_APPROVAL_REQUIRED'
  | 'AP_PAYMENT_APPROVAL_FORBIDDEN'
  | 'AP_PAYMENT_INITIATION_FORBIDDEN'
  | 'ROW104_NOT_STARTED'
  | 'ROW105_MULTI_JOB_SPLIT_NOT_STARTED'
  | 'ROW106_107_PROFIT_ENGINE_NOT_STARTED';

/** Row 127 — delivery inspection outcome before inventory/cost truth. */
export type DeliveryInspectionOutcome = 'accepted' | 'rejected' | 'review_required';

/** Row 127 — AP payment approval is internal control only (no money movement). */
export type ApPaymentApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ProcurementCostAuthority =
  | 'direct_to_job_invoice'
  | 'stock_receipt_only'
  | 'stock_material_use'
  | 'suppressed_duplicate';

export type PurchasePath = 'DIRECT_TO_JOB' | 'STOCK';

export type CanonicalJobLinkInput = {
  companyId: string;
  jobId: string | null | undefined;
  jobReference?: string | null;
  expectedJobCompanyId: string;
  /** Quote-derived / BOQ-derived expected job, when known. */
  expectedJobId?: string | null;
};

export type ApprovedProposalLineInput = {
  companyId: string;
  proposalId: string;
  proposalLineId: string;
  proposalStatus: string;
  boqImportId: string | null;
  boqImportRowId: string | null;
  quoteId: string | null;
  jobId: string | null;
  supplierId: string | null;
  supplierName: string;
  row100ProposalKey: string | null;
  offerKey: string;
  quantityProposed: number | null;
  unitPriceCents: number | null;
  vatBasis: string | null;
  expectedSupplierCostCents: number | null;
  sourceDocumentRef: string | null;
};

export type PoDraftFromProposalResult = {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  createsPurchaseOrder: boolean;
  poDraft: {
    supplierId: string;
    jobId: string;
    jobReference: null;
    items: Array<{
      description: string;
      quantity: number;
      unitCostCents: number;
      boqImportRowId: string | null;
      proposalLineId: string;
      row100ProposalKey: string | null;
    }>;
    source: {
      proposalId: string;
      boqImportId: string | null;
      quoteId: string | null;
    };
  } | null;
};

export type DeliveryEvidenceInput = {
  companyId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  jobId: string;
  expectedJobId: string;
  deliveredQuantity: number | null;
  deliveredAt: string | null;
  deliveryReference: string | null;
  orderedQuantity: number | null;
};

export type SupplierInvoiceEvidenceInput = {
  companyId: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  sourceDocumentRef: string | null;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  deliveryEvidenceId: string | null;
  jobId: string;
  expectedJobId: string;
  lineQuantity: number | null;
  lineCostCents: number | null;
  vatBasis: string | null;
};

export type XeroBillProjectionInput = {
  companyId: string;
  supplierInvoiceEvidenceId: string;
  /** Only legitimate already-imported / mock provider IDs — never invent. */
  knownXeroBillId: string | null;
  knownXeroInvoiceId: string | null;
  xeroWrites: number;
};

export type MaterialCostPostingInput = {
  companyId: string;
  jobId: string;
  path: PurchasePath;
  /** Supplier invoice posted as direct-to-job cost authority. */
  supplierInvoiceEvidenceId: string | null;
  /** Stock was received into warehouse. */
  stockReceiptMovementId: string | null;
  /** Canonical job material-use transaction. */
  materialUseTransactionId: string | null;
  amountCents: number | null;
  /** Prior posts for idempotency / duplicate detection. */
  existingJpeSourceKeys: string[];
};

/**
 * Canonical Job link: relational jobId required. Free-text-only rejected.
 */
export function assertCanonicalJobLink(input: CanonicalJobLinkInput): {
  ok: true;
  jobId: string;
} | {
  ok: false;
  warnings: JobProcurementChainWarning[];
} {
  const warnings: JobProcurementChainWarning[] = [];
  if (input.companyId !== input.expectedJobCompanyId) {
    warnings.push('CROSS_TENANT_LINK_BLOCKED');
  }
  if (!input.jobId) {
    warnings.push('JOB_LINK_MISSING');
    if (input.jobReference && String(input.jobReference).trim()) {
      warnings.push('FREE_TEXT_JOB_LINK_REJECTED');
    }
    return { ok: false, warnings };
  }
  if (input.expectedJobId && input.expectedJobId !== input.jobId) {
    warnings.push('JOB_LINK_CONFLICT');
    return { ok: false, warnings };
  }
  if (warnings.includes('CROSS_TENANT_LINK_BLOCKED')) {
    return { ok: false, warnings };
  }
  return { ok: true, jobId: input.jobId };
}

export function isProposalApprovedForPurchase(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'REVIEWED' || s === 'APPROVED_DRAFT' || s === 'APPROVED';
}

/**
 * Build a PO draft payload from an approved Row101 proposal line.
 * Does not invent missing price/qty/VAT/supplier.
 */
export function buildPoDraftFromApprovedProposal(
  line: ApprovedProposalLineInput,
): PoDraftFromProposalResult {
  const warnings: JobProcurementChainWarning[] = [];

  if (!isProposalApprovedForPurchase(line.proposalStatus)) {
    return {
      ok: false,
      warnings: ['UNREVIEWED_PROPOSAL_BLOCKED', 'REVIEW_REQUIRED'],
      createsPurchaseOrder: false,
      poDraft: null,
    };
  }

  const jobLink = assertCanonicalJobLink({
    companyId: line.companyId,
    jobId: line.jobId,
    expectedJobCompanyId: line.companyId,
  });
  if (!jobLink.ok) {
    return {
      ok: false,
      warnings: jobLink.warnings,
      createsPurchaseOrder: false,
      poDraft: null,
    };
  }

  if (!line.boqImportId || !line.boqImportRowId) warnings.push('BOQ_SOURCE_MISSING');
  if (!line.supplierId && !line.row100ProposalKey) warnings.push('SUPPLIER_EVIDENCE_MISSING');
  if (!line.supplierId) {
    return {
      ok: false,
      warnings: [...warnings, 'SUPPLIER_EVIDENCE_MISSING'],
      createsPurchaseOrder: false,
      poDraft: null,
    };
  }
  if (line.quantityProposed == null || !Number.isFinite(line.quantityProposed)) {
    warnings.push('MISSING_QUANTITY');
  }
  if (line.unitPriceCents == null || !Number.isInteger(line.unitPriceCents)) {
    warnings.push('MISSING_PRICE');
  }
  if (!line.vatBasis || line.vatBasis === 'UNKNOWN') warnings.push('MISSING_VAT');

  if (
    warnings.includes('MISSING_QUANTITY') ||
    warnings.includes('MISSING_PRICE') ||
    warnings.includes('BOQ_SOURCE_MISSING')
  ) {
    return {
      ok: false,
      warnings: [...warnings, 'REVIEW_REQUIRED'],
      createsPurchaseOrder: false,
      poDraft: null,
    };
  }

  return {
    ok: true,
    warnings,
    createsPurchaseOrder: true,
    poDraft: {
      supplierId: line.supplierId,
      jobId: jobLink.jobId,
      jobReference: null,
      items: [
        {
          description: `BOQ ${line.boqImportRowId} · offer ${line.offerKey}`,
          quantity: line.quantityProposed!,
          unitCostCents: line.unitPriceCents!,
          boqImportRowId: line.boqImportRowId,
          proposalLineId: line.proposalLineId,
          row100ProposalKey: line.row100ProposalKey,
        },
      ],
      source: {
        proposalId: line.proposalId,
        boqImportId: line.boqImportId,
        quoteId: line.quoteId,
      },
    },
  };
}

export function recordDeliveryEvidence(input: DeliveryEvidenceInput): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  partial: boolean;
  evidence: {
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    jobId: string;
    deliveredQuantity: number | null;
    deliveredAt: string | null;
    deliveryReference: string | null;
  } | null;
} {
  const warnings: JobProcurementChainWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.companyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) {
    return { ok: false, warnings: jobLink.warnings, partial: false, evidence: null };
  }
  if (!input.purchaseOrderId || !input.purchaseOrderLineId) {
    return {
      ok: false,
      warnings: ['PO_LINK_MISSING'],
      partial: false,
      evidence: null,
    };
  }
  if (input.deliveredQuantity == null) warnings.push('DELIVERY_EVIDENCE_MISSING');

  const partial =
    input.deliveredQuantity != null &&
    input.orderedQuantity != null &&
    input.deliveredQuantity < input.orderedQuantity;

  return {
    ok: true,
    warnings,
    partial,
    evidence: {
      purchaseOrderId: input.purchaseOrderId,
      purchaseOrderLineId: input.purchaseOrderLineId,
      jobId: jobLink.jobId,
      deliveredQuantity: input.deliveredQuantity,
      deliveredAt: input.deliveredAt,
      deliveryReference: input.deliveryReference,
    },
  };
}

export function recordSupplierInvoiceEvidence(input: SupplierInvoiceEvidenceInput): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  line: {
    supplierId: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    sourceDocumentRef: string | null;
    purchaseOrderId: string | null;
    purchaseOrderLineId: string | null;
    deliveryEvidenceId: string | null;
    jobId: string;
    lineQuantity: number | null;
    lineCostCents: number | null;
    vatBasis: string | null;
    missingFields: string[];
  } | null;
} {
  const warnings: JobProcurementChainWarning[] = [];
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.companyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) {
    return { ok: false, warnings: jobLink.warnings, line: null };
  }
  if (!input.purchaseOrderId) warnings.push('PO_LINK_MISSING');
  if (!input.deliveryEvidenceId) warnings.push('DELIVERY_EVIDENCE_MISSING');

  const missingFields: string[] = [];
  if (input.invoiceNumber == null || !String(input.invoiceNumber).trim()) {
    missingFields.push('invoiceNumber');
  }
  if (input.invoiceDate == null) missingFields.push('invoiceDate');
  if (input.lineQuantity == null) missingFields.push('lineQuantity');
  if (input.lineCostCents == null) missingFields.push('lineCostCents');
  if (!input.vatBasis || input.vatBasis === 'UNKNOWN') missingFields.push('vatBasis');
  if (missingFields.length) warnings.push('REVIEW_REQUIRED');

  return {
    ok: true,
    warnings,
    line: {
      supplierId: input.supplierId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      sourceDocumentRef: input.sourceDocumentRef,
      purchaseOrderId: input.purchaseOrderId,
      purchaseOrderLineId: input.purchaseOrderLineId,
      deliveryEvidenceId: input.deliveryEvidenceId,
      jobId: jobLink.jobId,
      lineQuantity: input.lineQuantity,
      lineCostCents: input.lineCostCents,
      vatBasis: input.vatBasis,
      missingFields,
    },
  };
}

/**
 * Zero-write Xero bill projection. Never invents GUIDs. Never writes to Xero.
 */
export function projectXeroBillLinkage(input: XeroBillProjectionInput): {
  xeroWrites: 0;
  linked: boolean;
  warning: JobProcurementChainWarning | null;
  projection: {
    supplierInvoiceEvidenceId: string;
    xeroBillId: string | null;
    xeroInvoiceId: string | null;
    status: 'LINKED' | 'XERO_BILL_NOT_LINKED';
  };
} {
  if ((input.xeroWrites ?? 0) !== 0) {
    throw new Error('Row 103 requires real Xero writes = 0');
  }
  const hasLegitimate =
    Boolean(input.knownXeroBillId?.trim()) || Boolean(input.knownXeroInvoiceId?.trim());
  if (!hasLegitimate) {
    return {
      xeroWrites: 0,
      linked: false,
      warning: 'XERO_BILL_NOT_LINKED',
      projection: {
        supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId,
        xeroBillId: null,
        xeroInvoiceId: null,
        status: 'XERO_BILL_NOT_LINKED',
      },
    };
  }
  return {
    xeroWrites: 0,
    linked: true,
    warning: null,
    projection: {
      supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId,
      xeroBillId: input.knownXeroBillId,
      xeroInvoiceId: input.knownXeroInvoiceId,
      status: 'LINKED',
    },
  };
}

export function jpeCostSourceKey(input: {
  path: PurchasePath;
  supplierInvoiceEvidenceId?: string | null;
  materialUseTransactionId?: string | null;
}): string {
  if (input.path === 'DIRECT_TO_JOB') {
    return `supplier_invoice:${input.supplierInvoiceEvidenceId ?? 'missing'}`;
  }
  return `material_use:${input.materialUseTransactionId ?? 'missing'}`;
}

/**
 * Resolve exactly-once material cost posting authority.
 * Stock receipt alone does not post Job cost.
 * Invoice + stock-use for same consumption is duplicate-blocked.
 */
export function resolveMaterialCostPosting(input: MaterialCostPostingInput): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  shouldPost: boolean;
  costAuthority: ProcurementCostAuthority;
  jpeSourceType: 'supplier_invoice' | 'material_line' | null;
  jpeSourceId: string | null;
  amountCents: number | null;
  duplicateBlocked: boolean;
} {
  const warnings: JobProcurementChainWarning[] = [];
  if (input.amountCents == null) {
    return {
      ok: false,
      warnings: ['MATERIAL_COST_NOT_POSTED', 'REVIEW_REQUIRED'],
      shouldPost: false,
      costAuthority: 'suppressed_duplicate',
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: null,
      duplicateBlocked: false,
    };
  }

  if (input.path === 'STOCK') {
    // Receipt alone — warehouse up, no Job cost yet
    if (input.stockReceiptMovementId && !input.materialUseTransactionId) {
      return {
        ok: true,
        warnings: ['MATERIAL_COST_NOT_POSTED'],
        shouldPost: false,
        costAuthority: 'stock_receipt_only',
        jpeSourceType: null,
        jpeSourceId: null,
        amountCents: input.amountCents,
        duplicateBlocked: false,
      };
    }
    if (!input.materialUseTransactionId) {
      return {
        ok: false,
        warnings: ['MATERIAL_COST_NOT_POSTED'],
        shouldPost: false,
        costAuthority: 'stock_receipt_only',
        jpeSourceType: null,
        jpeSourceId: null,
        amountCents: input.amountCents,
        duplicateBlocked: false,
      };
    }
    const sourceId = jpeCostSourceKey({
      path: 'STOCK',
      materialUseTransactionId: input.materialUseTransactionId,
    });
    // Block if invoice already posted for same chain consumption
    const invoiceKey = input.supplierInvoiceEvidenceId
      ? jpeCostSourceKey({
          path: 'DIRECT_TO_JOB',
          supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId,
        })
      : null;
    if (
      input.existingJpeSourceKeys.includes(sourceId) ||
      (invoiceKey && input.existingJpeSourceKeys.includes(invoiceKey))
    ) {
      warnings.push('DUPLICATE_COST_BLOCKED');
      return {
        ok: true,
        warnings,
        shouldPost: false,
        costAuthority: 'suppressed_duplicate',
        jpeSourceType: null,
        jpeSourceId: null,
        amountCents: input.amountCents,
        duplicateBlocked: true,
      };
    }
    return {
      ok: true,
      warnings,
      shouldPost: true,
      costAuthority: 'stock_material_use',
      jpeSourceType: 'material_line',
      jpeSourceId: sourceId,
      amountCents: input.amountCents,
      duplicateBlocked: false,
    };
  }

  // DIRECT_TO_JOB
  if (!input.supplierInvoiceEvidenceId) {
    return {
      ok: false,
      warnings: ['SUPPLIER_INVOICE_LINK_MISSING', 'MATERIAL_COST_NOT_POSTED'],
      shouldPost: false,
      costAuthority: 'suppressed_duplicate',
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: input.amountCents,
      duplicateBlocked: false,
    };
  }
  const sourceId = jpeCostSourceKey({
    path: 'DIRECT_TO_JOB',
    supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId,
  });
  if (input.existingJpeSourceKeys.includes(sourceId)) {
    warnings.push('DUPLICATE_COST_BLOCKED');
    return {
      ok: true,
      warnings,
      shouldPost: false,
      costAuthority: 'suppressed_duplicate',
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: input.amountCents,
      duplicateBlocked: true,
    };
  }
  // Also block if material-use already posted for same invoice evidence
  if (
    input.materialUseTransactionId &&
    input.existingJpeSourceKeys.includes(
      jpeCostSourceKey({
        path: 'STOCK',
        materialUseTransactionId: input.materialUseTransactionId,
      }),
    )
  ) {
    warnings.push('DUPLICATE_COST_BLOCKED');
    return {
      ok: true,
      warnings,
      shouldPost: false,
      costAuthority: 'suppressed_duplicate',
      jpeSourceType: null,
      jpeSourceId: null,
      amountCents: input.amountCents,
      duplicateBlocked: true,
    };
  }

  return {
    ok: true,
    warnings,
    shouldPost: true,
    costAuthority: 'direct_to_job_invoice',
    jpeSourceType: 'supplier_invoice',
    jpeSourceId: sourceId,
    amountCents: input.amountCents,
    duplicateBlocked: false,
  };
}

export function buildBoqQuoteJobTrace(input: {
  boqImportId: string;
  boqImportRowId: string;
  quoteId: string | null;
  quoteLineId: string | null;
  jobId: string | null;
}): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  chain: {
    boqImportId: string;
    boqImportRowId: string;
    quoteId: string;
    quoteLineId: string | null;
    jobId: string;
  } | null;
} {
  const warnings: JobProcurementChainWarning[] = [];
  if (!input.boqImportId || !input.boqImportRowId) {
    return { ok: false, warnings: ['BOQ_SOURCE_MISSING'], chain: null };
  }
  if (!input.quoteId) {
    return { ok: false, warnings: ['BOQ_SOURCE_MISSING', 'REVIEW_REQUIRED'], chain: null };
  }
  if (!input.jobId) {
    return { ok: false, warnings: ['JOB_LINK_MISSING'], chain: null };
  }
  return {
    ok: true,
    warnings,
    chain: {
      boqImportId: input.boqImportId,
      boqImportRowId: input.boqImportRowId,
      quoteId: input.quoteId,
      quoteLineId: input.quoteLineId,
      jobId: input.jobId,
    },
  };
}

export function canManageJobProcurementChain(input: {
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

/**
 * Row 127 Need — canonical Job + BOQ/material requirement (not free-text-only).
 */
export function resolveProcurementNeedFromBoqJob(input: {
  companyId: string;
  jobId: string | null;
  expectedJobCompanyId: string;
  expectedJobId?: string | null;
  boqImportId: string | null;
  boqImportRowId: string | null;
  materialKey?: string | null;
  quantityRequired?: number | null;
  /** Free-text note alone is never sufficient. */
  freeTextOnly?: boolean;
}): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  need: {
    companyId: string;
    jobId: string;
    boqImportId: string;
    boqImportRowId: string;
    materialKey: string | null;
    quantityRequired: number | null;
    source: 'job_boq_requirement';
  } | null;
} {
  if (input.freeTextOnly) {
    return {
      ok: false,
      warnings: ['FREE_TEXT_JOB_LINK_REJECTED', 'JOB_LINK_MISSING'],
      need: null,
    };
  }
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.expectedJobCompanyId,
    expectedJobId: input.expectedJobId ?? null,
  });
  if (!jobLink.ok) return { ok: false, warnings: jobLink.warnings, need: null };
  if (!input.boqImportId || !input.boqImportRowId) {
    return { ok: false, warnings: ['BOQ_SOURCE_MISSING'], need: null };
  }
  return {
    ok: true,
    warnings: [],
    need: {
      companyId: input.companyId,
      jobId: jobLink.jobId,
      boqImportId: input.boqImportId,
      boqImportRowId: input.boqImportRowId,
      materialKey: input.materialKey ?? null,
      quantityRequired: input.quantityRequired ?? null,
      source: 'job_boq_requirement',
    },
  };
}

/**
 * Row 127 Purchase Request — auditable proposal request opened from Need
 * before supplier approval/PO (canonical proposal model, DRAFT status).
 */
export function openPurchaseRequestFromNeed(input: {
  need: NonNullable<ReturnType<typeof resolveProcurementNeedFromBoqJob>['need']>;
  proposalId: string;
  proposalLineId: string;
  actorUserId: string;
  openedAt: string;
}): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  purchaseRequest: {
    id: string;
    proposalId: string;
    proposalLineId: string;
    status: 'DRAFT';
    jobId: string;
    boqImportId: string;
    boqImportRowId: string;
    openedByUserId: string;
    openedAt: string;
    auditable: true;
  } | null;
} {
  if (!input.proposalId || !input.proposalLineId || !input.actorUserId) {
    return { ok: false, warnings: ['REVIEW_REQUIRED'], purchaseRequest: null };
  }
  return {
    ok: true,
    warnings: [],
    purchaseRequest: {
      id: `pr:${input.proposalId}`,
      proposalId: input.proposalId,
      proposalLineId: input.proposalLineId,
      status: 'DRAFT',
      jobId: input.need.jobId,
      boqImportId: input.need.boqImportId,
      boqImportRowId: input.need.boqImportRowId,
      openedByUserId: input.actorUserId,
      openedAt: input.openedAt,
      auditable: true,
    },
  };
}

/**
 * Row 127 Inspection — delivery evidence must be accepted/rejected/review_required
 * before downstream inventory/cost truth where required.
 */
export function recordDeliveryInspection(input: {
  companyId: string;
  deliveryEvidenceId: string | null;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  jobId: string;
  expectedJobId: string;
  outcome: DeliveryInspectionOutcome;
  inspectedByUserId: string;
  inspectedAt: string;
  notes?: string | null;
}): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  inspection: {
    deliveryEvidenceId: string;
    outcome: DeliveryInspectionOutcome;
    allowsInventoryCost: boolean;
    inspectedByUserId: string;
    inspectedAt: string;
    notes: string | null;
  } | null;
} {
  const jobLink = assertCanonicalJobLink({
    companyId: input.companyId,
    jobId: input.jobId,
    expectedJobCompanyId: input.companyId,
    expectedJobId: input.expectedJobId,
  });
  if (!jobLink.ok) return { ok: false, warnings: jobLink.warnings, inspection: null };
  if (!input.deliveryEvidenceId) {
    return { ok: false, warnings: ['DELIVERY_EVIDENCE_MISSING', 'INSPECTION_REQUIRED'], inspection: null };
  }
  if (!input.inspectedByUserId?.trim()) {
    return { ok: false, warnings: ['REVIEW_REQUIRED'], inspection: null };
  }
  if (input.outcome === 'rejected') {
    return {
      ok: false,
      warnings: ['INSPECTION_REJECTED'],
      inspection: {
        deliveryEvidenceId: input.deliveryEvidenceId,
        outcome: 'rejected',
        allowsInventoryCost: false,
        inspectedByUserId: input.inspectedByUserId,
        inspectedAt: input.inspectedAt,
        notes: input.notes ?? null,
      },
    };
  }
  if (input.outcome === 'review_required') {
    return {
      ok: false,
      warnings: ['INSPECTION_REQUIRED', 'REVIEW_REQUIRED'],
      inspection: {
        deliveryEvidenceId: input.deliveryEvidenceId,
        outcome: 'review_required',
        allowsInventoryCost: false,
        inspectedByUserId: input.inspectedByUserId,
        inspectedAt: input.inspectedAt,
        notes: input.notes ?? null,
      },
    };
  }
  return {
    ok: true,
    warnings: [],
    inspection: {
      deliveryEvidenceId: input.deliveryEvidenceId,
      outcome: 'accepted',
      allowsInventoryCost: true,
      inspectedByUserId: input.inspectedByUserId,
      inspectedAt: input.inspectedAt,
      notes: input.notes ?? null,
    },
  };
}

/**
 * Row 127 AP payment approval — authorised Finance/Owner only.
 * Does NOT initiate payment / money movement / Xero write.
 */
export function approveSupplierApPayment(input: {
  companyId: string;
  supplierInvoiceEvidenceId: string;
  amountCents: number;
  roleName?: string | null;
  permissions?: string[] | null;
  approverUserId: string;
  approvedAt: string;
  initiatePayment?: boolean;
  xeroWrites?: number;
}): {
  ok: boolean;
  warnings: JobProcurementChainWarning[];
  approval: {
    status: ApPaymentApprovalStatus;
    supplierInvoiceEvidenceId: string;
    amountCents: number;
    approvedByUserId: string;
    approvedAt: string;
    paymentInitiated: false;
    moneyMovement: 0;
    xeroWrites: 0;
  } | null;
} {
  if ((input.xeroWrites ?? 0) !== 0) {
    return { ok: false, warnings: ['AP_PAYMENT_INITIATION_FORBIDDEN'], approval: null };
  }
  if (input.initiatePayment === true) {
    return { ok: false, warnings: ['AP_PAYMENT_INITIATION_FORBIDDEN'], approval: null };
  }
  if (!canApproveApPayment(input)) {
    return { ok: false, warnings: ['AP_PAYMENT_APPROVAL_FORBIDDEN'], approval: null };
  }
  if (!input.supplierInvoiceEvidenceId || !input.approverUserId) {
    return { ok: false, warnings: ['AP_PAYMENT_APPROVAL_REQUIRED'], approval: null };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, warnings: ['MISSING_PRICE', 'AP_PAYMENT_APPROVAL_REQUIRED'], approval: null };
  }
  return {
    ok: true,
    warnings: [],
    approval: {
      status: 'approved',
      supplierInvoiceEvidenceId: input.supplierInvoiceEvidenceId,
      amountCents: input.amountCents,
      approvedByUserId: input.approverUserId,
      approvedAt: input.approvedAt,
      paymentInitiated: false,
      moneyMovement: 0,
      xeroWrites: 0,
    },
  };
}

export function canApproveApPayment(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin'].includes(role);
}

/**
 * Gate inventory/cost posting on accepted inspection (Row 127).
 */
export function assertInspectionAllowsInventoryCost(input: {
  inspectionOutcome: DeliveryInspectionOutcome | null;
}): { ok: true } | { ok: false; warnings: JobProcurementChainWarning[] } {
  if (input.inspectionOutcome === 'accepted') return { ok: true };
  if (input.inspectionOutcome === 'rejected') {
    return { ok: false, warnings: ['INSPECTION_REJECTED'] };
  }
  return { ok: false, warnings: ['INSPECTION_REQUIRED'] };
}

export function assertNoJobProcurementChainClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoJobProcurementChainClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'jobProcurementChain',
    'purchaseOrderInternal',
    'supplierInvoiceCost',
    'xeroBillProjection',
    'expectedSupplierCostCents',
    'unitPriceCents',
    'lineCostCents',
    'jpeProfitCents',
    'marginCents',
    'grossProfitCents',
    'splitPurchaseProposal',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Job procurement chain internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoJobProcurementChainClientLeak(value, `${path}.${key}`);
    }
  }
}

/** Tech may see operational material labels only — never supplier pricing/JPE profit. */
export function projectTechOperationalMaterialView(input: {
  jobId: string;
  description: string;
  quantity: number | null;
}): {
  jobId: string;
  description: string;
  quantity: number | null;
  supplierPricingVisible: false;
  jpeProfitVisible: false;
} {
  return {
    jobId: input.jobId,
    description: input.description,
    quantity: input.quantity,
    supplierPricingVisible: false,
    jpeProfitVisible: false,
  };
}

export function assertRow104NotStarted(started: boolean): void {
  if (started) throw new Error('Row 104+ must not start during Row 103');
}

export function assertRow105NotStarted(started: boolean): void {
  if (started) throw new Error('Row 105 multi-job invoice split must not start during Row 103');
}

export function assertRow106107NotStarted(started: boolean): void {
  if (started) throw new Error('Row 106/107 profitability engines must not start during Row 103');
}

export function assertRow103SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row104Started?: boolean;
  row105Started?: boolean;
  row106107Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row104NotStarted: true;
  row105NotStarted: true;
  row106107NotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow104NotStarted(input.row104Started === true);
  assertRow105NotStarted(input.row105Started === true);
  assertRow106107NotStarted(input.row106107Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 103 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 103 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 103 requires production writes = 0');
  return {
    row92Off: true,
    row104NotStarted: true,
    row105NotStarted: true,
    row106107NotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow103(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== JOB_PROCUREMENT_CHAIN_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== JOB_PROCUREMENT_CHAIN_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function chainIdempotencyKey(input: {
  companyId: string;
  proposalLineId: string;
  hop: string;
}): string {
  return `${input.companyId}:${input.proposalLineId}:${input.hop}`;
}

export function assertRows99to102Preserved(flags: {
  row99Immutable: boolean;
  row100EvidencePreserved: boolean;
  row101ProposalPreserved: boolean;
  row102ExportsUnchanged: boolean;
}): void {
  if (!flags.row99Immutable) throw new Error('Row99 must remain immutable');
  if (!flags.row100EvidencePreserved) throw new Error('Row100 evidence must be preserved');
  if (!flags.row101ProposalPreserved) throw new Error('Row101 proposal must be preserved');
  if (!flags.row102ExportsUnchanged) throw new Error('Row102 exports must remain unchanged');
}
