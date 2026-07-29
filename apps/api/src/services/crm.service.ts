import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateCustomerActivityRequest,
  CreateCustomerRequest,
  CrmStats,
  CustomerDetail,
  CustomerSummary,
  UpdateCustomerRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customerActivities, customers } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';

export class CrmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CrmError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

export type AuraCrmContext = {
  customerCount: number;
  customers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
  }>;
  focusedCustomer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
    recentActivities: Array<{
      content: string;
      authorName: string;
      createdAt: string;
    }>;
  } | null;
};

export class CrmService {
  constructor(private readonly db: DatabaseClient) {}

  async listCustomers(companyId: string): Promise<CustomerSummary[]> {
    const rows = await this.db.query.customers.findMany({
      where: eq(customers.companyId, companyId),
      orderBy: [desc(customers.updatedAt)],
    });

    return rows.map(toCustomerSummary);
  }

  async getCustomer(companyId: string, customerId: string): Promise<CustomerDetail | null> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
      with: {
        activities: {
          orderBy: [desc(customerActivities.createdAt)],
          with: {
            author: true,
          },
        },
      },
    });

    if (!customer) {
      return null;
    }

    return {
      ...toCustomerSummary(customer),
      notes: customer.notes,
      activities: customer.activities.map((activity) => ({
        id: activity.id,
        customerId: activity.customerId,
        content: activity.content,
        authorName: activity.author
          ? `${activity.author.firstName} ${activity.author.lastName}`
          : 'Unknown',
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  async createCustomer(companyId: string, input: CreateCustomerRequest): Promise<CustomerDetail> {
    const name = input.name.trim();

    if (!name) {
      throw new CrmError('VALIDATION_ERROR', 'Customer name is required');
    }

    const [created] = await this.db
      .insert(customers)
      .values({
        companyId,
        name,
        email: normalizeOptionalText(input.email),
        phone: normalizeOptionalText(input.phone),
        status: input.status ?? 'active',
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    if (!created) {
      throw new CrmError('CREATE_FAILED', 'Unable to create customer');
    }

    emitBusinessEvent({
      companyId,
      eventType: 'customer.created',
      entityType: 'customer',
      entityId: created.id,
      payload: {
        customer: {
          id: created.id,
          name: created.name,
          status: created.status,
          email: created.email,
          phone: created.phone,
        },
      },
    });

    return {
      ...toCustomerSummary(created),
      notes: created.notes,
      activities: [],
    };
  }

  async updateCustomer(
    companyId: string,
    customerId: string,
    input: UpdateCustomerRequest,
  ): Promise<CustomerDetail> {
    const existing = await this.getCustomer(companyId, customerId);

    if (!existing) {
      throw new CrmError('NOT_FOUND', 'Customer not found');
    }

    const updates: Partial<typeof customers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new CrmError('VALIDATION_ERROR', 'Customer name is required');
      }

      updates.name = name;
    }

    if (input.email !== undefined) {
      updates.email = normalizeOptionalText(input.email);
    }

    if (input.phone !== undefined) {
      updates.phone = normalizeOptionalText(input.phone);
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeOptionalText(input.notes);
    }

    const [updated] = await this.db
      .update(customers)
      .set(updates)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .returning();

    if (!updated) {
      throw new CrmError('UPDATE_FAILED', 'Unable to update customer');
    }

    emitBusinessEvent({
      companyId,
      eventType: 'customer.updated',
      entityType: 'customer',
      entityId: customerId,
      payload: {
        customer: {
          id: customerId,
          status: updated.status,
          name: updated.name,
        },
      },
    });

    return (await this.getCustomer(companyId, customerId))!;
  }

  async addActivity(
    scope: TenantScope,
    customerId: string,
    input: CreateCustomerActivityRequest,
  ): Promise<CustomerDetail> {
    const content = input.content.trim();

    if (!content) {
      throw new CrmError('VALIDATION_ERROR', 'Activity note is required');
    }

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, scope.companyId)),
    });

    if (!customer) {
      throw new CrmError('NOT_FOUND', 'Customer not found');
    }

    const [activity] = await this.db
      .insert(customerActivities)
      .values({
        companyId: scope.companyId,
        customerId,
        userId: scope.userId,
        content,
      })
      .returning();

    if (!activity) {
      throw new CrmError('ACTIVITY_FAILED', 'Unable to add activity note');
    }

    await this.db
      .update(customers)
      .set({ updatedAt: new Date() })
      .where(eq(customers.id, customerId));

    return (await this.getCustomer(scope.companyId, customerId))!;
  }

  async getStats(companyId: string): Promise<CrmStats> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(eq(customers.companyId, companyId));

    return {
      customerCount: row?.count ?? 0,
    };
  }

  async buildAuraContext(companyId: string, customerId?: string): Promise<AuraCrmContext> {
    const stats = await this.getStats(companyId);

    const customerRows = await this.db.query.customers.findMany({
      where: eq(customers.companyId, companyId),
      orderBy: [desc(customers.updatedAt)],
      limit: 25,
    });

    let focusedCustomer: AuraCrmContext['focusedCustomer'] = null;

    if (customerId) {
      const detail = await this.getCustomer(companyId, customerId);

      if (detail) {
        focusedCustomer = {
          id: detail.id,
          name: detail.name,
          email: detail.email,
          phone: detail.phone,
          status: detail.status,
          notes: detail.notes,
          recentActivities: detail.activities.slice(0, 10).map((activity) => ({
            content: activity.content,
            authorName: activity.authorName,
            createdAt: activity.createdAt,
          })),
        };
      }
    }

    return {
      customerCount: stats.customerCount,
      customers: customerRows.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
      })),
      focusedCustomer,
    };
  }
}

function toCustomerSummary(row: typeof customers.$inferSelect): CustomerSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
