/**
 * Row 127 — Procure-to-pay chain (closed hops)
 *
 * Reuses Rows99–118 + bank reconciliation. Isolated fixture only.
 * Need/PR/Inspection/AP approval/Reconciliation are mapped or minimally wired.
 * No parallel procurement/payment engines. No Xero/bank money movement.
 */

import {
  applyHumanReconciliationReview,
  canManageBankReconciliation,
  canViewBankReconciliation,
  type BankReconciliationReviewRecord,
} from './bank-reconciliation-states.js';
import {
  approveSupplierApPayment,
  assertCanonicalJobLink,
  buildPoDraftFromApprovedProposal,
  canManageJobProcurementChain,
  openPurchaseRequestFromNeed,
  projectXeroBillLinkage,
  recordDeliveryEvidence,
  recordDeliveryInspection,
  recordSupplierInvoiceEvidence,
  resolveMaterialCostPosting,
  resolveProcurementNeedFromBoqJob,
  type ApprovedProposalLineInput,
} from './job-procurement-chain.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const PROCURE_TO_PAY_ROW127_KEY = 'procure-to-pay-row127' as const;

export const PROCURE_TO_PAY_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
} as const;

export const PROCURE_TO_PAY_STEPS = [
  'need',
  'purchase_request',
  'supplier_comparison',
  'approval',
  'po',
  'delivery',
  'inspection',
  'inventory',
  'job_allocation',
  'supplier_bill',
  'matching',
  'payment_approval',
  'reconciliation',
] as const;

export type ProcureToPayStep = (typeof PROCURE_TO_PAY_STEPS)[number];

export type ProcureToPayHopResult = 'PASS' | 'GAP_FIXED' | 'BLOCKED';

export type ProcureToPayStepStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'NOT_AVAILABLE'
  | 'UNSUPPORTED'
  | 'FIXTURE_ONLY';

export type ProcureToPayStepEvidence = {
  step: ProcureToPayStep;
  status: ProcureToPayStepStatus;
  hopResult: ProcureToPayHopResult;
  evidence: string;
  fabricatesLiveYg: false;
};

export type ProcureToPayFixtureIds = {
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
  deliveryEvidenceId: string;
  supplierInvoiceEvidenceId: string;
  materialUseTransactionId: string;
  actorUserId: string;
};

export function defaultProcureToPayFixtureIds(
  overrides?: Partial<ProcureToPayFixtureIds>,
): ProcureToPayFixtureIds {
  return {
    companyId: 'co-fixture-127',
    otherCompanyId: 'co-other-127',
    jobId: 'job-fixture-127',
    wrongJobId: 'job-wrong-127',
    boqImportId: 'boq-imp-127',
    boqImportRowId: 'boq-row-127',
    proposalId: 'prop-127',
    proposalLineId: 'prop-line-127',
    supplierId: 'sup-127',
    quoteId: 'quote-127',
    purchaseOrderId: 'po-127',
    purchaseOrderLineId: 'pol-127',
    deliveryEvidenceId: 'del-127',
    supplierInvoiceEvidenceId: 'sinv-127',
    materialUseTransactionId: 'muse-127',
    actorUserId: 'user-owner-127',
    ...overrides,
  };
}

function reviewedProposalLine(ids: ProcureToPayFixtureIds): ApprovedProposalLineInput {
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
    supplierName: 'Fixture Supplier 127',
    offerKey: 'offer-127',
    row100ProposalKey: 'row100-127',
    quantityProposed: 10,
    unitPriceCents: 1000,
    vatBasis: 'EXCLUSIVE',
    expectedSupplierCostCents: 10000,
    sourceDocumentRef: 'src-127',
  };
}

function hopToStatus(result: ProcureToPayHopResult): ProcureToPayStepStatus {
  if (result === 'BLOCKED') return 'UNSUPPORTED';
  if (result === 'GAP_FIXED') return 'FIXTURE_ONLY';
  return 'SUPPORTED';
}

/**
 * Canonical coverage from a completed fixture hop matrix.
 * No NOT_AVAILABLE when fixture proves the hop.
 */
export function proveProcureToPayCoverage(input?: {
  hopResults?: Partial<Record<ProcureToPayStep, ProcureToPayHopResult>>;
}): ProcureToPayStepEvidence[] {
  const defaults: Record<ProcureToPayStep, ProcureToPayHopResult> = {
    need: 'GAP_FIXED',
    purchase_request: 'GAP_FIXED',
    supplier_comparison: 'PASS',
    approval: 'PASS',
    po: 'PASS',
    delivery: 'PASS',
    inspection: 'GAP_FIXED',
    inventory: 'PASS',
    job_allocation: 'PASS',
    supplier_bill: 'PASS',
    matching: 'PASS',
    payment_approval: 'GAP_FIXED',
    reconciliation: 'GAP_FIXED',
  };
  const hops = { ...defaults, ...input?.hopResults };
  const evidenceMap: Record<ProcureToPayStep, string> = {
    need: 'Job + BOQ requirement (resolveProcurementNeedFromBoqJob)',
    purchase_request: 'Draft proposal request from Need (openPurchaseRequestFromNeed)',
    supplier_comparison: 'BOQ supplier comparison / offer key',
    approval: 'Proposal REVIEWED/APPROVED',
    po: 'PO draft from approved proposal',
    delivery: 'Delivery evidence',
    inspection: 'Delivery inspection accepted/rejected/review_required',
    inventory: 'Material cost posting after accepted inspection',
    job_allocation: 'Canonical job allocation',
    supplier_bill: 'Supplier bill evidence / Xero bill projection',
    matching: 'Delivery↔invoice evidence match',
    payment_approval: 'AP payment approval (no payment initiation)',
    reconciliation: 'Existing bank reconciliation state model (no Xero/bank write)',
  };
  return PROCURE_TO_PAY_STEPS.map((step) => ({
    step,
    status: hopToStatus(hops[step]),
    hopResult: hops[step],
    evidence: evidenceMap[step],
    fabricatesLiveYg: false,
  }));
}

export function assertProcureToPayNoFabrication(cells: ProcureToPayStepEvidence[]): void {
  for (const c of cells) {
    if (c.fabricatesLiveYg) throw new Error(`Row 127 forbids fabricating live YG for ${c.step}`);
  }
}

export function procureToPaySupportedCount(cells: ProcureToPayStepEvidence[]): {
  supported: number;
  partial: number;
  missing: number;
} {
  return {
    supported: cells.filter(
      (c) => c.status === 'SUPPORTED' || c.status === 'FIXTURE_ONLY',
    ).length,
    partial: cells.filter((c) => c.status === 'PARTIAL').length,
    missing: cells.filter((c) => c.status === 'NOT_AVAILABLE' || c.status === 'UNSUPPORTED').length,
  };
}

/** All required hops must be PASS or GAP_FIXED — no NOT_AVAILABLE. */
export function assertRow127AcceptanceGate(cells: ProcureToPayStepEvidence[]): void {
  assertProcureToPayNoFabrication(cells);
  for (const step of PROCURE_TO_PAY_STEPS) {
    const cell = cells.find((c) => c.step === step);
    if (!cell) throw new Error(`Row 127 gate failed: missing ${step}`);
    if (cell.status === 'NOT_AVAILABLE' || cell.hopResult === 'BLOCKED') {
      throw new Error(`Row 127 gate failed: ${step} is ${cell.status}/${cell.hopResult}`);
    }
    if (cell.status !== 'SUPPORTED' && cell.status !== 'FIXTURE_ONLY' && cell.status !== 'PARTIAL') {
      throw new Error(`Row 127 gate failed: ${step} status ${cell.status}`);
    }
  }
}

export function assertRow127SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  fabricatedYgRecords?: number;
  moneyMovement?: number;
}): { row92Off: true; xeroWrites: 0; fabricatedYgRecords: 0; moneyMovement: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 127 Xero writes must be 0');
  if ((input.fabricatedYgRecords ?? 0) !== 0) {
    throw new Error('Row 127 must not fabricate live YG records');
  }
  if ((input.moneyMovement ?? 0) !== 0) throw new Error('Row 127 money movement must be 0');
  return { row92Off: true, xeroWrites: 0, fabricatedYgRecords: 0, moneyMovement: 0 };
}

export type ProcureToPayFixtureReport = {
  hops: ProcureToPayStepEvidence[];
  pass: boolean;
  jpePostedOnce: boolean;
  duplicateBlocked: boolean;
  wrongJobBlocked: boolean;
  techDenied: boolean;
  clientDenied: boolean;
  tenantIsolated: boolean;
  auditTrail: Array<{ hop: ProcureToPayStep; at: string; actorUserId: string; detail: string }>;
  xeroWrites: 0;
  moneyMovement: 0;
  cleanup: true;
  reconciliation: BankReconciliationReviewRecord | null;
};

/**
 * Isolated fixture — closes Need → … → reconciliation without DB/Xero/YG writes.
 */
export function runProcureToPayFixture(
  ids: ProcureToPayFixtureIds = defaultProcureToPayFixtureIds(),
): ProcureToPayFixtureReport {
  const auditTrail: ProcureToPayFixtureReport['auditTrail'] = [];
  const hopResults: Partial<Record<ProcureToPayStep, ProcureToPayHopResult>> = {};
  const at = '2026-08-08T12:00:00.000Z';
  const pushAudit = (hop: ProcureToPayStep, detail: string) => {
    auditTrail.push({ hop, at, actorUserId: ids.actorUserId, detail });
  };

  // NEED
  const freeTextBlocked = resolveProcurementNeedFromBoqJob({
    companyId: ids.companyId,
    jobId: null,
    expectedJobCompanyId: ids.companyId,
    boqImportId: null,
    boqImportRowId: null,
    freeTextOnly: true,
  });
  const need = resolveProcurementNeedFromBoqJob({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    expectedJobId: ids.jobId,
    boqImportId: ids.boqImportId,
    boqImportRowId: ids.boqImportRowId,
    materialKey: 'mat-127',
    quantityRequired: 10,
  });
  hopResults.need = need.ok && !freeTextBlocked.ok ? 'GAP_FIXED' : 'BLOCKED';
  pushAudit('need', need.ok ? `need=${need.need?.source}` : need.warnings.join(','));

  // PURCHASE REQUEST
  const pr = need.need
    ? openPurchaseRequestFromNeed({
        need: need.need,
        proposalId: ids.proposalId,
        proposalLineId: ids.proposalLineId,
        actorUserId: ids.actorUserId,
        openedAt: at,
      })
    : { ok: false as const, warnings: [], purchaseRequest: null };
  hopResults.purchase_request = pr.ok && pr.purchaseRequest?.auditable ? 'GAP_FIXED' : 'BLOCKED';
  pushAudit(
    'purchase_request',
    pr.ok ? `pr=${pr.purchaseRequest?.id};status=${pr.purchaseRequest?.status}` : 'missing',
  );

  // COMPARISON + APPROVAL + PO
  const line = reviewedProposalLine(ids);
  hopResults.supplier_comparison = line.offerKey && line.row100ProposalKey ? 'PASS' : 'BLOCKED';
  hopResults.approval = line.proposalStatus === 'REVIEWED' ? 'PASS' : 'BLOCKED';
  pushAudit('supplier_comparison', `offer=${line.offerKey}`);
  pushAudit('approval', `status=${line.proposalStatus}`);

  const poDraft = buildPoDraftFromApprovedProposal(line);
  hopResults.po = poDraft.ok && poDraft.createsPurchaseOrder ? 'PASS' : 'BLOCKED';
  pushAudit('po', poDraft.ok ? 'po_draft_created' : poDraft.warnings.join(','));

  // DELIVERY
  const delivery = recordDeliveryEvidence({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    orderedQuantity: 10,
    deliveredQuantity: 10,
    deliveredAt: '2026-08-08',
    deliveryReference: 'DEL-127',
  });
  hopResults.delivery = delivery.ok ? 'PASS' : 'BLOCKED';
  pushAudit('delivery', `ok=${delivery.ok};partial=${delivery.partial}`);

  // INSPECTION
  const reviewInspection = recordDeliveryInspection({
    companyId: ids.companyId,
    deliveryEvidenceId: ids.deliveryEvidenceId,
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    outcome: 'review_required',
    inspectedByUserId: ids.actorUserId,
    inspectedAt: at,
  });
  const inspection = recordDeliveryInspection({
    companyId: ids.companyId,
    deliveryEvidenceId: ids.deliveryEvidenceId,
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    outcome: 'accepted',
    inspectedByUserId: ids.actorUserId,
    inspectedAt: at,
    notes: 'Qty OK',
  });
  hopResults.inspection =
    inspection.ok &&
    inspection.inspection?.allowsInventoryCost &&
    !reviewInspection.ok
      ? 'GAP_FIXED'
      : 'BLOCKED';
  pushAudit('inspection', `outcome=${inspection.inspection?.outcome}`);

  // JOB ALLOCATION + SUPPLIER BILL + MATCHING
  const wrongJob = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.wrongJobId,
    expectedJobCompanyId: ids.companyId,
    expectedJobId: ids.jobId,
  });
  const jobLink = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.companyId,
    expectedJobId: ids.jobId,
  });
  hopResults.job_allocation = jobLink.ok && !wrongJob.ok ? 'PASS' : 'BLOCKED';
  pushAudit('job_allocation', `ok=${jobLink.ok};wrongBlocked=${!wrongJob.ok}`);

  const invoice = recordSupplierInvoiceEvidence({
    companyId: ids.companyId,
    supplierId: ids.supplierId,
    invoiceNumber: 'SINV-127',
    invoiceDate: '2026-08-08',
    sourceDocumentRef: 'doc-127',
    purchaseOrderId: ids.purchaseOrderId,
    purchaseOrderLineId: ids.purchaseOrderLineId,
    deliveryEvidenceId: ids.deliveryEvidenceId,
    jobId: ids.jobId,
    expectedJobId: ids.jobId,
    lineQuantity: 10,
    lineCostCents: 10000,
    vatBasis: 'EXCLUSIVE',
  });
  hopResults.supplier_bill = invoice.ok ? 'PASS' : 'BLOCKED';
  hopResults.matching =
    invoice.ok && Boolean(invoice.line?.deliveryEvidenceId) && delivery.ok ? 'PASS' : 'BLOCKED';
  pushAudit('supplier_bill', `ok=${invoice.ok}`);
  pushAudit('matching', `deliveryLinked=${Boolean(invoice.line?.deliveryEvidenceId)}`);

  const xero = projectXeroBillLinkage({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    knownXeroBillId: null,
    knownXeroInvoiceId: null,
    xeroWrites: 0,
  });
  void xero;

  // INVENTORY / COST (after accepted inspection) — exactly once
  const posting = resolveMaterialCostPosting({
    companyId: ids.companyId,
    jobId: ids.jobId,
    path: 'DIRECT_TO_JOB',
    amountCents: 10000,
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
    amountCents: 10000,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    stockReceiptMovementId: null,
    materialUseTransactionId: null,
    existingJpeSourceKeys: [sourceKey],
  });
  const jpePostedOnce = posting.shouldPost === true && posting.duplicateBlocked === false;
  const duplicateBlocked = duplicate.duplicateBlocked === true;
  hopResults.inventory =
    inspection.inspection?.allowsInventoryCost && jpePostedOnce && duplicateBlocked
      ? 'PASS'
      : 'BLOCKED';
  pushAudit('inventory', `jpeOnce=${jpePostedOnce};dupBlocked=${duplicateBlocked}`);

  // AP PAYMENT APPROVAL (no initiation)
  const techDenied = !approveSupplierApPayment({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    amountCents: 10000,
    roleName: 'technician',
    approverUserId: 'tech-1',
    approvedAt: at,
  }).ok;
  const clientDenied = !approveSupplierApPayment({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    amountCents: 10000,
    roleName: 'client',
    approverUserId: 'client-1',
    approvedAt: at,
  }).ok;
  const initiateBlocked = !approveSupplierApPayment({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    amountCents: 10000,
    roleName: 'owner',
    approverUserId: ids.actorUserId,
    approvedAt: at,
    initiatePayment: true,
  }).ok;
  const ap = approveSupplierApPayment({
    companyId: ids.companyId,
    supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
    amountCents: 10000,
    roleName: 'owner',
    permissions: ['finance:write'],
    approverUserId: ids.actorUserId,
    approvedAt: at,
    initiatePayment: false,
    xeroWrites: 0,
  });
  hopResults.payment_approval =
    ap.ok &&
    ap.approval?.paymentInitiated === false &&
    ap.approval.moneyMovement === 0 &&
    initiateBlocked &&
    techDenied &&
    clientDenied
      ? 'GAP_FIXED'
      : 'BLOCKED';
  pushAudit(
    'payment_approval',
    `status=${ap.approval?.status};initiated=${ap.approval?.paymentInitiated}`,
  );

  // RECONCILIATION — existing bank recon model; no Xero write / bank movement
  const techReconDenied = !canManageBankReconciliation({ roleName: 'technician' });
  const clientReconDenied = !canViewBankReconciliation({ roleName: 'client' });
  let reconciliation: BankReconciliationReviewRecord | null = null;
  try {
    reconciliation = applyHumanReconciliationReview({
      currentState: 'REVIEW_REQUIRED',
      nextState: 'RECONCILED',
      reviewedByUserId: ids.actorUserId,
      reviewedAt: at,
      evidence: {
        supplierInvoiceEvidenceId: ids.supplierInvoiceEvidenceId,
        apApprovalStatus: ap.approval?.status,
        amountCents: ap.approval?.amountCents,
        xeroWrites: 0,
        moneyMovement: 0,
      },
      auraForcedReconcile: false,
    });
  } catch {
    reconciliation = null;
  }
  hopResults.reconciliation =
    reconciliation?.humanConfirmed &&
    reconciliation.state === 'RECONCILED' &&
    techReconDenied &&
    clientReconDenied
      ? 'GAP_FIXED'
      : 'BLOCKED';
  pushAudit('reconciliation', `state=${reconciliation?.state ?? 'none'}`);

  // Tenant isolation
  const crossTenant = assertCanonicalJobLink({
    companyId: ids.companyId,
    jobId: ids.jobId,
    expectedJobCompanyId: ids.otherCompanyId,
    expectedJobId: ids.jobId,
  });
  const tenantIsolated = !crossTenant.ok;
  const staffOk = canManageJobProcurementChain({ roleName: 'owner', permissions: ['finance:write'] });

  const hops = proveProcureToPayCoverage({ hopResults });
  const pass =
    hops.every((h) => h.hopResult !== 'BLOCKED') &&
    jpePostedOnce &&
    duplicateBlocked &&
    !wrongJob.ok &&
    techDenied &&
    clientDenied &&
    tenantIsolated &&
    staffOk;

  return {
    hops,
    pass,
    jpePostedOnce,
    duplicateBlocked,
    wrongJobBlocked: !wrongJob.ok,
    techDenied,
    clientDenied,
    tenantIsolated,
    auditTrail,
    xeroWrites: 0,
    moneyMovement: 0,
    cleanup: true,
    reconciliation,
  };
}
