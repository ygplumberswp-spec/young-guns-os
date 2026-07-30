import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  DEFAULT_PORTAL_ACCESS_PERMISSIONS,
  isPortalAccessPermission,
  PORTAL_ACCESS_PERMISSION_OPTIONS,
  type CreatePortalUserRequest,
  type CreatePortalUserInviteResponse,
  type CustomerPortalAccessSummary,
  type PortalAccessPermission,
  type PortalDashboardResponse,
  type PortalStats,
  type PortalUserDetail,
  type PortalUserInviteSummary,
  type PortalUserSummary,
  type UpdatePortalUserRequest,
} from '@titan/shared';
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_TTL_MS,
} from '@titan/auth';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customers,
  documents,
  invoices,
  jobs,
  portalUserInvites,
  portalUserPermissions,
  portalUsers,
  portalSessions,
  quotes,
  securityAuditLogs,
  users,
} from '@titan/db';
import { hashPassword } from './portal-auth.service.js';

export class PortalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortalError';
  }
}

export type AuraPortalContext = {
  portalUserCount: number;
  activePortalUserCount: number;
  linkedCustomerCount: number;
  portalUsers: Array<{
    customerName: string;
    email: string;
    isActive: boolean;
    permissionCount: number;
  }>;
  accessPermissions: string[];
};

type PortalScope = {
  companyId: string;
  customerId: string;
  permissions: PortalAccessPermission[];
};

type TenantScope = {
  companyId: string;
  userId: string;
};

export class PortalService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly appUrl: string,
  ) {}

  async listPortalUsers(companyId: string): Promise<PortalUserSummary[]> {
    const rows = await this.db.query.portalUsers.findMany({
      where: eq(portalUsers.companyId, companyId),
      with: { customer: true, permissions: true },
      orderBy: [desc(portalUsers.updatedAt)],
    });

    return rows.map(toPortalUserSummary);
  }

  async getPortalUser(companyId: string, portalUserId: string): Promise<PortalUserDetail | null> {
    const row = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.id, portalUserId), eq(portalUsers.companyId, companyId)),
      with: { customer: true, permissions: true },
    });

    return row ? toPortalUserDetail(row) : null;
  }

  async createPortalUser(
    companyId: string,
    input: CreatePortalUserRequest,
  ): Promise<PortalUserDetail> {
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    if (!email || !firstName || !lastName) {
      throw new PortalError('VALIDATION_ERROR', 'Email, first name, and last name are required');
    }

    await this.ensureCustomerBelongsToCompany(companyId, input.customerId);

    const existingForCustomer = await this.db.query.portalUsers.findFirst({
      where: and(
        eq(portalUsers.companyId, companyId),
        eq(portalUsers.customerId, input.customerId),
      ),
    });

    if (existingForCustomer) {
      throw new PortalError(
        'PORTAL_USER_EXISTS',
        'A portal user already exists for this customer',
      );
    }

    const existingEmail = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.email, email)),
    });

    if (existingEmail) {
      throw new PortalError('EMAIL_IN_USE', 'A portal user with this email already exists');
    }

    const permissions = normalizePermissions(input.permissions ?? DEFAULT_PORTAL_ACCESS_PERMISSIONS);
    const passwordHash = await hashPassword(input.password);

    const [created] = await this.db
      .insert(portalUsers)
      .values({
        companyId,
        customerId: input.customerId,
        email,
        passwordHash,
        firstName,
        lastName,
      })
      .returning();

    if (!created) {
      throw new PortalError('CREATE_FAILED', 'Unable to create portal user');
    }

    await this.replacePermissions(companyId, created.id, permissions);

    const portalUser = await this.getPortalUser(companyId, created.id);

    if (!portalUser) {
      throw new PortalError('CREATE_FAILED', 'Unable to load portal user');
    }

    return portalUser;
  }

  async updatePortalUser(
    companyId: string,
    portalUserId: string,
    input: UpdatePortalUserRequest,
  ): Promise<PortalUserDetail> {
    const existing = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.id, portalUserId), eq(portalUsers.companyId, companyId)),
    });

    if (!existing) {
      throw new PortalError('PORTAL_USER_NOT_FOUND', 'Portal user not found');
    }

    const email = input.email?.trim().toLowerCase();
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();

    if (input.email !== undefined && !email) {
      throw new PortalError('VALIDATION_ERROR', 'Email is required');
    }

    if (input.firstName !== undefined && !firstName) {
      throw new PortalError('VALIDATION_ERROR', 'First name is required');
    }

    if (input.lastName !== undefined && !lastName) {
      throw new PortalError('VALIDATION_ERROR', 'Last name is required');
    }

    if (email && email !== existing.email) {
      const duplicate = await this.db.query.portalUsers.findFirst({
        where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.email, email)),
      });

      if (duplicate) {
        throw new PortalError('EMAIL_IN_USE', 'A portal user with this email already exists');
      }
    }

    const [updated] = await this.db
      .update(portalUsers)
      .set({
        email: email ?? existing.email,
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(portalUsers.id, portalUserId), eq(portalUsers.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new PortalError('UPDATE_FAILED', 'Unable to update portal user');
    }

    if (input.permissions) {
      await this.replacePermissions(companyId, portalUserId, normalizePermissions(input.permissions));
    }

    const portalUser = await this.getPortalUser(companyId, portalUserId);

    if (!portalUser) {
      throw new PortalError('UPDATE_FAILED', 'Unable to load portal user');
    }

    return portalUser;
  }

  async getDashboard(scope: PortalScope): Promise<PortalDashboardResponse> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, scope.customerId), eq(customers.companyId, scope.companyId)),
      with: { company: true },
    });

    if (!customer?.company) {
      throw new PortalError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    const permissionSet = new Set(scope.permissions);
    const sections = [];

    if (permissionSet.has('portal.jobs:read')) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(and(eq(jobs.companyId, scope.companyId), eq(jobs.customerId, scope.customerId)));
      sections.push({
        key: 'jobs',
        label: 'Jobs',
        enabled: true,
        itemCount: row?.count ?? 0,
      });
    }

    if (permissionSet.has('portal.quotes:read')) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.companyId, scope.companyId), eq(quotes.customerId, scope.customerId)));
      sections.push({
        key: 'quotes',
        label: 'Quotes',
        enabled: true,
        itemCount: row?.count ?? 0,
      });
    }

    if (permissionSet.has('portal.invoices:read')) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(
          and(eq(invoices.companyId, scope.companyId), eq(invoices.customerId, scope.customerId)),
        );
      sections.push({
        key: 'invoices',
        label: 'Invoices',
        enabled: true,
        itemCount: row?.count ?? 0,
      });
    }

    if (permissionSet.has('portal.documents:read')) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(eq(documents.companyId, scope.companyId), eq(documents.customerId, scope.customerId)),
        );
      sections.push({
        key: 'documents',
        label: 'Documents',
        enabled: true,
        itemCount: row?.count ?? 0,
      });
    }

    if (permissionSet.has('portal.communications:read')) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(communications)
        .where(
          and(
            eq(communications.companyId, scope.companyId),
            eq(communications.customerId, scope.customerId),
          ),
        );
      sections.push({
        key: 'communications',
        label: 'Communications',
        enabled: true,
        itemCount: row?.count ?? 0,
      });
    }

    return {
      customerName: customer.name,
      companyName: customer.company.name,
      permissions: scope.permissions,
      sections,
    };
  }

  async getStats(companyId: string): Promise<PortalStats> {
    const [portalUserCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(portalUsers)
      .where(eq(portalUsers.companyId, companyId));

    const [activePortalUserCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(portalUsers)
      .where(and(eq(portalUsers.companyId, companyId), eq(portalUsers.isActive, true)));

    const [linkedCustomerCountRow] = await this.db
      .select({ count: sql<number>`count(distinct ${portalUsers.customerId})::int` })
      .from(portalUsers)
      .where(eq(portalUsers.companyId, companyId));

    return {
      portalUserCount: portalUserCountRow?.count ?? 0,
      activePortalUserCount: activePortalUserCountRow?.count ?? 0,
      linkedCustomerCount: linkedCustomerCountRow?.count ?? 0,
    };
  }

  async buildAuraContext(companyId: string): Promise<AuraPortalContext> {
    const stats = await this.getStats(companyId);

    const rows = await this.db.query.portalUsers.findMany({
      where: eq(portalUsers.companyId, companyId),
      with: { customer: true, permissions: true },
      orderBy: [desc(portalUsers.updatedAt)],
      limit: 10,
    });

    return {
      portalUserCount: stats.portalUserCount,
      activePortalUserCount: stats.activePortalUserCount,
      linkedCustomerCount: stats.linkedCustomerCount,
      portalUsers: rows.map((row: typeof portalUsers.$inferSelect & {
        customer: typeof customers.$inferSelect | null;
        permissions: Array<typeof portalUserPermissions.$inferSelect>;
      }) => ({
        customerName: row.customer?.name ?? 'Unknown',
        email: row.email,
        isActive: row.isActive,
        permissionCount: row.permissions.length,
      })),
      accessPermissions: PORTAL_ACCESS_PERMISSION_OPTIONS.map((option) => option.value),
    };
  }

  getAccessPermissionCatalog() {
    return PORTAL_ACCESS_PERMISSION_OPTIONS;
  }

  async getCustomerPortalAccess(
    companyId: string,
    customerId: string,
  ): Promise<CustomerPortalAccessSummary> {
    await this.ensureCustomerBelongsToCompany(companyId, customerId);

    const portalUser = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.companyId, companyId), eq(portalUsers.customerId, customerId)),
      with: { customer: true, permissions: true },
    });

    const pendingInviteRow = await this.db.query.portalUserInvites.findFirst({
      where: and(
        eq(portalUserInvites.companyId, companyId),
        eq(portalUserInvites.customerId, customerId),
        isNull(portalUserInvites.acceptedAt),
        isNull(portalUserInvites.revokedAt),
      ),
      with: { invitedBy: true },
      orderBy: [desc(portalUserInvites.createdAt)],
    });

    const now = new Date();
    const pendingInvite =
      pendingInviteRow && pendingInviteRow.expiresAt >= now
        ? toPortalInviteSummary(pendingInviteRow)
        : null;

    return {
      portalUser: portalUser ? toPortalUserSummary(portalUser) : null,
      pendingInvite,
    };
  }

  async createCustomerPortalInvite(
    scope: TenantScope,
    input: {
      customerId: string;
      email: string;
      permissions?: PortalAccessPermission[];
    },
  ): Promise<CreatePortalUserInviteResponse> {
    const customerId = input.customerId;
    const email = input.email.trim().toLowerCase();

    if (!email) {
      throw new PortalError('VALIDATION_ERROR', 'Email is required');
    }

    await this.ensureCustomerBelongsToCompany(scope.companyId, customerId);

    const existingPortalUser = await this.db.query.portalUsers.findFirst({
      where: and(
        eq(portalUsers.companyId, scope.companyId),
        eq(portalUsers.customerId, customerId),
      ),
    });

    if (existingPortalUser) {
      throw new PortalError('PORTAL_USER_EXISTS', 'This customer already has portal access');
    }

    const emailUsedByOtherCustomer = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.companyId, scope.companyId), eq(portalUsers.email, email)),
    });

    if (emailUsedByOtherCustomer) {
      throw new PortalError('INVITE_NOT_AVAILABLE', 'Unable to send invitation for this email');
    }

    await this.db
      .update(portalUserInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(portalUserInvites.companyId, scope.companyId),
          eq(portalUserInvites.customerId, customerId),
          isNull(portalUserInvites.acceptedAt),
          isNull(portalUserInvites.revokedAt),
        ),
      );

    const permissions = normalizePermissions(input.permissions ?? DEFAULT_PORTAL_ACCESS_PERMISSIONS);
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

    const [invite] = await this.db
      .insert(portalUserInvites)
      .values({
        companyId: scope.companyId,
        customerId,
        email,
        permissions,
        invitedByUserId: scope.userId,
        tokenHash,
        expiresAt,
      })
      .returning();

    if (!invite) {
      throw new PortalError('INVITE_FAILED', 'Unable to create portal invitation');
    }

    const inviter = await this.db.query.users.findFirst({
      where: eq(users.id, scope.userId),
    });

    await this.recordPortalAudit(scope, {
      action: 'customer_invited',
      entityType: 'customer',
      entityId: customerId,
      metadata: { email, inviteId: invite.id },
    });

    const inviteSummary: PortalUserInviteSummary = {
      id: invite.id,
      customerId: invite.customerId,
      email: invite.email,
      permissions,
      invitedByName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Unknown',
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };

    return {
      invite: inviteSummary,
      inviteUrl: `${this.appUrl.replace(/\/$/, '')}/portal/accept-invite?token=${token}`,
    };
  }

  async revokeCustomerPortalInvite(
    scope: TenantScope,
    customerId: string,
    inviteId: string,
  ): Promise<void> {
    await this.ensureCustomerBelongsToCompany(scope.companyId, customerId);

    const [updated] = await this.db
      .update(portalUserInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(portalUserInvites.id, inviteId),
          eq(portalUserInvites.companyId, scope.companyId),
          eq(portalUserInvites.customerId, customerId),
          isNull(portalUserInvites.acceptedAt),
          isNull(portalUserInvites.revokedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new PortalError('INVITE_NOT_FOUND', 'Invitation not found');
    }

    await this.recordPortalAudit(scope, {
      action: 'customer_invitation_revoked',
      entityType: 'customer',
      entityId: customerId,
      metadata: { inviteId },
    });
  }

  async revokePortalUserAccess(scope: TenantScope, portalUserId: string): Promise<PortalUserDetail> {
    const existing = await this.db.query.portalUsers.findFirst({
      where: and(eq(portalUsers.id, portalUserId), eq(portalUsers.companyId, scope.companyId)),
    });

    if (!existing) {
      throw new PortalError('PORTAL_USER_NOT_FOUND', 'Portal user not found');
    }

    await this.db
      .update(portalSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(portalSessions.portalUserId, portalUserId), isNull(portalSessions.revokedAt)));

    const updated = await this.updatePortalUser(scope.companyId, portalUserId, { isActive: false });

    await this.recordPortalAudit(scope, {
      action: 'customer_access_revoked',
      entityType: 'portal_user',
      entityId: portalUserId,
      metadata: { customerId: existing.customerId },
    });

    return updated;
  }

  private async recordPortalAudit(
    scope: TenantScope,
    input: {
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'authentication',
      action: input.action,
      userId: scope.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }

  private async replacePermissions(
    companyId: string,
    portalUserId: string,
    permissions: PortalAccessPermission[],
  ) {
    await this.db
      .delete(portalUserPermissions)
      .where(
        and(
          eq(portalUserPermissions.companyId, companyId),
          eq(portalUserPermissions.portalUserId, portalUserId),
        ),
      );

    if (permissions.length === 0) {
      return;
    }

    await this.db.insert(portalUserPermissions).values(
      permissions.map((permission) => ({
        companyId,
        portalUserId,
        permission,
      })),
    );
  }

  private async ensureCustomerBelongsToCompany(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });

    if (!customer) {
      throw new PortalError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }
  }
}

function normalizePermissions(permissions: string[]): PortalAccessPermission[] {
  return [...new Set(permissions.filter(isPortalAccessPermission))];
}

function toPortalInviteSummary(
  row: typeof portalUserInvites.$inferSelect & {
    invitedBy?: typeof users.$inferSelect | null;
  },
): PortalUserInviteSummary {
  const permissions = Array.isArray(row.permissions)
    ? row.permissions.filter((value): value is PortalAccessPermission =>
        typeof value === 'string' && isPortalAccessPermission(value),
      )
    : [];

  return {
    id: row.id,
    customerId: row.customerId,
    email: row.email,
    permissions,
    invitedByName: row.invitedBy ? `${row.invitedBy.firstName} ${row.invitedBy.lastName}` : 'Unknown',
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toPortalUserSummary(
  row: typeof portalUsers.$inferSelect & {
    customer: typeof customers.$inferSelect | null;
    permissions: Array<typeof portalUserPermissions.$inferSelect>;
  },
): PortalUserSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Unknown',
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    isActive: row.isActive,
    permissionCount: row.permissions.length,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPortalUserDetail(
  row: typeof portalUsers.$inferSelect & {
    customer: typeof customers.$inferSelect | null;
    permissions: Array<typeof portalUserPermissions.$inferSelect>;
  },
): PortalUserDetail {
  return {
    ...toPortalUserSummary(row),
    permissions: row.permissions
      .map((item: { permission: string }) => item.permission)
      .filter(isPortalAccessPermission),
  };
}
