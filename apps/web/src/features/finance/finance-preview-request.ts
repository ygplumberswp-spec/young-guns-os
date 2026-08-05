import type {
  FinanceCustomerSearchResult,
  FinanceDocumentPreviewInput,
  FinanceDocumentPreviewKind,
  DocumentPhoto,
} from '@titan/shared';
import {
  addressesToApiPayload,
  parseEditorLinesForPreview,
  type FinanceDocumentAddresses,
  type FinanceDocumentPriceMode,
  type FinanceDocumentVatMode,
  type FinanceEditorLine,
} from './finance-editor-utils';

export type FinanceEditorPreviewContext = {
  kind: FinanceDocumentPreviewKind;
  customer: FinanceCustomerSearchResult | null;
  customerName?: string | null;
  customerReference: string;
  issuedAt: string;
  dueDate: string;
  addresses: FinanceDocumentAddresses;
  lines: FinanceEditorLine[];
  vatMode: FinanceDocumentVatMode;
  priceMode: FinanceDocumentPriceMode;
  notes: string;
  paymentTerms?: string | null;
  scopeOfWork?: string | null;
  exclusions?: string | null;
  workCompleted?: string | null;
  warranty?: FinanceDocumentPreviewInput['warranty'];
  recommendedMaintenance?: FinanceDocumentPreviewInput['recommendedMaintenance'];
  coc?: FinanceDocumentPreviewInput['coc'];
  xeroQuoteNumber?: string | null;
  xeroInvoiceNumber?: string | null;
  jobReference?: string | null;
  jobTechnician?: string | null;
  jobScheduledAt?: string | null;
  status?: string | null;
  showPaymentDetails?: boolean | null;
  paymentUrl?: string | null;
  reviewUrl?: string | null;
  amountPaidCents?: number | null;
  depositReceivedCents?: number | null;
  photos?: DocumentPhoto[];
};

export function buildFinanceEditorPreviewInput(
  context: FinanceEditorPreviewContext,
): FinanceDocumentPreviewInput {
  const parsedLines = parseEditorLinesForPreview(context.lines, {
    priceMode: context.priceMode,
    vatMode: context.vatMode,
  });
  const customerName =
    context.customer?.companyName?.trim() ||
    context.customer?.name?.trim() ||
    context.customerName?.trim() ||
    '';

  return {
    kind: context.kind,
    customer: customerName
      ? {
          name: customerName,
          contactPerson: context.customer?.name?.trim() || null,
          email: context.customer?.email ?? null,
          phone: context.customer?.phone ?? null,
        }
      : null,
    customerReference: context.customerReference.trim() || null,
    issuedAt: context.issuedAt || null,
    dueDate: context.dueDate || null,
    addresses: addressesToApiPayload(context.addresses),
    lines: parsedLines.map((line, index) => ({
      id: `preview-${index}`,
      category: line.category,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatRateBps: line.vatRateBps,
    })),
    notes: context.notes.trim() || null,
    paymentTerms: context.paymentTerms?.trim() || null,
    scopeOfWork: context.scopeOfWork?.trim() || null,
    exclusions: context.exclusions?.trim() || null,
    workCompleted: context.workCompleted?.trim() || null,
    warranty: context.warranty ?? null,
    recommendedMaintenance: context.recommendedMaintenance ?? null,
    coc: context.coc ?? null,
    xeroQuoteNumber: context.xeroQuoteNumber ?? null,
    xeroInvoiceNumber: context.xeroInvoiceNumber ?? null,
    jobReference: context.jobReference?.trim() || null,
    jobTechnician: context.jobTechnician?.trim() || null,
    jobScheduledAt: context.jobScheduledAt || null,
    status: context.status ?? 'draft',
    showPaymentDetails: context.showPaymentDetails ?? null,
    paymentUrl: context.paymentUrl ?? null,
    reviewUrl: context.reviewUrl ?? null,
    amountPaidCents: context.amountPaidCents ?? null,
    depositReceivedCents: context.depositReceivedCents ?? null,
    photos: context.photos ?? [],
  };
}
