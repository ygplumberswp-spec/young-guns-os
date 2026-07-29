import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CreatePortalUserRequest,
  PortalDashboardResponse,
  PortalStats,
  PortalUserDetail,
  PortalUserSummary,
  UpdatePortalUserRequest,
} from '@titan/shared';
import {
  DEFAULT_PORTAL_ACCESS_PERMISSIONS,
  isPortalAccessPermission,
  PORTAL_ACCESS_PERMISSION_OPTIONS,
  type PortalAccessPermission,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  customers,
  documents,
  invoices,
  jobs,
  portalUserPermissions,
  portalUsers,
  quotes,
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

export class PortalService {
  constructor(private readonly db: DatabaseClient) {}

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
