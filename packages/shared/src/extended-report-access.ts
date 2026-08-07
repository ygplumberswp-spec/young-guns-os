/**
 * Server-side extended report access control (Phase J-6.7E).
 * Job-linked inspection/compliance-support exports use report-audience.ts;
 * this module governs fleet and compliance register exports.
 */

import type { ExtendedReportKind } from './extended-report.js';

export type ExtendedReportAccessScope =
  | 'fleet_vehicle'
  | 'fleet_operations'
  | 'compliance_register';

export type ExtendedReportAccessDecision = {
  allowed: boolean;
  scope: ExtendedReportAccessScope | null;
  permissionBasis: string;
  reason: string;
};

export type ExtendedReportAccessInput = {
  actorUserId: string;
  actorRoleName: string;
  permissions: readonly string[];
  reportKind: ExtendedReportKind;
  isPortal: boolean;
};

const FLEET_VEHICLE_PERMISSIONS = [
  '*',
  'fleet_intelligence:read',
  'fleet_intelligence:write',
  'fleet:read',
  'fleet:write',
  'ops:read',
  'integrations:read',
] as const;

const FLEET_OPERATIONS_PERMISSIONS = [
  '*',
  'fleet_intelligence:read',
  'fleet_intelligence:write',
  'ops:read',
  'ops:manage',
  'analytics:read',
] as const;

const COMPLIANCE_REGISTER_PERMISSIONS = [
  '*',
  'legal_compliance:read',
  'legal_compliance:write',
  'legal_compliance:manage',
  'documents:read',
] as const;

const FLEET_SUMMARY_ROLES = new Set(['Company Owner', 'Owner', 'Admin', 'Manager']);

function normalizeRole(roleName: string): string {
  return roleName.trim();
}

function isTechnician(roleName: string): boolean {
  return normalizeRole(roleName) === 'Technician';
}

function isClient(roleName: string): boolean {
  return normalizeRole(roleName) === 'Client';
}

function hasAny(permissions: readonly string[], required: readonly string[]): boolean {
  if (permissions.includes('*')) return true;
  return required.some((p) => permissions.includes(p));
}

export class ExtendedReportAccessError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ExtendedReportAccessError';
  }
}

export function resolveExtendedReportAccess(
  input: ExtendedReportAccessInput,
): ExtendedReportAccessDecision {
  if (input.isPortal) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'portal_extended_denied',
      reason: 'Client portal users cannot access fleet or compliance register reports.',
    };
  }

  if (isClient(input.actorRoleName)) {
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'client_denied',
      reason: 'Client staff role cannot access fleet or compliance register reports.',
    };
  }

  if (input.reportKind === 'inspection' || input.reportKind === 'compliance_coc_support') {
    return {
      allowed: true,
      scope: null,
      permissionBasis: 'job_report_audience',
      reason: 'Job-linked extended reports use operational report audience resolution.',
    };
  }

  if (input.reportKind === 'fleet_vehicle_activity') {
    if (isTechnician(input.actorRoleName)) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'technician_fleet_denied',
        reason: 'Technicians cannot access fleet vehicle activity reports.',
      };
    }
    if (
      hasAny(input.permissions, FLEET_VEHICLE_PERMISSIONS) ||
      FLEET_SUMMARY_ROLES.has(normalizeRole(input.actorRoleName))
    ) {
      return {
        allowed: true,
        scope: 'fleet_vehicle',
        permissionBasis: 'fleet_vehicle_read',
        reason: 'Authorized fleet vehicle activity report access.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_fleet_permission',
      reason: 'Missing permission for fleet vehicle activity report.',
    };
  }

  if (input.reportKind === 'fleet_operations') {
    if (isTechnician(input.actorRoleName)) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'technician_fleet_summary_denied',
        reason: 'Technicians cannot access fleet operations summaries.',
      };
    }
    if (
      hasAny(input.permissions, FLEET_OPERATIONS_PERMISSIONS) ||
      FLEET_SUMMARY_ROLES.has(normalizeRole(input.actorRoleName))
    ) {
      return {
        allowed: true,
        scope: 'fleet_operations',
        permissionBasis: 'fleet_operations_read',
        reason: 'Authorized fleet operations summary access.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_fleet_operations_permission',
      reason: 'Missing permission for fleet operations summary.',
    };
  }

  if (input.reportKind === 'compliance_coc_register') {
    if (isTechnician(input.actorRoleName)) {
      return {
        allowed: false,
        scope: null,
        permissionBasis: 'technician_compliance_register_denied',
        reason: 'Technicians cannot access the compliance and COC register report.',
      };
    }
    if (
      hasAny(input.permissions, COMPLIANCE_REGISTER_PERMISSIONS) ||
      FLEET_SUMMARY_ROLES.has(normalizeRole(input.actorRoleName))
    ) {
      return {
        allowed: true,
        scope: 'compliance_register',
        permissionBasis: 'compliance_register_read',
        reason: 'Authorized compliance register report access.',
      };
    }
    return {
      allowed: false,
      scope: null,
      permissionBasis: 'missing_compliance_register_permission',
      reason: 'Missing permission for compliance and COC register report.',
    };
  }

  return {
    allowed: false,
    scope: null,
    permissionBasis: 'unknown_kind',
    reason: 'Extended report access denied.',
  };
}

export function assertExtendedReportAccess(
  input: ExtendedReportAccessInput,
): ExtendedReportAccessDecision {
  const decision = resolveExtendedReportAccess(input);
  if (!decision.allowed) {
    throw new ExtendedReportAccessError('FORBIDDEN', decision.reason);
  }
  return decision;
}
