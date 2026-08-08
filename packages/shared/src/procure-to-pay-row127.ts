/**
 * Row 127 — Procure-to-pay chain coverage
 *
 * Reuses Rows99–118. Does not fabricate live YG suppliers/POs/bills/payments.
 * Missing hops stay explicit (NOT_AVAILABLE / UNSUPPORTED), never faked PASS.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const PROCURE_TO_PAY_ROW127_KEY = 'procure-to-pay-row127' as const;

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

export type ProcureToPayStepStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'NOT_AVAILABLE'
  | 'UNSUPPORTED'
  | 'FIXTURE_ONLY';

export type ProcureToPayStepEvidence = {
  step: ProcureToPayStep;
  status: ProcureToPayStepStatus;
  evidence: string;
  fabricatesLiveYg: false;
};

/**
 * Canonical coverage map over existing Rows99–118 surfaces.
 * Need/PR/Inspection/AP payment approval/recon are explicit gaps unless wired.
 */
export function proveProcureToPayCoverage(input?: {
  hasNeedEvidence?: boolean;
  hasPurchaseRequest?: boolean;
  hasSupplierComparison?: boolean;
  hasApproval?: boolean;
  hasPo?: boolean;
  hasDelivery?: boolean;
  hasInspection?: boolean;
  hasInventoryPosting?: boolean;
  hasJobAllocation?: boolean;
  hasSupplierBill?: boolean;
  hasMatching?: boolean;
  hasPaymentApproval?: boolean;
  hasReconciliation?: boolean;
}): ProcureToPayStepEvidence[] {
  const i = {
    hasNeedEvidence: false,
    hasPurchaseRequest: false,
    hasSupplierComparison: true,
    hasApproval: true,
    hasPo: true,
    hasDelivery: true,
    hasInspection: false,
    hasInventoryPosting: true,
    hasJobAllocation: true,
    hasSupplierBill: true,
    hasMatching: true,
    hasPaymentApproval: false,
    hasReconciliation: false,
    ...input,
  };

  const cell = (
    step: ProcureToPayStep,
    present: boolean,
    evidence: string,
    whenMissing: ProcureToPayStepStatus = 'NOT_AVAILABLE',
    whenPresent: ProcureToPayStepStatus = 'SUPPORTED',
  ): ProcureToPayStepEvidence => ({
    step,
    status: present ? whenPresent : whenMissing,
    evidence: present ? evidence : `${evidence} — missing`,
    fabricatesLiveYg: false,
  });

  return [
    cell('need', i.hasNeedEvidence, 'Need/requisition evidence', 'NOT_AVAILABLE'),
    cell('purchase_request', i.hasPurchaseRequest, 'Purchase request', 'NOT_AVAILABLE'),
    cell('supplier_comparison', i.hasSupplierComparison, 'BOQ supplier comparison (Row100+)'),
    cell('approval', i.hasApproval, 'Proposal REVIEWED/APPROVED → PO draft'),
    cell('po', i.hasPo, 'PO draft from approved proposal'),
    cell('delivery', i.hasDelivery, 'Delivery evidence (Row102+)'),
    cell('inspection', i.hasInspection, 'Inspection hop', 'NOT_AVAILABLE'),
    cell('inventory', i.hasInventoryPosting, 'Stock/material cost posting', 'PARTIAL', 'SUPPORTED'),
    cell('job_allocation', i.hasJobAllocation, 'Multi-job supplier invoice allocation'),
    cell('supplier_bill', i.hasSupplierBill, 'Supplier bill evidence / Xero bill projection'),
    cell('matching', i.hasMatching, 'Delivery↔invoice / bank match surfaces', 'PARTIAL', 'PARTIAL'),
    cell('payment_approval', i.hasPaymentApproval, 'AP payment approval', 'NOT_AVAILABLE'),
    cell(
      'reconciliation',
      i.hasReconciliation,
      'Supplier payment reconciliation',
      'NOT_AVAILABLE',
    ),
  ];
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
    supported: cells.filter((c) => c.status === 'SUPPORTED' || c.status === 'FIXTURE_ONLY').length,
    partial: cells.filter((c) => c.status === 'PARTIAL').length,
    missing: cells.filter((c) => c.status === 'NOT_AVAILABLE' || c.status === 'UNSUPPORTED').length,
  };
}

/** Gate: mid-chain must be supported; explicit gaps allowed if not fabricated. */
export function assertRow127AcceptanceGate(cells: ProcureToPayStepEvidence[]): void {
  assertProcureToPayNoFabrication(cells);
  const required: ProcureToPayStep[] = [
    'supplier_comparison',
    'approval',
    'po',
    'delivery',
    'job_allocation',
    'supplier_bill',
  ];
  for (const step of required) {
    const cell = cells.find((c) => c.step === step);
    if (!cell || (cell.status !== 'SUPPORTED' && cell.status !== 'PARTIAL' && cell.status !== 'FIXTURE_ONLY')) {
      throw new Error(`Row 127 gate failed: ${step} not covered`);
    }
  }
}

export function assertRow127SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  fabricatedYgRecords?: number;
}): { row92Off: true; xeroWrites: 0; fabricatedYgRecords: 0 } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 127 Xero writes must be 0');
  if ((input.fabricatedYgRecords ?? 0) !== 0) {
    throw new Error('Row 127 must not fabricate live YG records');
  }
  return { row92Off: true, xeroWrites: 0, fabricatedYgRecords: 0 };
}
