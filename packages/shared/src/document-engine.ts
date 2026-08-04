/**
 * Shared TITAN document engine.
 *
 * Invoices, quotes and reports render from one model and one token set so the
 * three surfaces cannot drift apart visually or structurally. Everything here is
 * pure: the API composes documents from real invoice/quote/job rows and the web
 * app renders them, but neither owns the layout rules.
 */

import { calculateLineAmounts } from './finance.js';

export type TitanDocumentType = 'invoice' | 'quote' | 'report';

export const TITAN_DOCUMENT_TYPES: readonly TitanDocumentType[] = ['invoice', 'quote', 'report'];

/**
 * Reports share one engine and one look; the kind selects the section set.
 * Service, inspection and maintenance are the three Owner-approved kinds.
 */
export type TitanReportKind = 'service' | 'inspection' | 'maintenance';

export const TITAN_REPORT_KINDS: readonly TitanReportKind[] = [
  'service',
  'inspection',
  'maintenance',
];

/** The five documents the engine produces. */
export type TitanDocumentVariant =
  | { type: 'invoice'; reportKind?: null }
  | { type: 'quote'; reportKind?: null }
  | { type: 'report'; reportKind: TitanReportKind };

export const TITAN_DOCUMENT_VARIANTS: readonly TitanDocumentVariant[] = [
  { type: 'quote' },
  { type: 'invoice' },
  { type: 'report', reportKind: 'service' },
  { type: 'report', reportKind: 'inspection' },
  { type: 'report', reportKind: 'maintenance' },
];

export function documentVariantLabel(variant: TitanDocumentVariant): string {
  if (variant.type === 'invoice') return 'Invoice';
  if (variant.type === 'quote') return 'Quote';
  switch (variant.reportKind) {
    case 'service':
      return 'Service Report';
    case 'inspection':
      return 'Inspection Report';
    case 'maintenance':
      return 'Maintenance Report';
  }
}

/**
 * Draft is freely editable; issued documents are locked and only change through
 * a new version, mirroring how quotes already use `isImmutable`.
 */
export type TitanDocumentStatus = 'draft' | 'in_review' | 'issued' | 'superseded' | 'cancelled';

export type DocumentSectionKind =
  | 'branded_header'
  | 'document_meta'
  | 'customer_property'
  | 'job_details'
  | 'status_panel'
  | 'work_completed'
  | 'line_items'
  | 'totals'
  | 'scope_of_work'
  | 'terms_exclusions'
  | 'warranty'
  | 'before_after_photos'
  | 'image_gallery'
  | 'coc_attachment'
  | 'attachments'
  | 'payment_options'
  | 'recommended_maintenance'
  | 'contact_help'
  | 'review_request'
  | 'branded_footer'
  | 'executive_summary'
  | 'service_summary'
  | 'work_completed_checklist'
  | 'inspection_findings'
  | 'work_performed'
  | 'parts_materials'
  | 'recommendations'
  | 'compliance'
  | 'sign_off'
  | 'custom';

export const DOCUMENT_SECTION_KINDS: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'work_completed',
  'line_items',
  'totals',
  'scope_of_work',
  'terms_exclusions',
  'warranty',
  'before_after_photos',
  'image_gallery',
  'coc_attachment',
  'attachments',
  'payment_options',
  'recommended_maintenance',
  'contact_help',
  'review_request',
  'branded_footer',
  'executive_summary',
  'service_summary',
  'work_completed_checklist',
  'inspection_findings',
  'work_performed',
  'parts_materials',
  'recommendations',
  'compliance',
  'sign_off',
  'custom',
];

/** Sections that carry the brand frame and cannot be removed from any document. */
export const REQUIRED_DOCUMENT_SECTION_KINDS: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'branded_footer',
];

/** Sections whose content is financial and therefore Owner/Office-only to edit. */
export const FINANCIAL_SECTION_KINDS: readonly DocumentSectionKind[] = [
  'line_items',
  'totals',
  'payment_options',
  'status_panel',
];

/** Sections a technician may contribute to on a job they are assigned. */
export const TECHNICIAN_EDITABLE_SECTION_KINDS: readonly DocumentSectionKind[] = [
  'work_completed',
  'work_completed_checklist',
  'before_after_photos',
  'image_gallery',
  'inspection_findings',
  'work_performed',
  'service_summary',
  'parts_materials',
];

/**
 * Sections that would put money, VAT, banking or a payment invite on a page.
 * Reports are operational documents and must never carry any of them.
 */
export const REPORT_FORBIDDEN_SECTION_KINDS: readonly DocumentSectionKind[] = [
  'line_items',
  'totals',
  'payment_options',
];

/** Payload keys that would leak pricing into a report section. */
const MONEY_PAYLOAD_KEYS: readonly string[] = [
  'unitPriceCents',
  'lineTotalCents',
  'lineSubtotalCents',
  'lineVatCents',
  'vatCents',
  'subtotalCents',
  'totalCents',
  'amountCents',
  'outstandingCents',
  'depositReceivedCents',
  'price',
  'unitPrice',
  'total',
  'vat',
  'amount',
  'paymentUrl',
  'paymentQrSvg',
  'bankAccountNumber',
  'accountNumber',
  'branchCode',
];

export type DocumentSection = {
  id: string;
  kind: DocumentSectionKind;
  /** Owner-editable heading. Falls back to the kind's default label when blank. */
  title: string | null;
  position: number;
  visible: boolean;
  /** Section-specific content. Never contains sample or placeholder data. */
  payload: Record<string, unknown>;
};

export type DocumentLineItem = {
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

/**
 * Owner-approved invoice totals: subtotal, VAT, total, deposit and balance.
 * There is deliberately no discount row — invoices carry no discount field, so
 * showing one would be inventing a number.
 */
export type DocumentTotals = {
  subtotalCents: number;
  vatCents: number;
  depositReceivedCents: number;
  totalCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  currency: string;
};

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

/**
 * The approved Young Guns invoice palette: near-black navy panels, chrome
 * hairline borders, YGP blue accents, white body copy.
 */
export const DOCUMENT_COLOR_TOKENS = {
  pageBackground: '#04070D',
  panelBackground: '#0A0F18',
  panelBackgroundRaised: '#0E1522',
  panelBorder: '#233043',
  chromeHighlight: '#3C4C63',
  brandBlue: '#1F7AEC',
  brandBlueBright: '#3E9BFF',
  brandBlueDeep: '#0E4FA8',
  bannerFrom: '#1668D6',
  bannerTo: '#2E88F0',
  textPrimary: '#FFFFFF',
  textBody: '#E6EDF6',
  textMuted: '#A4B3C6',
  labelBlue: '#54A6FF',
  positive: '#2FBF6B',
  warning: '#F2B33D',
  danger: '#E5484D',
} as const;

/**
 * Screen font sizes in px. These are floors set by the readability correction —
 * `validateDocumentTypography` fails the build rather than letting a future
 * change shrink the document to force one page.
 */
export type DocumentTypographyTokens = {
  body: number;
  important: number;
  label: number;
  sectionHeading: number;
  documentTitle: number;
  totalsEmphasis: number;
  lineHeightBody: number;
  lineHeightTight: number;
  lineHeightRelaxed: number;
};

export const DOCUMENT_TYPOGRAPHY = {
  body: 15,
  /** Customer, job and payment facts a reader must not squint at. */
  important: 16,
  label: 14,
  sectionHeading: 18,
  documentTitle: 30,
  totalsEmphasis: 20,
  lineHeightBody: 1.45,
  lineHeightTight: 1.35,
  lineHeightRelaxed: 1.5,
} as const;

export const DOCUMENT_TYPOGRAPHY_FLOORS = {
  bodyPx: 15,
  importantPx: 16,
  labelPx: 14,
  sectionHeadingMinPx: 17,
  sectionHeadingMaxPx: 20,
  lineHeightMin: 1.35,
  lineHeightMax: 1.5,
  /** Print equivalent of the 15px screen body floor. */
  printBodyMinPt: 10.5,
} as const;

export type DocumentPrintTokens = {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  bodyPt: number;
  importantPt: number;
  labelPt: number;
  sectionHeadingPt: number;
  qrSizeMm: number;
};

/** Print metrics for the A4 portrait stylesheet. */
export const DOCUMENT_PRINT_TOKENS = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 10,
  bodyPt: 10.5,
  importantPt: 11.5,
  labelPt: 9.5,
  sectionHeadingPt: 12.5,
  qrSizeMm: 30,
} as const;

export type TypographyViolation = { token: string; reason: string };

/**
 * Guards the readability floors. Returns every violation instead of the first so
 * a reviewer sees the whole picture.
 */
export function validateDocumentTypography(
  typography: DocumentTypographyTokens = DOCUMENT_TYPOGRAPHY,
  print: DocumentPrintTokens = DOCUMENT_PRINT_TOKENS,
): TypographyViolation[] {
  const violations: TypographyViolation[] = [];
  const floors = DOCUMENT_TYPOGRAPHY_FLOORS;

  if (typography.body < floors.bodyPx) {
    violations.push({ token: 'body', reason: `must be at least ${floors.bodyPx}px` });
  }
  if (typography.important < floors.importantPx) {
    violations.push({ token: 'important', reason: `must be at least ${floors.importantPx}px` });
  }
  if (typography.label < floors.labelPx) {
    violations.push({ token: 'label', reason: `must be at least ${floors.labelPx}px` });
  }
  if (
    typography.sectionHeading < floors.sectionHeadingMinPx ||
    typography.sectionHeading > floors.sectionHeadingMaxPx
  ) {
    violations.push({
      token: 'sectionHeading',
      reason: `must be between ${floors.sectionHeadingMinPx}px and ${floors.sectionHeadingMaxPx}px`,
    });
  }
  if (typography.totalsEmphasis < typography.body) {
    violations.push({ token: 'totalsEmphasis', reason: 'totals must not be smaller than body' });
  }

  for (const key of ['lineHeightBody', 'lineHeightTight', 'lineHeightRelaxed'] as const) {
    const value = typography[key];
    if (value < floors.lineHeightMin || value > floors.lineHeightMax) {
      violations.push({
        token: key,
        reason: `must be between ${floors.lineHeightMin} and ${floors.lineHeightMax}`,
      });
    }
  }

  if (print.bodyPt < floors.printBodyMinPt) {
    violations.push({ token: 'print.bodyPt', reason: `must be at least ${floors.printBodyMinPt}pt` });
  }
  if (print.qrSizeMm < 30) {
    violations.push({ token: 'print.qrSizeMm', reason: 'payment QR must be at least 30mm' });
  }
  if (print.pageWidthMm !== 210 || print.pageHeightMm !== 297) {
    violations.push({ token: 'print.page', reason: 'document pages must be A4 portrait' });
  }

  return violations;
}

/**
 * Relative luminance per WCAG 2.1, used to prove the palette clears AA contrast
 * rather than asserting it in a comment.
 */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Expected a 6-digit hex colour, received "${hex}"`);
  }
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Company facts
// ---------------------------------------------------------------------------

/** Owner-confirmed company contact block. */
export const YOUNG_GUNS_CONTACT = {
  tradingName: 'Young Guns Plumbing',
  tagline: 'Renovations, Maintenance & Construction',
  phone: '066 234 6301',
  email: 'ygplumberswp@gmail.com',
  website: 'younggunsplumbingcpt.co.za',
  location: 'Cape Town, Western Cape',
} as const;

/**
 * Owner-confirmed bank details. EFT and the Yoco link are the only payment
 * options — deliberately no SnapScan or Zapper.
 */
export const YOUNG_GUNS_BANK_DETAILS = {
  accountName: 'Young Guns Plumbing',
  bank: 'First National Bank',
  accountNumber: '62847540459',
  branchCode: '250655',
  accountType: 'Cheque',
  referenceInstruction: 'Use the invoice number as your payment reference',
} as const;

export const SUPPORTED_PAYMENT_METHOD_LABELS: readonly string[] = [
  'EFT / Bank Transfer',
  'Yoco Payment Link',
];

// ---------------------------------------------------------------------------
// Section defaults
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<DocumentSectionKind, string> = {
  branded_header: 'Header',
  document_meta: 'Document Details',
  customer_property: 'Billed To',
  job_details: 'Job Details',
  status_panel: 'Status',
  work_completed: 'Work Completed',
  line_items: 'Line Items',
  totals: 'Totals',
  scope_of_work: 'Scope of Work',
  terms_exclusions: 'Terms & Exclusions',
  warranty: 'Workmanship Warranty',
  before_after_photos: 'Before & After',
  image_gallery: 'Photos',
  coc_attachment: 'Certificate of Compliance',
  attachments: 'Attachments',
  payment_options: 'Payment Options',
  recommended_maintenance: 'Recommended Maintenance',
  contact_help: 'Need Assistance?',
  review_request: 'We Appreciate Your Support',
  branded_footer: 'Footer',
  executive_summary: 'Executive Summary',
  service_summary: 'Service Summary',
  work_completed_checklist: 'Work Completed',
  inspection_findings: 'Inspection Findings',
  work_performed: 'Work Performed',
  parts_materials: 'Parts & Materials Used',
  recommendations: 'Recommendations',
  compliance: 'Compliance',
  sign_off: 'Client Sign-Off',
  custom: 'Custom Section',
};

export function documentSectionLabel(kind: DocumentSectionKind): string {
  return SECTION_LABELS[kind];
}

/** Section order matching the approved invoice layout. */
const INVOICE_SECTION_ORDER: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'work_completed',
  'line_items',
  'totals',
  'warranty',
  'before_after_photos',
  'coc_attachment',
  'payment_options',
  'recommended_maintenance',
  'contact_help',
  'review_request',
  'branded_footer',
];

const QUOTE_SECTION_ORDER: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'scope_of_work',
  'line_items',
  'totals',
  'image_gallery',
  'terms_exclusions',
  'warranty',
  'contact_help',
  'branded_footer',
];

/** The approved Service Report structure. */
const SERVICE_REPORT_SECTION_ORDER: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'service_summary',
  'work_completed_checklist',
  'inspection_findings',
  'before_after_photos',
  'image_gallery',
  'coc_attachment',
  'parts_materials',
  'recommended_maintenance',
  'warranty',
  'sign_off',
  'contact_help',
  'review_request',
  'branded_footer',
];

/** Inspection reports lead with findings and compliance rather than work done. */
const INSPECTION_REPORT_SECTION_ORDER: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'executive_summary',
  'inspection_findings',
  'image_gallery',
  'compliance',
  'coc_attachment',
  'recommendations',
  'warranty',
  'sign_off',
  'contact_help',
  'review_request',
  'branded_footer',
];

/** Maintenance reports centre on the checklist performed and the next service. */
const MAINTENANCE_REPORT_SECTION_ORDER: readonly DocumentSectionKind[] = [
  'branded_header',
  'document_meta',
  'customer_property',
  'job_details',
  'status_panel',
  'service_summary',
  'work_completed_checklist',
  'before_after_photos',
  'image_gallery',
  'coc_attachment',
  'parts_materials',
  'recommended_maintenance',
  'warranty',
  'sign_off',
  'contact_help',
  'review_request',
  'branded_footer',
];

export function defaultSectionKindsFor(
  type: TitanDocumentType,
  reportKind: TitanReportKind | null = null,
): readonly DocumentSectionKind[] {
  switch (type) {
    case 'invoice':
      return INVOICE_SECTION_ORDER;
    case 'quote':
      return QUOTE_SECTION_ORDER;
    case 'report':
      switch (reportKind ?? 'service') {
        case 'inspection':
          return INSPECTION_REPORT_SECTION_ORDER;
        case 'maintenance':
          return MAINTENANCE_REPORT_SECTION_ORDER;
        case 'service':
        default:
          return SERVICE_REPORT_SECTION_ORDER;
      }
  }
}

/**
 * Builds the default section list for a document. Payloads start empty: real
 * content is filled from real records, never seeded with examples.
 */
export function buildDefaultSections(
  type: TitanDocumentType,
  reportKind: TitanReportKind | null = null,
): DocumentSection[] {
  const prefix = type === 'report' ? `report-${reportKind ?? 'service'}` : type;
  return defaultSectionKindsFor(type, reportKind).map((kind, index) => ({
    id: `${prefix}-${kind}`,
    kind,
    title: null,
    position: index,
    visible: true,
    payload: {},
  }));
}

export type ReportContentViolation = { sectionId: string; kind: DocumentSectionKind; reason: string };

/**
 * Proves a report carries no pricing, VAT, banking or payment content. Called
 * before a report is saved or issued, so the ban is enforced rather than assumed.
 */
export function findReportFinancialContent(
  sections: readonly DocumentSection[],
): ReportContentViolation[] {
  const violations: ReportContentViolation[] = [];

  for (const section of sections) {
    if (REPORT_FORBIDDEN_SECTION_KINDS.includes(section.kind)) {
      violations.push({
        sectionId: section.id,
        kind: section.kind,
        reason: `${documentSectionLabel(section.kind)} may not appear on a report`,
      });
      continue;
    }
    for (const key of collectPayloadKeys(section.payload)) {
      if (MONEY_PAYLOAD_KEYS.includes(key)) {
        violations.push({
          sectionId: section.id,
          kind: section.kind,
          reason: `Report section carries financial field "${key}"`,
        });
      }
    }
  }

  return violations;
}

export function assertReportHasNoFinancialContent(sections: readonly DocumentSection[]): void {
  const violations = findReportFinancialContent(sections);
  if (violations.length > 0) {
    throw new DocumentEngineError(
      'REPORT_FINANCIAL_CONTENT',
      `Reports may not contain pricing, VAT, banking or payment content: ${violations
        .map((violation) => violation.reason)
        .join('; ')}`,
    );
  }
}

function collectPayloadKeys(value: unknown, depth = 0): string[] {
  if (depth > 6 || !value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectPayloadKeys(entry, depth + 1));
  }
  const keys: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    keys.push(key);
    keys.push(...collectPayloadKeys(entry, depth + 1));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Section editing (pure)
// ---------------------------------------------------------------------------

export class DocumentEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentEngineError';
  }
}

/**
 * Sorts by the stored position, then renumbers to a dense 0..n-1 sequence.
 * Use this to clean up sparse input, not after an in-place reorder.
 */
export function normaliseSectionPositions(sections: readonly DocumentSection[]): DocumentSection[] {
  return renumberByOrder([...sections].sort((a, b) => a.position - b.position));
}

/**
 * Renumbers positions from array order. Reorders must use this rather than
 * `normaliseSectionPositions`, whose sort would undo the move.
 */
function renumberByOrder(sections: readonly DocumentSection[]): DocumentSection[] {
  return sections.map((section, index) => ({ ...section, position: index }));
}

export function addSection(
  sections: readonly DocumentSection[],
  section: Omit<DocumentSection, 'position'>,
  atPosition?: number,
): DocumentSection[] {
  if (sections.some((existing) => existing.id === section.id)) {
    throw new DocumentEngineError('DUPLICATE_SECTION', `Section "${section.id}" already exists`);
  }
  const ordered = normaliseSectionPositions(sections);
  const index = atPosition === undefined ? ordered.length : clampIndex(atPosition, ordered.length);
  const next = [...ordered];
  next.splice(index, 0, { ...section, position: index });
  return renumberByOrder(next);
}

export function removeSection(
  sections: readonly DocumentSection[],
  sectionId: string,
): DocumentSection[] {
  const target = sections.find((section) => section.id === sectionId);
  if (!target) {
    throw new DocumentEngineError('SECTION_NOT_FOUND', `Section "${sectionId}" not found`);
  }
  if (REQUIRED_DOCUMENT_SECTION_KINDS.includes(target.kind)) {
    throw new DocumentEngineError(
      'SECTION_REQUIRED',
      `${documentSectionLabel(target.kind)} cannot be removed from a document`,
    );
  }
  return renumberByOrder(
    normaliseSectionPositions(sections).filter((section) => section.id !== sectionId),
  );
}

export function moveSection(
  sections: readonly DocumentSection[],
  sectionId: string,
  toPosition: number,
): DocumentSection[] {
  const ordered = normaliseSectionPositions(sections);
  const from = ordered.findIndex((section) => section.id === sectionId);
  if (from === -1) {
    throw new DocumentEngineError('SECTION_NOT_FOUND', `Section "${sectionId}" not found`);
  }
  const to = clampIndex(toPosition, ordered.length - 1);
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return renumberByOrder(next);
}

export function setSectionVisibility(
  sections: readonly DocumentSection[],
  sectionId: string,
  visible: boolean,
): DocumentSection[] {
  const target = sections.find((section) => section.id === sectionId);
  if (!target) {
    throw new DocumentEngineError('SECTION_NOT_FOUND', `Section "${sectionId}" not found`);
  }
  if (!visible && REQUIRED_DOCUMENT_SECTION_KINDS.includes(target.kind)) {
    throw new DocumentEngineError(
      'SECTION_REQUIRED',
      `${documentSectionLabel(target.kind)} cannot be hidden`,
    );
  }
  return sections.map((section) =>
    section.id === sectionId ? { ...section, visible } : section,
  );
}

export function updateSection(
  sections: readonly DocumentSection[],
  sectionId: string,
  patch: Partial<Pick<DocumentSection, 'title' | 'payload'>>,
): DocumentSection[] {
  const target = sections.find((section) => section.id === sectionId);
  if (!target) {
    throw new DocumentEngineError('SECTION_NOT_FOUND', `Section "${sectionId}" not found`);
  }
  return sections.map((section) =>
    section.id === sectionId
      ? {
          ...section,
          title: patch.title === undefined ? section.title : normaliseTitle(patch.title),
          payload: patch.payload === undefined ? section.payload : patch.payload,
        }
      : section,
  );
}

function normaliseTitle(title: string | null): string | null {
  const trimmed = title?.trim();
  return trimmed ? trimmed : null;
}

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), Math.max(max, 0));
}

// ---------------------------------------------------------------------------
// Line items and totals (pure)
// ---------------------------------------------------------------------------

export function reorderLineItems(
  items: readonly DocumentLineItem[],
  itemId: string,
  toPosition: number,
): DocumentLineItem[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((item) => item.id === itemId);
  if (from === -1) {
    throw new DocumentEngineError('LINE_ITEM_NOT_FOUND', `Line item "${itemId}" not found`);
  }
  const to = clampIndex(toPosition, ordered.length - 1);
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.map((item, index) => ({ ...item, position: index }));
}

export function removeLineItem(
  items: readonly DocumentLineItem[],
  itemId: string,
): DocumentLineItem[] {
  if (!items.some((item) => item.id === itemId)) {
    throw new DocumentEngineError('LINE_ITEM_NOT_FOUND', `Line item "${itemId}" not found`);
  }
  return items
    .filter((item) => item.id !== itemId)
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index }));
}

export type DocumentLineItemInput = {
  id: string;
  category?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps?: number;
};

/** Recomputes a line's money fields with the shared BOQ/quote arithmetic. */
export function buildLineItem(input: DocumentLineItemInput, position: number): DocumentLineItem {
  const description = input.description.trim();
  if (!description) {
    throw new DocumentEngineError('VALIDATION_ERROR', 'Line item description is required');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new DocumentEngineError('VALIDATION_ERROR', 'Line item quantity must be greater than zero');
  }
  if (!Number.isInteger(input.unitPriceCents)) {
    throw new DocumentEngineError('VALIDATION_ERROR', 'Unit price must be an integer number of cents');
  }

  const vatRateBps = input.vatRateBps ?? 1500;
  const amounts = calculateLineAmounts({
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    vatRateBps,
  });

  return {
    id: input.id,
    position,
    category: input.category?.trim() || 'other',
    description,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    vatRateBps,
    lineSubtotalCents: amounts.lineSubtotalCents,
    lineVatCents: amounts.lineVatCents,
    lineTotalCents: amounts.lineTotalCents,
  };
}

export type ComputeTotalsInput = {
  lineItems: readonly DocumentLineItem[];
  depositReceivedCents?: number;
  amountPaidCents?: number;
  currency?: string;
};

/**
 * Totals are computed in integer cents only. A deposit already received is a
 * payment, so it reduces the outstanding balance without changing the total.
 */
export function computeDocumentTotals(input: ComputeTotalsInput): DocumentTotals {
  const depositReceivedCents = requireInteger(
    input.depositReceivedCents ?? 0,
    'depositReceivedCents',
  );
  const amountPaidCents = requireInteger(input.amountPaidCents ?? 0, 'amountPaidCents');

  const subtotalCents = input.lineItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
  const vatCents = input.lineItems.reduce((sum, item) => sum + item.lineVatCents, 0);
  const totalCents = subtotalCents + vatCents;
  const settledCents = amountPaidCents + depositReceivedCents;

  return {
    subtotalCents,
    vatCents,
    depositReceivedCents,
    totalCents,
    amountPaidCents,
    outstandingCents: Math.max(0, totalCents - settledCents),
    currency: input.currency ?? 'ZAR',
  };
}

function requireInteger(value: number, field: string): number {
  if (!Number.isInteger(value)) {
    throw new DocumentEngineError('VALIDATION_ERROR', `${field} must be an integer number of cents`);
  }
  if (value < 0) {
    throw new DocumentEngineError('VALIDATION_ERROR', `${field} cannot be negative`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type DocumentPhotoRole = 'before' | 'after' | 'additional';

export const DOCUMENT_PHOTO_ROLES: readonly DocumentPhotoRole[] = ['before', 'after', 'additional'];

/**
 * A photo points at stored evidence bytes — either job evidence (`job_evidence`)
 * or finance direct storage (`finance_direct`) when no job is linked.
 */
export type DocumentPhoto = {
  id: string;
  /** Existing `mobile_job_documentation` row when source is job_evidence. */
  documentationId: string;
  jobId: string;
  role: DocumentPhotoRole;
  caption: string | null;
  position: number;
  fileName: string;
  mimeType: string;
  /** When false, the photo is omitted from finance PDF preview output. Defaults to true for images. */
  includeInPdf?: boolean;
  /** Defaults to job_evidence for legacy rows. */
  source?: 'job_evidence' | 'finance_direct';
  /** Tenant-scoped storage key when source is finance_direct. */
  storageKey?: string | null;
};

export type AddDocumentPhotoInput = {
  id: string;
  documentationId: string;
  jobId: string;
  role: DocumentPhotoRole;
  caption?: string | null;
  fileName: string;
  mimeType: string;
  includeInPdf?: boolean;
  source?: 'job_evidence' | 'finance_direct';
  storageKey?: string | null;
};

export function defaultDocumentPhotoIncludeInPdf(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

export function documentPhotoIncludedInPdf(photo: DocumentPhoto): boolean {
  return photo.includeInPdf ?? defaultDocumentPhotoIncludeInPdf(photo.mimeType);
}

export function setDocumentPhotoIncludeInPdf(
  photos: readonly DocumentPhoto[],
  photoId: string,
  includeInPdf: boolean,
): DocumentPhoto[] {
  requirePhoto(photos, photoId);
  return photos.map((photo) => (photo.id === photoId ? { ...photo, includeInPdf } : photo));
}

export function documentPhotosForPdfPreview(photos: readonly DocumentPhoto[]): DocumentPhoto[] {
  return normaliseDocumentPhotos(photos).filter(documentPhotoIncludedInPdf);
}

/** Authenticated, tenant-scoped source path for a document photo. */
export function documentPhotoSourcePath(photo: DocumentPhoto): string {
  return buildJobEvidenceDownloadPath(photo.jobId, photo.documentationId);
}

export function addDocumentPhoto(
  photos: readonly DocumentPhoto[],
  input: AddDocumentPhotoInput,
): DocumentPhoto[] {
  if (photos.some((photo) => photo.id === input.id)) {
    throw new DocumentEngineError('DUPLICATE_PHOTO', `Photo "${input.id}" already exists`);
  }
  if (!input.documentationId.trim() || !input.jobId.trim()) {
    throw new DocumentEngineError(
      'VALIDATION_ERROR',
      'A photo must reference stored evidence metadata',
    );
  }
  if (input.source === 'finance_direct' && !input.storageKey?.trim()) {
    throw new DocumentEngineError(
      'VALIDATION_ERROR',
      'Finance direct photos require a storage key',
    );
  }
  if (!DOCUMENT_PHOTO_ROLES.includes(input.role)) {
    throw new DocumentEngineError('VALIDATION_ERROR', `Unknown photo role "${input.role}"`);
  }

  const next: DocumentPhoto = {
    id: input.id,
    documentationId: input.documentationId,
    jobId: input.jobId,
    role: input.role,
    caption: normaliseTitle(input.caption ?? null),
    position: photos.filter((photo) => photo.role === input.role).length,
    fileName: input.fileName,
    mimeType: input.mimeType,
    includeInPdf: input.includeInPdf ?? defaultDocumentPhotoIncludeInPdf(input.mimeType),
    source: input.source ?? 'job_evidence',
    storageKey: input.storageKey ?? null,
  };
  return renumberPhotosByRole([...photos, next]);
}

export function setDocumentPhotoCaption(
  photos: readonly DocumentPhoto[],
  photoId: string,
  caption: string | null,
): DocumentPhoto[] {
  requirePhoto(photos, photoId);
  return photos.map((photo) =>
    photo.id === photoId ? { ...photo, caption: normaliseTitle(caption) } : photo,
  );
}

/**
 * Swaps the underlying stored file while keeping the caption and position, so
 * replacing a blurred photo does not lose the editor's wording.
 */
export function replaceDocumentPhoto(
  photos: readonly DocumentPhoto[],
  photoId: string,
  replacement: {
    documentationId: string;
    jobId: string;
    fileName: string;
    mimeType: string;
    source?: 'job_evidence' | 'finance_direct';
    storageKey?: string | null;
  },
): DocumentPhoto[] {
  requirePhoto(photos, photoId);
  if (!replacement.documentationId.trim() || !replacement.jobId.trim()) {
    throw new DocumentEngineError(
      'VALIDATION_ERROR',
      'A replacement photo must reference stored evidence metadata',
    );
  }
  return photos.map((photo) => (photo.id === photoId ? { ...photo, ...replacement } : photo));
}

export function removeDocumentPhoto(
  photos: readonly DocumentPhoto[],
  photoId: string,
): DocumentPhoto[] {
  requirePhoto(photos, photoId);
  return renumberPhotosByRole(photos.filter((photo) => photo.id !== photoId));
}

/** Reorders within a role, so before/after pairs cannot be shuffled together. */
export function reorderDocumentPhoto(
  photos: readonly DocumentPhoto[],
  photoId: string,
  toPosition: number,
): DocumentPhoto[] {
  const target = requirePhoto(photos, photoId);
  const sameRole = photos
    .filter((photo) => photo.role === target.role)
    .sort((a, b) => a.position - b.position);
  const others = photos.filter((photo) => photo.role !== target.role);

  const from = sameRole.findIndex((photo) => photo.id === photoId);
  const to = clampIndex(toPosition, sameRole.length - 1);
  const reordered = [...sameRole];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);

  return renumberPhotosByRole([...others, ...reordered]);
}

export function documentPhotosByRole(
  photos: readonly DocumentPhoto[],
  role: DocumentPhotoRole,
): DocumentPhoto[] {
  return photos.filter((photo) => photo.role === role).sort((a, b) => a.position - b.position);
}

function requirePhoto(photos: readonly DocumentPhoto[], photoId: string): DocumentPhoto {
  const found = photos.find((photo) => photo.id === photoId);
  if (!found) {
    throw new DocumentEngineError('PHOTO_NOT_FOUND', `Photo "${photoId}" not found`);
  }
  return found;
}

/**
 * Groups by role and renumbers from array order. Callers pass photos in the
 * intended visual order; sorting here would undo a reorder.
 */
function renumberPhotosByRole(photos: readonly DocumentPhoto[]): DocumentPhoto[] {
  return DOCUMENT_PHOTO_ROLES.flatMap((role) =>
    photos
      .filter((photo) => photo.role === role)
      .map((photo, index) => ({ ...photo, position: index })),
  );
}

/** Sorts stored photos into visual order and renumbers densely. */
export function normaliseDocumentPhotos(photos: readonly DocumentPhoto[]): DocumentPhoto[] {
  return renumberPhotosByRole([...photos].sort((a, b) => a.position - b.position));
}

// ---------------------------------------------------------------------------
// Certificate of Compliance
// ---------------------------------------------------------------------------

/**
 * A COC is either a real stored attachment with a working download route, or it
 * is honestly reported as missing. There is no third state and no placeholder.
 */
export type CocAttachmentState =
  | {
      status: 'attached';
      documentId: string;
      jobId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number | null;
      /** Authenticated, tenant-scoped download path. */
      downloadPath: string;
    }
  | { status: 'not_attached' };

export const COC_NOT_ATTACHED_LABEL = 'Not attached';

/**
 * Builds the COC state from a stored evidence record. Anything missing a real
 * stored file returns `not_attached` so the document never shows a dead link.
 */
export function resolveCocAttachment(input: {
  documentId?: string | null;
  jobId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  hasStoredFile: boolean;
}): CocAttachmentState {
  if (!input.hasStoredFile || !input.documentId || !input.jobId || !input.fileName?.trim()) {
    return { status: 'not_attached' };
  }
  return {
    status: 'attached',
    documentId: input.documentId,
    jobId: input.jobId,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType?.trim() || 'application/octet-stream',
    sizeBytes: input.sizeBytes ?? null,
    downloadPath: buildJobEvidenceDownloadPath(input.jobId, input.documentId),
  };
}

/** Reuses the existing job evidence content route rather than a new file API. */
export function buildJobEvidenceDownloadPath(jobId: string, documentId: string): string {
  return `/api/v1/jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(documentId)}/content`;
}

// ---------------------------------------------------------------------------
// Editing and locking rules
// ---------------------------------------------------------------------------

export type DocumentEditorIdentity = {
  roleName: string | null;
  permissions: readonly string[];
  /** True when the actor is a technician assigned to this document's job. */
  isAssignedTechnician?: boolean;
};

export type DocumentEditScope = {
  canEditWording: boolean;
  canEditLineItems: boolean;
  canEditFinancialFields: boolean;
  canManageSections: boolean;
  canAttachPhotos: boolean;
  canAttachCoc: boolean;
  canIssue: boolean;
  canManagePaymentLinks: boolean;
  canEditBankDetails: boolean;
  editableSectionKinds: readonly DocumentSectionKind[];
  /** Populated when nothing may be edited. */
  lockedReason: string | null;
};

const NO_ACCESS_SCOPE: DocumentEditScope = {
  canEditWording: false,
  canEditLineItems: false,
  canEditFinancialFields: false,
  canManageSections: false,
  canAttachPhotos: false,
  canAttachCoc: false,
  canIssue: false,
  canManagePaymentLinks: false,
  canEditBankDetails: false,
  editableSectionKinds: [],
  lockedReason: 'You do not have permission to edit this document',
};

function hasPermission(identity: DocumentEditorIdentity, ...required: string[]): boolean {
  return identity.permissions.some(
    (permission) => permission === '*' || required.includes(permission),
  );
}

/**
 * Server-side authority for what an actor may change. Hiding a button is never
 * the control; routes call this before applying any mutation.
 */
export function resolveDocumentEditScope(
  identity: DocumentEditorIdentity,
  document: { type: TitanDocumentType; status: TitanDocumentStatus },
): DocumentEditScope {
  const isDraft = document.status === 'draft' || document.status === 'in_review';
  const financeWrite = hasPermission(identity, 'finance:write');
  const documentsWrite = hasPermission(identity, 'documents:write');
  const isTechnician = identity.roleName === 'Technician';

  if (isTechnician) {
    // Technicians contribute field evidence only — never finance, bank, Yoco or templates.
    if (!identity.isAssignedTechnician || !documentsWrite) {
      return NO_ACCESS_SCOPE;
    }
    return {
      canEditWording: false,
      canEditLineItems: false,
      canEditFinancialFields: false,
      canManageSections: false,
      canAttachPhotos: isDraft,
      canAttachCoc: isDraft,
      canIssue: false,
      canManagePaymentLinks: false,
      canEditBankDetails: false,
      editableSectionKinds: isDraft ? TECHNICIAN_EDITABLE_SECTION_KINDS : [],
      lockedReason: isDraft ? null : 'This document has been issued and is locked',
    };
  }

  if (!financeWrite && !documentsWrite) {
    return NO_ACCESS_SCOPE;
  }

  if (!isDraft) {
    return {
      ...NO_ACCESS_SCOPE,
      canIssue: false,
      canManagePaymentLinks: financeWrite && document.type === 'invoice',
      lockedReason: 'This document has been issued — create a new version to change it',
    };
  }

  const editableSectionKinds = DOCUMENT_SECTION_KINDS.filter((kind) => {
    // A report never exposes financial sections, whatever the actor may do elsewhere.
    if (document.type === 'report' && REPORT_FORBIDDEN_SECTION_KINDS.includes(kind)) return false;
    return financeWrite ? true : !FINANCIAL_SECTION_KINDS.includes(kind);
  });

  return {
    canEditWording: true,
    canEditLineItems: financeWrite && document.type !== 'report',
    canEditFinancialFields: financeWrite && document.type !== 'report',
    canManageSections: true,
    canAttachPhotos: true,
    canAttachCoc: true,
    canIssue: financeWrite,
    canManagePaymentLinks: financeWrite && document.type === 'invoice',
    canEditBankDetails: false,
    editableSectionKinds,
    lockedReason: null,
  };
}

/**
 * Financial fields on an invoice that Xero owns once it has synced. The document
 * engine displays them and must never write over them.
 */
export const XERO_DERIVED_INVOICE_FIELDS: readonly string[] = [
  'xeroInvoiceNumber',
  'xeroReference',
  'numberAuthority',
  'totalCents',
  'subtotalCents',
  'vatCents',
  'amountPaidCents',
];

export function isXeroDerivedField(field: string): boolean {
  return XERO_DERIVED_INVOICE_FIELDS.includes(field);
}

/**
 * Filters an edit payload down to fields the engine may write. Once an invoice
 * is Xero-synced its financial totals stay Xero's, so they are dropped rather
 * than silently overwritten.
 */
export function stripXeroOwnedFields<T extends Record<string, unknown>>(
  patch: T,
  options: { isXeroSynced: boolean },
): { patch: Partial<T>; rejectedFields: string[] } {
  if (!options.isXeroSynced) {
    return { patch, rejectedFields: [] };
  }
  const next: Partial<T> = {};
  const rejectedFields: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (isXeroDerivedField(key)) {
      rejectedFields.push(key);
      continue;
    }
    next[key as keyof T] = value as T[keyof T];
  }
  return { patch: next, rejectedFields };
}
