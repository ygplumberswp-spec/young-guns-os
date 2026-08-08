/**
 * Customer Portal Expansion (Department 7.1)
 */
import type { PortalAccessPermission } from './portal.js';
import { resolveInvoiceDisplayNumberLabel } from './xero-official-number-authority.js';

export const PORTAL_EXPANSION_PRODUCT_COPY = {
  title: 'Customer Portal Expansion',
  summary:
    'Customer-safe booking, job status, quotes, invoices, payment status, documents, and communication history.',
  emptyJobs: 'No jobs are linked to your account yet.',
  emptyQuotes: 'No quotes have been shared with your account yet.',
  emptyInvoices: 'No invoices are linked to your account yet.',
  emptyPayments: 'No payments have been recorded against your invoices yet.',
  emptyDocuments: 'No documents have been shared with your account yet.',
  emptyTimeline: 'No customer-visible messages yet.',
  emptyBookings: 'No booking requests yet. Submit a request below.',
  onlinePayUnavailable:
    'Secure online payment is not enabled for this workspace. Contact the office to arrange payment.',
} as const;

export const PORTAL_EXPANSION_FORBIDDEN_FIELDS = [
  'internalNotes',
  'internal_notes',
  // Raw staff-only aliases — customerFacingNotes is the explicit portal field.
  'estimatedCostCents',
  'grossProfitCents',
  'markupBps',
  'marginBps',
  'multiplier',
  'estimatedGrossProfitCents',
  'profitFloorCents',
  'targetPriceCents',
  'belowFloorOverride',
  'belowFloorReason',
  'unitCostCents',
  'lineCostCents',
  // Row 96 — internal cost model never reaches Client Portal
  'costComponents',
  'costSummary',
  'costWarnings',
  'costConfidence',
  'costSnapshot',
  'costModel',
  'quote_cost_components',
  'totalEstimatedCostCents',
  'overheadCostCents',
  'contingencyCostCents',
  'warrantyProvisionCents',
  'labourRateConfigCentsPerHour',
  // Row 97 — quote price intelligence never reaches Client Portal
  'priceIntelligence',
  'knownCostFloorCents',
  'approvedProfitFloorCents',
  'targetProfitablePriceCents',
  'profitFloorMarginBps',
  'marketEvidence',
  'recommendationExplanation',
  'auraNarrativeFacts',
  'row92Preview',
  // Row 98 — AI plan take-off internals never reach Client Portal
  'aiTakeoff',
  'aiDraftItems',
  'ambiguityFlags',
  'providerConfidence',
  'humanReviewReasons',
  'evidenceCandidates',
  'planAiTakeoffInternal',
  'scaleProvenance',
  // Row 99 — BOQ workbook import internals never reach Client Portal
  'boqImport',
  'boqImportRows',
  'boqWorkbookInternal',
  'formulaText',
  'fileChecksumSha256',
  'sheetRaw',
  'supplierMatch',
  // Row 100 — supplier quote → BOQ match internals never reach Client Portal
  'supplierQuoteImport',
  'supplierQuoteMatch',
  'matchProposal',
  'matchSignals',
  'supplierBoqMatchInternal',
  // Row 101 — supplier comparison / split-purchase internals never reach Client Portal
  'boqSupplierComparison',
  'splitPurchaseProposal',
  'cheapestEligibleCostCents',
  'expectedSupplierCostCents',
  'supplierSubtotalCents',
  'boqComparisonInternal',

  'xeroQuoteId',
  'xeroInvoiceNumber',
  'xeroReference',
  'xeroPaymentId',
  'yocoPaymentId',
  'numberAuthority',
  'internalNumber',
  'estimatorUserId',
  'leadId',
  'authorUserId',
  'failureReason',
  'accountCode',
  'sourceExternalId',
  'sourceProvider',
  'sourceImportJobId',
  // Row 95 — raw scenario enum / metadata never portal-visible (use customerFacingScenarioLabel).
  'scenario',
  'scenarioMetadata',
  'scenario_metadata',
  'variationParentQuoteId',
] as const;

export type PortalExpansionAvailability = 'available' | 'unavailable';
export type PortalSafePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export type PortalSafeJobStatus = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  executionPhase: string | null;
  addressDisplay: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserName: string | null;
  etaAt: string | null;
  customerVisibleNotes: string | null;
  completedWorkSummary: string | null;
  updatedAt: string;
};

export type PortalSafeJobTimelineEntry = {
  id: string;
  type: 'created' | 'scheduled' | 'status_change' | 'completed' | 'booking' | 'message';
  title: string;
  description: string | null;
  occurredAt: string;
};

export type PortalSafeDocument = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  jobId: string | null;
  jobTitle: string | null;
  sharedAt: string;
  source: 'portal_share' | 'cx_document';
};

export type PortalSafeJobDetail = {
  job: PortalSafeJobStatus;
  timeline: PortalSafeJobTimelineEntry[];
  documents: PortalSafeDocument[];
  liveTracking: {
    technicianDisplayName: string;
    status: 'en_route' | 'arriving' | 'arrived';
    etaAt: string | null;
    progressPercent: number | null;
    startedAt: string;
  } | null;
};

export type PortalSafeQuoteLine = {
  id: string;
  position: number;
  category: string;
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
  isOptional: boolean;
};

export type PortalSafeQuote = {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  versionNumber: number;
  jobId: string | null;
  jobTitle: string | null;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  validUntil: string | null;
  issuedAt: string | null;
  scopeOfWork: string | null;
  exclusions: string | null;
  assumptions: string | null;
  /** Customer PO / reference (never internal notes). */
  customerNotes: string | null;
  customerReference: string | null;
  customerPoNumber: string | null;
  paymentTerms: string | null;
  /** Explicitly customer-visible note. */
  customerFacingNotes: string | null;
  /** Row 95 — human-friendly scenario label only (never raw enum). */
  customerFacingScenarioLabel?: string | null;
  depositPercent: number | null;
  lineItems: PortalSafeQuoteLine[];
  canRequestClarification: boolean;
  canAccept: boolean;
  canDecline: boolean;
};

export type PortalSafeInvoiceLine = {
  id: string;
  position: number;
  category: string;
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
};

export type PortalSafeInvoice = {
  id: string;
  displayNumber: string;
  title: string;
  status: string;
  paymentStatus: PortalSafePaymentStatus;
  jobId: string | null;
  jobTitle: string | null;
  totalCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  isOverdue: boolean;
  currency: string;
  dueDate: string | null;
  paymentTerms: string | null;
  customerReference: string | null;
  customerPoNumber: string | null;
  customerFacingNotes: string | null;
  lineItems: PortalSafeInvoiceLine[];
  createdAt: string;
};

export type PortalSafePayment = {
  id: string;
  invoiceId: string;
  invoiceDisplayNumber: string;
  amountCents: number;
  currency: string;
  method: string;
  reference: string | null;
  paidAt: string;
};

export type PortalSafeFinance = {
  availability: PortalExpansionAvailability;
  outstandingBalanceCents: number;
  currency: string;
  invoices: PortalSafeInvoice[];
  payments: PortalSafePayment[];
  paymentStatusSummary: {
    unpaidCount: number;
    partialCount: number;
    paidCount: number;
    overdueCount: number;
  };
  onlinePayAvailable: false;
};

export type PortalSafeTimelineEntry = {
  id: string;
  kind: 'message' | 'support' | 'voice' | 'request' | 'job' | 'quote' | 'invoice' | 'booking';
  title: string;
  body: string | null;
  channel: string | null;
  occurredAt: string;
  relatedJobId: string | null;
  relatedQuoteId: string | null;
  relatedInvoiceId: string | null;
};

export type PortalSafeBooking = {
  id: string;
  subject: string;
  status: string;
  preferredDate: string | null;
  preferredTimeWindow: string | null;
  jobNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalSafeAppointment = {
  jobId: string;
  jobTitle: string;
  status: string;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserName: string | null;
};

export type PortalExpansionHub = {
  customerName: string;
  companyName: string;
  permissions: PortalAccessPermission[];
  activeJobCount: number;
  pendingQuoteCount: number;
  outstandingInvoiceCount: number;
  outstandingBalanceCents: number;
  currency: string;
  upcomingAppointmentCount: number;
  sharedDocumentCount: number;
  timelineEntryCount: number;
  paymentStatusSummary: PortalSafeFinance['paymentStatusSummary'];
  activeJobs: PortalSafeJobStatus[];
  pendingQuotes: PortalSafeQuote[];
  recentInvoices: PortalSafeInvoice[];
  upcomingAppointments: PortalSafeAppointment[];
  recentTimeline: PortalSafeTimelineEntry[];
  honestEmpty: {
    jobs: boolean;
    quotes: boolean;
    invoices: boolean;
    payments: boolean;
    documents: boolean;
    timeline: boolean;
    bookings: boolean;
  };
};

export type PortalExpansionDocumentShareSummary = {
  id: string;
  documentId: string;
  customerId: string;
  customerName: string;
  title: string;
  fileName: string;
  sharedAt: string;
  sharedByUserId: string | null;
  isActive: boolean;
};

export type CreatePortalExpansionDocumentShareRequest = {
  documentId: string;
  customerId: string;
};

export type CreatePortalExpansionBookingRequest = {
  subject: string;
  preferredDate?: string | null;
  preferredTimeWindow?: string | null;
  jobNotes?: string | null;
  propertyId?: string | null;
};

export function isPortalSafeCommunicationVisibility(visibility: string): boolean {
  return visibility === 'customer_visible';
}

export function buildPortalSafeInvoiceDisplayNumber(input: {
  invoiceNumber: string;
  title?: string | null;
  xeroInvoiceNumber?: string | null;
  numberAuthority?: string | null;
  sourceProvider?: string | null;
  id?: string | null;
  sourceExternalId?: string | null;
}): string {
  // Row 87: clients must see official InvoiceNumber, never TITAN-*/UUID.
  return resolveInvoiceDisplayNumberLabel({
    id: input.id,
    invoiceNumber: input.invoiceNumber,
    xeroInvoiceNumber: input.xeroInvoiceNumber,
    numberAuthority: input.numberAuthority,
    sourceProvider: input.sourceProvider,
    sourceExternalId: input.sourceExternalId,
  });
}

export function derivePortalSafePaymentStatus(input: {
  status: string;
  outstandingCents: number;
  amountPaidCents: number;
  isOverdue: boolean;
}): PortalSafePaymentStatus {
  if (input.outstandingCents <= 0 || input.status === 'paid') return 'paid';
  if (input.isOverdue || input.status === 'overdue') return 'overdue';
  if (input.amountPaidCents > 0 || input.status === 'partial') return 'partial';
  return 'unpaid';
}

export function summarizePortalSafePaymentStatuses(
  invoices: Array<{ paymentStatus: PortalSafePaymentStatus }>,
): PortalSafeFinance['paymentStatusSummary'] {
  const summary = { unpaidCount: 0, partialCount: 0, paidCount: 0, overdueCount: 0 };
  for (const invoice of invoices) {
    if (invoice.paymentStatus === 'unpaid') summary.unpaidCount += 1;
    else if (invoice.paymentStatus === 'partial') summary.partialCount += 1;
    else if (invoice.paymentStatus === 'paid') summary.paidCount += 1;
    else summary.overdueCount += 1;
  }
  return summary;
}

export function toPortalSafeQuoteLine(input: {
  id: string;
  position: number;
  category: string;
  description: string;
  quantity: string | number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
  isOptional?: boolean | null;
}): PortalSafeQuoteLine {
  return {
    id: input.id,
    position: input.position,
    category: input.category,
    description: input.description,
    quantity: String(input.quantity),
    unitPriceCents: input.unitPriceCents,
    lineSubtotalCents: input.lineSubtotalCents,
    lineVatCents: input.lineVatCents,
    lineTotalCents: input.lineTotalCents,
    isOptional: Boolean(input.isOptional),
  };
}

export function assertNoForbiddenPortalExpansionFields(
  payload: unknown,
  path = 'root',
): string[] {
  const violations: string[] = [];
  if (payload == null || typeof payload !== 'object') return violations;
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      violations.push(...assertNoForbiddenPortalExpansionFields(item, `${path}[${index}]`));
    });
    return violations;
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if ((PORTAL_EXPANSION_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      violations.push(`${path}.${key}`);
    }
    if (value != null && typeof value === 'object') {
      violations.push(...assertNoForbiddenPortalExpansionFields(value, `${path}.${key}`));
    }
  }
  return violations;
}

export function canStaffManagePortalDocumentShares(actor: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (actor.roleName === 'Technician' || actor.roleName === 'Client') return false;
  const perms = new Set(actor.permissions);
  return (
    perms.has('*') ||
    perms.has('portal:write') ||
    perms.has('documents:write') ||
    perms.has('customers:write')
  );
}

export function canStaffReadPortalDocumentShares(actor: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (actor.roleName === 'Technician' || actor.roleName === 'Client') return false;
  const perms = new Set(actor.permissions);
  return (
    perms.has('*') ||
    perms.has('portal:read') ||
    perms.has('portal:write') ||
    perms.has('documents:read') ||
    perms.has('documents:write') ||
    perms.has('customers:read') ||
    perms.has('customers:write')
  );
}
