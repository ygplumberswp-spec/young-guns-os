import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type {
  BulkOperationSummary,
  CreateCustomerActivityRequest,
  CreateCustomerPropertyRequest,
  CreateCustomerRequest,
  CrmStats,
  CustomerDetail,
  CustomerPropertySummary,
  CustomerSummary,
  CustomerStatusChangeGuardInput,
  CustomerUiStatus,
  UpdateCustomerPropertyRequest,
  UpdateCustomerRequest,
} from '@titan/shared';
import {
  buildJobAddressDisplay,
  customerUiStatusToDbStatus,
  isValidEmailAddress,
  isValidSaPhone,
  normalizeSaMobile,
  normalizeSaPhone,
  validateCustomerStatusChange,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customerActivities, customers, cxCustomerProperties, jobs } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import { buildTenantCacheKey, cachedTenantRead, CACHE_TTLS } from './api-read-cache.js';

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

  async listCustomers(companyId: string, search?: string | null): Promise<CustomerSummary[]> {
    const q = search?.trim();
    let customerRows: Array<typeof customers.$inferSelect>;

    if (!q) {
      customerRows = await this.db.query.customers.findMany({
        where: eq(customers.companyId, companyId),
        orderBy: [desc(customers.updatedAt)],
      });
    } else {
      const pattern = `%${escapeLike(q)}%`;
      const normalizedMobile = normalizeSaMobile(q);
      const mobileDigits = (normalizedMobile ?? q).replace(/\D/g, '');
      const mobileDigitPattern =
        mobileDigits.length >= 9 ? `%${escapeLike(mobileDigits.slice(-9))}%` : null;
      const mobileMatchers = [
        ...(normalizedMobile
          ? [
              ilike(customers.phone, `%${escapeLike(normalizedMobile)}%`),
            ]
          : []),
        ...(mobileDigitPattern ? [ilike(customers.phone, mobileDigitPattern)] : []),
      ];

      const matches = await this.db
        .select({ customer: customers })
        .from(customers)
        .leftJoin(
          cxCustomerProperties,
          and(
            eq(cxCustomerProperties.customerId, customers.id),
            eq(cxCustomerProperties.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(customers.companyId, companyId),
            or(
              ilike(customers.name, pattern),
              ilike(customers.email, pattern),
              ilike(customers.phone, pattern),
              ilike(customers.contactPerson, pattern),
              ilike(cxCustomerProperties.addressLine1, pattern),
              ilike(cxCustomerProperties.suburb, pattern),
              ilike(cxCustomerProperties.city, pattern),
              ilike(cxCustomerProperties.postalCode, pattern),
              ...mobileMatchers,
            ),
          ),
        )
        .orderBy(desc(customers.updatedAt));

      const seen = new Set<string>();
      customerRows = [];
      for (const row of matches) {
        if (seen.has(row.customer.id)) continue;
        seen.add(row.customer.id);
        customerRows.push(row.customer);
      }
    }

    const addressByCustomerId = await loadPrimaryAddressDisplays(
      this.db,
      companyId,
      customerRows.map((row) => row.id),
    );

    const enrichmentByCustomerId = await loadCustomerListEnrichment(
      this.db,
      companyId,
      customerRows.map((row) => row.id),
    );

    return customerRows.map((row) => {
      const enrichment = enrichmentByCustomerId.get(row.id);
      const address = addressByCustomerId.get(row.id);
      return toCustomerSummary(row, address?.display ?? null, address?.suburb ?? null, enrichment);
    });
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

    const addressMap = await loadPrimaryAddressDisplays(this.db, companyId, [customerId]);
    const enrichmentMap = await loadCustomerListEnrichment(this.db, companyId, [customerId]);
    const address = addressMap.get(customerId);
    const enrichment = enrichmentMap.get(customerId);

    return {
      ...toCustomerSummary(
        customer,
        address?.display ?? null,
        address?.suburb ?? null,
        enrichment,
      ),
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

  async listCustomerProperties(
    companyId: string,
    customerId: string,
  ): Promise<CustomerPropertySummary[]> {
    await this.ensureCustomer(companyId, customerId);

    const rows = await this.db.query.cxCustomerProperties.findMany({
      where: and(
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
      orderBy: [desc(cxCustomerProperties.isPrimary), desc(cxCustomerProperties.updatedAt)],
    });

    return rows.map(toPropertySummary);
  }

  async createCustomerProperty(
    companyId: string,
    customerId: string,
    input: CreateCustomerPropertyRequest,
  ): Promise<CustomerPropertySummary> {
    await this.ensureCustomer(companyId, customerId);

    const propertyName = input.propertyName.trim();
    if (!propertyName) {
      throw new CrmError('VALIDATION_ERROR', 'Property name is required');
    }

    const [created] = await this.db
      .insert(cxCustomerProperties)
      .values({
        companyId,
        customerId,
        propertyName,
        addressLine1: normalizeOptionalText(input.street),
        addressLine2: normalizeOptionalText(input.unit),
        suburb: normalizeOptionalText(input.suburb),
        city: normalizeOptionalText(input.city),
        province: normalizeOptionalText(input.province),
        postalCode: normalizeOptionalText(input.postalCode),
        unitNumber: normalizeOptionalText(input.unit),
        isPrimary: input.isPrimary ?? false,
      })
      .returning();

    if (!created) {
      throw new CrmError('CREATE_FAILED', 'Unable to create property');
    }

    return toPropertySummary(created);
  }

  async updateCustomerProperty(
    companyId: string,
    customerId: string,
    propertyId: string,
    input: UpdateCustomerPropertyRequest,
  ): Promise<CustomerPropertySummary> {
    await this.ensureCustomer(companyId, customerId);

    const existing = await this.db.query.cxCustomerProperties.findFirst({
      where: and(
        eq(cxCustomerProperties.id, propertyId),
        eq(cxCustomerProperties.companyId, companyId),
        eq(cxCustomerProperties.customerId, customerId),
      ),
    });

    if (!existing) {
      throw new CrmError('NOT_FOUND', 'Property not found');
    }

    const updates: Partial<typeof cxCustomerProperties.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.propertyName !== undefined) {
      const propertyName = input.propertyName.trim();
      if (!propertyName) {
        throw new CrmError('VALIDATION_ERROR', 'Property name is required');
      }
      updates.propertyName = propertyName;
    }

    if (input.street !== undefined) updates.addressLine1 = normalizeOptionalText(input.street);
    if (input.unit !== undefined) {
      updates.unitNumber = normalizeOptionalText(input.unit);
      updates.addressLine2 = normalizeOptionalText(input.unit);
    }
    if (input.suburb !== undefined) updates.suburb = normalizeOptionalText(input.suburb);
    if (input.city !== undefined) updates.city = normalizeOptionalText(input.city);
    if (input.province !== undefined) updates.province = normalizeOptionalText(input.province);
    if (input.postalCode !== undefined) {
      updates.postalCode = normalizeOptionalText(input.postalCode);
    }
    if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;

    const [updated] = await this.db
      .update(cxCustomerProperties)
      .set(updates)
      .where(
        and(eq(cxCustomerProperties.id, propertyId), eq(cxCustomerProperties.companyId, companyId)),
      )
      .returning();

    if (!updated) {
      throw new CrmError('UPDATE_FAILED', 'Unable to update property');
    }

    return toPropertySummary(updated);
  }

  async createCustomer(companyId: string, input: CreateCustomerRequest): Promise<CustomerDetail> {
    const name = input.name.trim();

    if (!name) {
      throw new CrmError('VALIDATION_ERROR', 'Customer name is required');
    }

    const email = normalizeOptionalText(input.email);
    if (email && !isValidEmailAddress(email)) {
      throw new CrmError('VALIDATION_ERROR', 'Customer email is invalid');
    }

    const phone = normalizeCustomerPhone(input.phone);
    const contactPerson = normalizeOptionalText(input.contactPerson);

    const [created] = await this.db
      .insert(customers)
      .values({
        companyId,
        name,
        contactPerson,
        email,
        phone,
        status: input.status ?? 'active',
        isSupplierOnly: input.isSupplierOnly ?? false,
        doNotContact: input.doNotContact ?? false,
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
    opts: {
      classification?: CustomerStatusChangeGuardInput | null;
      actorUserId?: string | null;
    } = {},
  ): Promise<CustomerDetail> {
    const existing = await this.getCustomer(companyId, customerId);

    if (!existing) {
      throw new CrmError('NOT_FOUND', 'Customer not found');
    }

    if (input.status !== undefined && input.status !== existing.status) {
      const targetUiStatus =
        input.status === 'inactive'
          ? 'archived'
          : input.status === 'lead'
            ? 'duplicate_review'
            : 'active';
      const guard = validateCustomerStatusChange(targetUiStatus, opts.classification ?? null);
      if (!guard.allowed) {
        throw new CrmError('VALIDATION_ERROR', guard.reason);
      }
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

    if (input.contactPerson !== undefined) {
      updates.contactPerson = normalizeOptionalText(input.contactPerson);
    }

    if (input.email !== undefined) {
      const email = normalizeOptionalText(input.email);
      if (email && !isValidEmailAddress(email)) {
        throw new CrmError('VALIDATION_ERROR', 'Customer email is invalid');
      }
      // Placeholder company/import emails (e.g. Xero-shared inboxes) are never
      // treated as a verified customer-owned contact — see marketing eligibility service.
      updates.email = email;
    }

    if (input.phone !== undefined) {
      updates.phone = normalizeCustomerPhone(input.phone);
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if (input.isSupplierOnly !== undefined) {
      updates.isSupplierOnly = input.isSupplierOnly;
    }

    if (input.doNotContact !== undefined) {
      updates.doNotContact = input.doNotContact;
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
      eventType:
        input.status !== undefined && input.status !== existing.status
          ? 'customer.status_changed'
          : 'customer.updated',
      entityType: 'customer',
      entityId: customerId,
      payload: {
        customer: {
          id: customerId,
          status: updated.status,
          fromStatus: existing.status,
          name: updated.name,
        },
      },
      actorUserId: opts.actorUserId ?? undefined,
    });

    return (await this.getCustomer(companyId, customerId))!;
  }

  async deleteCustomer(
    companyId: string,
    customerId: string,
    opts: {
      classification?: CustomerStatusChangeGuardInput | null;
      actorUserId?: string;
      isOwner?: boolean;
    } = {},
  ): Promise<void> {
    if (!opts.isOwner) {
      throw new CrmError('FORBIDDEN', 'Only the company owner may permanently delete customers');
    }

    const existing = await this.getCustomer(companyId, customerId);
    if (!existing) {
      throw new CrmError('NOT_FOUND', 'Customer not found');
    }

    const guard = validateCustomerStatusChange('archived', opts.classification ?? null);
    if (!guard.allowed) {
      throw new CrmError('VALIDATION_ERROR', guard.reason);
    }

    const [jobCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.customerId, customerId), eq(jobs.companyId, companyId)));

    if ((jobCount?.count ?? 0) > 0) {
      throw new CrmError(
        'VALIDATION_ERROR',
        'Customer has linked jobs. Archive instead of deleting.',
      );
    }

    await this.db
      .delete(customerActivities)
      .where(
        and(eq(customerActivities.companyId, companyId), eq(customerActivities.customerId, customerId)),
      );

    await this.db
      .delete(cxCustomerProperties)
      .where(
        and(
          eq(cxCustomerProperties.companyId, companyId),
          eq(cxCustomerProperties.customerId, customerId),
        ),
      );

    const deleted = await this.db
      .delete(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .returning({ id: customers.id });

    if (deleted.length === 0) {
      throw new CrmError('DELETE_FAILED', 'Unable to delete customer');
    }

    emitBusinessEvent({
      companyId,
      eventType: 'customer.deleted',
      entityType: 'customer',
      entityId: customerId,
      payload: { customer: { id: customerId, name: existing.name } },
      actorUserId: opts.actorUserId,
    });
  }

  async bulkCustomers(
    companyId: string,
    input: {
      ids: string[];
      action: 'archive' | 'delete' | 'set_status';
      status?: CustomerUiStatus;
      typedConfirmation?: string;
      classificationById?: Map<string, CustomerStatusChangeGuardInput | null>;
      actorUserId: string;
      isOwner: boolean;
    },
  ): Promise<BulkOperationSummary> {
    const summary: BulkOperationSummary = {
      deleted: 0,
      archived: 0,
      updated: 0,
      skipped: 0,
      blocked: 0,
      results: [],
    };

    const uniqueIds = [...new Set(input.ids)];
    for (const customerId of uniqueIds) {
      const existing = await this.getCustomer(companyId, customerId);
      if (!existing) {
        summary.skipped += 1;
        summary.results.push({
          id: customerId,
          name: customerId,
          status: 'skipped',
          reason: 'Customer not found',
        });
        continue;
      }

      const classification = input.classificationById?.get(customerId) ?? null;

      if (input.action === 'delete') {
        if (!input.isOwner) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: 'Owner-only permanent delete',
          });
          continue;
        }
        if (input.typedConfirmation !== 'DELETE') {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: 'Typed DELETE confirmation required',
          });
          continue;
        }
        try {
          await this.deleteCustomer(companyId, customerId, {
            classification,
            actorUserId: input.actorUserId,
            isOwner: true,
          });
          summary.deleted += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'deleted',
          });
        } catch (error) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: error instanceof CrmError ? error.message : 'Delete blocked',
          });
        }
        continue;
      }

      if (input.action === 'archive') {
        const guard = validateCustomerStatusChange('archived', classification);
        if (!guard.allowed) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: guard.reason,
          });
          continue;
        }
        try {
          await this.updateCustomer(
            companyId,
            customerId,
            { status: customerUiStatusToDbStatus('archived') },
            { classification, actorUserId: input.actorUserId },
          );
          summary.archived += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'archived',
          });
        } catch (error) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: error instanceof CrmError ? error.message : 'Archive failed',
          });
        }
        continue;
      }

      if (input.action === 'set_status' && input.status) {
        const guard = validateCustomerStatusChange(input.status, classification);
        if (!guard.allowed) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: guard.reason,
          });
          continue;
        }
        try {
          await this.updateCustomer(
            companyId,
            customerId,
            { status: customerUiStatusToDbStatus(input.status) },
            { classification, actorUserId: input.actorUserId },
          );
          summary.updated += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'updated',
          });
        } catch (error) {
          summary.blocked += 1;
          summary.results.push({
            id: customerId,
            name: existing.name,
            status: 'blocked',
            reason: error instanceof CrmError ? error.message : 'Status change failed',
          });
        }
      }
    }

    return summary;
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
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'crm/stats'),
      async () => {
        const [row] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(customers)
          .where(eq(customers.companyId, companyId));

        return {
          customerCount: row?.count ?? 0,
        };
      },
      CACHE_TTLS.stats,
    );
  }

  private async ensureCustomer(companyId: string, customerId: string): Promise<void> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
    });
    if (!customer) {
      throw new CrmError('NOT_FOUND', 'Customer not found');
    }
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

function toCustomerSummary(
  row: typeof customers.$inferSelect,
  primaryAddressDisplay: string | null = null,
  primarySuburb: string | null = null,
  enrichment?: {
    lastJobAt: string | null;
    lastJobNumber: string | null;
    lastActivityAt: string | null;
    nextAction: string | null;
  },
): CustomerSummary {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    primaryAddressDisplay,
    primarySuburb,
    status: row.status,
    isSupplierOnly: row.isSupplierOnly,
    doNotContact: row.doNotContact,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastJobAt: enrichment?.lastJobAt ?? null,
    lastJobNumber: enrichment?.lastJobNumber ?? null,
    lastActivityAt: enrichment?.lastActivityAt ?? null,
    nextAction: enrichment?.nextAction ?? null,
  };
}

function toPropertySummary(row: typeof cxCustomerProperties.$inferSelect): CustomerPropertySummary {
  return {
    id: row.id,
    customerId: row.customerId,
    propertyName: row.propertyName,
    street: row.addressLine1,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    unit: row.unitNumber ?? row.addressLine2,
    addressDisplay: buildJobAddressDisplay({
      street: row.addressLine1,
      suburb: row.suburb,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
      unit: row.unitNumber ?? row.addressLine2,
    }),
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCustomerPhone(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) return null;
  if (!isValidSaPhone(trimmed)) {
    throw new CrmError(
      'VALIDATION_ERROR',
      'Customer phone must be a valid South African phone number',
    );
  }
  return normalizeSaPhone(trimmed);
}

async function loadPrimaryAddressDisplays(
  db: DatabaseClient,
  companyId: string,
  customerIds: string[],
): Promise<Map<string, { display: string | null; suburb: string | null }>> {
  const map = new Map<string, { display: string | null; suburb: string | null }>();
  if (customerIds.length === 0) {
    return map;
  }

  const rows = await db.query.cxCustomerProperties.findMany({
    where: and(
      eq(cxCustomerProperties.companyId, companyId),
      inArray(cxCustomerProperties.customerId, customerIds),
    ),
    orderBy: [desc(cxCustomerProperties.isPrimary), desc(cxCustomerProperties.updatedAt)],
  });

  for (const row of rows) {
    if (map.has(row.customerId)) continue;
    map.set(row.customerId, {
      display: buildJobAddressDisplay({
        street: row.addressLine1,
        suburb: row.suburb,
        city: row.city,
        province: row.province,
        postalCode: row.postalCode,
        unit: row.unitNumber ?? row.addressLine2,
      }),
      suburb: row.suburb ?? null,
    });
  }

  return map;
}

type CustomerListEnrichment = {
  lastJobAt: string | null;
  lastJobNumber: string | null;
  lastActivityAt: string | null;
  nextAction: string | null;
};

async function loadCustomerListEnrichment(
  db: DatabaseClient,
  companyId: string,
  customerIds: string[],
): Promise<Map<string, CustomerListEnrichment>> {
  const map = new Map<string, CustomerListEnrichment>();
  if (customerIds.length === 0) return map;

  const jobRows = await db
    .select({
      customerId: jobs.customerId,
      updatedAt: sql<Date>`max(${jobs.updatedAt})`.as('updated_at'),
      jobNumber: sql<string | null>`(
        array_agg(${jobs.jobNumber} ORDER BY ${jobs.updatedAt} DESC)
      )[1]`.as('job_number'),
    })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), inArray(jobs.customerId, customerIds)))
    .groupBy(jobs.customerId);

  const activityRows = await db
    .select({
      customerId: customerActivities.customerId,
      lastAt: sql<Date>`max(${customerActivities.createdAt})`.as('last_at'),
    })
    .from(customerActivities)
    .where(
      and(
        eq(customerActivities.companyId, companyId),
        inArray(customerActivities.customerId, customerIds),
      ),
    )
    .groupBy(customerActivities.customerId);

  for (const id of customerIds) {
    map.set(id, {
      lastJobAt: null,
      lastJobNumber: null,
      lastActivityAt: null,
      nextAction: null,
    });
  }

  for (const row of jobRows) {
    if (!row.customerId) continue;
    const entry = map.get(row.customerId);
    if (!entry) continue;
    entry.lastJobAt = row.updatedAt ? new Date(row.updatedAt).toISOString() : null;
    entry.lastJobNumber = row.jobNumber ?? null;
  }

  for (const row of activityRows) {
    const entry = map.get(row.customerId);
    if (!entry) continue;
    entry.lastActivityAt = row.lastAt ? new Date(row.lastAt).toISOString() : null;
  }

  return map;
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
