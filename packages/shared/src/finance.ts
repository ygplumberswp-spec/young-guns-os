import type { JobPaymentLedger } from './job-payment-ledger.js';

export type QuoteStatus =
  | 'draft'
  | 'internal_review'
  | 'approved_for_sending'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'superseded'
  | 'converted'
  | 'cancelled';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export type InvoiceStage = 'deposit' | 'progress' | 'final' | 'standard';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'other';

export type QuoteLineCategory =
  | 'scope'
  | 'labour'
  | 'materials'
  | 'travel'
  | 'equipment'
  | 'subcontractor'
  | 'overhead'
  | 'contingency'
  | 'warranty'
  | 'discount'
  | 'other';

export type InvoiceNumberAuthority = 'internal_pending_xero' | 'xero';

export const QUOTE_STATUS_OPTIONS: Array<{ value: QuoteStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'approved_for_sending', label: 'Approved for sending' },
  { value: 'sent', label: 'Sent / issued' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'converted', label: 'Converted / invoiced' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const INVOICE_STATUS_OPTIONS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const INVOICE_STAGE_OPTIONS: Array<{ value: InvoiceStage; label: string }> = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'progress', label: 'Progress' },
  { value: 'final', label: 'Final' },
  { value: 'standard', label: 'Standard' },
];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export const QUOTE_LINE_CATEGORY_OPTIONS: Array<{ value: QuoteLineCategory; label: string }> = [
  { value: 'scope', label: 'Scope of work' },
  { value: 'labour', label: 'Labour' },
  { value: 'materials', label: 'Materials' },
  { value: 'travel', label: 'Travel / call-out' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'contingency', label: 'Contingency / risk' },
  { value: 'warranty', label: 'Warranty / compliance' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

export type QuoteLineItemInput = {
  category?: QuoteLineCategory;
  description: string;
  quantity?: number;
  unitPriceCents: number;
  unitCostCents?: number;
  vatRateBps?: number;
  isOptional?: boolean;
  optionTier?: string | null;
};

export type QuoteLineItemSummary = {
  id: string;
  position: number;
  category: QuoteLineCategory;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  vatRateBps: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
  lineCostCents: number | null;
  isOptional: boolean;
  optionTier: string | null;
};

export type QuoteProfitSummary = {
  estimatedCostCents: number;
  grossProfitCents: number;
  markupBps: number;
  marginBps: number;
  profitFloorCents: number;
  targetPriceCents: number;
  belowFloor: boolean;
  missingCostWarning: boolean;
};

export type QuoteSummary = {
  id: string;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  versionNumber: number;
  isImmutable: boolean;
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobTitle: string | null;
  jobNumber: string | null;
  propertyId: string | null;
  leadId: string | null;
  estimatorUserId: string | null;
  amountCents: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  validUntil: string | null;
  depositPercent?: number | null;
  issuedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profit?: QuoteProfitSummary | null;
};

export type QuoteAcceptanceSummary = {
  id: string;
  decision: 'accepted' | 'declined' | 'change_requested';
  acceptedVersionNumber: number;
  accepterName: string | null;
  accepterEmail: string | null;
  declineReason: string | null;
  changeRequestMessage: string | null;
  createdAt: string;
  idempotentReplay?: boolean;
};

export type QuoteDetail = QuoteSummary & {
  scopeOfWork: string | null;
  exclusions: string | null;
  assumptions: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  paymentTerms: string | null;
  depositPercent: number | null;
  optionTier: string | null;
  discountCents: number;
  belowFloorOverride: boolean;
  belowFloorReason: string | null;
  lineItems: QuoteLineItemSummary[];
  acceptance: QuoteAcceptanceSummary | null;
  xeroQuoteId: string | null;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  internalNumber: string;
  displayInvoiceNumber: string;
  xeroInvoiceNumber: string | null;
  xeroReference: string | null;
  numberAuthority: InvoiceNumberAuthority;
  title: string;
  status: InvoiceStatus;
  stage: InvoiceStage;
  customerId: string;
  customerName: string;
  jobId: string | null;
  jobTitle: string | null;
  jobNumber: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  quoteVersionNumber: number | null;
  amountCents: number;
  totalCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  isOverdue: boolean;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLineItemSummary = {
  id: string;
  position: number;
  category: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
};

export type InvoiceDetail = InvoiceSummary & {
  subtotalCents: number;
  vatCents: number;
  paymentTerms: string | null;
  billingName: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  notes: string | null;
  lineItems: InvoiceLineItemSummary[];
  payments: PaymentSummary[];
};

export type PaymentSummary = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTitle: string;
  customerName: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  xeroPaymentId: string | null;
  receiptNumber: string | null;
  paidAt: string;
  createdAt: string;
};

export type PaymentDetail = PaymentSummary & {
  notes: string | null;
  receipt: {
    id: string;
    receiptNumber: string;
    issuedAt: string;
    payload: Record<string, unknown>;
  } | null;
};

export type FinanceStats = {
  openQuoteCount: number;
  revenueMtdCents: number;
  currency: string;
  invoiceCount: number;
  paymentCount: number;
  outstandingCents: number;
  overdueInvoiceCount: number;
};

export type JobFinanceChip = {
  kind: 'quoted' | 'accepted' | 'invoiced' | 'paid' | 'outstanding' | 'overdue' | 'profit';
  label: string;
  value: string;
  href: string | null;
  internalOnly?: boolean;
};

export type JobFinanceSummary = {
  jobId: string;
  chips: JobFinanceChip[];
  quotes: QuoteSummary[];
  invoices: InvoiceSummary[];
  payments: PaymentSummary[];
  /** Derived payment ledger for Job 360 finance strip (read-only; no Xero writes). */
  ledger: JobPaymentLedger;
};

export type CreateQuoteRequest = {
  customerId: string;
  jobId?: string | null;
  propertyId?: string | null;
  leadId?: string | null;
  estimatorUserId?: string | null;
  title?: string;
  status?: QuoteStatus;
  currency?: string;
  validUntil?: string | null;
  scopeOfWork?: string | null;
  exclusions?: string | null;
  assumptions?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  paymentTerms?: string | null;
  depositPercent?: number | null;
  optionTier?: string | null;
  notes?: string | null;
  lineItems: QuoteLineItemInput[];
  discountCents?: number;
  belowFloorOverride?: boolean;
  belowFloorReason?: string | null;
  clientActionId?: string | null;
  /** @deprecated legacy aggregate — prefer lineItems */
  amountCents?: number;
};

export type UpdateQuoteRequest = Partial<Omit<CreateQuoteRequest, 'customerId' | 'clientActionId'>> & {
  cancelReason?: string | null;
};

export type IssueQuoteRequest = {
  clientActionId?: string | null;
};

export type CreateQuoteVersionRequest = {
  clientActionId: string;
  reason?: string | null;
};

export type CreateInvoiceFromQuoteRequest = {
  clientActionId: string;
  stage: InvoiceStage;
  dueDate?: string | null;
  notes?: string | null;
  amountCents?: number | null;
};

export type CreateInvoiceRequest = {
  customerId: string;
  jobId?: string | null;
  quoteId?: string | null;
  propertyId?: string | null;
  title: string;
  stage?: InvoiceStage;
  status?: InvoiceStatus;
  amountCents?: number;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
  paymentTerms?: string | null;
  lineItems?: QuoteLineItemInput[];
  clientActionId?: string | null;
};

export type CreatePaymentRequest = {
  invoiceId: string;
  amountCents: number;
  currency?: string;
  method?: PaymentMethod;
  reference?: string | null;
  paidAt?: string;
  notes?: string | null;
  clientActionId?: string | null;
};

export type AcceptQuoteRequest = {
  clientActionId: string;
  accepterName: string;
  acknowledgeScope: boolean;
  acknowledgeExclusions: boolean;
  acknowledgePrice: boolean;
  acknowledgeVat: boolean;
  acknowledgePaymentTerms: boolean;
  acknowledgeValidity: boolean;
  typedSignature?: string | null;
};

export type DeclineQuoteRequest = {
  clientActionId: string;
  decision: 'declined' | 'change_requested';
  reason: string;
  message?: string | null;
};

export type FinanceListQuery = {
  q?: string;
  status?: string;
  outstandingOnly?: boolean;
  overdueOnly?: boolean;
};

export type CompanyFinanceSettingsSummary = {
  defaultVatRateBps: number;
  profitFloorMarginBps: number;
  allowBelowFloorWithOverride: boolean;
  currency: string;
};

export function calculateLineAmounts(input: {
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number;
  vatRateBps: number;
}) {
  const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
  const lineSubtotalCents = Math.round(qty * input.unitPriceCents);
  const lineVatCents = Math.round((lineSubtotalCents * input.vatRateBps) / 10_000);
  const lineTotalCents = lineSubtotalCents + lineVatCents;
  const lineCostCents = Math.round(qty * (input.unitCostCents ?? 0));
  return { lineSubtotalCents, lineVatCents, lineTotalCents, lineCostCents };
}

export function calculateQuoteProfit(input: {
  totalCents: number;
  estimatedCostCents: number;
  profitFloorMarginBps: number;
}): QuoteProfitSummary & { belowFloor: boolean } {
  const grossProfitCents = input.totalCents - input.estimatedCostCents;
  const markupBps =
    input.estimatedCostCents > 0
      ? Math.round((grossProfitCents / input.estimatedCostCents) * 10_000)
      : 0;
  const marginBps =
    input.totalCents > 0 ? Math.round((grossProfitCents / input.totalCents) * 10_000) : 0;
  const profitFloorCents = Math.round(
    input.estimatedCostCents * (1 + input.profitFloorMarginBps / 10_000),
  );
  const targetPriceCents = profitFloorCents;
  return {
    estimatedCostCents: input.estimatedCostCents,
    grossProfitCents,
    markupBps,
    marginBps,
    profitFloorCents,
    targetPriceCents,
    belowFloor: input.totalCents < profitFloorCents && input.estimatedCostCents > 0,
    missingCostWarning: input.estimatedCostCents <= 0,
  };
}

export function formatInternalInvoiceNumber(sequence: number): string {
  return `TITAN-INV-${String(sequence).padStart(6, '0')}`;
}

export function displayInvoiceNumber(input: {
  xeroInvoiceNumber?: string | null;
  internalNumber?: string | null;
  invoiceNumber: string;
  numberAuthority?: string | null;
}): string {
  if (input.xeroInvoiceNumber?.trim()) return input.xeroInvoiceNumber.trim();
  const internal = input.internalNumber?.trim() || input.invoiceNumber;
  return `Pending Xero sync (${internal})`;
}

export { formatMoney } from './localisation.js';

export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}
