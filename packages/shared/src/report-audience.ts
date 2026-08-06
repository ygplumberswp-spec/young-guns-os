/**
 * Canonical server-side report audience resolution.
 * Browser-supplied `audience` query values are hints only — never security authority.
 */

import type { OperationalReportAudience } from './operational-report.js';

export const REPORT_AUDIENCES = ['internal', 'technician', 'client'] as const;

export type ReportActorCategory =
  | 'owner'
  | 'admin'
  | 'office'
  | 'technician'
  | 'client'
  | 'portal_client'
  | 'unauthorized';

export type ReportAudienceDecision = {
  effectiveAudience: OperationalReportAudience;
  actorCategory: ReportActorCategory;
  tenantId: string;
  customerId: string | null;
  assignmentRequired: boolean;
  permissionBasis: string;
  /** Requested audience was more privileged than permitted and was clamped/ignored. */
  audienceEscalationAttempt: boolean;
};

export type StaffReportAudienceInput = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: readonly string[];
  requestedAudience: unknown;
  jobAssignedUserId: string | null;
  isAssignedToJob: boolean;
};

export type PortalReportAudienceInput = {
  companyId: string;
  customerId: string;
  permissions: readonly string[];
  resourceCustomerId: string | null;
  requestedAudience?: unknown;
};

const INTERNAL_REPORT_PERMISSIONS = ['documents:read', 'jobs:write', '*'] as const;
const CLIENT_REPORT_PERMISSIONS = ['documents:read', 'jobs:read', 'jobs:write', '*'] as const;
const TECHNICIAN_ELEVATED_PERMISSIONS = ['documents:read', 'jobs:write', '*'] as const;

function hasAny(userPermissions: readonly string[], required: readonly string[]): boolean {
  if (userPermissions.includes('*')) return true;
  return required.some((p) => userPermissions.includes(p));
}

function normalizeRoleName(roleName: string): string {
  return roleName.trim();
}

function isReportTechnicianRole(roleName: string): boolean {
  return normalizeRoleName(roleName) === 'Technician';
}

function isReportClientRole(roleName: string): boolean {
  return normalizeRoleName(roleName) === 'Client';
}

function isReportOwnerRole(roleName: string): boolean {
  const n = normalizeRoleName(roleName);
  return n === 'Company Owner' || n === 'Owner';
}

function isReportAdminRole(roleName: string): boolean {
  const n = normalizeRoleName(roleName);
  return n === 'Admin' || n === 'Manager';
}

export function parseRequestedReportAudience(value: unknown): OperationalReportAudience | null {
  if (value == null || value === '') return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'internal' || normalized === 'technician' || normalized === 'client') {
    return normalized;
  }
  return null;
}

function classifyStaffActor(roleName: string, permissions: readonly string[]): ReportActorCategory {
  if (isReportOwnerRole(roleName)) return 'owner';
  if (isReportAdminRole(roleName)) return 'admin';
  if (isReportTechnicianRole(roleName)) return 'technician';
  if (isReportClientRole(roleName)) return 'client';
  if (hasAny(permissions, CLIENT_REPORT_PERMISSIONS)) return 'office';
  return 'unauthorized';
}

function staffMaxAudience(
  roleName: string,
  permissions: readonly string[],
): OperationalReportAudience | null {
  if (isReportTechnicianRole(roleName)) return 'technician';
  if (isReportClientRole(roleName)) return 'client';
  if (hasAny(permissions, INTERNAL_REPORT_PERMISSIONS)) return 'internal';
  if (hasAny(permissions, CLIENT_REPORT_PERMISSIONS)) return 'client';
  if (hasAny(permissions, ['jobs:read'])) return 'technician';
  return null;
}

function canAccessInternal(permissions: readonly string[]): boolean {
  return hasAny(permissions, INTERNAL_REPORT_PERMISSIONS);
}

function canAccessClient(permissions: readonly string[]): boolean {
  return hasAny(permissions, CLIENT_REPORT_PERMISSIONS);
}

function canAccessTechnicianElevated(permissions: readonly string[]): boolean {
  return hasAny(permissions, TECHNICIAN_ELEVATED_PERMISSIONS);
}

/**
 * Resolve effective audience for authenticated staff actors.
 * Technicians and staff Clients always receive forced audiences regardless of query hints.
 */
export function resolveStaffReportAudience(input: StaffReportAudienceInput): ReportAudienceDecision {
  const actorCategory = classifyStaffActor(input.roleName, input.permissions);
  const maxAudience = staffMaxAudience(input.roleName, input.permissions);

  if (!maxAudience) {
    throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export reports');
  }

  const parsed = parseRequestedReportAudience(input.requestedAudience);
  const requested = parsed ?? (maxAudience === 'internal' ? 'internal' : maxAudience);

  if (isReportTechnicianRole(input.roleName)) {
    const assigned = input.isAssignedToJob;
    const elevated = canAccessTechnicianElevated(input.permissions);
    if (!assigned && !elevated) {
      throw new ReportAudienceError('FORBIDDEN', 'Technicians may only export reports for assigned jobs');
    }
    const escalation = requested !== 'technician';
    return {
      effectiveAudience: 'technician',
      actorCategory: 'technician',
      tenantId: input.companyId,
      customerId: null,
      assignmentRequired: !elevated,
      permissionBasis: assigned ? 'job_assignment' : 'elevated_ops_permission',
      audienceEscalationAttempt: escalation,
    };
  }

  if (isReportClientRole(input.roleName)) {
    if (!canAccessClient(input.permissions)) {
      throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export client reports');
    }
    return {
      effectiveAudience: 'client',
      actorCategory: 'client',
      tenantId: input.companyId,
      customerId: null,
      assignmentRequired: false,
      permissionBasis: 'client_role',
      audienceEscalationAttempt: requested !== 'client',
    };
  }

  let effective: OperationalReportAudience = requested;
  let escalation = false;

  if (requested === 'internal') {
    if (!canAccessInternal(input.permissions)) {
      throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export internal reports');
    }
    effective = 'internal';
  } else if (requested === 'client') {
    if (!canAccessClient(input.permissions)) {
      throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export client reports');
    }
    effective = 'client';
  } else {
    const assigned = input.isAssignedToJob;
    const elevated = canAccessTechnicianElevated(input.permissions);
    if (!assigned && !elevated) {
      throw new ReportAudienceError('FORBIDDEN', 'Technician-safe reports require job assignment or elevated permission');
    }
    if (maxAudience === 'client' && !elevated && !assigned) {
      throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export technician reports');
    }
    effective = 'technician';
    if (requested !== 'technician') escalation = true;
  }

  if (
    (effective === 'internal' && maxAudience !== 'internal') ||
    (effective === 'client' && maxAudience === 'technician')
  ) {
    throw new ReportAudienceError('FORBIDDEN', 'Requested report audience exceeds your permission level');
  }

  return {
    effectiveAudience: effective,
    actorCategory,
    tenantId: input.companyId,
    customerId: null,
    assignmentRequired: effective === 'technician' && !canAccessTechnicianElevated(input.permissions),
    permissionBasis:
      effective === 'internal'
        ? 'internal_report_permission'
        : effective === 'client'
          ? 'client_report_permission'
          : input.isAssignedToJob
            ? 'job_assignment'
            : 'elevated_ops_permission',
    audienceEscalationAttempt: escalation || (parsed != null && parsed !== effective),
  };
}

export function resolvePortalReportAudience(input: PortalReportAudienceInput): ReportAudienceDecision {
  if (!hasAny(input.permissions, ['portal.jobs:read', 'portal.documents:read'])) {
    throw new ReportAudienceError('FORBIDDEN', 'Portal permission denied for report export');
  }

  if (
    input.resourceCustomerId &&
    input.resourceCustomerId !== input.customerId
  ) {
    throw new ReportAudienceError('FORBIDDEN', 'You do not have permission to export this report');
  }

  const parsed = parseRequestedReportAudience(input.requestedAudience);
  const escalation = parsed != null && parsed !== 'client';

  return {
    effectiveAudience: 'client',
    actorCategory: 'portal_client',
    tenantId: input.companyId,
    customerId: input.customerId,
    assignmentRequired: false,
    permissionBasis: 'portal_customer_relationship',
    audienceEscalationAttempt: escalation,
  };
}

export class ReportAudienceError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'INVALID_AUDIENCE',
    message: string,
  ) {
    super(message);
    this.name = 'ReportAudienceError';
  }
}

/** Prohibited structured field names that must never appear in non-internal report output. */
export const REPORT_SENSITIVE_FIELD_PATTERNS = [
  'internalNotes',
  'unitCost',
  'lineCost',
  'margin',
  'profit',
  'payroll',
  'wage',
  'storageKey',
  'storagePath',
  'signatureDocId',
] as const;

export function assertReportHtmlFreeOfSensitiveFields(
  html: string,
  audience: OperationalReportAudience,
): void {
  if (audience === 'internal') return;

  const prohibitedPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'internalNotes', pattern: /\binternalNotes\b/ },
    { label: 'unitCost', pattern: /\bunitCost\b/ },
    { label: 'lineCost', pattern: /\blineCost\b/ },
    { label: 'profit', pattern: /\bprofit\b/i },
    { label: 'payroll', pattern: /\bpayroll\b/i },
    { label: 'wage', pattern: /\bwage\b/i },
    { label: 'storageKey', pattern: /\bstorageKey\b/ },
    { label: 'storagePath', pattern: /\bstoragePath\b/ },
    { label: 'signatureDocId', pattern: /\bsignatureDocId\b/ },
    { label: 'margin review', pattern: /margin review/i },
  ];

  for (const { label, pattern } of prohibitedPatterns) {
    if (pattern.test(html)) {
      throw new Error(`Sensitive field "${label}" leaked into ${audience} report HTML`);
    }
  }
  if (html.includes('/api/v1/jobs') || html.includes('/var/lib/')) {
    throw new Error(`Storage path leaked into ${audience} report HTML`);
  }
}
