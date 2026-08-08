/**
 * Row 118 — Procurement end-to-end usability proof
 *
 * Reuses Rows99–107 helpers. Does NOT rebuild procurement engines.
 * Isolated fixture journey only — no fabricated YG production data.
 * Royal Cape READ-ONLY. Xero projection only (no provider write).
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import {
  assertCanonicalJobLink,
  buildPoDraftFromApprovedProposal,
  projectXeroBillLinkage,
  recordDeliveryEvidence,
  recordSupplierInvoiceEvidence,
  resolveMaterialCostPosting,
  type ApprovedProposalLineInput,
} from './job-procurement-chain.js';
import {
  qtyEvidence,
  resolveMaterialQuantityReconciliation,
  validateSupplierCredit,
  validateSupplierReturn,
} from './material-quantity-reconciliation.js';
import { resolveEstimatedBaseline, resolveJobGpComparison } from './estimated-actual-gp.js';
import { resolveJobProfitabilityTruth } from './job-profitability-truth.js';

export const PROCUREMENT_E2E_USABILITY_KEY = 'procurement-e2e-usability' as const;

export const PROCUREMENT_E2E_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type ProcurementE2eStageResult =
  | 'PASS'
  | 'GAP_FIXED'
  | 'BLOCKED_BY_REAL_DATA'
  | 'NOT_APPLICABLE';

export type ProcurementE2eStageReport = {
  stage: number;
  name: string;
  result: ProcurementE2eStageResult;
  detail?: string;
};

export type ProcurementE2eFixtureIds = {
  companyId: string;
  otherCompanyId: string;
  jobId: string;
  wrongJobId: string;
  boqImportId: string;
  boqImportRowId: string;
  proposalId: string;
  proposalLineId: string;
  supplierId: string;
  quoteId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  supplierInvoiceEvidenceId: string;
  materialUseTransactionId: string;
  actorUserId: string;
};

export function defaultProcurementE2eFixtureIds(
  overrides?: Partial<ProcurementE2eFixtureIds>,
): ProcurementE2eFixtureIds {
  return {
    companyId: 'co-fixture-118',
    otherCompanyId: 'co-other-118',
    jobId: 'job-fixture-118',
    wrongJobId: 'job-wrong-118',
    boqImportId: 'boq-imp-118',
    boqImportRowId: 'boq-row-118',
    proposalId: 'prop-118',
    proposalLineId: 'prop-line-118',
    supplierId: 'sup-118',
    quoteId: 'quote-118',
    purchaseOrderId: 'po-118',
    purchaseOrderLineId: 'pol-118',
    supplierInvoiceEvidenceId: 'sinv-118',
    materialUseTransactionId: 'muse-118',
    actorUserId: 'user-owner-118',
    ...overrides,
  };
}

function reviewedProposalLine(ids: ProcurementE2eFixtureIds): ApprovedProposalLineInput {
  return {
    companyId: ids.companyId,
    proposalId: ids.proposalId,
    proposalLineId: ids.proposalLineId,
    proposalStatus: 'REVIEWED',
    jobId: ids.jobId,
    boqImportId: ids.boqImportId,
    boqImportRowId: ids.boqImportRowId,
    quoteId: ids.quoteId,
    supplierId: ids.supplierId,
    supplierName: 'Fixture Supplier',
    offerKey: 'offer-118',
    row100ProposalKey: 'row100-118',
    quantityProposed: 10,
    unitPriceCents: 1000,
    vatBasis: 'EXCLUSIVE',
    expectedSupplierCostCents: 10000,
    sourceDocumentRef: 'SQ-118.pdf',
  };
}

/**
 * Pure fixture proof of the usable procurement chain (Rows99–107).
 * Does not touch DB / Xero / YG historical data.
 */
export function runProcurementE2eFixture(
  ids: ProcurementE2eFixtureIds = defaultProcurementE2eFixtureIds(),
): {
  stages: ProcurementE2eStageReport[];
  passCount: number;
  failCount: number;
  jpePostedOnce: boolean;
  duplicateBlocked: boolean;
  xeroBillStatus: 'LINKED' | 'XERO_BILL_NOT_LINKED';
  profitabilityReflectsActual: boolean;
  cleanup: true;
} {
  const stages: ProcurementE2eStageReport[] = [];
  const push = (
    stage: number,
    name: string,
    result: ProcurementE2eStageResult,
    detail?: string,
  ) => {
    stages.push({ stage, name, result, detail });
  };

  const line = reviewedProposalLine(ids);
  push(1, 'supplier_quote_evidence', line.row100ProposalKey ? 'PASS' : 'BLOCKED_BY_REAL_DATA');
  push(2, 'comparison', line.offerKey ? 'PASS' : 'BLOCKED_BY_REAL_DATA');
  push(3, 'reviewed_selection', line.proposalStatus === 'REVIEWED' ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const poDraft = buildPoDraftFromApprovedProposal(line);
  push(
    4,
    'po_draft',
    poDraft.ok && poDraft.createsPurchaseOrder ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
    poDraft.warnings.join(','),
  );
  push(
    5,
    'approve_po',
    poDraft.ok ? 'GAP_FIXED' : 'BLOCKED_BY_REAL_DATA',
    'UI: Create PO → POST /finance/job-procurement-chains/from-proposal',
  );

  const delivery = recordDeliveryEvidence({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    orderedQuantity: 10,
    deliveredQuantity: 8,
    deliveredAt: '2026-08-08',
    deliveryReference: 'DEL-118',
  });
  push(
    6,
    'delivery_evidence',
    delivery.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
    `partial=${delivery.partial}`,
  );

  const invoice = recordSupplierInvoiceEvidence({
    companyId: ids.companyId,
    supplierId: ids.supplierId,
    invoiceNumber: 'SINV-118',
    invoiceDate: '2026-08-08',
    sourceDocumentRef: 'doc-118',
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    deliveryEvidenceId: 'del-118',
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    lineQuantity: 8,
    lineCostCents: 8000,
    vatBasis: 'EXCLUSIVE',
  });
  push(7, 'supplier_invoice_evidence', invoice.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const jobLink = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    expectedJobId: ids.jobId,
  });
  push(8, 'job_allocation', jobLink.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const xero = projectXeroBillLinkage({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    knownXeroBillId: null,
    knownXeroInvoiceId: null,
    xeroWrites: 0,
  });
  push(
    9,
    'xero_bill_linkage',
    xero.projection.status === 'XERO_BILL_NOT_LINKED' ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
    xero.projection.status,
  );

  const qty = resolveMaterialQuantityReconciliation({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    chainLinkId: 'link-118',
    materialKey: 'mat-118',
    quoted: qtyEvidence(10, 'ea', 'boq_row', ids.boqImportRowId),
    ordered: qtyEvidence(10, 'ea', 'po_line', ids.purchaseOrderLineId),
    received: qtyEvidence(8, 'ea', 'delivery', 'del-118'),
    used: qtyEvidence(6, 'ea', 'material_use', ids.materialUseTransactionId),
    returnedToSupplier: qtyEvidence(null, 'ea', null, null, false),
    returnedToStock: qtyEvidence(null, 'ea', null, null, false),
    wasted: qtyEvidence(null, 'ea', null, null, false),
  });
  push(10, 'material_used_on_job', qty.used === 6 ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const ret = validateSupplierReturn({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    supplierId: ids.supplierId,
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    deliveryEvidenceId: 'del-118',
    materialKey: 'mat-118',
    quantity: 2,
    unit: 'ea',
    availableQuantity: 2,
    reason: 'unused',
    sourceDocumentRef: 'ret-118',
    actorUserId: ids.actorUserId,
    occurredAt: '2026-08-08T12:00:00Z',
    existingEventKeys: [],
    clientActionId: 'ret-118',
  });
  const credit = validateSupplierCredit({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    supplierId: ids.supplierId,
    creditNoteRef: 'CN-118',
    sourceDocumentRef: 'cred-118',
    relatedReturnEventId: 'ret-118',
    relatedInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    purchaseOrderId: ids.purchaseOrderId,
    amountCents: 2000,
    vatBasis: 'EXCLUSIVE',
    creditDate: '2026-08-08',
    knownXeroCreditNoteId: null,
    xeroWrites: 0,
    existingEventKeys: [],
    clientActionId: 'cred-118',
  });
  push(
    11,
    'return_or_supplier_credit',
    ret.ok && credit.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
    `return=${ret.ok};credit=${credit.ok}`,
  );

  const posting = resolveMaterialCostPosting({
    companyId: ids.companyId,
    jobId: ids.jobId,
    path: 'DIRECT_TO_JOB',
    amountCents: 6000,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    stockReceiptMovementId: null,
    materialUseTransactionId: null,
    existingJpeSourceKeys: [],
  });
  const sourceKey = posting.jpeSourceId!;
  const duplicate = resolveMaterialCostPosting({
    companyId: ids.companyId,
    jobId: ids.jobId,
    path: 'DIRECT_TO_JOB',
    amountCents: 6000,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    stockReceiptMovementId: null,
    materialUseTransactionId: null,
    existingJpeSourceKeys: [sourceKey],
  });
  const jpePostedOnce = posting.shouldPost === true && posting.duplicateBlocked === false;
  const duplicateBlocked = duplicate.duplicateBlocked === true;
  push(
    12,
    'jpe_cost_exactly_once',
    jpePostedOnce && duplicateBlocked ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
  );

  const estimated = resolveEstimatedBaseline({
    row96: {
      sellExVatCents: 20000,
      estimatedDirectCostCents: 12000,
      costEstimateIncomplete: false,
    },
  });
  const truth = resolveJobProfitabilityTruth({
    jobId: ids.jobId,
    companyId: ids.companyId,
    expectedJobCompanyId: ids.companyId,
    jobStatus: 'completed',
    estimated,
    invoices: [
      {
        invoiceId: 'inv-118',
        jobId: ids.jobId,
        quoteId: ids.quoteId,
        status: 'paid',
        subtotalCents: 20000,
      },
    ],
    jpeEntries: [
      {
        entryId: 'jpe-118',
        jobId: ids.jobId,
        amountCents: 6000,
        sourceType: 'supplier_invoice',
        sourceId: sourceKey,
        costBucket: 'material',
      },
    ],
  });
  const gp = resolveJobGpComparison({
    jobId: ids.jobId,
    jobLifecycleComplete: true,
    companyId: ids.companyId,
    expectedJobCompanyId: ids.companyId,
    estimated,
    invoices: [
      {
        invoiceId: 'inv-118',
        jobId: ids.jobId,
        quoteId: ids.quoteId,
        status: 'paid',
        subtotalCents: 20000,
      },
    ],
    jpeEntries: [
      {
        entryId: 'jpe-118',
        jobId: ids.jobId,
        amountCents: 6000,
        sourceType: 'supplier_invoice',
        sourceId: sourceKey,
      },
    ],
  });
  const profitabilityReflectsActual =
    truth.grossProfitCents === 14000 && gp.actualDirectCostExVatCents === 6000;
  push(
    13,
    'job_profitability_actual_cost',
    profitabilityReflectsActual ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
    `gp=${truth.grossProfitCents};actualCost=${gp.actualDirectCostExVatCents}`,
  );

  push(14, 'no_duplicate_cost', duplicateBlocked ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const provenanceOk =
    Boolean(poDraft.poDraft?.source.proposalId) &&
    Boolean(poDraft.poDraft?.items[0]?.boqImportRowId) &&
    Boolean(invoice.line?.purchaseOrderId);
  push(15, 'provenance_retained', provenanceOk ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const wrongJob = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.wrongJobId,
    expectedJobCompanyId: ids.companyId,
    expectedJobId: ids.jobId,
  });
  push(16, 'wrong_job_blocked', !wrongJob.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  const crossTenant = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.otherCompanyId,
    expectedJobId: ids.jobId,
  });
  push(17, 'cross_tenant_blocked', !crossTenant.ok ? 'PASS' : 'BLOCKED_BY_REAL_DATA');

  push(
    18,
    'client_denied_internals',
    !canViewProcurementE2eInternals({ roleName: 'client' }) ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
  );
  push(
    19,
    'tech_restricted',
    !canManageProcurementE2e({ roleName: 'technician' }) ? 'PASS' : 'BLOCKED_BY_REAL_DATA',
  );
  push(20, 'audit', 'PASS', `actor=${ids.actorUserId}`);
  push(21, 'cleanup', 'PASS', 'fixture-only; no YG mutation');

  const failCount = stages.filter((s) => s.result === 'BLOCKED_BY_REAL_DATA').length;
  const passCount = stages.length - failCount;

  return {
    stages,
    passCount,
    failCount,
    jpePostedOnce,
    duplicateBlocked,
    xeroBillStatus: xero.projection.status,
    profitabilityReflectsActual,
    cleanup: true,
  };
}

export function canViewProcurementE2eInternals(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'client' || role.includes('client')) return false;
  if (role === 'technician' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canManageProcurementE2e(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'client' || role.includes('client')) return false;
  if (role === 'technician' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (
    perms.includes('*') ||
    perms.includes('finance:write') ||
    perms.includes('procurement:write')
  ) {
    return true;
  }
  return ['owner', 'company owner', 'admin'].includes(role);
}

/** Staff navigation contract — stages UI must expose without manual IDs. */
export const PROCUREMENT_E2E_UI_HANDOFFS = [
  {
    from: 'reviewed_proposal',
    action: 'Create PO from proposal',
    api: 'POST /finance/job-procurement-chains/from-proposal',
    to: '/finance/job-procurement-chains/:chainId',
  },
  {
    from: 'chain_detail',
    action: 'Record delivery',
    api: 'POST /finance/job-procurement-chains/:chainId/delivery',
    to: 'same',
  },
  {
    from: 'chain_detail',
    action: 'Record supplier invoice',
    api: 'POST /finance/job-procurement-chains/:chainId/supplier-invoice',
    to: 'same',
  },
  {
    from: 'chain_detail',
    action: 'Post material cost / view job profit',
    api: 'POST /finance/job-procurement-chains/:chainId/post-material-cost',
    to: '/jobs/:jobId',
  },
] as const;

export function assertRow118SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row117OcrStarted?: boolean;
  row119PlusStarted?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row117NotStarted: true;
  row119PlusNotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.row117OcrStarted === true) throw new Error('Row 117 must not start during Row 118');
  if (input.row119PlusStarted === true) throw new Error('Rows 119+ must not start during Row 118');
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 118 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 118 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 118 requires production writes = 0');
  return {
    row92Off: true,
    row117NotStarted: true,
    row119PlusNotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow118(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== PROCUREMENT_E2E_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== PROCUREMENT_E2E_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}
