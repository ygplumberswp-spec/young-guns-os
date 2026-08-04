import {
  buildDefaultSections,
  buildLineItem,
  computeDocumentTotals,
  setSectionVisibility,
  updateSection,
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

export type FinanceDocumentPreviewKind = 'quote' | 'invoice';

export type FinanceDocumentPreviewLineInput = {
  id?: string;
  category?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
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
  notes?: string | null;
  paymentTerms?: string | null;
  scopeOfWork?: string | null;
  exclusions?: string | null;
  xeroQuoteNumber?: string | null;
  xeroInvoiceNumber?: string | null;
  jobReference?: string | null;
  status?: string | null;
  photos?: DocumentPhoto[];
};

export type FinanceDocumentPreviewAttachment = {
  fileName: string;
  mimeType: string;
  caption: string | null;
  dataUrl: string;
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
  hidePaymentOptions: true;
  attachments?: FinanceDocumentPreviewAttachment[];
};

const PREVIEW_HIDDEN_SECTIONS = new Set([
  'payment_options',
  'status_panel',
  'review_request',
  'before_after_photos',
  'image_gallery',
  'coc_attachment',
  'warranty',
  'recommended_maintenance',
  'work_completed',
  'job_details',
]);

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

function buildPreviewLineItems(lines: FinanceDocumentPreviewLineInput[]): DocumentLineItem[] {
  const usable = lines.filter((line) => line.description.trim());
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
): DocumentSection[] {
  const trimmed = text?.trim();
  if (!trimmed) return sections;
  const target = sections.find((section) => section.kind === kind);
  if (!target) return sections;
  return updateSection(sections, target.id, { payload: { text: trimmed } });
}

/** Maps live editor values into the shared document engine preview model. Pure — no persistence. */
export function buildFinanceDocumentPreviewModel(
  input: FinanceDocumentPreviewInput,
): FinanceDocumentPreviewModel {
  const documentType = input.kind;
  const lineItems = buildPreviewLineItems(input.lines);
  const totals = computeDocumentTotals({ lineItems });
  const vatRateLabel =
    lineItems.every((line) => line.vatRateBps === 0) || totals.vatCents === 0
      ? 'VAT (0%)'
      : 'VAT (15%)';

  let sections = buildDefaultSections(documentType);
  for (const section of sections) {
    if (PREVIEW_HIDDEN_SECTIONS.has(section.kind)) {
      sections = setSectionVisibility(sections, section.id, false);
    }
  }

  if (input.jobReference?.trim()) {
    const jobSection = sections.find((section) => section.kind === 'job_details');
    if (jobSection) {
      sections = setSectionVisibility(sections, jobSection.id, true);
      sections = updateSection(sections, jobSection.id, {
        payload: { reference: input.jobReference.trim() },
      });
    }
  }

  const notes = input.notes?.trim() || null;
  const paymentTerms = input.paymentTerms?.trim() || null;
  const scopeOfWork = input.scopeOfWork?.trim() || notes;
  const exclusions =
    input.exclusions?.trim() ||
    [paymentTerms, documentType === 'invoice' ? notes : null].filter(Boolean).join('\n\n') ||
    null;

  if (documentType === 'quote') {
    sections = applyTextSection(sections, 'scope_of_work', scopeOfWork);
    sections = applyTextSection(sections, 'terms_exclusions', exclusions);
  } else {
    sections = applyTextSection(sections, 'terms_exclusions', exclusions || notes);
  }

  const documentAddresses = normalizeFinanceDocumentAddresses(input.addresses ?? undefined);
  const site = documentAddresses.siteAddress?.trim() || null;

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
    job: input.jobReference?.trim()
      ? { reference: input.jobReference.trim(), scheduledAt: null, technician: null }
      : null,
    vatRateLabel,
    hideTitle: true,
    hidePaymentOptions: true,
  };
}
