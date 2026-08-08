import type { JobPaymentLedger } from './job-payment-ledger.js';
import type { FinanceDocumentAddressSnapshot } from './finance-document-roundtrip.js';
import type { FinanceDocumentContent, FinanceDocumentSectionsSnapshot } from './finance-document-content.js';
import {
  DRAFT_INVOICE_DISPLAY_LABEL,
  DRAFT_QUOTE_DISPLAY_LABEL,
  resolveInvoiceDisplayNumberLabel,
  resolveQuoteDisplayNumberLabel,
} from './xero-official-number-authority.js';

export type { FinanceDocumentContent, FinanceDocumentSectionsSnapshot };

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
  { value: 'internal_review', label: 'Internal Review' },
  { value: 'approved_for_sending', label: 'Approved For Sending' },
  { value: 'sent', label: 'Sent / Issued' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'converted', label: 'Converted / Invoiced' },
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
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

export const QUOTE_LINE_CATEGORY_OPTIONS: Array<{ value: QuoteLineCategory; label: string }> = [
  { value: 'scope', label: 'Scope Of Work' },
  { value: 'labour', label: 'Labour' },
  { value: 'materials', label: 'Materials' },
  { value: 'travel', label: 'Travel / Call-Out' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'contingency', label: 'Contingency / Risk' },
  { value: 'warranty', label: 'Warranty / Compliance' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

/** Line categories shown in the professional editor — discount is intentionally excluded. */
export const FINANCE_EDITOR_LINE_CATEGORY_OPTIONS = QUOTE_LINE_CATEGORY_OPTIONS.filter(
  (option) => option.value !== 'discount',
);

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
  /** Official Xero quote number when synced — never show internal quoteNumber as official. */
  xeroQuoteNumber: string | null;
  displayQuoteNumber: string;
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
  /** Provenance — Xero-backed quotes keep provider state authoritative. */
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  xeroQuoteId?: string | null;
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
  notes: string | null;
  addresses: FinanceDocumentAddressSnapshot;
  lineItems: QuoteLineItemSummary[];
  acceptance: QuoteAcceptanceSummary | null;
  xeroQuoteId: string | null;
  documentSections: FinanceDocumentSectionsSnapshot;
};

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  internalNumber: string;
  displayInvoiceNumber: string;
  /** Official display label for UI — Xero number or pending draft text. */
  displayOfficialInvoiceNumber: string;
  xeroInvoiceNumber: string | null;
  xeroReference: string | null;
  numberAuthority: InvoiceNumberAuthority;
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
  issuedAt: string | null;
  /** Customer-entered reference (PO/site ref) — never the official Xero invoice number. */
  customerReference: string | null;
  xeroSyncStatus?: 'synced' | 'pending' | 'failed' | 'out_of_sync' | null;
  financialDataComplete?: boolean;
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
  addresses: FinanceDocumentAddressSnapshot;
  lineItems: InvoiceLineItemSummary[];
  payments: PaymentSummary[];
  documentSections: FinanceDocumentSectionsSnapshot;
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
  /** Honest historical/partial archive states for Job 360 — never invents missing evidence. */
  historicalCompleteness?: import('./historical-import.js').Job360HistoricalCompleteness;
  /** Permanent Digital Job File section rollup — archive is not deletion. */
  digitalFile?: import('./historical-import.js').Job360DigitalFileRollup;
};

export type CreateQuoteRequest = {
  customerId: string;
  jobId?: string | null;
  propertyId?: string | null;
  leadId?: string | null;
  estimatorUserId?: string | null;
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
  issuedAt?: string | null;
  billingAddress?: string | null;
  siteAddress?: string | null;
  postalAddress?: string | null;
  lineItems: QuoteLineItemInput[];
  discountCents?: number;
  belowFloorOverride?: boolean;
  belowFloorReason?: string | null;
  clientActionId?: string | null;
  /** @deprecated legacy aggregate — prefer lineItems */
  amountCents?: number;
  documentContent?: FinanceDocumentContent | null;
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
  stage?: InvoiceStage;
  status?: InvoiceStatus;
  amountCents?: number;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
  customerReference?: string | null;
  billingAddress?: string | null;
  siteAddress?: string | null;
  postalAddress?: string | null;
  paymentTerms?: string | null;
  lineItems?: QuoteLineItemInput[];
  clientActionId?: string | null;
  documentContent?: FinanceDocumentContent | null;
  cocDocumentationId?: string | null;
};

export type UpdateInvoiceRequest = Partial<
  Omit<CreateInvoiceRequest, 'customerId' | 'quoteId' | 'clientActionId'>
> & {
  documentContent?: FinanceDocumentContent | null;
  cocDocumentationId?: string | null;
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

/** Prefer stored total; fall back to legacy amount_cents when total_cents was never populated (Xero import gap). */
export function resolveEffectiveInvoiceTotalCents(input: {
  amountCents: number;
  totalCents?: number | null;
}): number {
  const total = input.totalCents ?? 0;
  if (total > 0) return total;
  return input.amountCents > 0 ? input.amountCents : 0;
}

export function resolveEffectiveInvoiceOutstandingCents(input: {
  amountCents: number;
  totalCents?: number | null;
  amountPaidCents: number;
}): number {
  const total = resolveEffectiveInvoiceTotalCents(input);
  if (total <= 0) return 0;
  return Math.max(0, total - input.amountPaidCents);
}

export function displayInvoiceNumber(input: {
  xeroInvoiceNumber?: string | null;
  internalNumber?: string | null;
  invoiceNumber: string;
  numberAuthority?: string | null;
  id?: string | null;
  sourceExternalId?: string | null;
  sourceProvider?: string | null;
}): string {
  return resolveInvoiceDisplayNumberLabel({
    id: input.id,
    invoiceNumber: input.invoiceNumber,
    internalNumber: input.internalNumber,
    xeroInvoiceNumber: input.xeroInvoiceNumber,
    sourceExternalId: input.sourceExternalId,
    sourceProvider: input.sourceProvider,
    numberAuthority: input.numberAuthority,
  });
}

/** Legacy DB column only — finance documents no longer use user-entered titles. */
export function legacyFinanceDocumentTitle(customerName?: string | null): string {
  return customerName?.trim() || '';
}

/**
 * Xero is the only official invoice number authority for customer-facing / operational display.
 * Accepts optional richer fields (Row 87) while remaining backward compatible with
 * `{ xeroInvoiceNumber }` call sites.
 */
export function displayOfficialInvoiceNumber(input: {
  xeroInvoiceNumber?: string | null;
  invoiceNumber?: string | null;
  internalNumber?: string | null;
  id?: string | null;
  xeroInvoiceId?: string | null;
  sourceExternalId?: string | null;
  sourceProvider?: string | null;
  numberAuthority?: string | null;
}): string {
  const resolved = resolveInvoiceDisplayNumberLabel(input);
  // Preserve exact legacy draft string for single-field callers.
  if (
    !input.xeroInvoiceNumber?.trim() &&
    input.invoiceNumber == null &&
    input.internalNumber == null &&
    input.numberAuthority == null &&
    input.sourceProvider == null
  ) {
    return DRAFT_INVOICE_DISPLAY_LABEL;
  }
  return resolved;
}

/**
 * Xero is the only official quote number authority for customer-facing / operational display.
 * Accepts optional richer fields (Row 87) while remaining backward compatible with
 * `{ xeroQuoteNumber }` call sites.
 */
export function displayOfficialQuoteNumber(input: {
  xeroQuoteNumber?: string | null;
  quoteNumber?: string | null;
  id?: string | null;
  xeroQuoteId?: string | null;
  sourceExternalId?: string | null;
  sourceProvider?: string | null;
}): string {
  const resolved = resolveQuoteDisplayNumberLabel(input);
  if (
    !input.xeroQuoteNumber?.trim() &&
    input.quoteNumber == null &&
    input.sourceProvider == null &&
    input.xeroQuoteId == null
  ) {
    return DRAFT_QUOTE_DISPLAY_LABEL;
  }
  return resolved;
}

/** Returns true when a customer name closely matches an existing search result. */
export function findDuplicateCustomerHint(
  name: string,
  results: Array<{
    id: string;
    name: string;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
  }>,
): boolean {
  return findDuplicateCustomersByContact({ name }, results).length > 0;
}

function normaliseCustomerContact(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Finds possible duplicate customers by name, phone or email within tenant search results. */
export function findDuplicateCustomersByContact<
  T extends { id: string; name: string; companyName?: string | null; email?: string | null; phone?: string | null },
>(
  input: { name?: string | null; email?: string | null; phone?: string | null },
  results: readonly T[],
): T[] {
  const name = normaliseCustomerContact(input.name);
  const email = normaliseCustomerContact(input.email);
  const phone = normaliseCustomerContact(input.phone)?.replace(/\s+/g, '');

  return results.filter((row) => {
    const rowName = normaliseCustomerContact(row.companyName || row.name);
    const rowEmail = normaliseCustomerContact(row.email);
    const rowPhone = normaliseCustomerContact(row.phone)?.replace(/\s+/g, '');
    if (name.length >= 2 && (rowName === name || normaliseCustomerContact(row.name) === name)) return true;
    if (email.length >= 3 && rowEmail && rowEmail === email) return true;
    if (phone.length >= 6 && rowPhone && rowPhone === phone) return true;
    return false;
  });
}

const EDITABLE_INVOICE_STATUSES = new Set<InvoiceStatus>(['draft']);

/** Draft invoices can be edited locally until synced from Xero. */
export function canEditInvoice(invoice: {
  status: InvoiceStatus;
  xeroInvoiceNumber?: string | null;
  numberAuthority?: InvoiceNumberAuthority | string | null;
  sourceProvider?: string | null;
}): boolean {
  if (invoice.numberAuthority === 'xero') return false;
  if (invoice.xeroInvoiceNumber?.trim()) return false;
  if (invoice.sourceProvider === 'xero') return false;
  return EDITABLE_INVOICE_STATUSES.has(invoice.status);
}

const EDITABLE_QUOTE_STATUSES = new Set<QuoteStatus>([
  'draft',
  'internal_review',
  'approved_for_sending',
]);

/** Draft quotes can be edited until issued. Row 88: issued/terminal states are not draft-editable. */
export function canEditQuote(quote: { isImmutable: boolean; status: QuoteStatus }): boolean {
  return !quote.isImmutable && EDITABLE_QUOTE_STATUSES.has(quote.status);
}

/** Issuing requires internal approval workflow completion. */
export function canIssueQuote(quote: { isImmutable: boolean; status: QuoteStatus }): boolean {
  return !quote.isImmutable && quote.status === 'approved_for_sending';
}

/** Next approval step in the internal quote workflow, if any. */
export function nextQuoteApprovalAction(
  status: QuoteStatus,
): { label: string; nextStatus: QuoteStatus } | null {
  if (status === 'draft') {
    return { label: 'Submit For Internal Review', nextStatus: 'internal_review' };
  }
  if (status === 'internal_review') {
    return { label: 'Approve For Sending', nextStatus: 'approved_for_sending' };
  }
  return null;
}

/** @deprecated Prefer getAllowedQuoteActions from quote-lifecycle — kept for UI compatibility. */
export function canConvertQuoteToInvoice(quote: { status: QuoteStatus }): boolean {
  return quote.status === 'accepted';
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
