/**
 * YG-CUTOVER-001A — Safe user lifecycle management contracts.
 * Hard delete is refused whenever business history/FK attribution would be lost.
 */

export const USER_HARD_DELETE_REFUSED_MESSAGE =
  'This user has business history and cannot be permanently deleted. Deactivate access instead.';

export const USER_LIFECYCLE_ACTIONS = [
  'invite',
  'change_role',
  'suspend',
  'reactivate',
  'remove_access',
  'hard_delete',
] as const;

export type UserLifecycleAction = (typeof USER_LIFECYCLE_ACTIONS)[number];

export type UserSafeDeleteBlockerCode =
  | 'SELF_DELETE'
  | 'LAST_OWNER'
  | 'CROSS_TENANT'
  | 'ASSIGNED_OR_COMPLETED_JOBS'
  | 'TIME_ENTRIES'
  | 'JOB_CARDS_OR_DOCUMENTATION'
  | 'DOCUMENTS'
  | 'COMMUNICATIONS'
  | 'FINANCIAL_RECORDS'
  | 'APPROVALS'
  | 'AUDIT_SENSITIVE_HISTORY'
  | 'WORKFORCE_PROFILE_HISTORY'
  | 'OTHER_BUSINESS_RELATIONSHIP'
  | 'CONFIRMATION_MISMATCH';

export type UserSafeDeleteDependencyCheck = {
  code: UserSafeDeleteBlockerCode;
  label: string;
  count: number;
};

export type UserHardDeleteEligibility = {
  memberId: string;
  companyId: string;
  canHardDelete: boolean;
  blockers: UserSafeDeleteDependencyCheck[];
  refusalMessage: string | null;
  confirmationHint: 'email_or_display_name';
};

export type HardDeleteTeamMemberRequest = {
  /** Must match the member's email or "First Last" display name (trimmed, case-insensitive). */
  confirmation: string;
};

export type TeamMemberLifecycleSummary = {
  canSuspend: boolean;
  canReactivate: boolean;
  canRemoveAccess: boolean;
  canEditRole: boolean;
  canHardDelete: boolean;
  hardDeleteRefusalMessage: string | null;
};

export type StagingTestAccountClassification =
  | 'SAFE_TO_DELETE'
  | 'MUST_DEACTIVATE'
  | 'REQUIRED_FOR_TEST_HARNESS'
  | 'UNKNOWN';

export type StagingTestAccountInventoryRow = {
  displayName: string;
  classification: StagingTestAccountClassification;
  rationale: string;
  autoDeleteAllowed: false;
  ownerApprovalRequired: boolean;
};

/**
 * Visible staging-only test/smoke accounts from Team & Access.
 * Classification is advisory until a live dependency audit runs.
 * Never auto-delete. Never delete the canonical Young Guns Owner.
 */
export const YG_CUTOVER_001A_STAGING_TEST_USER_INVENTORY: readonly StagingTestAccountInventoryRow[] =
  [
    {
      displayName: 'canonical Company Owner',
      classification: 'REQUIRED_FOR_TEST_HARNESS',
      rationale:
        'Canonical Young Guns Company Owner — protected. Never hard-delete; required for tenant ownership and cutover.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: false,
    },
    {
      displayName: 'RBAC Accountant-251',
      classification: 'UNKNOWN',
      rationale:
        'Staging RBAC smoke label. Candidate for hard delete only after Owner approval and a passing safe-delete dependency check; otherwise deactivate.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'RBAC Dispatcher-251',
      classification: 'UNKNOWN',
      rationale:
        'Staging RBAC smoke label. Candidate for hard delete only after Owner approval and a passing safe-delete dependency check; otherwise deactivate.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'Owner Smoke',
      classification: 'UNKNOWN',
      rationale:
        'Smoke Owner account. If it is not the last/canonical Owner and has zero business history, SAFE_TO_DELETE after Owner approval; else MUST_DEACTIVATE.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'Tech Smoke',
      classification: 'UNKNOWN',
      rationale:
        'Smoke Technician. Hard delete only when dependency checks pass; otherwise deactivate to preserve attribution.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'Owner Test',
      classification: 'UNKNOWN',
      rationale:
        'Test Owner account. Protect if it is the last active Company Owner; otherwise audit history before any delete.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'Tech Test',
      classification: 'UNKNOWN',
      rationale:
        'Test Technician. Likely has Job Card / time history in staging — expect MUST_DEACTIVATE until proven clean.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
    {
      displayName: 'Client Test',
      classification: 'UNKNOWN',
      rationale:
        'Test Client. Portal/customer linkage may block hard delete; deactivate when history exists.',
      autoDeleteAllowed: false,
      ownerApprovalRequired: true,
    },
  ] as const;

export function matchesUserDeleteConfirmation(input: {
  confirmation: string;
  email: string;
  firstName: string;
  lastName: string;
}): boolean {
  const confirmation = input.confirmation.trim().toLowerCase();
  if (!confirmation) return false;
  const email = input.email.trim().toLowerCase();
  const displayName = `${input.firstName} ${input.lastName}`.trim().toLowerCase();
  return confirmation === email || confirmation === displayName;
}

export function summarizeHardDeleteEligibility(
  blockers: UserSafeDeleteDependencyCheck[],
): Pick<UserHardDeleteEligibility, 'canHardDelete' | 'refusalMessage'> {
  const active = blockers.filter((b) => b.count > 0);
  if (active.length === 0) {
    return { canHardDelete: true, refusalMessage: null };
  }
  return {
    canHardDelete: false,
    refusalMessage: USER_HARD_DELETE_REFUSED_MESSAGE,
  };
}
