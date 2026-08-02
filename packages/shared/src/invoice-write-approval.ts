import type { XeroWriteOperation } from './xero-two-way-sync.js';

export type InvoiceWriteApprovalOperation = Extract<
  XeroWriteOperation,
  'invoice_void' | 'credit_note_create'
>;

export type InvoiceWriteApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'
  | 'approved_awaiting_provider_write';

export type InvoiceWriteApprovalLineInput = {
  description: string;
  quantity?: number;
  unitPriceCents: number;
  vatRateBps?: number;
};

export type CreateInvoiceWriteApprovalRequest = {
  operation: InvoiceWriteApprovalOperation;
  reason: string;
  clientActionId: string;
  lineItems?: InvoiceWriteApprovalLineInput[];
  creditAmountCents?: number;
};

export type InvoiceWriteApprovalSummary = {
  id: string;
  companyId: string;
  entityType: 'invoice';
  entityId: string;
  operation: InvoiceWriteApprovalOperation;
  status: InvoiceWriteApprovalStatus;
  idempotencyKey: string;
  reason: string;
  requestedByUserId: string | null;
  requestedAt: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  invoiceDisplayNumber: string;
  invoiceTitle: string;
  invoiceStatus: string;
  invoiceTotalCents: number;
  invoiceOutstandingCents: number;
  expectedEffect: string;
  providerWriteBlocked: boolean;
  providerWriteMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ExecuteInvoiceWriteApprovalResult = {
  approval: InvoiceWriteApprovalSummary;
  executionStatus: InvoiceWriteApprovalStatus;
  providerWriteBlocked: boolean;
  message: string;
  invoiceUpdated: boolean;
};

export const VOID_ELIGIBLE_INVOICE_STATUSES = ['sent', 'partial', 'overdue', 'paid'] as const;

export const CREDIT_NOTE_ELIGIBLE_INVOICE_STATUSES = ['sent', 'partial', 'overdue', 'paid'] as const;

export function describeInvoiceWriteExpectedEffect(
  operation: InvoiceWriteApprovalOperation,
  input: { displayNumber: string; outstandingCents: number; creditAmountCents?: number },
): string {
  if (operation === 'invoice_void') {
    return `Void invoice ${input.displayNumber} in Xero and mark cancelled in TITAN. Outstanding ${input.outstandingCents} cents will no longer be collectible.`;
  }
  const credit = input.creditAmountCents ?? input.outstandingCents;
  return `Create credit note against ${input.displayNumber} for ${credit} cents (incl. VAT allocation). Reduces customer balance; Xero remains source of truth.`;
}

export function isProviderWriteAuthorized(): boolean {
  return process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED === 'true';
}
