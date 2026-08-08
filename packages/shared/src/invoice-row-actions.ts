/**
 * Row 126 — State/role-aware invoice actions
 *
 * Only surface actions the server will accept. Tech/Client never gain
 * internal finance controls.
 */

import { canEditInvoice, type InvoiceStatus } from './finance.js';
import {
  assertIssuedInvoiceMutationAllowed,
  isInvoiceIssued,
  type IssuedInvoiceProtectionInput,
} from './issued-invoice-protection.js';

export const INVOICE_ROW_ACTIONS_KEY = 'invoice-row-actions' as const;

export type InvoiceRowAction =
  | 'view'
  | 'edit'
  | 'approve'
  | 'send'
  | 'resend'
  | 'customer'
  | 'job'
  | 'payment_history'
  | 'pdf'
  | 'duplicate_as_draft'
  | 'void'
  | 'credit_note'
  | 'archive';

export type InvoiceActionActorRole =
  | 'owner'
  | 'manager'
  | 'admin'
  | 'office'
  | 'technician'
  | 'client'
  | 'unknown';

export type InvoiceActionContext = IssuedInvoiceProtectionInput & {
  customerId?: string | null;
  jobId?: string | null;
  awaitingApproval?: boolean;
};

const FINANCE_ROLES = new Set(['owner', 'manager', 'admin', 'office']);

export function normalizeInvoiceActionRole(roleName?: string | null): InvoiceActionActorRole {
  const r = (roleName ?? '').toLowerCase().trim();
  if (r === 'owner' || r === 'company owner') return 'owner';
  if (r === 'manager') return 'manager';
  if (r === 'admin') return 'admin';
  if (r === 'office' || r === 'office admin') return 'office';
  if (r.includes('tech') || r === 'technician') return 'technician';
  if (r === 'client' || r === 'customer') return 'client';
  return 'unknown';
}

export function resolveInvoiceRowActions(input: {
  invoice: InvoiceActionContext;
  role: InvoiceActionActorRole | string;
  permissions?: string[] | null;
}): InvoiceRowAction[] {
  const role =
    typeof input.role === 'string' && !['owner', 'manager', 'admin', 'office', 'technician', 'client', 'unknown'].includes(input.role)
      ? normalizeInvoiceActionRole(input.role)
      : (input.role as InvoiceActionActorRole);

  if (role === 'technician' || role === 'client') {
    return ['view'];
  }
  if (role === 'unknown') {
    const perms = input.permissions ?? [];
    if (!perms.includes('*') && !perms.includes('finance:read') && !perms.includes('finance:write')) {
      return ['view'];
    }
  }
  if (!FINANCE_ROLES.has(role) && role !== 'unknown') {
    return ['view'];
  }

  const inv = input.invoice;
  const actions: InvoiceRowAction[] = ['view'];

  const editGate = assertIssuedInvoiceMutationAllowed(inv, 'edit');
  if (
    editGate.allowed &&
    canEditInvoice({
      status: (inv.status as InvoiceStatus) ?? 'draft',
      xeroInvoiceNumber: inv.xeroInvoiceNumber,
      numberAuthority: inv.numberAuthority,
      sourceProvider: inv.sourceProvider,
    })
  ) {
    actions.push('edit');
  }

  if (inv.status === 'draft' && inv.awaitingApproval) {
    actions.push('approve');
  }

  if (inv.status === 'draft' && !inv.awaitingApproval && editGate.allowed) {
    actions.push('send');
  }
  if (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partial') {
    actions.push('resend');
  }

  if (inv.customerId) actions.push('customer');
  if (inv.jobId) actions.push('job');
  actions.push('payment_history', 'pdf', 'duplicate_as_draft');

  if (isInvoiceIssued(inv) && assertIssuedInvoiceMutationAllowed(inv, 'void').allowed) {
    actions.push('void');
  }
  if (isInvoiceIssued(inv) && assertIssuedInvoiceMutationAllowed(inv, 'credit_note').allowed) {
    actions.push('credit_note');
  }
  if (assertIssuedInvoiceMutationAllowed(inv, 'archive').allowed || inv.status === 'cancelled') {
    if (!actions.includes('archive') && inv.status !== 'draft') {
      actions.push('archive');
    }
  }

  return actions;
}

/** Server reject check — UI must not offer actions that fail this. */
export function serverAcceptsInvoiceAction(input: {
  invoice: InvoiceActionContext;
  action: InvoiceRowAction;
  role: InvoiceActionActorRole | string;
}): boolean {
  const allowed = resolveInvoiceRowActions({
    invoice: input.invoice,
    role: input.role,
  });
  return allowed.includes(input.action);
}
