import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import {
  assertTechnicianDeniedCustomer360,
  buildAssociatedHistoryTimelineTag,
  buildC360TimelineEvents,
  canViewCustomer360InternalNotesAccess,
  canWriteCustomer360,
  CUSTOMER_360_SECTIONS,
  dedupeTimelineEvents,
  paginateTimelineEvents,
  resolveConsentTruth,
  resolveInvoiceDisplayNumberLabel,
  resolveQuoteDisplayNumberLabel,
  type CreateCustomerPersonRequest,
  type CreateCustomerSourceAssociationRequest,
  type Customer360Workspace,
  type CustomerPerson,
  type CustomerSourceAssociation,
  type UpdateCustomerPersonRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  assetEquipment,
  assetMaintenanceRecords,
  communications,
  customerActivities,
  customerMarketingConsents,
  customerPeople,
  customers,
  customerSourceAssociations,
  cxCustomerProperties,
  documents,
  invoices,
  jobs,
  leads,
  opsRecurringMaintenancePlans,
  payments,
  quotes,
  securityAuditLogs,
  users,
  xeroCustomerMappings,
} from '@titan/db';

export class Customer360Error extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Customer360Error';
  }
}

export type Customer360Actor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function mapPerson(row: typeof customerPeople.$inferSelect): CustomerPerson {
  return {
    id: row.id,
    customerId: row.customerId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    roleTitle: row.roleTitle,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    isPrimary: row.isPrimary,
    isBillingContact: row.isBillingContact,
    isSiteContact: row.isSiteContact,
    emailAllowed: row.emailAllowed,
    smsAllowed: row.smsAllowed,
    whatsappAllowed: row.whatsappAllowed,
    phoneAllowed: row.phoneAllowed,
    preferredContactMethod: row.preferredContactMethod,
    consentStatus: row.consentStatus,
    consentSource: row.consentSource,
    consentCapturedAt: row.consentCapturedAt?.toISOString() ?? null,
    status: row.status,
    notes: row.notes,
    sourceProvider: row.sourceProvider,
    sourceExternalId: row.sourceExternalId,
    linkedSourceCustomerId: row.linkedSourceCustomerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class Customer360Service {
  constructor(private readonly db: DatabaseClient) {}

  private assertAccess(actor: Customer360Actor): void {
    const gate = assertTechnicianDeniedCustomer360(actor);
    if (!gate.allowed) {
      throw new Customer360Error('FORBIDDEN', gate.reason);
    }
  }

  private assertWrite(actor: Customer360Actor): void {
    this.assertAccess(actor);
    if (!canWriteCustomer360(actor)) {
      throw new Customer360Error(
        'FORBIDDEN',
        'Customer 360 write requires customers:write or Owner/Admin access.',
      );
    }
  }

  private async recordAudit(
    actor: Customer360Actor,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action,
      entityType,
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        module: 'customer_360',
        destructiveMerge: false,
        xeroWrite: false,
      },
    });
  }

  private async assertCustomer(actor: Customer360Actor, customerId: string) {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, customerId)))
      .limit(1);
    if (!row) throw new Customer360Error('NOT_FOUND', 'Customer not found in this tenant.');
    return row;
  }

  async listPeople(actor: Customer360Actor, customerId: string): Promise<CustomerPerson[]> {
    this.assertAccess(actor);
    await this.assertCustomer(actor, customerId);
    const rows = await this.db
      .select()
      .from(customerPeople)
      .where(
        and(
          eq(customerPeople.companyId, actor.companyId),
          eq(customerPeople.customerId, customerId),
        ),
      )
      .orderBy(desc(customerPeople.isPrimary), desc(customerPeople.updatedAt));
    return rows.map(mapPerson);
  }

  async createPerson(
    actor: Customer360Actor,
    customerId: string,
    body: CreateCustomerPersonRequest,
  ): Promise<CustomerPerson> {
    this.assertWrite(actor);
    await this.assertCustomer(actor, customerId);
    const displayName = body.displayName?.trim();
    if (!displayName) throw new Customer360Error('INVALID', 'displayName is required.');

    const consent = resolveConsentTruth({
      explicitConsentStatus: body.consentStatus ?? 'unknown',
      doNotContact: false,
      hasEmail: Boolean(body.email?.trim()),
      hasPhone: Boolean(body.phone?.trim() || body.mobile?.trim()),
    });

    if (body.isPrimary) {
      await this.db
        .update(customerPeople)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(customerPeople.companyId, actor.companyId),
            eq(customerPeople.customerId, customerId),
            eq(customerPeople.isPrimary, true),
          ),
        );
    }

    const [created] = await this.db
      .insert(customerPeople)
      .values({
        companyId: actor.companyId,
        customerId,
        firstName: body.firstName?.trim() || null,
        lastName: body.lastName?.trim() || null,
        displayName,
        roleTitle: body.roleTitle?.trim() || null,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        mobile: body.mobile?.trim() || null,
        isPrimary: Boolean(body.isPrimary),
        isBillingContact: Boolean(body.isBillingContact),
        isSiteContact: Boolean(body.isSiteContact),
        emailAllowed: body.emailAllowed ?? true,
        smsAllowed: body.smsAllowed ?? true,
        whatsappAllowed: body.whatsappAllowed ?? true,
        phoneAllowed: body.phoneAllowed ?? true,
        preferredContactMethod: body.preferredContactMethod?.trim() || null,
        consentStatus: consent.status,
        consentSource: body.consentSource?.trim() || null,
        consentCapturedAt: body.consentSource ? new Date() : null,
        notes: body.notes?.trim() || null,
        sourceProvider: body.sourceProvider?.trim() || null,
        sourceExternalId: body.sourceExternalId?.trim() || null,
        linkedSourceCustomerId: body.linkedSourceCustomerId ?? null,
        provenance: {
          createdVia: 'customer_360',
          consentNeverInferredFromContactPresence: true,
        },
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      })
      .returning();

    await this.recordAudit(actor, 'customer_person_created', 'customer_person', created!.id, {
      customerId,
      displayName,
      sourceExternalId: created!.sourceExternalId,
      before: null,
      after: { displayName, status: created!.status },
    });
    return mapPerson(created!);
  }

  async updatePerson(
    actor: Customer360Actor,
    customerId: string,
    personId: string,
    body: UpdateCustomerPersonRequest,
  ): Promise<CustomerPerson> {
    this.assertWrite(actor);
    await this.assertCustomer(actor, customerId);
    const [existing] = await this.db
      .select()
      .from(customerPeople)
      .where(
        and(
          eq(customerPeople.companyId, actor.companyId),
          eq(customerPeople.customerId, customerId),
          eq(customerPeople.id, personId),
        ),
      )
      .limit(1);
    if (!existing) throw new Customer360Error('NOT_FOUND', 'Contact person not found.');

    if (body.isPrimary) {
      await this.db
        .update(customerPeople)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(customerPeople.companyId, actor.companyId),
            eq(customerPeople.customerId, customerId),
            eq(customerPeople.isPrimary, true),
            ne(customerPeople.id, personId),
          ),
        );
    }

    const nextEmail = body.email !== undefined ? body.email?.trim() || null : existing.email;
    const nextPhone = body.phone !== undefined ? body.phone?.trim() || null : existing.phone;
    const nextMobile = body.mobile !== undefined ? body.mobile?.trim() || null : existing.mobile;
    const consent = resolveConsentTruth({
      explicitConsentStatus:
        body.consentStatus !== undefined ? body.consentStatus : existing.consentStatus,
      doNotContact: false,
      hasEmail: Boolean(nextEmail),
      hasPhone: Boolean(nextPhone || nextMobile),
    });

    const [updated] = await this.db
      .update(customerPeople)
      .set({
        firstName: body.firstName !== undefined ? body.firstName?.trim() || null : existing.firstName,
        lastName: body.lastName !== undefined ? body.lastName?.trim() || null : existing.lastName,
        displayName:
          body.displayName !== undefined ? body.displayName.trim() || existing.displayName : existing.displayName,
        roleTitle: body.roleTitle !== undefined ? body.roleTitle?.trim() || null : existing.roleTitle,
        email: nextEmail,
        phone: nextPhone,
        mobile: nextMobile,
        isPrimary: body.isPrimary !== undefined ? Boolean(body.isPrimary) : existing.isPrimary,
        isBillingContact:
          body.isBillingContact !== undefined
            ? Boolean(body.isBillingContact)
            : existing.isBillingContact,
        isSiteContact:
          body.isSiteContact !== undefined ? Boolean(body.isSiteContact) : existing.isSiteContact,
        emailAllowed: body.emailAllowed ?? existing.emailAllowed,
        smsAllowed: body.smsAllowed ?? existing.smsAllowed,
        whatsappAllowed: body.whatsappAllowed ?? existing.whatsappAllowed,
        phoneAllowed: body.phoneAllowed ?? existing.phoneAllowed,
        preferredContactMethod:
          body.preferredContactMethod !== undefined
            ? body.preferredContactMethod?.trim() || null
            : existing.preferredContactMethod,
        consentStatus: consent.status,
        consentSource:
          body.consentSource !== undefined
            ? body.consentSource?.trim() || null
            : existing.consentSource,
        notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
        status: body.status ?? existing.status,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(customerPeople.id, personId))
      .returning();

    const action =
      body.status === 'inactive' && existing.status !== 'inactive'
        ? 'customer_person_deactivated'
        : body.consentStatus !== undefined && body.consentStatus !== existing.consentStatus
          ? 'customer_consent_updated'
          : 'customer_person_updated';

    await this.recordAudit(actor, action, 'customer_person', personId, {
      customerId,
      before: { displayName: existing.displayName, status: existing.status, consent: existing.consentStatus },
      after: {
        displayName: updated!.displayName,
        status: updated!.status,
        consent: updated!.consentStatus,
      },
    });
    return mapPerson(updated!);
  }

  async listAssociations(
    actor: Customer360Actor,
    customerId: string,
  ): Promise<CustomerSourceAssociation[]> {
    this.assertAccess(actor);
    await this.assertCustomer(actor, customerId);
    const rows = await this.db
      .select({
        assoc: customerSourceAssociations,
        sourceName: customers.name,
      })
      .from(customerSourceAssociations)
      .innerJoin(customers, eq(customers.id, customerSourceAssociations.sourceCustomerId))
      .where(
        and(
          eq(customerSourceAssociations.companyId, actor.companyId),
          eq(customerSourceAssociations.canonicalCustomerId, customerId),
          eq(customerSourceAssociations.status, 'active'),
        ),
      )
      .orderBy(desc(customerSourceAssociations.createdAt));

    return rows.map(({ assoc, sourceName }) => ({
      id: assoc.id,
      canonicalCustomerId: assoc.canonicalCustomerId,
      sourceCustomerId: assoc.sourceCustomerId,
      sourceCustomerName: sourceName,
      personId: assoc.personId,
      associationRole: assoc.associationRole,
      status: assoc.status,
      reason: assoc.reason,
      sourceProvider: assoc.sourceProvider,
      sourceExternalId: assoc.sourceExternalId,
      preservesFinancialOwnership: true as const,
      destructiveMerge: false as const,
      xeroWrite: false as const,
      createdAt: assoc.createdAt.toISOString(),
      removedAt: assoc.removedAt?.toISOString() ?? null,
    }));
  }

  async associateSource(
    actor: Customer360Actor,
    customerId: string,
    body: CreateCustomerSourceAssociationRequest,
  ): Promise<CustomerSourceAssociation> {
    this.assertWrite(actor);
    await this.assertCustomer(actor, customerId);
    if (body.sourceCustomerId === customerId) {
      throw new Customer360Error('INVALID', 'Cannot associate a customer to itself.');
    }
    const source = await this.assertCustomer(actor, body.sourceCustomerId);

    // Capture ownership snapshots to prove they are not moved.
    const quoteBefore = await this.db
      .select({ id: quotes.id, customerId: quotes.customerId, quoteNumber: quotes.quoteNumber })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          or(eq(quotes.customerId, customerId), eq(quotes.customerId, body.sourceCustomerId)),
        ),
      );
    const invoiceBefore = await this.db
      .select({ id: invoices.id, customerId: invoices.customerId })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, actor.companyId),
          or(eq(invoices.customerId, customerId), eq(invoices.customerId, body.sourceCustomerId)),
        ),
      );

    const [xero] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, body.sourceCustomerId),
        ),
      )
      .limit(1);

    const [existing] = await this.db
      .select()
      .from(customerSourceAssociations)
      .where(
        and(
          eq(customerSourceAssociations.companyId, actor.companyId),
          eq(customerSourceAssociations.canonicalCustomerId, customerId),
          eq(customerSourceAssociations.sourceCustomerId, body.sourceCustomerId),
          eq(customerSourceAssociations.status, 'active'),
        ),
      )
      .limit(1);
    if (existing) {
      throw new Customer360Error('INVALID_STATE', 'Source customer is already associated.');
    }

    const [created] = await this.db
      .insert(customerSourceAssociations)
      .values({
        companyId: actor.companyId,
        canonicalCustomerId: customerId,
        sourceCustomerId: body.sourceCustomerId,
        personId: body.personId ?? null,
        associationRole: body.associationRole?.trim() || 'related_person',
        reason: body.reason?.trim() || 'Non-destructive related person/contact association',
        sourceProvider: body.sourceProvider?.trim() || (xero?.xeroContactId ? 'xero' : null),
        sourceExternalId: body.sourceExternalId?.trim() || xero?.xeroContactId || null,
        preservesFinancialOwnership: true,
        destructiveMerge: false,
        xeroWrite: false,
        metadata: {
          quoteOwnershipSnapshot: quoteBefore.map((q) => ({
            id: q.id,
            customerId: q.customerId,
            quoteNumber: q.quoteNumber,
          })),
          invoiceOwnershipSnapshot: invoiceBefore.map((i) => ({
            id: i.id,
            customerId: i.customerId,
          })),
        },
        createdByUserId: actor.userId,
      })
      .returning();

    // Prove ownership unchanged after association write.
    const quoteAfter = await this.db
      .select({ customerId: quotes.customerId })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          or(eq(quotes.customerId, customerId), eq(quotes.customerId, body.sourceCustomerId)),
        ),
      );
    if (
      quoteBefore.map((q) => q.customerId).sort().join() !==
      quoteAfter.map((q) => q.customerId).sort().join()
    ) {
      throw new Customer360Error('INVALID_STATE', 'Association unexpectedly changed quote ownership.');
    }

    await this.recordAudit(actor, 'customer_source_associated', 'customer_source_association', created!.id, {
      canonicalCustomerId: customerId,
      sourceCustomerId: body.sourceCustomerId,
      sourceCustomerName: source.name,
      sourceExternalId: created!.sourceExternalId,
      preservesFinancialOwnership: true,
      destructiveMerge: false,
      xeroWrite: false,
    });

    const found = (await this.listAssociations(actor, customerId)).find((a) => a.id === created!.id);
    if (!found) throw new Customer360Error('INVALID_STATE', 'Association created but not readable.');
    return found;
  }

  async removeAssociation(
    actor: Customer360Actor,
    customerId: string,
    associationId: string,
  ): Promise<{ removed: true }> {
    this.assertWrite(actor);
    await this.assertCustomer(actor, customerId);
    const [existing] = await this.db
      .select()
      .from(customerSourceAssociations)
      .where(
        and(
          eq(customerSourceAssociations.companyId, actor.companyId),
          eq(customerSourceAssociations.canonicalCustomerId, customerId),
          eq(customerSourceAssociations.id, associationId),
          eq(customerSourceAssociations.status, 'active'),
        ),
      )
      .limit(1);
    if (!existing) throw new Customer360Error('NOT_FOUND', 'Association not found.');

    await this.db
      .update(customerSourceAssociations)
      .set({
        status: 'removed',
        removedAt: new Date(),
        removedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(customerSourceAssociations.id, associationId));

    await this.recordAudit(
      actor,
      'customer_source_association_removed',
      'customer_source_association',
      associationId,
      {
        canonicalCustomerId: customerId,
        sourceCustomerId: existing.sourceCustomerId,
        reversible: true,
        financialOwnershipUntouched: true,
      },
    );
    return { removed: true };
  }

  async getWorkspace(
    actor: Customer360Actor,
    customerId: string,
    opts: { timelineLimit?: number; timelineOffset?: number; timelineOrder?: 'newest' | 'oldest' } = {},
  ): Promise<Customer360Workspace> {
    this.assertAccess(actor);
    const customer = await this.assertCustomer(actor, customerId);
    const notesVisible = canViewCustomer360InternalNotesAccess(actor);

    const people = await this.listPeople(actor, customerId);
    const associations = await this.listAssociations(actor, customerId);
    const associatedIds = associations.map((a) => a.sourceCustomerId);
    const historyCustomerIds = [customerId, ...associatedIds];

    const [xero] = await this.db
      .select()
      .from(xeroCustomerMappings)
      .where(
        and(
          eq(xeroCustomerMappings.companyId, actor.companyId),
          eq(xeroCustomerMappings.customerId, customerId),
        ),
      )
      .limit(1);

    const [propertyRows, activityRows, jobRows, quoteRows, invoiceRows, leadRows, commRows, docRows, planRows, consentRows] =
      await Promise.all([
        this.db
          .select()
          .from(cxCustomerProperties)
          .where(
            and(
              eq(cxCustomerProperties.companyId, actor.companyId),
              inArray(cxCustomerProperties.customerId, historyCustomerIds),
            ),
          )
          .orderBy(desc(cxCustomerProperties.isPrimary), desc(cxCustomerProperties.updatedAt))
          .limit(50),
        this.db
          .select({
            activity: customerActivities,
            authorFirst: users.firstName,
            authorLast: users.lastName,
            authorEmail: users.email,
          })
          .from(customerActivities)
          .leftJoin(users, eq(users.id, customerActivities.userId))
          .where(
            and(
              eq(customerActivities.companyId, actor.companyId),
              eq(customerActivities.customerId, customerId),
            ),
          )
          .orderBy(desc(customerActivities.createdAt))
          .limit(50),
        this.db
          .select()
          .from(jobs)
          .where(
            and(eq(jobs.companyId, actor.companyId), inArray(jobs.customerId, historyCustomerIds)),
          )
          .orderBy(desc(jobs.updatedAt))
          .limit(50),
        this.db
          .select()
          .from(quotes)
          .where(
            and(eq(quotes.companyId, actor.companyId), inArray(quotes.customerId, historyCustomerIds)),
          )
          .orderBy(desc(quotes.createdAt))
          .limit(50),
        this.db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, actor.companyId),
              inArray(invoices.customerId, historyCustomerIds),
            ),
          )
          .orderBy(desc(invoices.createdAt))
          .limit(50),
        this.db
          .select()
          .from(leads)
          .where(
            and(eq(leads.companyId, actor.companyId), inArray(leads.customerId, historyCustomerIds)),
          )
          .orderBy(desc(leads.createdAt))
          .limit(50),
        this.db
          .select()
          .from(communications)
          .where(
            and(
              eq(communications.companyId, actor.companyId),
              inArray(communications.customerId, historyCustomerIds),
            ),
          )
          .orderBy(desc(communications.occurredAt))
          .limit(50),
        this.db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.companyId, actor.companyId),
              inArray(documents.customerId, historyCustomerIds),
            ),
          )
          .orderBy(desc(documents.createdAt))
          .limit(50),
        this.db
          .select()
          .from(opsRecurringMaintenancePlans)
          .where(
            and(
              eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
              inArray(opsRecurringMaintenancePlans.customerId, historyCustomerIds),
            ),
          )
          .limit(50),
        this.db
          .select()
          .from(customerMarketingConsents)
          .where(
            and(
              eq(customerMarketingConsents.companyId, actor.companyId),
              eq(customerMarketingConsents.customerId, customerId),
            ),
          ),
      ]);

    const invoiceIds = invoiceRows.map((i) => i.id);
    const paymentRows =
      invoiceIds.length === 0
        ? []
        : await this.db
            .select()
            .from(payments)
            .where(
              and(eq(payments.companyId, actor.companyId), inArray(payments.invoiceId, invoiceIds)),
            )
            .orderBy(desc(payments.paidAt))
            .limit(50);

    // Row 86: surface canonical registry-linked equipment (not only maintenance plans).
    const registryRows = await this.db
      .select({
        profile: alAssetRegistryProfiles,
        asset: assetEquipment,
        propertyName: cxCustomerProperties.propertyName,
      })
      .from(alAssetRegistryProfiles)
      .innerJoin(
        assetEquipment,
        and(
          eq(assetEquipment.id, alAssetRegistryProfiles.assetId),
          eq(assetEquipment.companyId, actor.companyId),
        ),
      )
      .leftJoin(
        cxCustomerProperties,
        and(
          eq(cxCustomerProperties.id, alAssetRegistryProfiles.propertyId),
          eq(cxCustomerProperties.companyId, actor.companyId),
        ),
      )
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          inArray(alAssetRegistryProfiles.customerId, historyCustomerIds),
        ),
      )
      .limit(100);

    const planAssetIds = [...new Set(planRows.map((p) => p.assetId).filter(Boolean))];
    const registryAssetIds = new Set(registryRows.map((r) => r.asset.id));
    const missingPlanAssetIds = planAssetIds.filter((id) => !registryAssetIds.has(id));
    const planOnlyAssets =
      missingPlanAssetIds.length === 0
        ? []
        : await this.db
            .select()
            .from(assetEquipment)
            .where(
              and(
                eq(assetEquipment.companyId, actor.companyId),
                inArray(assetEquipment.id, missingPlanAssetIds),
              ),
            );

    const allAssetIds = [
      ...registryRows.map((r) => r.asset.id),
      ...planOnlyAssets.map((a) => a.id),
    ];
    const latestServiceByAsset = new Map<string, string>();
    if (allAssetIds.length > 0) {
      const serviceRows = await this.db
        .select({
          assetId: assetMaintenanceRecords.assetId,
          completedAt: assetMaintenanceRecords.completedAt,
          scheduledAt: assetMaintenanceRecords.scheduledAt,
        })
        .from(assetMaintenanceRecords)
        .where(
          and(
            eq(assetMaintenanceRecords.companyId, actor.companyId),
            inArray(assetMaintenanceRecords.assetId, allAssetIds),
          ),
        )
        .orderBy(desc(assetMaintenanceRecords.completedAt))
        .limit(200);
      for (const row of serviceRows) {
        if (latestServiceByAsset.has(row.assetId)) continue;
        const at = row.completedAt ?? row.scheduledAt;
        if (at) latestServiceByAsset.set(row.assetId, at.toISOString());
      }
    }

    const equipmentSummaries = [
      ...registryRows.map((r) => ({
        id: r.asset.id,
        name: r.asset.name,
        assetType: r.asset.assetType,
        status: r.asset.status,
        serialNumber: r.asset.serialNumber,
        manufacturer: r.profile.manufacturer ?? null,
        model: r.profile.model ?? null,
        propertyId: r.profile.propertyId ?? null,
        propertyName: r.propertyName ?? null,
        latestServiceAt: latestServiceByAsset.get(r.asset.id) ?? null,
        href: `/assets/${r.asset.id}`,
      })),
      ...planOnlyAssets.map((a) => ({
        id: a.id,
        name: a.name,
        assetType: a.assetType,
        status: a.status,
        serialNumber: a.serialNumber,
        manufacturer: null as string | null,
        model: null as string | null,
        propertyId: null as string | null,
        propertyName: null as string | null,
        latestServiceAt: latestServiceByAsset.get(a.id) ?? null,
        href: `/assets/${a.id}`,
      })),
    ];

    const primaryPerson = people.find((p) => p.isPrimary && p.status === 'active') ?? people[0] ?? null;

    const timelineBase = buildC360TimelineEvents({
      activities: activityRows.map((r) => ({
        id: r.activity.id,
        content: r.activity.content,
        createdAt: r.activity.createdAt.toISOString(),
      })),
      jobs: jobRows.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        updatedAt: j.updatedAt.toISOString(),
        jobNumber: j.jobNumber,
      })),
      quotes: quoteRows.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        quoteNumber: resolveQuoteDisplayNumberLabel({
          id: q.id,
          quoteNumber: q.quoteNumber,
          xeroQuoteNumber: q.xeroQuoteNumber,
          xeroQuoteId: q.xeroQuoteId,
          sourceExternalId: q.sourceExternalId,
          sourceProvider: q.sourceProvider,
        }),
      })),
      invoices: invoiceRows.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        invoiceNumber: resolveInvoiceDisplayNumberLabel({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          internalNumber: i.internalNumber,
          xeroInvoiceNumber: i.xeroInvoiceNumber,
          sourceExternalId: i.sourceExternalId,
          sourceProvider: i.sourceProvider,
          numberAuthority: i.numberAuthority,
        }),
      })),
      payments: paymentRows.map((p) => {
        const inv = invoiceRows.find((i) => i.id === p.invoiceId);
        return {
          id: p.id,
          paidAt: p.paidAt.toISOString(),
          invoiceId: p.invoiceId,
          reference: p.reference,
          invoiceNumber: inv
            ? resolveInvoiceDisplayNumberLabel({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                internalNumber: inv.internalNumber,
                xeroInvoiceNumber: inv.xeroInvoiceNumber,
                sourceExternalId: inv.sourceExternalId,
                sourceProvider: inv.sourceProvider,
                numberAuthority: inv.numberAuthority,
              })
            : null,
        };
      }),
      communications: commRows.map((c) => ({
        id: c.id,
        subject: c.subject,
        channel: c.channel,
        occurredAt: c.occurredAt.toISOString(),
      })),
      documents: docRows.map((d) => ({
        id: d.id,
        title: d.title,
        createdAt: d.createdAt.toISOString(),
      })),
      maintenance: planRows.map((p) => ({
        planId: p.id,
        planName: p.name,
        status: p.status,
        nextDueAt: p.nextDueAt?.toISOString() ?? null,
        lastCompletedAt: p.lastCompletedAt?.toISOString() ?? null,
      })),
    });

    // Tag associated-source events so they don't collide with canonical ids.
    const tagged = timelineBase.map((event) => {
      if (!event.relatedId) return event;
      const owning =
        event.kind === 'quote'
          ? quoteRows.find((q) => q.id === event.relatedId)?.customerId
          : event.kind === 'invoice'
            ? invoiceRows.find((i) => i.id === event.relatedId)?.customerId
            : event.kind === 'job'
              ? jobRows.find((j) => j.id === event.relatedId)?.customerId
              : null;
      if (owning && owning !== customerId) {
        return {
          ...event,
          id: buildAssociatedHistoryTimelineTag({
            sourceCustomerId: owning,
            sourceCustomerName: associations.find((a) => a.sourceCustomerId === owning)?.sourceCustomerName ?? null,
            kind: event.kind,
            relatedId: event.relatedId,
          }),
          summary: `${event.summary} (associated source)`,
        };
      }
      return event;
    });

    for (const lead of leadRows) {
      tagged.push({
        id: `lead:${lead.id}`,
        kind: 'activity',
        occurredAt: lead.createdAt.toISOString(),
        title: 'Lead',
        summary: `${lead.title} — ${lead.status}`,
        href: `/leads/${lead.id}`,
        relatedId: lead.id,
      });
    }

    const timeline = paginateTimelineEvents({
      events: dedupeTimelineEvents(tagged),
      limit: opts.timelineLimit ?? 40,
      offset: opts.timelineOffset ?? 0,
      order: opts.timelineOrder ?? 'newest',
    });

    return {
      profile: {
        id: customer.id,
        displayName: customer.name,
        companyName: customer.companyName,
        legalName: customer.companyName ?? customer.name,
        vatNumber: customer.vatNumber,
        email: customer.email,
        phone: customer.phone,
        billingAddress: customer.billingAddress,
        siteAddress: customer.siteAddress,
        status: customer.status,
        doNotContact: customer.doNotContact,
        xeroContactId: xero?.xeroContactId ?? null,
        primaryContactName: primaryPerson?.displayName ?? customer.contactPerson,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        provenanceNote:
          'Xero-linked identity is source-preserving. Associated people/source records are non-destructive and do not rewrite financial ownership.',
      },
      people,
      associations,
      billing: {
        companyName: customer.companyName ?? customer.name,
        vatNumber: customer.vatNumber,
        billingAddress: customer.billingAddress,
        email: customer.email,
        phone: customer.phone,
        xeroContactId: xero?.xeroContactId ?? null,
        note: 'Billing fields from canonical customer + Xero mapping. Bank/internal JPE data is not shown on CRM.',
      },
      preferences: {
        doNotContact: customer.doNotContact,
        marketingConsents: consentRows.map((c) => ({
          channel: c.channel,
          status: c.status,
          captureSource: c.captureSource,
          capturedAt: c.capturedAt?.toISOString() ?? null,
        })),
        consentNeverInferredFromContactPresence: true,
        optOutAuthoritative: true,
      },
      notes: notesVisible
        ? activityRows.map((r) => ({
            id: r.activity.id,
            content: r.activity.content,
            authorName:
              [r.authorFirst, r.authorLast].filter(Boolean).join(' ').trim() ||
              r.authorEmail ||
              'Staff',
            createdAt: r.activity.createdAt.toISOString(),
            visibility: 'internal' as const,
          }))
        : [],
      properties: propertyRows.map((p) => ({
        id: p.id,
        name: p.propertyName,
        address:
          [p.addressLine1, p.suburb, p.city].filter(Boolean).join(', ') ||
          p.formattedAddress ||
          null,
        isPrimary: p.isPrimary,
        href: `/properties/${p.id}`,
      })),
      equipment: equipmentSummaries,
      leads: leadRows.map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        href: `/leads/${l.id}`,
      })),
      timeline,
      sections: CUSTOMER_360_SECTIONS,
      policy: {
        rebuildsCrm: false,
        inventsData: false,
        destructiveMerge: false,
        xeroWrites: false,
        preservesFinancialOwnership: true,
        technicianClientDenied: true,
      },
    };
  }
}
