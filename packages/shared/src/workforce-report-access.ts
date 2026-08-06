/**
 * Server-side workforce report access control.
 * Browser-supplied technician IDs are hints only — never security authority.
 */

import type { WorkforceReportKind } from './workforce-report.js';

export type WorkforceReportAccessScope = 'self' | 'team' | 'workforce_summary';

export type WorkforceReportAccessDecision = {
  allowed: boolean;
  scope: WorkforceReportAccessScope | null;
  permissionBasis: string;
  reason: string;
};

export type WorkforceReportAccessInput = {
  actorUserId: string;
  actorRoleName: string;
  permissions: readonly string[];
  targetUserId: string | null;
  reportKind: WorkforceReportKind;
  isSelfRoute: boolean;
};

const WORKFORCE_TEAM_PERMISSIONS = [
  '*',
  'ops:read',
  'ops:manage',
  'workforce_intelligence:read',
  'workforce_intelligence:manage',
  'workforce:read',
  'analytics:read',
  'dispatch:read',
  'dispatch_intelligence:read',
] as const;

const WORKFORCE_SUMMARY_PERMISSIONS = [
  '*',
  'ops:read',
  'ops:manage',
  'workforce_intelligence:read',
  'workforce_intelligence:manage',
  'analytics:read',
] as const;

function normalizeRole(roleName: string): string {
  return roleName.trim();
}

function isTechnicianRole(roleName: string): boolean {
  return normalizeRole(roleName) === 'Technician';
}

function isClientRole(roleName: string): boolean {
  return normalizeRole(roleName) === 'Client';
}

function isOwnerRole(roleName: string): boolean {
  const n = normalizeRole(roleName);
  return n === 'Company Owner' || n === 'Owner';
}

function isAdminRole(roleName: string): boolean {
  const n = normalizeRole(roleName);
  return n === 'Admin' || n === 'Manager';
}

function hasAny(permissions: readonly string[], required: readonly string[]): boolean {
  if (permissions.includes('*')) return true;
  return required.some((p) => permissions.includes(p));
}

export class WorkforceReportAccessError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'WorkforceReportAccessError';
  }
}

export function resolveWorkforceReportAccess(input: WorkforceReportAccessInput): WorkforceReportAccessDecision {
  if (isClientRole(input.actorRoleName)) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'client_denied',
      reason: 'Client portal users cannot access technician or workforce reports.',
    };
  }

  if (input.reportKind === 'workforce_operations') {
    if (isTechnicianRole(input.actorRoleName)) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'technician_workforce_summary_denied',
        reason: 'Technicians cannot access workforce-wide operational summaries.',
      };
    }
    if (hasAny(input.permissions, WORKFORCE_SUMMARY_PERMISSIONS) || isOwnerRole(input.actorRoleName) || isAdminRole(input.actorRoleName)) {
      return {
        allowed: true,
        scope: 'workforce_summary',
        permissionBasis: 'workforce_summary',
        reason: 'Authorized for workforce operations summary.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_workforce_summary_permission',
      reason: 'Workforce operations summary requires elevated operational permission.',
    };
  }

  const effectiveTargetId = input.isSelfRoute ? input.actorUserId : input.targetUserId;
  if (!effectiveTargetId) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_target',
      reason: 'Technician target is required.',
    };
  }

  const isSelf = effectiveTargetId === input.actorUserId;

  if (isSelf) {
    if (
      isTechnicianRole(input.actorRoleName) ||
      isOwnerRole(input.actorRoleName) ||
      isAdminRole(input.actorRoleName) ||
      hasAny(input.permissions, ['mobile:read', 'workforce:read', ...WORKFORCE_TEAM_PERMISSIONS])
    ) {
      return {
        allowed: true,
        scope: 'self',
        permissionBasis: isTechnicianRole(input.actorRoleName) ? 'technician_self' : 'staff_self_preview',
        reason: 'Self-service workforce report access.',
      };
    }
  }

  if (!isSelf) {
    if (isTechnicianRole(input.actorRoleName)) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'technician_peer_denied',
        reason: 'Technicians cannot access another technician’s workforce reports.',
      };
    }
    if (hasAny(input.permissions, WORKFORCE_TEAM_PERMISSIONS) || isOwnerRole(input.actorRoleName) || isAdminRole(input.actorRoleName)) {
      return {
        allowed: true,
        scope: 'team',
        permissionBasis: 'team_workforce_read',
        reason: 'Authorized staff access to technician workforce report.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_team_permission',
      reason: 'Missing permission to view this technician’s workforce report.',
    };
  }

  return {
    allowed: false,
    scope: null,
    permissionBasis: 'denied',
    reason: 'Workforce report access denied.',
  };
}

export function assertWorkforceReportAccess(input: WorkforceReportAccessInput): WorkforceReportAccessDecision {
  const decision = resolveWorkforceReportAccess(input);
  if (!decision.allowed) {
    throw new WorkforceReportAccessError('FORBIDDEN', decision.reason);
  }
  return decision;
}

/** Validate that a URL technician id matches authenticated user for self routes. */
export function assertTechnicianSelfBinding(
  actorUserId: string,
  routeUserId: string | undefined,
  isSelfRoute: boolean,
): void {
  if (isSelfRoute && routeUserId && routeUserId !== actorUserId) {
    throw new WorkforceReportAccessError(
      'FORBIDDEN',
      'Self-service workforce reports must use the authenticated technician identity.',
    );
  }
}

export const WORKFORCE_REPORT_SENSITIVE_PATTERNS = [
  /\bwage\b/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
  /\blabour cost\b/i,
  /\blabor cost\b/i,
  /\bpay rate\b/i,
  /\bunitCost\b/,
  /\blineCost\b/,
  /\bprofit\b/i,
  /\bmargin review\b/i,
  /\bstorageKey\b/,
  /\bstoragePath\b/,
] as const;

export function assertWorkforceReportHtmlSafe(html: string): void {
  for (const pattern of WORKFORCE_REPORT_SENSITIVE_PATTERNS) {
    if (pattern.test(html)) {
      throw new Error(`Sensitive workforce field leaked into report HTML (${pattern})`);
    }
  }
  if (html.includes('/var/lib/') || html.includes('/api/v1/jobs/')) {
    throw new Error('Storage path or internal API path leaked into workforce report HTML');
  }
}
