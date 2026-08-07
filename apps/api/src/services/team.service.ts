import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  ADMIN_ROLE_NAME,
  canAssignRoleName,
  COMPANY_OWNER_ROLE_NAME,
  DEFAULT_TEAM_ROLES,
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_TTL_MS,
  isCompanyOwnerRole,
  isCompanyOwnerRoleName,
  isInviteAssignableRoleName,
  isPlatformOwnerRole,
  MEMBER_ROLE_NAME,
  OWNER_ROLE_NAME,
  PLATFORM_OWNER_ROLE_NAME,
  type StaffIdentity,
} from '@titan/auth';
import {
  canViewTechnicianPayroll,
  matchesUserDeleteConfirmation,
  TECHNICIAN_ONBOARDING_STEPS,
  USER_HARD_DELETE_REFUSED_MESSAGE,
  type CreateTeamInviteRequest,
  type CreateTeamInviteResponse,
  type TeamInvite,
  type TeamMember,
  type TeamRole,
  type UserHardDeleteEligibility,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { roles, securityAuditLogs, sessions, userInvites, users } from '@titan/db';
import { evaluateUserHardDeleteEligibility } from './user-safe-delete.js';
import type { TechnicianPayrollService } from './technician-payroll.service.js';
import { TechnicianPayrollError } from './technician-payroll.service.js';

function toTeamMember(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  },
  roleName: string,
): TeamMember {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    roleName,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export class TeamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TeamError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type ActorScope = TenantScope & StaffIdentity;

type SeatGuardResult = {
  allowed: boolean;
  code: string;
  message: string;
  used: number;
  included: number | null;
  permitted: number | null;
};

export class TeamService {
  private payrollService: TechnicianPayrollService | null = null;
  private seatGuard:
    | ((companyId: string, roleName: string) => Promise<SeatGuardResult>)
    | null = null;

  constructor(
    private readonly db: DatabaseClient,
    private readonly appUrl: string,
  ) {}

  setPayrollService(payrollService: TechnicianPayrollService) {
    this.payrollService = payrollService;
  }

  /** Optional SaaS seat entitlement gate (Department 21). */
  setSeatGuard(guard: (companyId: string, roleName: string) => Promise<SeatGuardResult>) {
    this.seatGuard = guard;
  }

  async listMembers(companyId: string, actor?: ActorScope): Promise<TeamMember[]> {
    await this.ensureDefaultRoles(companyId);

    const members = await this.db.query.users.findMany({
      where: eq(users.companyId, companyId),
      with: { role: true },
      orderBy: [asc(users.createdAt)],
    });

    const canManageLifecycle = Boolean(
      actor &&
        (actor.permissions.includes('users:manage') ||
          actor.permissions.includes('*') ||
          isCompanyOwnerRole(actor) ||
          isPlatformOwnerRole(actor)),
    );
    const canAssignRoles = Boolean(
      actor && (isCompanyOwnerRole(actor) || isPlatformOwnerRole(actor)),
    );
    const canViewPayroll = Boolean(
      actor && canViewTechnicianPayroll(actor.permissions, actor.roleName),
    );

    const result: TeamMember[] = [];
    for (const member of members) {
      const base = toTeamMember(member, member.role?.name ?? 'Unknown');
      let next: TeamMember = base;

      if (canManageLifecycle && actor) {
        const isSelf = member.id === actor.userId;
        next = {
          ...base,
          lifecycle: {
            canSuspend: !isSelf && member.isActive,
            canReactivate: !isSelf && !member.isActive,
            canRemoveAccess: !isSelf && member.isActive,
            canEditRole: canAssignRoles && !isSelf,
            // Hard-delete safety is resolved via DELETE eligibility endpoint / Actions menu.
            canHardDelete: !isSelf,
            hardDeleteRefusalMessage: isSelf
              ? 'You cannot permanently delete your own account'
              : null,
          },
        };
      }

      // Salary/wage fields only for Owner/Finance — never for Technician viewers.
      if (
        canViewPayroll &&
        this.payrollService &&
        (member.role?.name ?? '') === 'Technician'
      ) {
        next = {
          ...next,
          payroll: await this.payrollService.getMemberPayrollBrief(companyId, member.id),
        };
      }

      result.push(next);
    }
    return result;
  }

  async listRoles(companyId: string): Promise<TeamRole[]> {
    await this.ensureDefaultRoles(companyId);

    const companyRoles = await this.db.query.roles.findMany({
      where: eq(roles.companyId, companyId),
      orderBy: [asc(roles.name)],
    });

    return companyRoles.map((role) => ({
      id: role.id,
      name: role.name,
      permissions: role.permissions,
      isSystem: role.isSystem,
    }));
  }

  async listInvites(companyId: string): Promise<TeamInvite[]> {
    const invites = await this.db.query.userInvites.findMany({
      where: and(
        eq(userInvites.companyId, companyId),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
      ),
      with: {
        role: true,
        invitedBy: true,
      },
      orderBy: [asc(userInvites.createdAt)],
    });

    const now = new Date();

    return invites
      .filter((invite) => invite.expiresAt >= now)
      .map((invite) => ({
        id: invite.id,
        email: invite.email,
        roleId: invite.roleId,
        roleName: invite.role?.name ?? 'Unknown',
        invitedByName: invite.invitedBy
          ? `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`
          : 'Unknown',
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      }));
  }

  async createInvite(
    scope: TenantScope,
    email: string,
    roleId: string,
    payrollSetup?: CreateTeamInviteRequest['payrollSetup'],
  ): Promise<CreateTeamInviteResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.companyId, scope.companyId)),
    });

    if (!role) {
      throw new TeamError('ROLE_NOT_FOUND', 'Selected role was not found');
    }

    if (!isInviteAssignableRoleName(role.name)) {
      throw new TeamError(
        'ROLE_NOT_ASSIGNABLE',
        `The ${role.name} role cannot be assigned via invite`,
      );
    }

    if (this.seatGuard) {
      const seat = await this.seatGuard(scope.companyId, role.name);
      if (!seat.allowed) {
        throw new TeamError(
          'SEAT_LIMIT_REACHED',
          `${seat.message}. Used ${seat.used}${seat.included != null ? ` of ${seat.included} included` : ''}${seat.permitted != null ? ` (${seat.permitted} permitted)` : ''}. Upgrade or add seats.`,
        );
      }
    }

    let payrollDraft: Record<string, unknown> | null = null;
    if (role.name === 'Technician' && payrollSetup) {
      if (!this.payrollService) {
        throw new TeamError('PAYROLL_UNAVAILABLE', 'Payroll service is not configured');
      }
      try {
        const parsed = this.payrollService.parseInvitePayrollSetup(payrollSetup);
        payrollDraft = parsed;
      } catch (error) {
        if (error instanceof TechnicianPayrollError) {
          throw new TeamError(error.code, error.message);
        }
        throw error;
      }
    } else if (role.name === 'Technician' && payrollSetup === null) {
      // Explicit incomplete onboarding — allowed, surfaces PAYROLL SETUP INCOMPLETE later.
      payrollDraft = null;
    }

    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (existingUser) {
      throw new TeamError('EMAIL_IN_USE', 'A user with this email already exists');
    }

    await this.db
      .update(userInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userInvites.companyId, scope.companyId),
          eq(userInvites.email, normalizedEmail),
          isNull(userInvites.acceptedAt),
          isNull(userInvites.revokedAt),
        ),
      );

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

    const [invite] = await this.db
      .insert(userInvites)
      .values({
        companyId: scope.companyId,
        email: normalizedEmail,
        roleId,
        invitedByUserId: scope.userId,
        tokenHash,
        expiresAt,
        payrollSetup: role.name === 'Technician' ? payrollDraft : null,
      })
      .returning();

    if (!invite) {
      throw new TeamError('INVITE_FAILED', 'Unable to create invite');
    }

    const inviter = await this.db.query.users.findFirst({
      where: eq(users.id, scope.userId),
    });

    const teamInvite: TeamInvite = {
      id: invite.id,
      email: invite.email,
      roleId: invite.roleId,
      roleName: role.name,
      invitedByName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Unknown',
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };

    await this.writeLifecycleAudit({
      companyId: scope.companyId,
      actorUserId: scope.userId,
      action: 'user_invited',
      entityId: invite.id,
      metadata: {
        inviteEmail: normalizedEmail,
        roleName: role.name,
        roleId,
        onboardingSteps: role.name === 'Technician' ? TECHNICIAN_ONBOARDING_STEPS : undefined,
        payrollSetupComplete: role.name === 'Technician' ? Boolean(payrollDraft) : undefined,
      },
    });

    return {
      invite: teamInvite,
      inviteUrl: `${this.appUrl.replace(/\/$/, '')}/auth/accept-invite?token=${token}`,
    };
  }

  async ensureDefaultRoles(companyId: string): Promise<void> {
    const existingRoles = await this.db.query.roles.findMany({
      where: eq(roles.companyId, companyId),
    });

    const existingNames = new Set(existingRoles.map((role) => role.name));
    const missingRoles = DEFAULT_TEAM_ROLES.filter((role) => !existingNames.has(role.name));

    if (missingRoles.length > 0) {
      await this.db.insert(roles).values(
        missingRoles.map((role) => ({
          companyId,
          name: role.name,
          permissions: [...role.permissions],
          isSystem: role.isSystem,
        })),
      );
    }

    const refreshed = missingRoles.length
      ? await this.db.query.roles.findMany({ where: eq(roles.companyId, companyId) })
      : existingRoles;

    for (const template of DEFAULT_TEAM_ROLES) {
      const role = refreshed.find((entry) => entry.name === template.name);

      if (!role?.isSystem) {
        continue;
      }

      const current = [...role.permissions].sort().join(',');
      const next = [...template.permissions].sort().join(',');

      if (current !== next) {
        await this.db
          .update(roles)
          .set({ permissions: [...template.permissions] })
          .where(eq(roles.id, role.id));
      }
    }
  }

  /** Roles allowed on invite links. */
  getAssignableRoles(allRoles: TeamRole[]): TeamRole[] {
    return allRoles.filter((role) => isInviteAssignableRoleName(role.name));
  }

  /** Roles the actor may assign via Users & Access (manual). */
  getManuallyAssignableRoles(allRoles: TeamRole[], actor: StaffIdentity): TeamRole[] {
    return allRoles.filter((role) => canAssignRoleName(actor, role.name).allowed);
  }

  async revokeInvite(scope: TenantScope, inviteId: string): Promise<void> {
    const invite = await this.db.query.userInvites.findFirst({
      where: and(eq(userInvites.id, inviteId), eq(userInvites.companyId, scope.companyId)),
    });

    if (!invite || invite.acceptedAt || invite.revokedAt) {
      throw new TeamError('INVITE_NOT_FOUND', 'Invite not found or already closed');
    }

    await this.db
      .update(userInvites)
      .set({ revokedAt: new Date() })
      .where(eq(userInvites.id, inviteId));
  }

  async updateMemberStatus(
    scope: TenantScope,
    memberId: string,
    isActive: boolean,
  ): Promise<TeamMember> {
    if (memberId === scope.userId && !isActive) {
      throw new TeamError('SELF_LOCKOUT', 'You cannot suspend your own account');
    }

    const member = await this.requireTenantMember(scope.companyId, memberId);

    if (!isActive && member.role?.name && isCompanyOwnerRoleName(member.role.name)) {
      const ownerCount = await this.countActiveCompanyOwners(scope.companyId);
      if (ownerCount <= 1) {
        throw new TeamError('LAST_OWNER', 'Cannot suspend the last active Company Owner');
      }
    }

    const [updated] = await this.db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, memberId))
      .returning();

    if (!updated) {
      throw new TeamError('UPDATE_FAILED', 'Unable to update member status');
    }

    if (!isActive) {
      await this.revokeAllSessions(memberId, 'account_suspended');
    }

    await this.writeLifecycleAudit({
      companyId: scope.companyId,
      actorUserId: scope.userId,
      action: isActive ? 'user_reactivated' : 'user_suspended',
      entityId: memberId,
      metadata: {
        targetUserId: memberId,
        targetEmail: member.email,
        previousIsActive: member.isActive,
        nextIsActive: isActive,
      },
    });

    return this.toTeamMember(updated, member.role?.name ?? 'Unknown');
  }

  /**
   * Remove access = deactivate + revoke sessions (offboarding language).
   * Preserves the user row and all historical attribution.
   */
  async removeMemberAccess(scope: TenantScope, memberId: string): Promise<TeamMember> {
    if (memberId === scope.userId) {
      throw new TeamError('SELF_LOCKOUT', 'You cannot remove access from your own account');
    }

    const member = await this.requireTenantMember(scope.companyId, memberId);

    if (member.role?.name && isCompanyOwnerRoleName(member.role.name)) {
      const ownerCount = await this.countActiveCompanyOwners(scope.companyId);
      if (ownerCount <= 1) {
        throw new TeamError('LAST_OWNER', 'Cannot remove access from the last active Company Owner');
      }
    }

    const [updated] = await this.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, memberId))
      .returning();

    if (!updated) {
      throw new TeamError('UPDATE_FAILED', 'Unable to remove member access');
    }

    await this.revokeAllSessions(memberId, 'access_removed');

    await this.writeLifecycleAudit({
      companyId: scope.companyId,
      actorUserId: scope.userId,
      action: 'user_access_removed',
      entityId: memberId,
      metadata: {
        targetUserId: memberId,
        targetEmail: member.email,
        previousIsActive: member.isActive,
      },
    });

    return this.toTeamMember(updated, member.role?.name ?? 'Unknown');
  }

  async getMemberDeleteEligibility(
    scope: TenantScope,
    memberId: string,
  ): Promise<UserHardDeleteEligibility> {
    await this.requireTenantMember(scope.companyId, memberId);

    if (memberId === scope.userId) {
      return {
        memberId,
        companyId: scope.companyId,
        canHardDelete: false,
        blockers: [{ code: 'SELF_DELETE', label: 'Self-delete denied', count: 1 }],
        refusalMessage: 'You cannot permanently delete your own account',
        confirmationHint: 'email_or_display_name',
      };
    }

    const member = await this.requireTenantMember(scope.companyId, memberId);
    if (member.role?.name && isCompanyOwnerRoleName(member.role.name)) {
      const ownerCount = await this.countActiveCompanyOwners(scope.companyId);
      if (ownerCount <= 1) {
        return {
          memberId,
          companyId: scope.companyId,
          canHardDelete: false,
          blockers: [{ code: 'LAST_OWNER', label: 'Last active Company Owner', count: 1 }],
          refusalMessage: 'Cannot delete the last active Company Owner',
          confirmationHint: 'email_or_display_name',
        };
      }
    }

    return evaluateUserHardDeleteEligibility(this.db, scope.companyId, memberId);
  }

  /**
   * Permanent delete — only when demonstrably safe.
   * Cross-tenant denied via companyId scoping on member lookup.
   */
  async hardDeleteMember(
    scope: TenantScope,
    memberId: string,
    confirmation: string,
  ): Promise<{ deleted: true; memberId: string }> {
    if (memberId === scope.userId) {
      throw new TeamError('SELF_DELETE', 'You cannot permanently delete your own account');
    }

    const member = await this.requireTenantMember(scope.companyId, memberId);

    if (
      !matchesUserDeleteConfirmation({
        confirmation,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
      })
    ) {
      throw new TeamError(
        'CONFIRMATION_MISMATCH',
        'Confirmation must match the user email or displayed name exactly',
      );
    }

    if (member.role?.name && isCompanyOwnerRoleName(member.role.name)) {
      const ownerCount = await this.countActiveCompanyOwners(scope.companyId);
      if (ownerCount <= 1) {
        throw new TeamError('LAST_OWNER', 'Cannot delete the last active Company Owner');
      }
    }

    const eligibility = await evaluateUserHardDeleteEligibility(
      this.db,
      scope.companyId,
      memberId,
    );

    if (!eligibility.canHardDelete) {
      await this.writeLifecycleAudit({
        companyId: scope.companyId,
        actorUserId: scope.userId,
        action: 'user_hard_delete_refused',
        entityId: memberId,
        metadata: {
          targetUserId: memberId,
          targetEmail: member.email,
          blockers: eligibility.blockers.filter((b) => b.count > 0),
        },
      });
      throw new TeamError(
        'HARD_DELETE_REFUSED',
        eligibility.refusalMessage ?? USER_HARD_DELETE_REFUSED_MESSAGE,
      );
    }

    await this.revokeAllSessions(memberId, 'account_hard_deleted');

    await this.writeLifecycleAudit({
      companyId: scope.companyId,
      actorUserId: scope.userId,
      action: 'user_hard_deleted',
      entityId: memberId,
      metadata: {
        targetUserId: memberId,
        targetEmail: member.email,
        targetName: `${member.firstName} ${member.lastName}`.trim(),
        targetRoleName: member.role?.name ?? null,
      },
    });

    await this.db.delete(users).where(and(eq(users.id, memberId), eq(users.companyId, scope.companyId)));

    return { deleted: true, memberId };
  }

  /**
   * Owner-only manual role assignment.
   * - No self-promotion
   * - Company Owner only by Platform Owner
   * - Audited to security_audit_logs
   */
  async updateMemberRole(actor: ActorScope, memberId: string, roleId: string): Promise<TeamMember> {
    if (memberId === actor.userId) {
      throw new TeamError('SELF_PROMOTION', 'You cannot change your own role');
    }

    if (!isPlatformOwnerRole(actor) && !isCompanyOwnerRole(actor)) {
      throw new TeamError(
        'ROLE_ASSIGN_FORBIDDEN',
        'Only Company Owner or Platform Owner may assign roles',
      );
    }

    const member = await this.requireTenantMember(actor.companyId, memberId);

    const targetRole = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.companyId, actor.companyId)),
    });

    if (!targetRole) {
      throw new TeamError('ROLE_NOT_FOUND', 'Selected role was not found');
    }

    const decision = canAssignRoleName(actor, targetRole.name);
    if (!decision.allowed) {
      throw new TeamError('ROLE_NOT_ASSIGNABLE', decision.reason ?? 'Role is not assignable');
    }

    if (
      member.role?.name &&
      isCompanyOwnerRoleName(member.role.name) &&
      targetRole.name !== COMPANY_OWNER_ROLE_NAME &&
      targetRole.name !== PLATFORM_OWNER_ROLE_NAME
    ) {
      const ownerCount = await this.countActiveCompanyOwners(actor.companyId);
      if (ownerCount <= 1) {
        throw new TeamError(
          'LAST_OWNER',
          'Cannot demote the last active Company Owner without assigning another',
        );
      }
    }

    if (member.roleId === targetRole.id) {
      return this.toTeamMember(member, member.role?.name ?? 'Unknown');
    }

    const [updated] = await this.db
      .update(users)
      .set({ roleId: targetRole.id, updatedAt: new Date() })
      .where(eq(users.id, memberId))
      .returning();

    if (!updated) {
      throw new TeamError('UPDATE_FAILED', 'Unable to update member role');
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'authorization',
      action: 'role_manual_reassignment',
      entityType: 'user',
      entityId: memberId,
      userId: actor.userId,
      metadata: {
        targetUserId: memberId,
        fromRoleName: member.role?.name ?? null,
        fromRoleId: member.roleId,
        toRoleName: targetRole.name,
        toRoleId: targetRole.id,
        actorUserId: actor.userId,
        actorRoleName: actor.roleName,
        authority: 'immutable_user_and_role_ids',
      },
    });

    return this.toTeamMember(updated, targetRole.name);
  }

  private async requireTenantMember(companyId: string, memberId: string) {
    const member = await this.db.query.users.findFirst({
      where: and(eq(users.id, memberId), eq(users.companyId, companyId)),
      with: { role: true },
    });

    if (!member) {
      throw new TeamError('MEMBER_NOT_FOUND', 'Team member not found');
    }

    return member;
  }

  private async countActiveCompanyOwners(companyId: string): Promise<number> {
    const activeOwners = await this.db.query.users.findMany({
      where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
      with: { role: true },
    });
    return activeOwners.filter(
      (user) => user.role?.name && isCompanyOwnerRoleName(user.role.name),
    ).length;
  }

  private async revokeAllSessions(userId: string, reason: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  private async writeLifecycleAudit(input: {
    companyId: string;
    actorUserId: string;
    action: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: input.companyId,
      category: 'authorization',
      action: input.action,
      entityType: 'user',
      entityId: input.entityId,
      userId: input.actorUserId,
      metadata: input.metadata,
    });
  }

  private toTeamMember = toTeamMember;
}

export { ADMIN_ROLE_NAME, MEMBER_ROLE_NAME, OWNER_ROLE_NAME };
