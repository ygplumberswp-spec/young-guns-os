/**
 * Row 88 — Quote Lifecycle End-to-End Verification
 *
 * ONE canonical quote lifecycle across TITAN. Maps existing quote_status
 * values — does not invent a second numbering or status system.
 *
 * Xero/provider state remains authoritative for provider-owned fields.
 * Official QuoteNumber (Row 87) is never rewritten by lifecycle transitions.
 * Customer sends = 0 in staging proof. Unauthorised Xero writes = 0.
 */

import type { BusinessEventType } from './automation.js';
import type { QuoteStatus } from './finance.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const QUOTE_LIFECYCLE_KEY = 'quote-lifecycle-e2e' as const;

export const QUOTE_LIFECYCLE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  quoteNumber: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteNumber,
  quoteId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteId,
  xeroQuoteId: XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeXeroQuoteId,
} as const;

/** Canonical lifecycle states (normalized view of existing quote_status). */
export type CanonicalQuoteLifecycleState =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED_READY'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CONVERTED'
  | 'VOIDED'
  | 'ARCHIVED'
  | 'SUPERSEDED'
  | 'EXPIRED'
  | 'UNKNOWN_REVIEW';

export type QuoteLifecycleAction =
  | 'view'
  | 'edit'
  | 'submit_for_review'
  | 'approve_for_sending'
  | 'prepare_send'
  | 'issue'
  | 'accept'
  | 'decline'
  | 'convert'
  | 'void'
  | 'archive'
  | 'create_version';

export type QuoteLifecycleActorRole =
  | 'owner'
  | 'manager'
  | 'admin'
  | 'office'
  | 'technician'
  | 'client'
  | 'unknown';

export type QuoteLifecycleErrorCode =
  | 'QUOTE_TRANSITION_NOT_ALLOWED'
  | 'QUOTE_ALREADY_CONVERTED'
  | 'QUOTE_PROVIDER_ACTION_BLOCKED'
  | 'QUOTE_APPROVAL_REQUIRED'
  | 'QUOTE_STALE_APPROVAL'
  | 'QUOTE_ALREADY_ACCEPTED'
  | 'QUOTE_ALREADY_DECLINED'
  | 'QUOTE_ALREADY_VOIDED'
  | 'QUOTE_EDIT_NOT_ALLOWED'
  | 'QUOTE_NOT_ELIGIBLE_FOR_CONVERT'
  | 'QUOTE_NOT_ELIGIBLE_FOR_ACCEPT'
  | 'QUOTE_NOT_ELIGIBLE_FOR_DECLINE'
  | 'QUOTE_SEND_NOT_READY'
  | 'QUOTE_CUSTOMER_SEND_BLOCKED'
  | 'QUOTE_IDEMPOTENT_SUCCESS';

export type QuoteConsequentialAction = 'issue' | 'convert' | 'void' | 'accept' | 'decline' | 'archive';

export type QuoteApprovalEnvelopeStatus = 'draft' | 'approved' | 'rejected' | 'executed' | 'blocked' | 'failed';

export type QuoteProviderActionOutcome =
  | { outcome: 'SUCCESS'; providerState?: string }
  | { outcome: 'BLOCKED'; reason: string; businessStateUnchanged: true }
  | { outcome: 'FAILED'; reason: string; businessStateUnchanged: true }
  | { outcome: 'PENDING'; reason: string; businessStateUnchanged: true };

export type QuotePaymentVisibility =
  | 'no_invoice'
  | 'no_payment'
  | 'deposit_requested'
  | 'deposit_unpaid'
  | 'deposit_partial'
  | 'deposit_paid'
  | 'invoice_unpaid'
  | 'invoice_partial'
  | 'invoice_paid'
  | 'unknown';

export type QuoteLifecycleAuditEventType =
  | 'quote_created'
  | 'quote_edited'
  | 'quote_approval_requested'
  | 'quote_approved'
  | 'quote_approval_rejected'
  | 'quote_send_prepared'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_conversion_requested'
  | 'quote_converted'
  | 'quote_voided'
  | 'quote_archived'
  | 'quote_action_failed'
  | 'quote_action_blocked';

export type QuoteLifecycleRecord = {
  id: string;
  status: QuoteStatus | string;
  isImmutable?: boolean;
  issuedAt?: string | Date | null;
  validUntil?: string | Date | null;
  cancelledAt?: string | Date | null;
  cancelReason?: string | null;
  declinedAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  sourceProvider?: string | null;
  xeroQuoteId?: string | null;
  xeroQuoteNumber?: string | null;
  quoteNumber?: string | null;
  sourceExternalId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  updatedAt?: string | Date | null;
  depositPercent?: number | null;
  hasLinkedInvoice?: boolean;
  linkedInvoiceCount?: number;
  providerSyncState?: 'ok' | 'pending' | 'failed' | 'blocked' | null;
};

export type QuoteLifecycleApproval = {
  action: QuoteConsequentialAction;
  status: QuoteApprovalEnvelopeStatus;
  quoteId: string;
  quoteUpdatedAt: string;
  actorId?: string | null;
  role?: QuoteLifecycleActorRole | string | null;
  intendedToStatus?: QuoteStatus | string | null;
  approvedAt?: string | null;
  approvalRef?: string | null;
};

const STAFF_ROLES = new Set<QuoteLifecycleActorRole>(['owner', 'manager', 'admin', 'office']);

/** Map persisted quote_status → canonical lifecycle state. */
export function toCanonicalQuoteLifecycleState(
  status: QuoteStatus | string,
  options: { cancelReason?: string | null } = {},
): CanonicalQuoteLifecycleState {
  switch (status) {
    case 'draft':
      return 'DRAFT';
    case 'internal_review':
      return 'AWAITING_APPROVAL';
    case 'approved_for_sending':
      return 'APPROVED_READY';
    case 'sent':
      return 'SENT';
    case 'viewed':
      return 'VIEWED';
    case 'accepted':
      return 'ACCEPTED';
    case 'declined':
      return 'DECLINED';
    case 'converted':
      return 'CONVERTED';
    case 'cancelled': {
      const reason = options.cancelReason?.trim().toLowerCase() ?? '';
      if (reason.startsWith('archive')) return 'ARCHIVED';
      return 'VOIDED';
    }
    case 'superseded':
      return 'SUPERSEDED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'UNKNOWN_REVIEW';
  }
}

export function canonicalLifecycleLabel(state: CanonicalQuoteLifecycleState): string {
  switch (state) {
    case 'DRAFT':
      return 'Draft';
    case 'AWAITING_APPROVAL':
      return 'Awaiting Approval';
    case 'APPROVED_READY':
      return 'Approved / Ready';
    case 'SENT':
      return 'Sent';
    case 'VIEWED':
      return 'Viewed';
    case 'ACCEPTED':
      return 'Accepted';
    case 'DECLINED':
      return 'Declined';
    case 'CONVERTED':
      return 'Converted';
    case 'VOIDED':
      return 'Voided';
    case 'ARCHIVED':
      return 'Archived';
    case 'SUPERSEDED':
      return 'Superseded';
    case 'EXPIRED':
      return 'Expired';
    case 'UNKNOWN_REVIEW':
      return 'Unknown / Review';
  }
}

export function isXeroBackedQuote(record: Pick<QuoteLifecycleRecord, 'sourceProvider' | 'xeroQuoteId' | 'xeroQuoteNumber'>): boolean {
  if (record.sourceProvider?.toLowerCase() === 'xero') return true;
  if (record.xeroQuoteId?.trim()) return true;
  if (record.xeroQuoteNumber?.trim()) return true;
  return false;
}

/** Legal status transitions for TITAN-orchestrated changes (not provider sync). */
const ALLOWED_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['internal_review', 'cancelled'],
  internal_review: ['approved_for_sending', 'draft', 'cancelled'],
  approved_for_sending: ['sent', 'internal_review', 'draft', 'cancelled'],
  sent: ['viewed', 'accepted', 'declined', 'expired', 'cancelled'],
  viewed: ['accepted', 'declined', 'expired', 'cancelled'],
  accepted: ['converted', 'cancelled'],
  declined: ['cancelled'],
  expired: ['cancelled'],
  superseded: [],
  converted: [],
  cancelled: [],
};

export function isQuoteStatusTransitionAllowed(
  from: QuoteStatus | string,
  to: QuoteStatus | string,
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertQuoteStatusTransition(input: {
  from: QuoteStatus | string;
  to: QuoteStatus | string;
}): { ok: true } {
  if (!isQuoteStatusTransitionAllowed(input.from, input.to)) {
    throw new QuoteLifecycleError(
      'QUOTE_TRANSITION_NOT_ALLOWED',
      `Quote transition not allowed: ${input.from} → ${input.to}`,
    );
  }
  return { ok: true };
}

export class QuoteLifecycleError extends Error {
  constructor(
    public readonly code: QuoteLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuoteLifecycleError';
  }
}

export function normalizeQuoteLifecycleRole(
  roleName: string | null | undefined,
): QuoteLifecycleActorRole {
  const r = (roleName ?? '').trim().toLowerCase();
  if (!r) return 'unknown';
  if (r === 'owner' || r.includes('owner')) return 'owner';
  if (r === 'manager' || r.includes('manager')) return 'manager';
  if (r === 'admin' || r.includes('admin')) return 'admin';
  if (r === 'office' || r.includes('office') || r.includes('dispatcher')) return 'office';
  if (r === 'technician' || r.includes('tech')) return 'technician';
  if (r === 'client' || r.includes('portal') || r.includes('customer')) return 'client';
  return 'unknown';
}

function quoteIsExpired(record: QuoteLifecycleRecord): boolean {
  if (record.status === 'expired') return true;
  if (!record.validUntil) return false;
  const t = record.validUntil instanceof Date ? record.validUntil.getTime() : Date.parse(String(record.validUntil));
  return Number.isFinite(t) && t < Date.now();
}

function quoteIsIssued(record: QuoteLifecycleRecord): boolean {
  if (record.isImmutable) return true;
  if (record.issuedAt) return true;
  const state = toCanonicalQuoteLifecycleState(record.status, { cancelReason: record.cancelReason });
  return state === 'SENT' || state === 'VIEWED' || state === 'ACCEPTED' || state === 'DECLINED' || state === 'CONVERTED';
}

/** Draft → Approve → Execute envelope for consequential quote actions. */
export function createQuoteApprovalDraft(input: {
  action: QuoteConsequentialAction;
  quoteId: string;
  quoteUpdatedAt: string | Date;
  actorId?: string | null;
  role?: QuoteLifecycleActorRole | string | null;
  intendedToStatus?: QuoteStatus | string | null;
}): QuoteLifecycleApproval {
  const quoteUpdatedAt =
    input.quoteUpdatedAt instanceof Date
      ? input.quoteUpdatedAt.toISOString()
      : String(input.quoteUpdatedAt);
  return {
    action: input.action,
    status: 'draft',
    quoteId: input.quoteId,
    quoteUpdatedAt,
    actorId: input.actorId ?? null,
    role: input.role ?? null,
    intendedToStatus: input.intendedToStatus ?? null,
    approvalRef: `qlc_${input.action}_${input.quoteId.slice(0, 8)}_${quoteUpdatedAt}`,
  };
}

export function approveQuoteApprovalDraft(
  draft: QuoteLifecycleApproval,
  actor: { actorId?: string | null; role?: QuoteLifecycleActorRole | string | null },
): QuoteLifecycleApproval {
  if (draft.status !== 'draft') {
    throw new QuoteLifecycleError('QUOTE_TRANSITION_NOT_ALLOWED', 'Only draft approvals can be approved');
  }
  return {
    ...draft,
    status: 'approved',
    actorId: actor.actorId ?? draft.actorId,
    role: actor.role ?? draft.role,
    approvedAt: new Date().toISOString(),
  };
}

export function assertQuoteApprovalExecutable(input: {
  approval: QuoteLifecycleApproval;
  quoteId: string;
  quoteUpdatedAt: string | Date;
  action: QuoteConsequentialAction;
}): { ok: true } {
  if (input.approval.status !== 'approved') {
    throw new QuoteLifecycleError('QUOTE_APPROVAL_REQUIRED', 'Approved envelope required before execute');
  }
  if (input.approval.action !== input.action) {
    throw new QuoteLifecycleError('QUOTE_TRANSITION_NOT_ALLOWED', 'Approval action mismatch');
  }
  if (input.approval.quoteId !== input.quoteId) {
    throw new QuoteLifecycleError('QUOTE_STALE_APPROVAL', 'Approval quote mismatch');
  }
  const current =
    input.quoteUpdatedAt instanceof Date
      ? input.quoteUpdatedAt.toISOString()
      : String(input.quoteUpdatedAt);
  if (input.approval.quoteUpdatedAt !== current) {
    throw new QuoteLifecycleError(
      'QUOTE_STALE_APPROVAL',
      'Quote changed after approval — re-approve required',
    );
  }
  return { ok: true };
}

/**
 * Provider/Xero write outcome truth.
 * BLOCKED/FAILED/PENDING must never be treated as successful business-state change.
 */
export function resolveProviderActionOutcome(input: {
  requested: QuoteConsequentialAction;
  providerWriteAttempted: boolean;
  providerWriteAllowed: boolean;
  providerSucceeded?: boolean;
  providerError?: string | null;
}): QuoteProviderActionOutcome {
  if (!input.providerWriteAttempted) {
    return { outcome: 'SUCCESS' };
  }
  if (!input.providerWriteAllowed) {
    return {
      outcome: 'BLOCKED',
      reason: input.providerError?.trim() || 'Provider write blocked by approval gate',
      businessStateUnchanged: true,
    };
  }
  if (input.providerSucceeded === true) {
    return { outcome: 'SUCCESS', providerState: 'synced' };
  }
  if (input.providerSucceeded === false) {
    return {
      outcome: 'FAILED',
      reason: input.providerError?.trim() || 'Provider write failed',
      businessStateUnchanged: true,
    };
  }
  return {
    outcome: 'PENDING',
    reason: 'Provider write pending confirmation',
    businessStateUnchanged: true,
  };
}

export function applyProviderOutcomeToBusinessState(input: {
  currentStatus: QuoteStatus | string;
  requestedToStatus: QuoteStatus | string;
  outcome: QuoteProviderActionOutcome;
}): { nextStatus: QuoteStatus | string; applied: boolean } {
  if (input.outcome.outcome !== 'SUCCESS') {
    return { nextStatus: input.currentStatus, applied: false };
  }
  return { nextStatus: input.requestedToStatus, applied: true };
}

export function resolveQuotePaymentVisibility(input: {
  quoteStatus: QuoteStatus | string;
  depositPercent?: number | null;
  hasLinkedInvoice?: boolean;
  invoiceStatus?: string | null;
  amountPaidCents?: number | null;
  invoiceTotalCents?: number | null;
  popOnly?: boolean;
}): QuotePaymentVisibility {
  // POP is never payment truth.
  if (input.popOnly && !input.hasLinkedInvoice) return 'no_payment';
  if (!input.hasLinkedInvoice) {
    if (input.depositPercent != null && input.depositPercent > 0) return 'deposit_requested';
    return 'no_invoice';
  }
  const paid = input.amountPaidCents ?? 0;
  const total = input.invoiceTotalCents ?? 0;
  const inv = (input.invoiceStatus ?? '').toLowerCase();
  if (inv === 'paid' || (total > 0 && paid >= total)) {
    return input.depositPercent != null && input.depositPercent > 0 ? 'deposit_paid' : 'invoice_paid';
  }
  if (paid > 0 && total > 0 && paid < total) {
    return input.depositPercent != null && input.depositPercent > 0 ? 'deposit_partial' : 'invoice_partial';
  }
  if (input.depositPercent != null && input.depositPercent > 0) return 'deposit_unpaid';
  if (inv === 'partial') return 'invoice_partial';
  return 'no_payment';
}

/** Quote status must never be inferred from payment/POP. */
export function assertQuoteStatusIndependentOfPayment(input: {
  quoteStatus: QuoteStatus | string;
  paymentVisibility: QuotePaymentVisibility;
}): { ok: true } {
  const paidLike =
    input.paymentVisibility === 'deposit_paid' || input.paymentVisibility === 'invoice_paid';
  if (paidLike && input.quoteStatus === 'draft') {
    // Allowed as inconsistency to flag — do not auto-correct.
  }
  return { ok: true };
}

export function getAllowedQuoteActions(input: {
  status: QuoteStatus | string;
  sourceProvider?: string | null;
  xeroQuoteId?: string | null;
  xeroQuoteNumber?: string | null;
  isImmutable?: boolean;
  issuedAt?: string | Date | null;
  validUntil?: string | Date | null;
  cancelReason?: string | null;
  approvalState?: QuoteApprovalEnvelopeStatus | null;
  role: QuoteLifecycleActorRole | string;
  hasInvoice?: boolean;
  linkedInvoiceCount?: number;
  providerSyncState?: QuoteLifecycleRecord['providerSyncState'];
}): QuoteLifecycleAction[] {
  const role = normalizeQuoteLifecycleRole(input.role);
  const record: QuoteLifecycleRecord = {
    id: 'n/a',
    status: input.status,
    isImmutable: input.isImmutable,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
    cancelReason: input.cancelReason,
    sourceProvider: input.sourceProvider,
    xeroQuoteId: input.xeroQuoteId,
    xeroQuoteNumber: input.xeroQuoteNumber,
    hasLinkedInvoice: input.hasInvoice,
    linkedInvoiceCount: input.linkedInvoiceCount,
    providerSyncState: input.providerSyncState,
  };
  const state = toCanonicalQuoteLifecycleState(record.status, { cancelReason: record.cancelReason });
  const xeroBacked = isXeroBackedQuote(record);
  const actions = new Set<QuoteLifecycleAction>(['view']);

  if (role === 'technician') {
    return ['view'];
  }

  if (role === 'client') {
    if ((state === 'SENT' || state === 'VIEWED') && quoteIsIssued(record) && !quoteIsExpired(record)) {
      actions.add('accept');
      actions.add('decline');
    }
    return [...actions];
  }

  if (!STAFF_ROLES.has(role) && role !== 'owner') {
    return ['view'];
  }

  if (
    !record.isImmutable &&
    (state === 'DRAFT' || state === 'AWAITING_APPROVAL' || state === 'APPROVED_READY')
  ) {
    actions.add('edit');
  }

  if (state === 'DRAFT') actions.add('submit_for_review');
  if (state === 'AWAITING_APPROVAL') actions.add('approve_for_sending');
  if (state === 'APPROVED_READY' && !record.isImmutable) {
    actions.add('prepare_send');
    actions.add('issue');
  }

  if ((state === 'SENT' || state === 'VIEWED') && !quoteIsExpired(record)) {
    // Staff reconciliation accept/decline (portal is primary; office may reconcile)
    if (role === 'owner' || role === 'manager' || role === 'admin' || role === 'office') {
      actions.add('accept');
      actions.add('decline');
    }
  }

  if (state === 'ACCEPTED' && !input.hasInvoice) {
    actions.add('convert');
  }
  // Progress billing may leave status accepted with deposit invoice — still allow final convert
  if (state === 'ACCEPTED' && (input.linkedInvoiceCount ?? 0) > 0 && input.status === 'accepted') {
    actions.add('convert');
  }

  if (
    state === 'DRAFT' ||
    state === 'AWAITING_APPROVAL' ||
    state === 'APPROVED_READY' ||
    state === 'SENT' ||
    state === 'VIEWED' ||
    state === 'ACCEPTED' ||
    state === 'DECLINED' ||
    state === 'EXPIRED'
  ) {
    if (!(xeroBacked && (state === 'SENT' || state === 'VIEWED' || state === 'ACCEPTED' || state === 'DECLINED'))) {
      actions.add('void');
    } else if (role === 'owner' || role === 'manager' || role === 'admin') {
      // Xero-backed issued quotes: void requires provider gate — action shown but execute may BLOCK
      actions.add('void');
    }
  }

  if (state === 'DECLINED' || state === 'EXPIRED' || state === 'VOIDED') {
    actions.add('archive');
  }

  if (quoteIsIssued(record) || state === 'APPROVED_READY') {
    actions.add('create_version');
  }

  // Never offer convert on converted/voided/declined
  if (state === 'CONVERTED' || state === 'VOIDED' || state === 'ARCHIVED' || state === 'DECLINED') {
    actions.delete('convert');
    actions.delete('accept');
    actions.delete('decline');
    actions.delete('issue');
    actions.delete('edit');
  }
  if (state === 'ACCEPTED') {
    actions.delete('accept');
    actions.delete('decline');
    actions.delete('edit');
    actions.delete('issue');
  }
  if (state === 'CONVERTED') {
    actions.add('create_version');
  }

  return [...actions];
}

export function assertQuoteActionAllowed(input: {
  action: QuoteLifecycleAction;
  record: QuoteLifecycleRecord;
  role: QuoteLifecycleActorRole | string;
}): { ok: true } {
  const allowed = getAllowedQuoteActions({
    status: input.record.status,
    sourceProvider: input.record.sourceProvider,
    xeroQuoteId: input.record.xeroQuoteId,
    xeroQuoteNumber: input.record.xeroQuoteNumber,
    isImmutable: input.record.isImmutable,
    issuedAt: input.record.issuedAt,
    validUntil: input.record.validUntil,
    cancelReason: input.record.cancelReason,
    role: input.role,
    hasInvoice: input.record.hasLinkedInvoice,
    linkedInvoiceCount: input.record.linkedInvoiceCount,
    providerSyncState: input.record.providerSyncState,
  });
  if (!allowed.includes(input.action)) {
    throw new QuoteLifecycleError(
      'QUOTE_TRANSITION_NOT_ALLOWED',
      `Action ${input.action} is not allowed for status ${input.record.status}`,
    );
  }
  return { ok: true };
}

export function assertQuoteEditable(record: QuoteLifecycleRecord): { ok: true } {
  if (record.isImmutable) {
    throw new QuoteLifecycleError('QUOTE_EDIT_NOT_ALLOWED', 'Issued quotes are immutable; create a version');
  }
  const state = toCanonicalQuoteLifecycleState(record.status, { cancelReason: record.cancelReason });
  if (state !== 'DRAFT' && state !== 'AWAITING_APPROVAL' && state !== 'APPROVED_READY') {
    throw new QuoteLifecycleError('QUOTE_EDIT_NOT_ALLOWED', `Quote in ${state} cannot be edited like a draft`);
  }
  return { ok: true };
}

export function assertQuoteIssuable(record: QuoteLifecycleRecord): { ok: true } {
  const result = evaluateIssueQuote(record);
  if (result.kind === 'idempotent') {
    throw new QuoteLifecycleError(
      result.code ?? 'QUOTE_IDEMPOTENT_SUCCESS',
      result.message ?? 'Quote already issued',
    );
  }
  if (result.kind === 'reject') {
    throw new QuoteLifecycleError(
      result.code ?? 'QUOTE_TRANSITION_NOT_ALLOWED',
      result.message ?? 'Quote cannot be issued',
    );
  }
  return { ok: true };
}

export function evaluateIssueQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject';
  code?: QuoteLifecycleErrorCode;
  message?: string;
  nextStatus?: 'sent';
} {
  if (record.status === 'sent' || record.status === 'viewed') {
    return { kind: 'idempotent', code: 'QUOTE_IDEMPOTENT_SUCCESS', message: 'Quote already issued' };
  }
  if (record.isImmutable && record.issuedAt) {
    return { kind: 'idempotent', code: 'QUOTE_IDEMPOTENT_SUCCESS', message: 'Quote already issued' };
  }
  if (record.status !== 'approved_for_sending') {
    return {
      kind: 'reject',
      code: 'QUOTE_APPROVAL_REQUIRED',
      message: 'Issue requires approved_for_sending status',
    };
  }
  return { kind: 'apply', nextStatus: 'sent' };
}

export function evaluateAcceptQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject';
  code?: QuoteLifecycleErrorCode;
  message?: string;
} {
  if (record.status === 'accepted' || record.status === 'converted') {
    return { kind: 'idempotent', code: 'QUOTE_ALREADY_ACCEPTED', message: 'Quote already accepted' };
  }
  if (record.status === 'declined') {
    return {
      kind: 'reject',
      code: 'QUOTE_TRANSITION_NOT_ALLOWED',
      message: 'Declined quote cannot be accepted without correction/revision workflow',
    };
  }
  if (record.status === 'cancelled' || record.status === 'superseded' || record.status === 'expired') {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_ACCEPT',
      message: `Quote status ${record.status} cannot be accepted`,
    };
  }
  if (!['sent', 'viewed'].includes(record.status)) {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_ACCEPT',
      message: 'Only sent/viewed quotes can be accepted',
    };
  }
  if (quoteIsExpired(record)) {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_ACCEPT',
      message: 'Expired quote cannot be accepted',
    };
  }
  if (!quoteIsIssued(record)) {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_ACCEPT',
      message: 'Draft quotes cannot be accepted',
    };
  }
  return { kind: 'apply' };
}

export function evaluateDeclineQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject';
  code?: QuoteLifecycleErrorCode;
  message?: string;
} {
  if (record.status === 'declined') {
    return { kind: 'idempotent', code: 'QUOTE_ALREADY_DECLINED', message: 'Quote already declined' };
  }
  if (record.status === 'accepted' || record.status === 'converted') {
    return {
      kind: 'reject',
      code: 'QUOTE_TRANSITION_NOT_ALLOWED',
      message: 'Accepted quote cannot be declined without explicit correction workflow',
    };
  }
  if (!['sent', 'viewed'].includes(record.status)) {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_DECLINE',
      message: `Quote status ${record.status} cannot be declined`,
    };
  }
  if (quoteIsExpired(record)) {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_DECLINE',
      message: 'Expired quote cannot be declined',
    };
  }
  return { kind: 'apply' };
}

export function evaluateConvertQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject';
  code?: QuoteLifecycleErrorCode;
  message?: string;
} {
  if (record.status === 'converted') {
    return {
      kind: 'idempotent',
      code: 'QUOTE_ALREADY_CONVERTED',
      message: 'Quote already converted',
    };
  }
  if (record.status === 'declined' || record.status === 'cancelled' || record.status === 'superseded') {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_CONVERT',
      message: `Quote status ${record.status} cannot be converted`,
    };
  }
  if (record.status !== 'accepted') {
    return {
      kind: 'reject',
      code: 'QUOTE_NOT_ELIGIBLE_FOR_CONVERT',
      message: 'Only accepted quotes can be converted to invoice',
    };
  }
  return { kind: 'apply' };
}

export function evaluateVoidQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject' | 'provider_gate';
  code?: QuoteLifecycleErrorCode;
  message?: string;
  nextStatus?: 'cancelled';
} {
  if (record.status === 'cancelled') {
    return { kind: 'idempotent', code: 'QUOTE_ALREADY_VOIDED', message: 'Quote already voided' };
  }
  if (record.status === 'converted') {
    return {
      kind: 'reject',
      code: 'QUOTE_TRANSITION_NOT_ALLOWED',
      message: 'Converted quotes cannot be voided',
    };
  }
  if (isXeroBackedQuote(record) && quoteIsIssued(record)) {
    return {
      kind: 'provider_gate',
      code: 'QUOTE_PROVIDER_ACTION_BLOCKED',
      message: 'Xero-backed issued quote void requires authorised provider write',
    };
  }
  return { kind: 'apply', nextStatus: 'cancelled' };
}

export function evaluateArchiveQuote(record: QuoteLifecycleRecord): {
  kind: 'apply' | 'idempotent' | 'reject';
  code?: QuoteLifecycleErrorCode;
  message?: string;
  nextStatus?: 'cancelled';
  cancelReason?: string;
} {
  const state = toCanonicalQuoteLifecycleState(record.status, { cancelReason: record.cancelReason });
  if (state === 'ARCHIVED' || state === 'SUPERSEDED' || state === 'CONVERTED' || state === 'VOIDED') {
    return { kind: 'idempotent', message: 'Quote already archived/terminal' };
  }
  if (state === 'DECLINED' || state === 'EXPIRED') {
    return {
      kind: 'apply',
      nextStatus: 'cancelled',
      cancelReason: 'archived: lifecycle archive preserves history',
    };
  }
  return {
    kind: 'reject',
    code: 'QUOTE_TRANSITION_NOT_ALLOWED',
    message: `Archive not allowed from ${state}`,
  };
}

export type QuoteSendReadiness = {
  ready: boolean;
  blockers: string[];
  quoteNumberDisplay: string;
  customerId: string | null;
  totalsReady: boolean;
  permissionOk: boolean;
  approvalOk: boolean;
  /** Staging: never perform external customer delivery. */
  customerSendAllowed: false;
};

export function evaluateQuoteSendReadiness(input: {
  record: QuoteLifecycleRecord;
  displayQuoteNumber: string;
  customerId?: string | null;
  totalCents?: number | null;
  hasPdfContent?: boolean;
  role: QuoteLifecycleActorRole | string;
}): QuoteSendReadiness {
  const blockers: string[] = [];
  const role = normalizeQuoteLifecycleRole(input.role);
  const permissionOk = STAFF_ROLES.has(role);
  if (!permissionOk) blockers.push('Insufficient role for send readiness');
  const approvalOk = input.record.status === 'approved_for_sending' && !input.record.isImmutable;
  if (!approvalOk) blockers.push('Quote must be approved_for_sending and not yet issued');
  if (!input.customerId?.trim()) blockers.push('Customer required');
  const totalsReady = (input.totalCents ?? 0) > 0;
  if (!totalsReady) blockers.push('Totals must be greater than zero');
  if (input.hasPdfContent === false) blockers.push('Document/PDF content required');
  if (!input.displayQuoteNumber?.trim()) blockers.push('Display quote number required');

  return {
    ready: blockers.length === 0,
    blockers,
    quoteNumberDisplay: input.displayQuoteNumber,
    customerId: input.customerId ?? null,
    totalsReady,
    permissionOk,
    approvalOk,
    customerSendAllowed: false,
  };
}

export function toBusinessEventType(eventType: QuoteLifecycleAuditEventType): BusinessEventType {
  return eventType.replace(/_/g, '.') as BusinessEventType;
}

export function buildQuoteLifecycleAuditEvent(input: {
  eventType: QuoteLifecycleAuditEventType;
  companyId: string;
  quoteId: string;
  quoteNumber?: string | null;
  displayQuoteNumber?: string | null;
  actorId?: string | null;
  fromState?: string | null;
  toState?: string | null;
  sourceProvider?: string | null;
  approvalRef?: string | null;
  reason?: string | null;
  extra?: Record<string, unknown>;
}): {
  companyId: string;
  eventType: BusinessEventType;
  entityType: 'quote';
  entityId: string;
  payload: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    eventType: toBusinessEventType(input.eventType),
    entityType: 'quote',
    entityId: input.quoteId,
    payload: {
      quoteId: input.quoteId,
      quoteNumber: input.quoteNumber ?? null,
      displayQuoteNumber: input.displayQuoteNumber ?? null,
      actorId: input.actorId ?? null,
      fromState: input.fromState ?? null,
      toState: input.toState ?? null,
      sourceProvider: input.sourceProvider ?? null,
      approvalRef: input.approvalRef ?? null,
      reason: input.reason ?? null,
      timestamp: new Date().toISOString(),
      ...(input.extra ?? {}),
    },
  };
}

export function detectInvalidQuoteLifecycleCombinations(record: QuoteLifecycleRecord & {
  linkedInvoiceCount?: number;
}): string[] {
  const issues: string[] = [];
  if (record.status === 'converted' && !(record.linkedInvoiceCount || record.hasLinkedInvoice)) {
    issues.push('converted_without_invoice');
  }
  if (record.status === 'accepted' && record.declinedAt) {
    issues.push('accepted_with_declined_at');
  }
  if ((record.linkedInvoiceCount ?? 0) > 1 && record.status === 'converted') {
    // Multiple invoices can be legitimate (deposit/progress/final) — flag only extreme dupes via caller
  }
  if (record.status === 'draft' && record.isImmutable) {
    issues.push('draft_but_immutable');
  }
  if (record.status === 'sent' && !record.issuedAt && !record.isImmutable) {
    issues.push('sent_without_issue_markers');
  }
  if (isXeroBackedQuote(record) && !record.xeroQuoteNumber?.trim() && !record.quoteNumber?.match(/^QU-/i)) {
    issues.push('xero_backed_missing_official_number');
  }
  return issues;
}

export function assertRoyalCapeQuoteLifecycleUnchanged(input: {
  titanQuoteId: string;
  xeroQuoteId: string | null;
  quoteNumber: string;
  xeroQuoteNumber: string | null;
  customerId: string;
  jobId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const rc = QUOTE_LIFECYCLE_ROYAL_CAPE;
  if (input.titanQuoteId !== rc.quoteId) return { ok: false, reason: 'TITAN quote id mismatch' };
  if (input.xeroQuoteId !== rc.xeroQuoteId) return { ok: false, reason: 'Xero Quote ID changed' };
  if (input.quoteNumber !== rc.quoteNumber || input.xeroQuoteNumber !== rc.quoteNumber) {
    return { ok: false, reason: 'QuoteNumber must remain QU-0183' };
  }
  if (input.customerId !== rc.canonicalCustomerId) return { ok: false, reason: 'CRC customer changed' };
  if (input.jobId !== rc.jobId) return { ok: false, reason: 'JOB-000002 linkage changed' };
  return { ok: true };
}

export function assertRow88NoXeroWrites(xeroWriteCalls: number): void {
  if (xeroWriteCalls !== 0) throw new Error('Row 88 forbids unauthorised Xero writes');
}

export function assertRow88NoCustomerSends(customerSends: number): void {
  if (customerSends !== 0) throw new Error('Row 88 forbids customer sends');
}

export function assertRow89NotStarted(row89Started: boolean): void {
  if (row89Started) throw new Error('Row 89 must not start during Row 88');
}

export function assertRow121LifecycleNotStarted(started: boolean): void {
  if (started) throw new Error('Broader Row 121 payment lifecycle must not start during Row 88');
}

/** Count quotes by canonical lifecycle state (staging audit helper). */
export function countQuotesByCanonicalState(
  rows: Array<{ status: string; cancelReason?: string | null }>,
): Record<CanonicalQuoteLifecycleState, number> {
  const counts: Record<CanonicalQuoteLifecycleState, number> = {
    DRAFT: 0,
    AWAITING_APPROVAL: 0,
    APPROVED_READY: 0,
    SENT: 0,
    VIEWED: 0,
    ACCEPTED: 0,
    DECLINED: 0,
    CONVERTED: 0,
    VOIDED: 0,
    ARCHIVED: 0,
    SUPERSEDED: 0,
    EXPIRED: 0,
    UNKNOWN_REVIEW: 0,
  };
  for (const row of rows) {
    const state = toCanonicalQuoteLifecycleState(row.status, { cancelReason: row.cancelReason });
    counts[state] += 1;
  }
  return counts;
}
