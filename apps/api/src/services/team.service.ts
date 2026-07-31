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
import type { CreateTeamInviteResponse, TeamInvite, TeamMember, TeamRole } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { roles, securityAuditLogs, userInvites, users } from '@titan/db';

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

export class TeamService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly appUrl: string,
  ) {}

  async listMembers(companyId: string): Promise<TeamMember[]> {
    await this.ensureDefaultRoles(companyId);

    const members = await this.db.query.users.findMany({
      where: eq(users.companyId, companyId),
      with: { role: true },
      orderBy: [asc(users.createdAt)],
    });

    return members.map((member) => ({
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      roleId: member.roleId,
      roleName: member.role?.name ?? 'Unknown',
      isActive: member.isActive,
      lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
      createdAt: member.createdAt.toISOString(),
    }));
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

    const member = await this.db.query.users.findFirst({
      where: and(eq(users.id, memberId), eq(users.companyId, scope.companyId)),
      with: { role: true },
    });

    if (!member) {
      throw new TeamError('MEMBER_NOT_FOUND', 'Team member not found');
    }

    if (!isActive && member.role?.name && isCompanyOwnerRoleName(member.role.name)) {
      const activeOwners = await this.db.query.users.findMany({
        where: and(eq(users.companyId, scope.companyId), eq(users.isActive, true)),
        with: { role: true },
      });

      const ownerCount = activeOwners.filter(
        (user) => user.role?.name && isCompanyOwnerRoleName(user.role.name),
      ).length;
      if (ownerCount <= 1) {
        throw new TeamError('LAST_OWNER', 'Cannot suspend the last active Company Owner');
      }
    }

    const [updated] = await this.db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, memberId))
      .returning();

    if (!updated) {
      throw new TeamError('UPDATE_FAILED', 'Unable to update member status');
    }

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      roleId: updated.roleId,
      roleName: member.role?.name ?? 'Unknown',
      isActive: updated.isActive,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
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

    const member = await this.db.query.users.findFirst({
      where: and(eq(users.id, memberId), eq(users.companyId, actor.companyId)),
      with: { role: true },
    });

    if (!member) {
      throw new TeamError('MEMBER_NOT_FOUND', 'Team member not found');
    }

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
      const activeOwners = await this.db.query.users.findMany({
        where: and(eq(users.companyId, actor.companyId), eq(users.isActive, true)),
        with: { role: true },
      });
      const ownerCount = activeOwners.filter(
        (user) => user.role?.name && isCompanyOwnerRoleName(user.role.name),
      ).length;
      if (ownerCount <= 1) {
        throw new TeamError(
          'LAST_OWNER',
          'Cannot demote the last active Company Owner without assigning another',
        );
      }
    }

    if (member.roleId === targetRole.id) {
      return {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        roleId: member.roleId,
        roleName: member.role?.name ?? 'Unknown',
        isActive: member.isActive,
        lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
        createdAt: member.createdAt.toISOString(),
      };
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

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      roleId: updated.roleId,
      roleName: targetRole.name,
      isActive: updated.isActive,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}

export { ADMIN_ROLE_NAME, MEMBER_ROLE_NAME, OWNER_ROLE_NAME };
