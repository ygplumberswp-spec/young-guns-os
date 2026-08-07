export type TeamRole = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
};

export type TeamMember = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Present when caller has users:manage — YG-CUTOVER-001A lifecycle flags. */
  lifecycle?: {
    canSuspend: boolean;
    canReactivate: boolean;
    canRemoveAccess: boolean;
    canEditRole: boolean;
    canHardDelete: boolean;
    hardDeleteRefusalMessage: string | null;
  };
  /**
   * Owner/Finance only. Technicians never receive salary fields.
   * When role is Technician and payroll is missing: setupStatus = incomplete.
   */
  payroll?: {
    setupStatus: 'complete' | 'incomplete';
    setupLabel: string | null;
    currentMonthlySalaryCents: number | null;
    derivedHourlyCostCents: number | null;
    effectiveFrom: string | null;
  } | null;
};

export type TeamInvite = {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

export type CreateTeamInviteRequest = {
  email: string;
  roleId: string;
  /**
   * Required for a complete Technician onboarding payroll setup.
   * When omitted for Technician invites, access can still activate but
   * wage/job-cost surfaces show PAYROLL SETUP INCOMPLETE.
   */
  payrollSetup?: {
    monthlySalaryCents: number;
    effectiveFrom: string;
    workingDaysPerWeek?: number;
    workingHoursPerDay?: number;
    overtimeDailyThresholdHours?: number;
    overtimeMultiplierBps?: number;
    payrollReference?: string | null;
    notes?: string | null;
  } | null;
};

export type UpdateTeamMemberRoleRequest = {
  roleId: string;
};

export type UpdateTeamMemberStatusRequest = {
  isActive: boolean;
};

export type CreateTeamInviteResponse = {
  invite: TeamInvite;
  inviteUrl: string;
};

export type AcceptInviteRequest = {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
};

export type InvitePreview = {
  email: string;
  companyName: string;
  roleName: string;
  expiresAt: string;
};
