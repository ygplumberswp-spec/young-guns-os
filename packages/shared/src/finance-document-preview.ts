import {
  buildDefaultSections,
  buildLineItem,
  computeDocumentTotals,
  setSectionVisibility,
  updateSection,
  type CocAttachmentState,
  type DocumentLineItem,
  type DocumentPhoto,
  type DocumentSection,
  type DocumentTotals,
} from './document-engine.js';
import { displayOfficialInvoiceNumber, displayOfficialQuoteNumber } from './finance.js';
import {
  normalizeFinanceDocumentAddresses,
  type FinanceDocumentAddressSnapshot,
} from './finance-document-roundtrip.js';
import {
  type FinancePreviewCocInput,
  type FinancePreviewMaintenanceInput,
  type FinancePreviewWarrantyInput,
  shouldHideFinancePreviewPaymentOptions,
  shouldShowFinancePreviewCoc,
  shouldShowFinancePreviewReviewSection,
  shouldShowFinancePreviewWorkCompleted,
  sanitizeFinancePreviewPaymentUrl,
  sanitizeFinancePreviewReviewUrl,
  buildFinancePreviewReviewQrSvg,
} from './finance-document-preview-sections.js';

export type FinanceDocumentPreviewKind = 'quote' | 'invoice';

export type FinanceDocumentPreviewLineInput = {
  id?: string;
  category?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  /** Row 90 — false hides line from customer PDF/preview. */
  customerVisible?: boolean;
};

export type FinanceDocumentPreviewCustomerInput = {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type FinanceDocumentPreviewInput = {
  kind: FinanceDocumentPreviewKind;
  customer?: FinanceDocumentPreviewCustomerInput | null;
  customerReference?: string | null;
  issuedAt?: string | null;
  dueDate?: string | null;
  addresses?: FinanceDocumentAddressSnapshot | null;
  lines: FinanceDocumentPreviewLineInput[];
  /** Row 90 — when set, PDF/preview hides absorbed labour/call-out lines. */
  pricingPresentationMode?: 'FLAT_RATE_INCLUDED' | 'ITEMISED' | null;
  labourIncluded?: boolean | null;
  calloutIncluded?: boolean | null;
  notes?: string | null;
  paymentTerms?: string | null;
  scopeOfWork?: string | null;
  exclusions?: string | null;
  workCompleted?: string | null;
  warranty?: FinancePreviewWarrantyInput | null;
  recommendedMaintenance?: FinancePreviewMaintenanceInput | null;
  coc?: FinancePreviewCocInput | null;
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

export type FinanceDocumentPreviewAttachment = {
  fileName: string;
  mimeType: string;
  caption: string | null;
  dataUrl: string | null;
  role?: 'before' | 'after' | 'additional';
};

export type FinanceDocumentPreviewModel = {
  documentType: FinanceDocumentPreviewKind;
  documentNumber: string;
  downloadFilename: string;
  title: '';
  status: string;
  issuedAt: string | null;
  dueDate: string | null;
  sections: DocumentSection[];
  lineItems: DocumentLineItem[];
  totals: DocumentTotals;
  customer: FinanceDocumentPreviewCustomerInput | null;
  customerReference: string | null;
  documentAddresses: FinanceDocumentAddressSnapshot;
  property: { addressLine: string | null; suburb: string | null; city: string | null };
  job: { reference: string | null; scheduledAt: string | null; technician: string | null } | null;
  vatRateLabel: string;
  hideTitle: true;
  hidePaymentOptions: boolean;
  showReviewSection: boolean;
  paymentUrl: string | null;
  reviewUrl: string | null;
  reviewQrSvg: string | null;
  coc: CocAttachmentState | null;
  attachments?: FinanceDocumentPreviewAttachment[];
};

function dateInputToIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  if (value.includes('T')) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(`${value.trim()}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function previewDocumentNumber(input: FinanceDocumentPreviewInput): string {
  if (input.kind === 'quote') {
    return displayOfficialQuoteNumber({ xeroQuoteNumber: input.xeroQuoteNumber });
  }
  return displayOfficialInvoiceNumber({ xeroInvoiceNumber: input.xeroInvoiceNumber });
}

export function financeDocumentPreviewFilename(kind: FinanceDocumentPreviewKind): string {
  return kind === 'quote' ? 'YGP-Draft-Quote.pdf' : 'YGP-Draft-Invoice.pdf';
}

function isPreviewCustomerFacingLine(
  line: FinanceDocumentPreviewLineInput,
  input: Pick<
    FinanceDocumentPreviewInput,
    'pricingPresentationMode' | 'labourIncluded' | 'calloutIncluded'
  >,
): boolean {
  if (line.customerVisible === false) return false;
  if (input.pricingPresentationMode !== 'FLAT_RATE_INCLUDED') return true;
  const category = (line.category ?? '').toLowerCase();
  if (input.labourIncluded && category === 'labour') return false;
  if (input.calloutIncluded && category === 'travel') return false;
  return true;
}

function buildPreviewLineItems(
  lines: FinanceDocumentPreviewLineInput[],
  input?: Pick<
    FinanceDocumentPreviewInput,
    'pricingPresentationMode' | 'labourIncluded' | 'calloutIncluded'
  >,
): DocumentLineItem[] {
  const usable = lines.filter(
    (line) =>
      line.description.trim() &&
      isPreviewCustomerFacingLine(line, input ?? {}),
  );
  if (usable.length === 0) {
    return [
      buildLineItem(
        {
          id: 'preview-placeholder',
          description: 'Line items pending',
          quantity: 1,
          unitPriceCents: 0,
          vatRateBps: 0,
        },
        0,
      ),
    ];
  }

  return usable.map((line, index) =>
    buildLineItem(
      {
        id: line.id ?? `preview-line-${index}`,
        category: line.category,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatRateBps: line.vatRateBps,
      },
      index,
    ),
  );
}

function applyTextSection(
  sections: DocumentSection[],
  kind: DocumentSection['kind'],
  text: string | null | undefined,
  visible?: boolean,
): DocumentSection[] {
  const trimmed = text?.trim();
  const target = sections.find((section) => section.kind === kind);
  if (!target) return sections;
  if (!trimmed) {
    return setSectionVisibility(sections, target.id, false);
  }
  let next = updateSection(sections, target.id, { payload: { text: trimmed } });
  if (visible !== undefined) {
    next = setSectionVisibility(next, target.id, visible);
  } else {
    next = setSectionVisibility(next, target.id, true);
  }
  return next;
}

function applyWarrantySection(
  sections: DocumentSection[],
  warranty: FinancePreviewWarrantyInput | null | undefined,
): DocumentSection[] {
  const target = sections.find((section) => section.kind === 'warranty');
  if (!target) return sections;
  const text = warranty?.text?.trim();
  if (!text) return setSectionVisibility(sections, target.id, false);
  return setSectionVisibility(
    updateSection(sections, target.id, {
      payload: { text, months: warranty?.months ?? null },
    }),
    target.id,
    true,
  );
}

function applyMaintenanceSection(
  sections: DocumentSection[],
  maintenance: FinancePreviewMaintenanceInput | null | undefined,
): DocumentSection[] {
  const target = sections.find((section) => section.kind === 'recommended_maintenance');
  if (!target) return sections;
  const text = maintenance?.text?.trim() ?? '';
  const items = (maintenance?.items ?? []).filter((item) => (item.label ?? item.description ?? '').trim());
  if (!text && items.length === 0) return setSectionVisibility(sections, target.id, false);
  return setSectionVisibility(
    updateSection(sections, target.id, {
      payload: { text: text || null, items },
    }),
    target.id,
    true,
  );
}

function applyWorkCompletedSection(
  sections: DocumentSection[],
  workCompleted: string | null | undefined,
  visible: boolean,
): DocumentSection[] {
  const target = sections.find((section) => section.kind === 'work_completed');
  if (!target) return sections;
  if (!visible || !workCompleted?.trim()) {
    return setSectionVisibility(sections, target.id, false);
  }
  return setSectionVisibility(
    updateSection(sections, target.id, { payload: { text: workCompleted.trim() } }),
    target.id,
    true,
  );
}

function applyCocSection(
  sections: DocumentSection[],
  coc: FinancePreviewCocInput | null | undefined,
  visible: boolean,
): DocumentSection[] {
  const target = sections.find((section) => section.kind === 'coc_attachment');
  if (!target) return sections;
  if (!visible || !coc || coc.status !== 'attached') {
    return setSectionVisibility(sections, target.id, false);
  }
  return setSectionVisibility(
    updateSection(sections, target.id, {
      payload: {
        fileName: coc.fileName,
        statusLabel: 'Certificate attached',
      },
    }),
    target.id,
    true,
  );
}

function applyContactHelpSection(sections: DocumentSection[]): DocumentSection[] {
  const target = sections.find((section) => section.kind === 'contact_help');
  if (!target) return sections;
  return setSectionVisibility(sections, target.id, true);
}

/** Maps live editor values into the shared document engine preview model. Pure — no persistence. */
export function buildFinanceDocumentPreviewModel(
  input: FinanceDocumentPreviewInput,
): FinanceDocumentPreviewModel {
  const documentType = input.kind;
  const lineItems = buildPreviewLineItems(input.lines, input);
  const totals = computeDocumentTotals({
    lineItems,
    amountPaidCents: input.amountPaidCents ?? 0,
    depositReceivedCents: input.depositReceivedCents ?? 0,
  });
  const vatRateLabel =
    lineItems.every((line) => line.vatRateBps === 0) || totals.vatCents === 0
      ? 'VAT (0%)'
      : 'VAT (15%)';

  let sections = buildDefaultSections(documentType);

  const notes = input.notes?.trim() || null;
  const paymentTerms = input.paymentTerms?.trim() || null;
  const scopeOfWork = input.scopeOfWork?.trim() || null;
  const exclusions = input.exclusions?.trim() || null;

  if (documentType === 'quote') {
    sections = applyTextSection(sections, 'scope_of_work', scopeOfWork ?? notes);
    const termsText = [exclusions, paymentTerms].filter(Boolean).join('\n\n') || null;
    sections = applyTextSection(sections, 'terms_exclusions', termsText);
  } else {
    sections = applyTextSection(sections, 'terms_exclusions', exclusions || paymentTerms || notes);
  }

  sections = applyWorkCompletedSection(
    sections,
    input.workCompleted,
    shouldShowFinancePreviewWorkCompleted(input),
  );
  sections = applyWarrantySection(sections, input.warranty);
  sections = applyMaintenanceSection(sections, input.recommendedMaintenance);
  sections = applyCocSection(sections, input.coc, shouldShowFinancePreviewCoc(documentType, input.coc));
  sections = applyContactHelpSection(sections);

  const hidePaymentOptions = shouldHideFinancePreviewPaymentOptions(input);
  const paymentSection = sections.find((section) => section.kind === 'payment_options');
  if (paymentSection) {
    sections = setSectionVisibility(sections, paymentSection.id, !hidePaymentOptions);
  }

  const showReviewSection = shouldShowFinancePreviewReviewSection(input);
  const reviewSection = sections.find((section) => section.kind === 'review_request');
  if (reviewSection) {
    sections = setSectionVisibility(sections, reviewSection.id, showReviewSection);
  }

  const documentAddresses = normalizeFinanceDocumentAddresses(input.addresses ?? undefined);
  const site = documentAddresses.siteAddress?.trim() || null;
  const reviewUrl = sanitizeFinancePreviewReviewUrl(input.reviewUrl);

  return {
    documentType,
    documentNumber: previewDocumentNumber(input),
    downloadFilename: financeDocumentPreviewFilename(documentType),
    title: '',
    status: input.status?.trim() || 'draft',
    issuedAt: dateInputToIso(input.issuedAt),
    dueDate: dateInputToIso(input.dueDate),
    sections,
    lineItems,
    totals,
    customer: input.customer?.name?.trim()
      ? {
          name: input.customer.name.trim(),
          contactPerson: input.customer.contactPerson ?? null,
          email: input.customer.email ?? null,
          phone: input.customer.phone ?? null,
        }
      : null,
    customerReference: input.customerReference?.trim() || null,
    documentAddresses,
    property: {
      addressLine: site,
      suburb: null,
      city: null,
    },
    job:
      input.jobReference?.trim() || input.jobTechnician?.trim() || input.jobScheduledAt
        ? {
            reference: input.jobReference?.trim() || null,
            scheduledAt: dateInputToIso(input.jobScheduledAt),
            technician: input.jobTechnician?.trim() || null,
          }
        : null,
    vatRateLabel,
    hideTitle: true,
    hidePaymentOptions,
    showReviewSection,
    paymentUrl: sanitizeFinancePreviewPaymentUrl(input.paymentUrl),
    reviewUrl,
    reviewQrSvg: buildFinancePreviewReviewQrSvg(reviewUrl),
    coc: input.coc?.status === 'attached' ? input.coc : null,
  };
}
