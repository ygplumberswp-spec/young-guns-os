/**
 * Row 87 — Official Xero QuoteNumber / InvoiceNumber Authority
 *
 * IF a quote/invoice is Xero-backed, the official Xero QuoteNumber /
 * InvoiceNumber is the authoritative customer-facing and operational
 * display number.
 *
 * Never masquerade UUID, sourceExternalId, Xero GUID, or TITAN-* placeholders
 * as the official number. Never invent QU-/INV- for unsynced drafts.
 *
 * Xero writes = 0. Customer sends = 0. Read/resolution focused.
 */

export const XERO_OFFICIAL_NUMBER_AUTHORITY_KEY = 'xero-official-number-authority' as const;

export const XERO_OFFICIAL_NUMBER_ROYAL_CAPE = {
  youngGunsCompanyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
  canonicalCustomerId: '773497f7-2d71-4a3a-8d80-d113b841b843',
  canonicalName: 'CRC',
  xeroContactId: '9ff6c727-561b-49cb-a2a5-a22e117af850',
  rowanSourceCustomerId: 'd73df05b-d1e1-4f17-bc1d-890baa9f1e7e',
  royalCapeQuoteNumber: 'QU-0183',
  royalCapeQuoteId: '41178762-bb9a-4e5d-b568-07c330f18cbb',
  royalCapeXeroQuoteId: '4d9b1ceb-83dc-4ac6-8d58-ce7ac08f6db8',
  jobId: '5920ef4a-51a9-44ec-8577-09d187ca9c33',
  jobNumber: 'JOB-000002',
  propertyId: '8b42a5d3-97fa-4d53-b61a-9917accf9fa8',
} as const;

export const DRAFT_QUOTE_DISPLAY_LABEL = 'Draft — Xero quote number pending';
export const DRAFT_INVOICE_DISPLAY_LABEL = 'Draft — Xero invoice number pending';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TITAN_INV_RE = /^TITAN-INV-\d+$/i;
const TIT_PREFIX_RE = /^(TIT-|TITAN-)/i;
const XERO_FALLBACK_RE = /^XERO(-Q)?-[0-9a-f]{6,}$/i;

export type OfficialNumberResolution = {
  displayNumber: string;
  isOfficial: boolean;
  isDraft: boolean;
  source:
    | 'xero_quote_number'
    | 'xero_invoice_number'
    | 'persisted_official_import'
    | 'draft_pending';
  rejectedCandidates: string[];
};

export type QuoteNumberResolverInput = {
  id?: string | null;
  quoteNumber?: string | null;
  xeroQuoteNumber?: string | null;
  xeroQuoteId?: string | null;
  sourceExternalId?: string | null;
  sourceProvider?: string | null;
};

export type InvoiceNumberResolverInput = {
  id?: string | null;
  invoiceNumber?: string | null;
  internalNumber?: string | null;
  xeroInvoiceNumber?: string | null;
  xeroInvoiceId?: string | null;
  sourceExternalId?: string | null;
  sourceProvider?: string | null;
  numberAuthority?: string | null;
};

export function isUuidLike(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export function isInternalPlaceholderNumber(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  if (isUuidLike(v)) return true;
  if (TITAN_INV_RE.test(v) || TIT_PREFIX_RE.test(v)) return true;
  if (XERO_FALLBACK_RE.test(v)) return true;
  return false;
}

/** Local TITAN quote sequence Q-#### before Xero assigns an official number. */
export function isLocalTitanQuoteSequence(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return /^Q-\d+$/i.test(value.trim());
}

export function looksLikeOfficialAccountingNumber(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  if (isInternalPlaceholderNumber(v)) return false;
  if (isLocalTitanQuoteSequence(v)) return false;
  return /^(QU-|INV-|IN-|QUOTE-|BILL-)/i.test(v) || /^[A-Z]{1,5}-\d+$/i.test(v);
}

export function classifyDocumentNumberOccurrence(value: string):
  | 'VALID_INTERNAL'
  | 'CUSTOMER_FACING_BUG'
  | 'SAFE_FALLBACK'
  | 'TEST_FIXTURE'
  | 'REVIEW_REQUIRED'
  | 'DEAD_CODE' {
  if (value === DRAFT_QUOTE_DISPLAY_LABEL || value === DRAFT_INVOICE_DISPLAY_LABEL) {
    return 'SAFE_FALLBACK';
  }
  if (isUuidLike(value) || isInternalPlaceholderNumber(value)) {
    return 'CUSTOMER_FACING_BUG';
  }
  if (looksLikeOfficialAccountingNumber(value) || isLocalTitanQuoteSequence(value)) {
    return 'VALID_INTERNAL';
  }
  return 'REVIEW_REQUIRED';
}

/**
 * Canonical quote display number.
 * 1. xeroQuoteNumber
 * 2. persisted official import (never UUID/TITAN; local Q-#### only if Xero-backed)
 * 3. Draft label — never invent QU-XXXX
 */
export function resolveQuoteDisplayNumber(
  input: QuoteNumberResolverInput,
): OfficialNumberResolution {
  const rejected: string[] = [];
  for (const bad of [input.id, input.xeroQuoteId, input.sourceExternalId]) {
    if (bad?.trim()) rejected.push(bad.trim());
  }

  const xero = input.xeroQuoteNumber?.trim();
  if (xero) {
    if (isUuidLike(xero) || isInternalPlaceholderNumber(xero)) {
      rejected.push(xero);
    } else {
      return {
        displayNumber: xero,
        isOfficial: true,
        isDraft: false,
        source: 'xero_quote_number',
        rejectedCandidates: rejected,
      };
    }
  }

  const persisted = input.quoteNumber?.trim();
  const xeroBacked = Boolean(
    input.sourceProvider === 'xero' || input.xeroQuoteId || input.sourceExternalId,
  );
  if (persisted) {
    if (isUuidLike(persisted) || isInternalPlaceholderNumber(persisted)) {
      rejected.push(persisted);
    } else if (isLocalTitanQuoteSequence(persisted) && !xeroBacked) {
      rejected.push(persisted);
    } else if (
      looksLikeOfficialAccountingNumber(persisted) ||
      (isLocalTitanQuoteSequence(persisted) && xeroBacked)
    ) {
      return {
        displayNumber: persisted,
        isOfficial: true,
        isDraft: false,
        source: 'persisted_official_import',
        rejectedCandidates: rejected,
      };
    } else {
      rejected.push(persisted);
    }
  }

  return {
    displayNumber: DRAFT_QUOTE_DISPLAY_LABEL,
    isOfficial: false,
    isDraft: true,
    source: 'draft_pending',
    rejectedCandidates: rejected,
  };
}

/**
 * Canonical invoice display number.
 * 1. xeroInvoiceNumber
 * 2. invoiceNumber when Xero authority / provider and not a placeholder
 * 3. Draft label — never invent INV-XXXX
 */
export function resolveInvoiceDisplayNumber(
  input: InvoiceNumberResolverInput,
): OfficialNumberResolution {
  const rejected: string[] = [];
  for (const bad of [input.id, input.xeroInvoiceId, input.sourceExternalId, input.internalNumber]) {
    if (bad?.trim() && (isUuidLike(bad) || isInternalPlaceholderNumber(bad))) {
      rejected.push(bad.trim());
    }
  }

  const xero = input.xeroInvoiceNumber?.trim();
  if (xero) {
    if (isUuidLike(xero) || isInternalPlaceholderNumber(xero)) {
      rejected.push(xero);
    } else {
      return {
        displayNumber: xero,
        isOfficial: true,
        isDraft: false,
        source: 'xero_invoice_number',
        rejectedCandidates: rejected,
      };
    }
  }

  const persisted = input.invoiceNumber?.trim();
  if (
    persisted &&
    !isUuidLike(persisted) &&
    !isInternalPlaceholderNumber(persisted) &&
    (input.numberAuthority === 'xero' ||
      input.sourceProvider === 'xero' ||
      looksLikeOfficialAccountingNumber(persisted))
  ) {
    return {
      displayNumber: persisted,
      isOfficial: true,
      isDraft: false,
      source: 'persisted_official_import',
      rejectedCandidates: rejected,
    };
  }
  if (persisted) rejected.push(persisted);

  return {
    displayNumber: DRAFT_INVOICE_DISPLAY_LABEL,
    isOfficial: false,
    isDraft: true,
    source: 'draft_pending',
    rejectedCandidates: rejected,
  };
}

export function resolveQuoteDisplayNumberLabel(input: QuoteNumberResolverInput): string {
  return resolveQuoteDisplayNumber(input).displayNumber;
}

export function resolveInvoiceDisplayNumberLabel(input: InvoiceNumberResolverInput): string {
  return resolveInvoiceDisplayNumber(input).displayNumber;
}

export function pickPaymentInvoiceDisplayNumber(input: {
  invoice?: InvoiceNumberResolverInput | null;
  fallbackInvoiceNumber?: string | null;
}): string {
  if (input.invoice) return resolveInvoiceDisplayNumberLabel(input.invoice);
  const fb = input.fallbackInvoiceNumber?.trim();
  if (fb && !isUuidLike(fb) && !isInternalPlaceholderNumber(fb)) return fb;
  return DRAFT_INVOICE_DISPLAY_LABEL;
}

export function assertNeverUsesNonOfficialDisplay(display: string): void {
  if (isUuidLike(display) || isInternalPlaceholderNumber(display)) {
    throw new Error(`Non-official number presented as display: ${display}`);
  }
}

export function assertRoyalCapeQuoteDisplay(input: {
  titanQuoteId: string;
  xeroQuoteId: string | null;
  displayNumber: string;
  quoteNumber: string;
  xeroQuoteNumber: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.titanQuoteId !== XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteId) {
    return { ok: false, reason: 'TITAN quote id mismatch' };
  }
  if (input.xeroQuoteId !== XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeXeroQuoteId) {
    return { ok: false, reason: 'Xero quote id must remain unchanged' };
  }
  if (input.quoteNumber !== 'QU-0183' || input.xeroQuoteNumber !== 'QU-0183') {
    return { ok: false, reason: 'Stored QuoteNumber must remain QU-0183' };
  }
  if (input.displayNumber !== 'QU-0183') {
    return { ok: false, reason: `Display must be QU-0183, got ${input.displayNumber}` };
  }
  return { ok: true };
}

export function assertRow87NoXeroWrites(xeroWriteCalls: number): void {
  if (xeroWriteCalls !== 0) throw new Error('Row 87 forbids Xero writes');
}

export function assertRow87NoCustomerSends(customerSends: number): void {
  if (customerSends !== 0) throw new Error('Row 87 forbids customer sends');
}

export function assertRow88NotStarted(row88Started: boolean): void {
  if (row88Started) throw new Error('Row 88 must not start during Row 87');
}

export function detectOfficialNumberConflict(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  if (isInternalPlaceholderNumber(left) || isInternalPlaceholderNumber(right)) return false;
  return left !== right;
}
