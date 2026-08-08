/**
 * Row 125 — Issued invoice protection
 *
 * Issued invoices must not be casually edited/deleted. Valid corrections:
 * Void / Credit Note / Reverse / Archive. Issued numbers are never reused.
 * Xero-backed issued truth remains authoritative. Enforced for API/server.
 */

import { canEditInvoice, type InvoiceNumberAuthority, type InvoiceStatus } from './finance.js';

export const ISSUED_INVOICE_PROTECTION_KEY = 'issued-invoice-protection' as const;

export type IssuedInvoiceCorrectionAction =
  | 'void'
  | 'credit_note'
  | 'reverse'
  | 'archive';

export type IssuedInvoiceProtectionInput = {
  status: InvoiceStatus | string;
  issuedAt?: string | Date | null;
  invoiceNumber?: string | null;
  xeroInvoiceNumber?: string | null;
  numberAuthority?: InvoiceNumberAuthority | string | null;
  sourceProvider?: string | null;
  xeroInvoiceId?: string | null;
};

export function isInvoiceIssued(invoice: IssuedInvoiceProtectionInput): boolean {
  if (invoice.issuedAt) return true;
  if (invoice.xeroInvoiceId?.trim()) return true;
  if (invoice.xeroInvoiceNumber?.trim()) return true;
  if (invoice.numberAuthority === 'xero') return true;
  if (invoice.sourceProvider === 'xero') return true;
  const s = invoice.status;
  return s === 'sent' || s === 'paid' || s === 'partial' || s === 'overdue';
}

/** Casual edit/delete of issued invoices is blocked. */
export function assertIssuedInvoiceMutationAllowed(
  invoice: IssuedInvoiceProtectionInput,
  mutation: 'edit' | 'delete' | 'reuse_number' | IssuedInvoiceCorrectionAction,
): { allowed: true } | { allowed: false; code: string; message: string } {
  if (mutation === 'reuse_number') {
    return {
      allowed: false,
      code: 'INVOICE_NUMBER_REUSE_FORBIDDEN',
      message: 'Issued invoice numbers must never be reused',
    };
  }

  const correction = new Set<string>(['void', 'credit_note', 'reverse', 'archive']);
  if (correction.has(mutation)) {
    if (!isInvoiceIssued(invoice) && invoice.status === 'draft') {
      return {
        allowed: false,
        code: 'INVOICE_NOT_ISSUED',
        message: 'Correction actions apply to issued invoices; delete draft instead',
      };
    }
    if (invoice.status === 'cancelled' && mutation === 'void') {
      return {
        allowed: false,
        code: 'INVOICE_ALREADY_VOIDED',
        message: 'Invoice already voided',
      };
    }
    return { allowed: true };
  }

  if (mutation === 'delete') {
    if (isInvoiceIssued(invoice)) {
      return {
        allowed: false,
        code: 'ISSUED_INVOICE_DELETE_FORBIDDEN',
        message: 'Issued invoices cannot be deleted; use Void, Credit Note, Reverse, or Archive',
      };
    }
    return { allowed: true };
  }

  // edit
  if (!canEditInvoice({
    status: (invoice.status as InvoiceStatus) ?? 'draft',
    xeroInvoiceNumber: invoice.xeroInvoiceNumber,
    numberAuthority: invoice.numberAuthority,
    sourceProvider: invoice.sourceProvider,
  })) {
    return {
      allowed: false,
      code: 'ISSUED_INVOICE_EDIT_FORBIDDEN',
      message: 'Issued invoices cannot be casually edited; use Void, Credit Note, Reverse, or Archive',
    };
  }
  if (isInvoiceIssued(invoice) && invoice.status !== 'draft') {
    return {
      allowed: false,
      code: 'ISSUED_INVOICE_EDIT_FORBIDDEN',
      message: 'Issued invoices cannot be casually edited; use Void, Credit Note, Reverse, or Archive',
    };
  }
  return { allowed: true };
}

export function assertInvoiceNumberNotReused(input: {
  candidateNumber: string;
  existingIssuedNumbers: string[];
}): void {
  const candidate = input.candidateNumber.trim().toLowerCase();
  if (!candidate) throw new Error('Invoice number required');
  const hit = input.existingIssuedNumbers.some((n) => n.trim().toLowerCase() === candidate);
  if (hit) {
    throw new Error('INVOICE_NUMBER_REUSE_FORBIDDEN: issued invoice numbers must never be reused');
  }
}

export function xeroBackedIssuedIsAuthoritative(invoice: IssuedInvoiceProtectionInput): boolean {
  return (
    invoice.numberAuthority === 'xero' ||
    invoice.sourceProvider === 'xero' ||
    Boolean(invoice.xeroInvoiceId?.trim()) ||
    Boolean(invoice.xeroInvoiceNumber?.trim())
  );
}
