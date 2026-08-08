/**
 * Row 124 — Canonical finance statuses / filters
 *
 * Quote + Invoice display statuses and list filters share one resolver.
 * Overdue is derived from due date + outstanding balance (not a fake persisted
 * overdue flag when derivation is canonical).
 */

import type { InvoiceStatus, QuoteStatus } from './finance.js';

export const FINANCE_CANONICAL_STATUS_KEY = 'finance-canonical-status' as const;

export const CANONICAL_QUOTE_FILTER_STATUSES = [
  'Draft',
  'Awaiting Approval',
  'Sent',
  'Accepted',
  'Declined',
  'Archived',
] as const;

export const CANONICAL_INVOICE_FILTER_STATUSES = [
  'Draft',
  'Awaiting Approval',
  'Awaiting Payment',
  'Partially Paid',
  'Paid',
  'Overdue',
  'Voided',
  'Archived',
] as const;

export type CanonicalQuoteDisplayStatus = (typeof CANONICAL_QUOTE_FILTER_STATUSES)[number];
export type CanonicalInvoiceDisplayStatus = (typeof CANONICAL_INVOICE_FILTER_STATUSES)[number];

export type CanonicalQuoteListFilter =
  | 'all'
  | 'drafts'
  | 'awaiting_approval'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'archived';

export type CanonicalInvoiceListFilter =
  | 'all'
  | 'drafts'
  | 'awaiting_approval'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'voided'
  | 'archived';

export type QuoteStatusResolverInput = {
  status: QuoteStatus | string;
  isImmutable?: boolean;
  issuedAt?: string | null;
};

export type InvoiceStatusResolverInput = {
  status: InvoiceStatus | string;
  dueDate?: string | null;
  /** Outstanding balance in cents. Null → cannot derive overdue. */
  balanceDueCents?: number | null;
  /** ISO date YYYY-MM-DD. Defaults to today UTC when omitted. */
  asOfDate?: string | null;
  xeroInvoiceNumber?: string | null;
  numberAuthority?: string | null;
  /** Optional approval gate for draft → send. */
  awaitingApproval?: boolean;
  /** Soft-archive flag when present. */
  archivedAt?: string | null;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Overdue = due date in the past AND outstanding balance > 0. */
export function isInvoiceOverdueDerived(input: {
  dueDate?: string | null;
  balanceDueCents?: number | null;
  asOfDate?: string | null;
  status?: string | null;
}): boolean {
  if (input.status === 'cancelled' || input.status === 'voided' || input.status === 'paid') {
    return false;
  }
  if (input.status === 'draft') return false;
  const balance = input.balanceDueCents;
  if (balance == null || !Number.isFinite(balance) || balance <= 0) return false;
  const due = input.dueDate?.trim();
  if (!due) return false;
  const asOf = (input.asOfDate ?? todayUtcDate()).slice(0, 10);
  return due < asOf;
}

export function resolveCanonicalQuoteDisplayStatus(
  input: QuoteStatusResolverInput,
): CanonicalQuoteDisplayStatus {
  const s = input.status;
  if (s === 'draft') return 'Draft';
  if (s === 'internal_review' || s === 'approved_for_sending') return 'Awaiting Approval';
  if (s === 'sent' || s === 'viewed') return 'Sent';
  if (s === 'accepted') return 'Accepted';
  if (s === 'declined') return 'Declined';
  if (
    s === 'cancelled' ||
    s === 'superseded' ||
    s === 'expired' ||
    s === 'converted'
  ) {
    return 'Archived';
  }
  return 'Draft';
}

export function resolveCanonicalInvoiceDisplayStatus(
  input: InvoiceStatusResolverInput,
): CanonicalInvoiceDisplayStatus {
  if (input.archivedAt) return 'Archived';
  const s = input.status;
  if (s === 'cancelled' || s === 'voided') return 'Voided';
  if (s === 'paid') return 'Paid';
  if (s === 'draft') {
    if (input.awaitingApproval) return 'Awaiting Approval';
    return 'Draft';
  }
  if (isInvoiceOverdueDerived(input)) return 'Overdue';
  if (s === 'partial') return 'Partially Paid';
  if (s === 'sent' || s === 'overdue') {
    // Persisted 'overdue' is treated as display hint only when derivation agrees;
    // if balance/due missing, fall back to Awaiting Payment (no fake overdue).
    if (s === 'overdue' && input.balanceDueCents == null) return 'Awaiting Payment';
    return 'Awaiting Payment';
  }
  return 'Awaiting Payment';
}

export function quoteMatchesCanonicalFilter(
  input: QuoteStatusResolverInput,
  filter: CanonicalQuoteListFilter,
): boolean {
  const display = resolveCanonicalQuoteDisplayStatus(input);
  switch (filter) {
    case 'all':
      return display !== 'Archived';
    case 'drafts':
      return display === 'Draft';
    case 'awaiting_approval':
      return display === 'Awaiting Approval';
    case 'sent':
      return display === 'Sent';
    case 'accepted':
      return display === 'Accepted';
    case 'declined':
      return display === 'Declined';
    case 'archived':
      return display === 'Archived';
    default:
      return true;
  }
}

export function invoiceMatchesCanonicalFilter(
  input: InvoiceStatusResolverInput,
  filter: CanonicalInvoiceListFilter,
): boolean {
  const display = resolveCanonicalInvoiceDisplayStatus(input);
  switch (filter) {
    case 'all':
      return display !== 'Voided' && display !== 'Archived';
    case 'drafts':
      return display === 'Draft';
    case 'awaiting_approval':
      return display === 'Awaiting Approval';
    case 'awaiting_payment':
      return display === 'Awaiting Payment';
    case 'partially_paid':
      return display === 'Partially Paid';
    case 'paid':
      return display === 'Paid';
    case 'overdue':
      return display === 'Overdue';
    case 'voided':
      return display === 'Voided';
    case 'archived':
      return display === 'Archived';
    default:
      return true;
  }
}

export function countByCanonicalInvoiceStatus(
  rows: InvoiceStatusResolverInput[],
): Record<CanonicalInvoiceDisplayStatus, number> {
  const counts = Object.fromEntries(
    CANONICAL_INVOICE_FILTER_STATUSES.map((s) => [s, 0]),
  ) as Record<CanonicalInvoiceDisplayStatus, number>;
  for (const row of rows) {
    counts[resolveCanonicalInvoiceDisplayStatus(row)] += 1;
  }
  return counts;
}

export function countByCanonicalQuoteStatus(
  rows: QuoteStatusResolverInput[],
): Record<CanonicalQuoteDisplayStatus, number> {
  const counts = Object.fromEntries(
    CANONICAL_QUOTE_FILTER_STATUSES.map((s) => [s, 0]),
  ) as Record<CanonicalQuoteDisplayStatus, number>;
  for (const row of rows) {
    counts[resolveCanonicalQuoteDisplayStatus(row)] += 1;
  }
  return counts;
}
