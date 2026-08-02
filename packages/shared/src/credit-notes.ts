export type CreditNoteStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'approved_awaiting_provider_write'
  | 'executed'
  | 'failed'
  | 'cancelled';

export type CreditNoteLineItemInput = {
  description: string;
  quantity?: number;
  unitPriceCents: number;
  vatRateBps?: number;
};

export type CreditNoteLineItemSummary = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
};

export type CreditNoteSummary = {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceDisplayNumber: string;
  customerId: string;
  customerName: string;
  jobId: string | null;
  status: CreditNoteStatus;
  reason: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  invoiceBalancePreviewCents: number | null;
  providerReference: string | null;
  xeroWriteApprovalId: string | null;
  errorState: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lineItems: CreditNoteLineItemSummary[];
};

export type CreateCreditNoteDraftRequest = {
  reason: string;
  lineItems: CreditNoteLineItemInput[];
  clientActionId: string;
};

export type UpdateCreditNoteDraftRequest = {
  reason?: string;
  lineItems?: CreditNoteLineItemInput[];
};

export type BillingRecipientSnapshot = {
  billingCustomerId: string | null;
  billingCustomerName: string | null;
  serviceCustomerId: string;
  serviceCustomerName: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  billingAddress: string | null;
  vatNumber: string | null;
  poReference: string | null;
  attentionPerson: string | null;
};

export type UpdateBillingRecipientRequest = {
  billingCustomerId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  billingAddress?: string | null;
  vatNumber?: string | null;
  poReference?: string | null;
  attentionPerson?: string | null;
  copyFromServiceCustomer?: boolean;
  reason: string;
};
