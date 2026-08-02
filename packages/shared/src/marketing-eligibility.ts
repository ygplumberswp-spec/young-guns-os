/**
 * UX-H / UX-026 — buyer classification, contact quality, consent, reactivation.
 * No provider send. Missing consent is not consent. Invoice/payment ≠ marketing consent.
 */

export type BuyerClassification =
  | 'contact_record'
  | 'accrec_buyer'
  | 'paid_buyer'
  | 'repeat_buyer'
  | 'inactive_reactivation_candidate'
  | 'supplier_only'
  | 'prospect_lead'
  | 'uncertain_manual_review';

export type ContactFieldKey = 'name' | 'contact_person' | 'email' | 'phone';

export type ContactVerificationState =
  | 'unknown'
  | 'unverified'
  | 'verified'
  | 'placeholder'
  | 'bounced';

export type MarketingConsentChannel = 'whatsapp' | 'email' | 'sms' | 'phone';

export type MarketingConsentStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'withdrawn'
  | 'do_not_contact';

export type ReactivationEligibilityStatus =
  | 'eligible'
  | 'excluded'
  | 'blocked'
  | 'awaiting_verification';

export type MarketingAudienceRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type XeroSyncBackRequestStatus =
  | 'requested'
  | 'approved_pending_provider'
  | 'cancelled'
  | 'blocked_no_provider';

/** Days since last paid ACCREC invoice before a paid buyer is a reactivation candidate. */
export const REACTIVATION_INACTIVE_DAYS = 180;

export type BuyerClassificationEvidenceItem = {
  code: string;
  detail: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
};

export type BuyerClassificationSummary = {
  id: string;
  customerId: string;
  customerName: string;
  primaryClassification: BuyerClassification;
  isAccrecBuyer: boolean;
  isPaidBuyer: boolean;
  isRepeatBuyer: boolean;
  isSupplierOnly: boolean;
  qualifyingInvoiceCount: number;
  paidInvoiceCount: number;
  lastPaidAt: string | null;
  lastQualifyingAt: string | null;
  xeroContactId: string | null;
  evidence: BuyerClassificationEvidenceItem[];
  reason: string;
  computedAt: string;
  idempotentReplay?: boolean;
};

export type CustomerContactFieldSummary = {
  id: string;
  customerId: string;
  fieldKey: ContactFieldKey;
  value: string | null;
  source: string;
  verificationState: ContactVerificationState;
  isSharedCompanyEmail: boolean;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  updatedAt: string;
};

export type CustomerContactCorrectionSummary = {
  id: string;
  customerId: string;
  fieldKey: ContactFieldKey;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  changedByUserId: string | null;
  createdAt: string;
};

export type CustomerMarketingConsentSummary = {
  id: string;
  customerId: string;
  channel: MarketingConsentChannel;
  status: MarketingConsentStatus;
  lawfulBasis: string | null;
  captureSource: string | null;
  wordingVersion: string | null;
  capturedAt: string | null;
  capturedByUserId: string | null;
  withdrawnAt: string | null;
  notes: string | null;
  updatedAt: string;
};

export type ReactivationEligibilityReason = {
  code: string;
  detail: string;
};

export type ReactivationEligibilitySummary = {
  id: string;
  customerId: string;
  customerName: string;
  eligibilityStatus: ReactivationEligibilityStatus;
  preferredChannel: MarketingConsentChannel | null;
  reasons: ReactivationEligibilityReason[];
  evidence: Record<string, unknown>;
  computedAt: string;
  classification: BuyerClassification | null;
  isPaidBuyer: boolean;
  emailVerificationState: ContactVerificationState | null;
  phoneVerificationState: ContactVerificationState | null;
  doNotContact: boolean;
};

export type ReactivationEligibilityCounts = {
  eligible: number;
  excluded: number;
  blocked: number;
  awaitingVerification: number;
  total: number;
};

export type MarketingAudienceRequestSummary = {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  exclusions: Record<string, unknown>;
  memberCount: number;
  status: MarketingAudienceRequestStatus;
  /** Always not_sent / never provider-delivered in UX-H. */
  deliveryState: 'not_sent';
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  idempotentReplay?: boolean;
};

export type XeroContactSyncBackRequestSummary = {
  id: string;
  customerId: string;
  requestedFields: string[];
  status: XeroSyncBackRequestStatus;
  notes: string | null;
  createdAt: string;
  /** Honest boundary: TITAN never called Xero for this request. */
  providerCalled: false;
};

export type CorrectCustomerContactRequest = {
  fieldKey: ContactFieldKey;
  value: string | null;
  reason: string;
  markVerified?: boolean;
  source?: string;
  clientActionId?: string | null;
};

export type UpsertMarketingConsentRequest = {
  channel: MarketingConsentChannel;
  status: MarketingConsentStatus;
  lawfulBasis?: string | null;
  captureSource?: string | null;
  wordingVersion?: string | null;
  notes?: string | null;
  reason: string;
};

export type CreateMarketingAudienceRequestInput = {
  name: string;
  criteria?: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  notes?: string | null;
  clientActionId?: string | null;
};

export type CreateXeroSyncBackRequestInput = {
  customerId: string;
  requestedFields: Array<'name' | 'email' | 'phone' | 'contact_person'>;
  notes?: string | null;
  clientActionId?: string | null;
};

export type InvoiceClassificationInput = {
  id: string;
  invoiceNumber: string;
  status: string;
  amountCents: number;
  amountPaidCents: number;
  totalCents: number;
  issuedAt: string | null;
  dueDate?: string | null;
  updatedAt: string;
};

export type ClassifyCustomerInput = {
  customerId: string;
  customerName: string;
  customerStatus: string;
  isSupplierOnly: boolean;
  xeroContactId: string | null;
  invoices: InvoiceClassificationInput[];
  inactiveDays?: number;
};

/**
 * Pure Decision 3 / UX-H classifier. Does not treat contact existence as buyer proof.
 * Excludes draft / cancelled (voided) invoices. Paid is separately identifiable.
 */
export function classifyBuyerFromEvidence(input: ClassifyCustomerInput): {
  primaryClassification: BuyerClassification;
  isAccrecBuyer: boolean;
  isPaidBuyer: boolean;
  isRepeatBuyer: boolean;
  isSupplierOnly: boolean;
  qualifyingInvoiceCount: number;
  paidInvoiceCount: number;
  lastPaidAt: string | null;
  lastQualifyingAt: string | null;
  evidence: BuyerClassificationEvidenceItem[];
  reason: string;
} {
  const inactiveDays = input.inactiveDays ?? REACTIVATION_INACTIVE_DAYS;
  const evidence: BuyerClassificationEvidenceItem[] = [];

  if (input.isSupplierOnly) {
    evidence.push({
      code: 'supplier_only_flag',
      detail: 'Customer marked supplier-only; excluded from buyer classification.',
    });
    return {
      primaryClassification: 'supplier_only',
      isAccrecBuyer: false,
      isPaidBuyer: false,
      isRepeatBuyer: false,
      isSupplierOnly: true,
      qualifyingInvoiceCount: 0,
      paidInvoiceCount: 0,
      lastPaidAt: null,
      lastQualifyingAt: null,
      evidence,
      reason: 'Supplier-only contact — not a sales buyer.',
    };
  }

  const qualifying = input.invoices.filter((inv) => {
    if (inv.status === 'draft' || inv.status === 'cancelled') return false;
    const total = inv.totalCents || inv.amountCents || 0;
    return total > 0;
  });

  for (const inv of input.invoices) {
    if (inv.status === 'draft') {
      evidence.push({
        code: 'excluded_draft',
        detail: 'Draft invoice excluded from buyer proof.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    } else if (inv.status === 'cancelled') {
      evidence.push({
        code: 'excluded_void_cancelled',
        detail: 'Cancelled/voided invoice excluded from buyer proof.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    }
  }

  const paid = qualifying.filter(
    (inv) => inv.status === 'paid' || (inv.amountPaidCents ?? 0) > 0,
  );

  for (const inv of paid) {
    evidence.push({
      code: 'paid_accrec',
      detail: 'Qualifying paid sales invoice evidence.',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceStatus: inv.status,
    });
  }
  for (const inv of qualifying.filter((q) => !paid.some((p) => p.id === q.id))) {
    evidence.push({
      code: 'unpaid_accrec',
      detail: 'Qualifying non-draft sales invoice (not paid).',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceStatus: inv.status,
    });
  }

  const lastPaidAt =
    paid
      .map((inv) => inv.issuedAt ?? inv.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const lastQualifyingAt =
    qualifying
      .map((inv) => inv.issuedAt ?? inv.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const isAccrecBuyer = qualifying.length >= 1;
  const isPaidBuyer = paid.length >= 1;
  const isRepeatBuyer = paid.length >= 2;

  if (!isAccrecBuyer) {
    if (input.customerStatus === 'lead') {
      evidence.push({
        code: 'prospect_lead',
        detail: 'Lead/prospect with no qualifying ACCREC sales history.',
      });
      return {
        primaryClassification: 'prospect_lead',
        isAccrecBuyer: false,
        isPaidBuyer: false,
        isRepeatBuyer: false,
        isSupplierOnly: false,
        qualifyingInvoiceCount: 0,
        paidInvoiceCount: 0,
        lastPaidAt: null,
        lastQualifyingAt: null,
        evidence,
        reason: 'Prospect/lead — contact existence is not buyer proof.',
      };
    }

    if (input.xeroContactId) {
      evidence.push({
        code: 'xero_mapping_without_sales',
        detail: 'Xero contact mapping retained; no qualifying ACCREC sales.',
      });
      return {
        primaryClassification: 'uncertain_manual_review',
        isAccrecBuyer: false,
        isPaidBuyer: false,
        isRepeatBuyer: false,
        isSupplierOnly: false,
        qualifyingInvoiceCount: 0,
        paidInvoiceCount: 0,
        lastPaidAt: null,
        lastQualifyingAt: null,
        evidence,
        reason: 'Xero contact without qualifying ACCREC sales — manual review.',
      };
    }

    evidence.push({
      code: 'contact_only',
      detail: 'Customer record only; no qualifying ACCREC sales.',
    });
    return {
      primaryClassification: 'contact_record',
      isAccrecBuyer: false,
      isPaidBuyer: false,
      isRepeatBuyer: false,
      isSupplierOnly: false,
      qualifyingInvoiceCount: 0,
      paidInvoiceCount: 0,
      lastPaidAt: null,
      lastQualifyingAt: null,
      evidence,
      reason: 'Contact/customer record only — not classified as a buyer.',
    };
  }

  if (!isPaidBuyer) {
    return {
      primaryClassification: 'accrec_buyer',
      isAccrecBuyer: true,
      isPaidBuyer: false,
      isRepeatBuyer: false,
      isSupplierOnly: false,
      qualifyingInvoiceCount: qualifying.length,
      paidInvoiceCount: 0,
      lastPaidAt: null,
      lastQualifyingAt,
      evidence,
      reason: 'Has qualifying ACCREC sales history but no paid invoice evidence yet.',
    };
  }

  if (lastPaidAt) {
    const ageMs = Date.now() - new Date(lastPaidAt).getTime();
    const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;
    if (Number.isFinite(ageMs) && ageMs >= inactiveMs) {
      evidence.push({
        code: 'inactive_window',
        detail: `Last paid sale older than ${inactiveDays} days — reactivation candidate.`,
      });
      return {
        primaryClassification: 'inactive_reactivation_candidate',
        isAccrecBuyer: true,
        isPaidBuyer: true,
        isRepeatBuyer,
        isSupplierOnly: false,
        qualifyingInvoiceCount: qualifying.length,
        paidInvoiceCount: paid.length,
        lastPaidAt,
        lastQualifyingAt,
        evidence,
        reason: 'Paid buyer inactive long enough to be a reactivation candidate.',
      };
    }
  }

  if (isRepeatBuyer) {
    return {
      primaryClassification: 'repeat_buyer',
      isAccrecBuyer: true,
      isPaidBuyer: true,
      isRepeatBuyer: true,
      isSupplierOnly: false,
      qualifyingInvoiceCount: qualifying.length,
      paidInvoiceCount: paid.length,
      lastPaidAt,
      lastQualifyingAt,
      evidence,
      reason: 'Repeat paid ACCREC buyer (2+ paid sales invoices).',
    };
  }

  return {
    primaryClassification: 'paid_buyer',
    isAccrecBuyer: true,
    isPaidBuyer: true,
    isRepeatBuyer: false,
    isSupplierOnly: false,
    qualifyingInvoiceCount: qualifying.length,
    paidInvoiceCount: paid.length,
    lastPaidAt,
    lastQualifyingAt,
    evidence,
    reason: 'Confirmed paid ACCREC buyer.',
  };
}

export function isMarketingConsentGranted(status: MarketingConsentStatus | null | undefined): boolean {
  return status === 'granted';
}

export function isMarketingSuppressed(status: MarketingConsentStatus | null | undefined): boolean {
  return status === 'denied' || status === 'withdrawn' || status === 'do_not_contact';
}

/** Human-Quality Content Standard — recorded for future marketing implementation (not UX-H engine). */
export const HUMAN_QUALITY_CONTENT_STANDARD = {
  id: 'titan-human-quality-content-standard-v1',
  title: 'Owner-Approved Human-Quality Content Standard',
  requirements: [
    'Real company work and local Cape Town context only',
    'No generic AI content',
    'No fake staff, customers, testimonials or results',
    'Brand, fact, plumbing, visual and consent review required',
    'Owner approval before publishing, ad spend or mass communication',
  ],
} as const;
