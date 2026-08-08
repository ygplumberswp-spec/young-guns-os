/**
 * Row 89 — Quote / Invoice Payment Terms, Customer PO/Reference,
 * Internal Notes + Customer-Facing Notes
 *
 * Explicit visibility contract:
 * - INTERNAL NOTES never leak to customer surfaces (portal/PDF/print/email/WhatsApp)
 * - CUSTOMER-FACING NOTES are explicitly customer-visible
 * - Do not invent PO / terms / notes
 * - Row 87 official numbers remain authoritative
 * - Row 88 lifecycle edit protections remain in force
 * - Xero writes = 0 · customer sends = 0
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const FINANCE_DOCUMENT_METADATA_KEY = 'finance-document-metadata' as const;

export const FINANCE_METADATA_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedReferenceHint: 'Royal Cape',
} as const;

export const FINANCE_METADATA_EMPTY = {
  paymentTerms: 'Not specified',
  customerPo: 'Not provided',
  customerReference: '',
  notes: '',
} as const;

export type FinanceMetadataOwnership =
  | 'LOCAL_TITAN_OWNED'
  | 'PROVIDER_AUTHORITATIVE'
  | 'CONFLICT_REVIEW_REQUIRED';

export type FinanceMetadataFieldKey =
  | 'paymentTerms'
  | 'customerPoNumber'
  | 'customerReference'
  | 'internalNotes'
  | 'customerFacingNotes';

export type CanonicalFinanceDocumentMetadata = {
  paymentTerms: string | null;
  /** Customer PO number when provided — never fabricated. */
  customerPoNumber: string | null;
  /** Customer / project reference (e.g. Royal Cape Yacht Club). */
  customerReference: string | null;
  /** Staff-only. Never customer-visible. */
  internalNotes: string | null;
  /** Explicitly customer-visible note text. */
  customerFacingNotes: string | null;
  /** Provider-backed reference (e.g. Xero Reference) — may differ from customer PO. */
  providerReference: string | null;
  ownership: Record<FinanceMetadataFieldKey, FinanceMetadataOwnership>;
};

export type CustomerFacingFinanceMetadata = {
  paymentTerms: string | null;
  customerPoNumber: string | null;
  customerReference: string | null;
  customerFacingNotes: string | null;
  /** Never includes internalNotes. */
};

export type StaffFinanceMetadata = CustomerFacingFinanceMetadata & {
  internalNotes: string | null;
  providerReference: string | null;
};

export type FinanceMetadataAuditEventType =
  | 'payment_terms_changed'
  | 'customer_po_changed'
  | 'customer_reference_changed'
  | 'internal_note_changed'
  | 'customer_note_changed';

export type NoteFieldClassification =
  | 'SAFE_CUSTOMER_FIELD'
  | 'INTERNAL_ONLY'
  | 'AMBIGUOUS'
  | 'BUG'
  | 'DEAD_CODE'
  | 'TEST_FIXTURE'
  | 'VALID_INTERNAL';

const PO_LIKE = /^(PO[-_\s]?\d+)/i;

export function normalizeFinanceMetadataText(
  value: string | null | undefined,
  maxLen = 5000,
): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function isFabricatedCustomerPo(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  if (/^n\/?a(\s+po)?$/i.test(v)) return true;
  if (/^0+$/.test(v)) return true;
  if (/^(TITAN-PO|TIT-PO)/i.test(v)) return true;
  return false;
}

export function rejectFabricatedCustomerPo(value: string | null | undefined): string | null {
  const n = normalizeFinanceMetadataText(value, 200);
  if (!n) return null;
  if (isFabricatedCustomerPo(n)) {
    throw new Error('Fabricated customer PO values are not allowed');
  }
  return n;
}

/**
 * Quote column mapping (existing schema — no rename):
 * - payment_terms → paymentTerms
 * - customer_notes → customerReference / customerPoNumber (combined PO/reference field)
 * - notes → customerFacingNotes
 * - internal_notes → internalNotes
 */
export function resolveQuoteMetadata(input: {
  paymentTerms?: string | null;
  customerNotes?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  sourceProvider?: string | null;
  xeroQuoteId?: string | null;
}): CanonicalFinanceDocumentMetadata {
  const customerNotes = normalizeFinanceMetadataText(input.customerNotes);
  const poGuess = customerNotes && PO_LIKE.test(customerNotes) ? customerNotes : null;
  const local: FinanceMetadataOwnership = 'LOCAL_TITAN_OWNED';
  // Quote payment terms / notes / customer_notes are TITAN-owned in current architecture
  // (Xero quote pull does not map Reference/Terms into these columns).
  void input.sourceProvider;
  void input.xeroQuoteId;

  return {
    paymentTerms: normalizeFinanceMetadataText(input.paymentTerms, 2000),
    customerPoNumber: poGuess,
    customerReference: customerNotes,
    internalNotes: normalizeFinanceMetadataText(input.internalNotes),
    customerFacingNotes: normalizeFinanceMetadataText(input.notes),
    providerReference: null,
    ownership: {
      paymentTerms: local,
      customerPoNumber: local,
      customerReference: local,
      internalNotes: local,
      // Customer-facing notes are TITAN-authored unless a future provider field exists.
      customerFacingNotes: local,
    },
  };
}

/**
 * Invoice column mapping:
 * - payment_terms → paymentTerms
 * - customer_po_number → customerPoNumber (additive)
 * - notes → customerFacingNotes
 * - internal_notes → internalNotes (additive)
 * - xero_reference → providerReference / legacy customerReference compat
 */
export function resolveInvoiceMetadata(input: {
  paymentTerms?: string | null;
  customerPoNumber?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  xeroReference?: string | null;
  customerReference?: string | null;
  sourceProvider?: string | null;
  xeroInvoiceNumber?: string | null;
  numberAuthority?: string | null;
}): CanonicalFinanceDocumentMetadata {
  const xeroBacked =
    input.sourceProvider?.toLowerCase() === 'xero' ||
    Boolean(input.xeroInvoiceNumber?.trim()) ||
    input.numberAuthority === 'xero';
  const providerRef = normalizeFinanceMetadataText(input.xeroReference, 200);
  const rawPo = normalizeFinanceMetadataText(input.customerPoNumber, 200);
  const customerPo =
    rawPo && !isFabricatedCustomerPo(rawPo)
      ? rawPo
      : !xeroBacked
        ? (() => {
            const ref = normalizeFinanceMetadataText(input.customerReference, 200);
            return ref && !isFabricatedCustomerPo(ref) ? ref : null;
          })()
        : null;
  // Legacy: local drafts stored PO in xero_reference via customerReference mapping.
  const legacyLocalRef =
    !xeroBacked && !customerPo
      ? normalizeFinanceMetadataText(input.customerReference ?? input.xeroReference, 200)
      : null;

  return {
    paymentTerms: normalizeFinanceMetadataText(input.paymentTerms, 2000),
    customerPoNumber: customerPo,
    customerReference: customerPo ?? legacyLocalRef ?? (xeroBacked ? providerRef : null),
    internalNotes: normalizeFinanceMetadataText(input.internalNotes),
    customerFacingNotes: normalizeFinanceMetadataText(input.notes),
    providerReference: providerRef,
    ownership: {
      paymentTerms: 'LOCAL_TITAN_OWNED',
      customerPoNumber: 'LOCAL_TITAN_OWNED',
      customerReference: xeroBacked && providerRef && !customerPo
        ? 'PROVIDER_AUTHORITATIVE'
        : 'LOCAL_TITAN_OWNED',
      internalNotes: 'LOCAL_TITAN_OWNED',
      customerFacingNotes: 'LOCAL_TITAN_OWNED',
    },
  };
}

export function toCustomerFacingFinanceMetadata(
  meta: CanonicalFinanceDocumentMetadata,
): CustomerFacingFinanceMetadata {
  return {
    paymentTerms: meta.paymentTerms,
    customerPoNumber: meta.customerPoNumber,
    customerReference: meta.customerReference,
    customerFacingNotes: meta.customerFacingNotes,
  };
}

export function toStaffFinanceMetadata(
  meta: CanonicalFinanceDocumentMetadata,
  options: { includeInternalNotes: boolean },
): StaffFinanceMetadata {
  const customer = toCustomerFacingFinanceMetadata(meta);
  return {
    ...customer,
    internalNotes: options.includeInternalNotes ? meta.internalNotes : null,
    providerReference: meta.providerReference,
  };
}

/** Build PDF/print-safe payload — never includes internal notes. */
export function toPdfSafeFinanceMetadata(meta: CanonicalFinanceDocumentMetadata): {
  customerReference: string | null;
  paymentTerms: string | null;
  notes: string | null;
  forbiddenKeysPresent: false;
} {
  const customer = toCustomerFacingFinanceMetadata(meta);
  return {
    customerReference: customer.customerReference ?? customer.customerPoNumber,
    paymentTerms: customer.paymentTerms,
    notes: customer.customerFacingNotes,
    forbiddenKeysPresent: false,
  };
}

/** Communication template render payload — never includes internal notes. */
export function toCommunicationSafeFinanceMetadata(meta: CanonicalFinanceDocumentMetadata): {
  paymentTerms: string | null;
  customerReference: string | null;
  customerFacingNotes: string | null;
  customerSendAllowed: false;
} {
  const customer = toCustomerFacingFinanceMetadata(meta);
  return {
    paymentTerms: customer.paymentTerms,
    customerReference: customer.customerReference,
    customerFacingNotes: customer.customerFacingNotes,
    customerSendAllowed: false,
  };
}

export function assertNoInternalNoteLeak(payload: unknown, path = 'root'): void {
  if (payload == null) return;
  if (typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoInternalNoteLeak(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower === 'internalnotes' ||
      lower === 'internal_notes' ||
      lower === 'internalnote' ||
      lower === 'staffnotes'
    ) {
      if (value != null && String(value).trim() !== '') {
        throw new Error(`Internal note leaked at ${path}.${key}`);
      }
    }
    if (value && typeof value === 'object') {
      assertNoInternalNoteLeak(value, `${path}.${key}`);
    }
  }
}

export function classifyFinanceMetadataField(
  fieldName: string,
  surface: 'customer' | 'internal' | 'pdf' | 'portal' | 'comms' | 'unknown',
): NoteFieldClassification {
  const n = fieldName.trim();
  if (!n) return 'DEAD_CODE';
  if (/^internalNotes$/i.test(n) || /^internal_notes$/i.test(n)) {
    return surface === 'internal' ? 'INTERNAL_ONLY' : 'BUG';
  }
  if (/^customerFacingNotes$/i.test(n) || (/^notes$/i.test(n) && surface !== 'unknown')) {
    if (surface === 'customer' || surface === 'pdf' || surface === 'portal' || surface === 'comms') {
      return 'SAFE_CUSTOMER_FIELD';
    }
    if (surface === 'internal') return 'SAFE_CUSTOMER_FIELD';
  }
  if (/^notes$/i.test(n) && surface === 'unknown') return 'AMBIGUOUS';
  if (/^customerNotes$/i.test(n) || /^customerReference$/i.test(n) || /^customerPoNumber$/i.test(n)) {
    return 'SAFE_CUSTOMER_FIELD';
  }
  if (/^paymentTerms$/i.test(n) || /^payment_terms$/i.test(n)) return 'SAFE_CUSTOMER_FIELD';
  if (/^xeroReference$/i.test(n) || /^sourceExternalId$/i.test(n)) return 'VALID_INTERNAL';
  return 'AMBIGUOUS';
}

export function detectMetadataConflict(input: {
  localValue: string | null | undefined;
  providerValue: string | null | undefined;
  field: FinanceMetadataFieldKey;
  ownership: FinanceMetadataOwnership;
}): FinanceMetadataOwnership {
  const local = normalizeFinanceMetadataText(input.localValue);
  const provider = normalizeFinanceMetadataText(input.providerValue);
  if (!local || !provider) return input.ownership;
  if (local === provider) return input.ownership;
  if (input.ownership === 'PROVIDER_AUTHORITATIVE') return 'CONFLICT_REVIEW_REQUIRED';
  if (input.field === 'internalNotes') return 'LOCAL_TITAN_OWNED';
  return 'CONFLICT_REVIEW_REQUIRED';
}

/**
 * Issued / Xero-backed commercial customer-facing fields must not be casually rewritten.
 * Internal notes remain editable (TITAN-owned) even after issue.
 */
export function assertIssuedCommercialMetadataEditable(input: {
  isIssued: boolean;
  xeroBacked: boolean;
  field: FinanceMetadataFieldKey;
  allowInternalNoteEdit?: boolean;
}): { ok: true } {
  if (input.field === 'internalNotes') {
    if (input.allowInternalNoteEdit === false) {
      throw new Error('Internal note edit not permitted for this actor');
    }
    return { ok: true };
  }
  if (input.isIssued && input.xeroBacked) {
    throw new Error(
      `Issued Xero-backed commercial field ${input.field} is protected — use controlled correction workflow`,
    );
  }
  return { ok: true };
}

export function buildFinanceMetadataAuditEvent(input: {
  eventType: FinanceMetadataAuditEventType;
  companyId: string;
  entityType: 'quote' | 'invoice';
  entityId: string;
  officialNumber?: string | null;
  actorId?: string | null;
  sourceProvider?: string | null;
  /** Prefer hashes/lengths over raw internal note bodies. */
  beforeSafe?: string | null;
  afterSafe?: string | null;
  reason?: string | null;
}): {
  companyId: string;
  action: string;
  entityType: 'quote' | 'invoice';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      officialNumber: input.officialNumber ?? null,
      actorId: input.actorId ?? null,
      sourceProvider: input.sourceProvider ?? null,
      before: input.beforeSafe ?? null,
      after: input.afterSafe ?? null,
      reason: input.reason ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

export function safeAuditText(value: string | null | undefined): string | null {
  const n = normalizeFinanceMetadataText(value);
  if (!n) return null;
  if (n.length <= 80) return n;
  return `${n.slice(0, 77)}… (${n.length} chars)`;
}

export function assertRoyalCapeMetadataUnchanged(input: {
  titanQuoteId: string;
  xeroQuoteId: string | null;
  quoteNumber: string;
  xeroQuoteNumber: string | null;
  customerId: string;
  jobId: string | null;
  customerReference?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const rc = FINANCE_METADATA_ROYAL_CAPE;
  if (input.titanQuoteId !== rc.royalCapeQuoteId) return { ok: false, reason: 'TITAN quote id mismatch' };
  if (input.xeroQuoteId !== rc.royalCapeXeroQuoteId) return { ok: false, reason: 'Xero Quote ID changed' };
  if (input.quoteNumber !== 'QU-0183' && input.xeroQuoteNumber !== 'QU-0183') {
    return { ok: false, reason: 'QuoteNumber must remain QU-0183' };
  }
  if (input.customerId !== rc.canonicalCustomerId) return { ok: false, reason: 'CRC unchanged required' };
  if (input.jobId !== rc.jobId) return { ok: false, reason: 'JOB-000002 unchanged required' };
  if (
    input.customerReference &&
    !input.customerReference.toLowerCase().includes('royal cape') &&
    input.customerReference.trim().length > 0
  ) {
    // Soft check — only fail if clearly fabricated TITAN-PO
    if (isFabricatedCustomerPo(input.customerReference)) {
      return { ok: false, reason: 'Fabricated PO on Royal Cape' };
    }
  }
  return { ok: true };
}

export function assertRow89NoXeroWrites(xeroWriteCalls: number): void {
  if (xeroWriteCalls !== 0) throw new Error('Row 89 forbids Xero writes');
}

export function assertRow89NoCustomerSends(customerSends: number): void {
  if (customerSends !== 0) throw new Error('Row 89 forbids customer sends');
}

export function assertRow90NotStarted(row90Started: boolean): void {
  if (row90Started) throw new Error('Row 90 must not start during Row 89');
}

export function emptyMetadataDisplay(
  field: 'paymentTerms' | 'customerPo' | 'customerReference' | 'notes',
  value: string | null | undefined,
): string {
  if (value?.trim()) return value;
  if (field === 'paymentTerms') return FINANCE_METADATA_EMPTY.paymentTerms;
  if (field === 'customerPo') return FINANCE_METADATA_EMPTY.customerPo;
  return FINANCE_METADATA_EMPTY.customerReference;
}
