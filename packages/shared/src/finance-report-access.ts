/**
 * Server-side finance report access control (Phase J-6.7D).
 */

import type { FinanceReportKind } from './finance-report.js';

export type FinanceReportAccessScope =
  | 'finance_full'
  | 'finance_limited'
  | 'customer_history_internal'
  | 'customer_history_client';

export type FinanceReportAccessDecision = {
  allowed: boolean;
  scope: FinanceReportAccessScope | null;
  permissionBasis: string;
  reason: string;
};

export type FinanceReportAccessInput = {
  actorUserId: string;
  actorRoleName: string;
  permissions: readonly string[];
  reportKind: FinanceReportKind;
  targetCustomerId: string | null;
  portalCustomerId?: string | null;
  isPortal: boolean;
};

const FINANCE_FULL_PERMISSIONS = [
  '*',
  'finance:read',
  'finance:write',
] as const;

const FINANCE_AGGREGATE_ROLES = new Set(['company owner', 'owner', 'admin', 'accountant', 'manager']);

const CUSTOMER_HISTORY_OFFICE_PERMISSIONS = [
  '*',
  'finance:read',
  'customers:read',
  'crm:read',
] as const;

function normalizeRole(roleName: string): string {
  return roleName.trim().toLowerCase();
}

function isTechnician(roleName: string): boolean {
  return normalizeRole(roleName) === 'technician';
}

function isClient(roleName: string): boolean {
  return normalizeRole(roleName) === 'client';
}

function hasAny(permissions: readonly string[], required: readonly string[]): boolean {
  if (permissions.includes('*')) return true;
  return required.some((p) => permissions.includes(p));
}

export class FinanceReportAccessError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'FinanceReportAccessError';
  }
}

export function resolveFinanceReportAccess(input: FinanceReportAccessInput): FinanceReportAccessDecision {
  if (input.isPortal) {
    if (input.reportKind !== 'customer_property_history') {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'portal_finance_denied',
        reason: 'Client portal users cannot access internal finance reports.',
      };
    }
    if (!input.portalCustomerId) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'portal_customer_missing',
        reason: 'Portal customer context is required.',
      };
    }
    if (input.targetCustomerId && input.targetCustomerId !== input.portalCustomerId) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'portal_customer_mismatch',
        reason: 'Clients may only access their own customer history.',
      };
    }
    return {
      allowed: true,
      scope: 'customer_history_client',
      permissionBasis: 'portal_customer_self',
      reason: 'Client-safe customer history for authenticated portal customer.',
    };
  }

  if (isClient(input.actorRoleName)) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'client_denied',
      reason: 'Client staff role cannot access finance reports through staff routes.',
    };
  }

  if (isTechnician(input.actorRoleName)) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'technician_finance_denied',
      reason: 'Technicians cannot access finance or customer-wide history reports.',
    };
  }

  if (input.reportKind === 'customer_property_history') {
    if (
      hasAny(input.permissions, CUSTOMER_HISTORY_OFFICE_PERMISSIONS) ||
      FINANCE_AGGREGATE_ROLES.has(normalizeRole(input.actorRoleName))
    ) {
      return {
        allowed: true,
        scope: 'customer_history_internal',
        permissionBasis: 'customer_history_read',
        reason: 'Authorized staff access to internal customer history.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_customer_history_permission',
      reason: 'Missing permission for customer history report.',
    };
  }

  if (
    hasAny(input.permissions, FINANCE_FULL_PERMISSIONS) ||
    FINANCE_AGGREGATE_ROLES.has(normalizeRole(input.actorRoleName))
  ) {
    return {
      allowed: true,
      scope: input.reportKind === 'accounts_receivable' ? 'finance_limited' : 'finance_full',
      permissionBasis: 'finance_read',
      reason: 'Authorized finance report access.',
    };
  }

  if (input.reportKind === 'accounts_receivable' && hasAny(input.permissions, ['customers:read'])) {
    return {
      allowed: true,
      scope: 'finance_limited',
      permissionBasis: 'office_receivables',
      reason: 'Office receivables access with customers:read.',
    };
  }

  return {
    allowed: false,
    scope: null,
    permissionBasis: 'missing_finance_permission',
    reason: 'Missing finance permission for this report.',
  };
}

export function assertFinanceReportAccess(input: FinanceReportAccessInput): FinanceReportAccessDecision {
  const decision = resolveFinanceReportAccess(input);
  if (!decision.allowed) {
    throw new FinanceReportAccessError('FORBIDDEN', decision.reason);
  }
  return decision;
}

export const FINANCE_REPORT_SENSITIVE_PATTERNS = [
  /\baccess[_-]?token\b/i,
  /\brefresh[_-]?token\b/i,
  /\bclient[_-]?secret\b/i,
  /\bbank account number\b/i,
  /\bcard number\b/i,
  /\bxero tenant id\b/i,
  /\bstorageKey\b/,
  /\bstoragePath\b/,
  /\bunitCost\b/,
  /\blineCost\b/,
  /\bmargin review\b/i,
  /\bpayroll\b/i,
  /\bwage\b/i,
  /\bsalary\b/i,
] as const;

export function assertFinanceReportHtmlSafe(html: string, audience: 'internal' | 'client'): void {
  for (const pattern of FINANCE_REPORT_SENSITIVE_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`Sensitive finance field leaked into ${audience} report HTML (${pattern})`);
    }
  }
  if (html.includes('/var/lib/') || html.includes('/api/v1/jobs/')) {
    throw new Error('Storage path leaked into finance report HTML');
  }
  if (audience === 'client' && /\binternalNotes\b/.test(html)) {
    throw new Error('Internal notes leaked into client finance report HTML');
  }
}
