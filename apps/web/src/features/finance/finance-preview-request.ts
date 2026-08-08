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
import {
  editorStateToDocumentContent,
  type FinanceDocumentSectionsEditorState,
} from './finance-document-sections-state';

export type FinanceEditorPreviewContext = {
  kind: FinanceDocumentPreviewKind;
  quoteId?: string | null;
  invoiceId?: string | null;
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
  sections?: FinanceDocumentSectionsEditorState;
  cocDocumentationId?: string | null;
  xeroQuoteNumber?: string | null;
  xeroInvoiceNumber?: string | null;
  jobReference?: string | null;
  jobTechnician?: string | null;
  jobScheduledAt?: string | null;
  status?: string | null;
  showPaymentDetails?: boolean | null;
  amountPaidCents?: number | null;
  depositReceivedCents?: number | null;
  photos?: DocumentPhoto[];
  /** Row 90 */
  pricingPresentationMode?: 'FLAT_RATE_INCLUDED' | 'ITEMISED' | null;
  labourIncluded?: boolean | null;
  calloutIncluded?: boolean | null;
};

export function buildFinanceEditorPreviewInput(
  context: FinanceEditorPreviewContext,
): FinanceDocumentPreviewInput & {
  quoteId?: string | null;
  invoiceId?: string | null;
  cocDocumentationId?: string | null;
} {
  const parsedLines = parseEditorLinesForPreview(context.lines, {
    priceMode: context.priceMode,
    vatMode: context.vatMode,
  });
  const customerName =
    context.customer?.companyName?.trim() ||
    context.customer?.name?.trim() ||
    context.customerName?.trim() ||
    '';

  const sections = context.sections;
  const documentContent = sections ? editorStateToDocumentContent(sections, context.kind) : {};

  return {
    kind: context.kind,
    quoteId: context.quoteId ?? null,
    invoiceId: context.invoiceId ?? null,
    cocDocumentationId: context.cocDocumentationId ?? null,
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
    pricingPresentationMode: context.pricingPresentationMode ?? null,
    labourIncluded: context.labourIncluded ?? null,
    calloutIncluded: context.calloutIncluded ?? null,
    notes: context.notes.trim() || null,
    paymentTerms: sections?.paymentTerms.trim() || null,
    scopeOfWork: sections?.scopeOfWork.trim() || null,
    exclusions: sections?.exclusions.trim() || null,
    workCompleted: documentContent.workCompleted ?? null,
    warranty: documentContent.warranty ?? null,
    recommendedMaintenance: documentContent.recommendedMaintenance ?? null,
    xeroQuoteNumber: context.xeroQuoteNumber ?? null,
    xeroInvoiceNumber: context.xeroInvoiceNumber ?? null,
    jobReference: context.jobReference?.trim() || null,
    jobTechnician: context.jobTechnician?.trim() || null,
    jobScheduledAt: context.jobScheduledAt || null,
    status: context.status ?? 'draft',
    showPaymentDetails: context.showPaymentDetails ?? null,
    amountPaidCents: context.amountPaidCents ?? null,
    depositReceivedCents: context.depositReceivedCents ?? null,
    photos: context.photos ?? [],
  };
}
