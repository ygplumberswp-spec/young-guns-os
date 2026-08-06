import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type {
  CreateCustomerActivityRequest,
  CreateCustomerPropertyRequest,
  CreateCustomerRequest,
  CrmStats,
  CustomerDetail,
  CustomerPropertySummary,
  CustomerSummary,
  CustomerStatusChangeGuardInput,
  UpdateCustomerPropertyRequest,
  UpdateCustomerRequest,
} from '@titan/shared';
import {
  buildJobAddressDisplay,
  isValidEmailAddress,
  isValidSaPhone,
  normalizeSaMobile,
  normalizeSaPhone,
  validateCustomerStatusChange,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { customerActivities, customers, cxCustomerProperties, jobs, xeroCustomerMappings } from '@titan/db';
import { emitBusinessEvent } from '../lib/automation-events.js';
import {
  buildTenantCacheKey,
  cachedTenantRead,
  CACHE_TTLS,
  invalidateCrmListCaches,
} from './api-read-cache.js';

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
    if (!q) {
      return cachedTenantRead(
        buildTenantCacheKey(companyId, 'crm/list', 'all'),
        () => this.loadCustomerList(companyId, null),
        CACHE_TTLS.list,
      );
    }
    return this.loadCustomerList(companyId, q);
  }

  private async loadCustomerList(
    companyId: string,
    search: string | null,
  ): Promise<CustomerSummary[]> {
    const q = search?.trim();
    let customerRows: Array<typeof customers.$inferSelect>;

    if (!q) {
      customerRows = await this.db.query.customers.findMany({
        where: and(eq(customers.companyId, companyId), isNull(customers.mergedIntoCustomerId)),
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
        .leftJoin(
          xeroCustomerMappings,
          and(
            eq(xeroCustomerMappings.customerId, customers.id),
            eq(xeroCustomerMappings.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(customers.companyId, companyId),
            isNull(customers.mergedIntoCustomerId),
            or(
              ilike(customers.name, pattern),
              ilike(customers.companyName, pattern),
              ilike(customers.email, pattern),
              ilike(customers.phone, pattern),
              ilike(customers.contactPerson, pattern),
              ilike(customers.billingAddress, pattern),
              ilike(customers.siteAddress, pattern),
              ilike(customers.vatNumber, pattern),
              ilike(cxCustomerProperties.addressLine1, pattern),
              ilike(cxCustomerProperties.suburb, pattern),
              ilike(cxCustomerProperties.city, pattern),
              ilike(cxCustomerProperties.postalCode, pattern),
              ilike(xeroCustomerMappings.xeroContactId, pattern),
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
    const xeroByCustomerId = await loadXeroContactIds(
      this.db,
      companyId,
      customerRows.map((row) => row.id),
    );

    return customerRows.map((row) =>
      toCustomerSummary(row, addressByCustomerId.get(row.id) ?? null, xeroByCustomerId.get(row.id) ?? null),
    );
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

    const addressByCustomerId = await loadPrimaryAddressDisplays(this.db, companyId, [customer.id]);
    const xeroContactId = (await loadXeroContactIds(this.db, companyId, [customer.id])).get(customer.id) ?? null;

    return {
      ...toCustomerSummary(customer, addressByCustomerId.get(customer.id) ?? null, xeroContactId),
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
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        placeId: normalizeOptionalText(input.placeId),
        formattedAddress: normalizeOptionalText(input.formattedAddress),
        geocodeStatus: input.geocodeStatus ?? (input.latitude != null ? 'verified' : null),
        geocodedAt: input.latitude != null && input.longitude != null ? new Date() : null,
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
    if (input.latitude !== undefined) updates.latitude = input.latitude;
    if (input.longitude !== undefined) updates.longitude = input.longitude;
    if (input.placeId !== undefined) updates.placeId = normalizeOptionalText(input.placeId);
    if (input.formattedAddress !== undefined) {
      updates.formattedAddress = normalizeOptionalText(input.formattedAddress);
    }
    if (input.geocodeStatus !== undefined) updates.geocodeStatus = input.geocodeStatus;
    if (
      input.latitude !== undefined ||
      input.longitude !== undefined ||
      input.placeId !== undefined ||
      input.geocodeStatus !== undefined
    ) {
      updates.geocodedAt =
        input.latitude != null && input.longitude != null ? new Date() : existing.geocodedAt;
    }

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
        companyName: normalizeOptionalText(input.companyName),
        contactPerson,
        email,
        phone,
        billingAddress: normalizeOptionalText(input.billingAddress),
        siteAddress: normalizeOptionalText(input.siteAddress),
        vatNumber: normalizeOptionalText(input.vatNumber),
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

    invalidateCrmListCaches(companyId);

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

    if (input.companyName !== undefined) {
      updates.companyName = normalizeOptionalText(input.companyName);
    }

    if (input.billingAddress !== undefined) {
      updates.billingAddress = normalizeOptionalText(input.billingAddress);
    }

    if (input.siteAddress !== undefined) {
      updates.siteAddress = normalizeOptionalText(input.siteAddress);
    }

    if (input.vatNumber !== undefined) {
      updates.vatNumber = normalizeOptionalText(input.vatNumber);
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

    invalidateCrmListCaches(companyId);

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

    invalidateCrmListCaches(companyId);
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
  xeroContactId: string | null = null,
): CustomerSummary {
  return {
    id: row.id,
    name: row.name,
    companyName: row.companyName ?? null,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    billingAddress: row.billingAddress ?? null,
    siteAddress: row.siteAddress ?? null,
    vatNumber: row.vatNumber ?? null,
    primaryAddressDisplay,
    xeroContactId,
    status: row.status,
    isSupplierOnly: row.isSupplierOnly,
    doNotContact: row.doNotContact,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadXeroContactIds(
  db: DatabaseClient,
  companyId: string,
  customerIds: string[],
): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();
  const rows = await db
    .select({ customerId: xeroCustomerMappings.customerId, xeroContactId: xeroCustomerMappings.xeroContactId })
    .from(xeroCustomerMappings)
    .where(and(eq(xeroCustomerMappings.companyId, companyId), inArray(xeroCustomerMappings.customerId, customerIds)));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.xeroContactId?.trim()) map.set(row.customerId, row.xeroContactId.trim());
  }
  return map;
}

function toPropertySummary(row: typeof cxCustomerProperties.$inferSelect): CustomerPropertySummary {
  const geocodeStatus =
    row.geocodeStatus === 'verified' ||
    row.geocodeStatus === 'unverified' ||
    row.geocodeStatus === 'failed'
      ? row.geocodeStatus
      : null;

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
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    placeId: row.placeId ?? null,
    formattedAddress: row.formattedAddress ?? null,
    geocodedAt: row.geocodedAt?.toISOString() ?? null,
    geocodeStatus,
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
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
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
    map.set(
      row.customerId,
      buildJobAddressDisplay({
        street: row.addressLine1,
        suburb: row.suburb,
        city: row.city,
        province: row.province,
        postalCode: row.postalCode,
        unit: row.unitNumber ?? row.addressLine2,
      }),
    );
  }

  return map;
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
