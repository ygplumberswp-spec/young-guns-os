/**
 * Property / Site 360 — CURRENT Row 84.
 * Staging-only workspace over canonical cx_customer_properties.
 * Reuses job snapshots, asset_equipment + al_asset_registry_profiles, customer_people.
 * No parallel properties/equipment systems. No Row 85/86. No fake data. No Xero writes.
 */
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  PROPERTY_SITE_360_SECTIONS,
  assertTechnicianDeniedPropertySite360,
  buildJobSiteSnapshotFromJob,
  canAccessPropertySite360,
  canWritePropertySite360,
  canViewCustomer360InternalNotesAccess,
  normalizePropertyAddressKey,
  paginatePropertyActivity,
  planPropertyDuplicateWarning,
  type PropertyJobSiteSnapshot,
  type PropertySiteActivityEvent,
  type PropertySiteContact,
  type PropertySiteDocumentSummary,
  type PropertySiteEquipmentSummary,
  type PropertySiteJobSummary,
  type PropertySiteNote,
  type PropertySiteStatus,
  type PropertySiteVisitSummary,
  type PropertySiteWorkspace,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  assetEquipment,
  customerPeople,
  customers,
  cxCustomerProperties,
  documents,
  jobVisits,
  jobs,
  propertySiteContacts,
  quotes,
  securityAuditLogs,
} from '@titan/db';

export class PropertySite360Error extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PropertySite360Error';
  }
}

export type PropertySite360Actor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function formatAddress(p: {
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
}): string | null {
  const parts = [p.addressLine1, p.addressLine2, p.suburb, p.city, p.province, p.postalCode].filter(
    Boolean,
  );
  if (parts.length > 0) return parts.join(', ');
  return p.formattedAddress;
}

export class PropertySite360Service {
  constructor(private readonly db: DatabaseClient) {}

  private assertAccess(actor: PropertySite360Actor): void {
    const gate = assertTechnicianDeniedPropertySite360(actor);
    if (!gate.allowed) {
      throw new PropertySite360Error('FORBIDDEN', gate.reason);
    }
    if (!canAccessPropertySite360(actor)) {
      throw new PropertySite360Error('FORBIDDEN', 'Property 360 requires authorised staff access.');
    }
  }

  private assertWrite(actor: PropertySite360Actor): void {
    this.assertAccess(actor);
    if (!canWritePropertySite360(actor)) {
      throw new PropertySite360Error('FORBIDDEN', 'Property 360 write requires authorised staff.');
    }
  }

  private async audit(
    actor: PropertySite360Actor,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action,
      entityType,
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        module: 'property_site_360',
        inventsData: false,
        xeroWrite: false,
        row85: false,
        row86: false,
        productionWrite: false,
      },
    });
  }

  private async loadPropertyOrThrow(actor: PropertySite360Actor, propertyId: string) {
    const [row] = await this.db
      .select()
      .from(cxCustomerProperties)
      .where(
        and(
          eq(cxCustomerProperties.companyId, actor.companyId),
          eq(cxCustomerProperties.id, propertyId),
        ),
      )
      .limit(1);
    if (!row) throw new PropertySite360Error('NOT_FOUND', 'Property not found in this tenant.');
    return row;
  }

  async getWorkspace(
    actor: PropertySite360Actor,
    propertyId: string,
    opts?: {
      activityLimit?: number;
      activityOffset?: number;
      activityOrder?: 'newest' | 'oldest';
      jobsLimit?: number;
      visitsLimit?: number;
      equipmentLimit?: number;
      documentsLimit?: number;
    },
  ): Promise<PropertySiteWorkspace> {
    this.assertAccess(actor);
    const property = await this.loadPropertyOrThrow(actor, propertyId);

    const [customer] = await this.db
      .select({
        id: customers.id,
        name: customers.name,
        companyName: customers.companyName,
      })
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, property.customerId)))
      .limit(1);
    if (!customer) throw new PropertySite360Error('NOT_FOUND', 'Customer not found for property.');

    const jobsLimit = Math.min(Math.max(opts?.jobsLimit ?? 40, 1), 100);
    const visitsLimit = Math.min(Math.max(opts?.visitsLimit ?? 40, 1), 100);
    const equipmentLimit = Math.min(Math.max(opts?.equipmentLimit ?? 40, 1), 100);
    const documentsLimit = Math.min(Math.max(opts?.documentsLimit ?? 40, 1), 100);
    const activityLimit = Math.min(Math.max(opts?.activityLimit ?? 40, 1), 100);
    const activityOffset = Math.max(opts?.activityOffset ?? 0, 0);
    const activityOrder = opts?.activityOrder === 'oldest' ? 'oldest' : 'newest';

    const contactRows = await this.db
      .select({
        id: propertySiteContacts.id,
        propertyId: propertySiteContacts.propertyId,
        personId: propertySiteContacts.personId,
        role: propertySiteContacts.role,
        isPrimary: propertySiteContacts.isPrimary,
        notes: propertySiteContacts.notes,
        displayName: customerPeople.displayName,
        email: customerPeople.email,
        phone: customerPeople.phone,
      })
      .from(propertySiteContacts)
      .innerJoin(customerPeople, eq(customerPeople.id, propertySiteContacts.personId))
      .where(
        and(
          eq(propertySiteContacts.companyId, actor.companyId),
          eq(propertySiteContacts.propertyId, propertyId),
          eq(customerPeople.companyId, actor.companyId),
        ),
      )
      .orderBy(desc(propertySiteContacts.isPrimary), desc(propertySiteContacts.createdAt))
      .limit(50);

    const contacts: PropertySiteContact[] = contactRows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      personId: r.personId,
      displayName: r.displayName,
      role: r.role as PropertySiteContact['role'],
      isPrimary: r.isPrimary,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
    }));

    const primaryContactName =
      contacts.find((c) => c.isPrimary)?.displayName ??
      contacts.find((c) => c.role === 'primary')?.displayName ??
      null;

    const [jobCountRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.propertyId, propertyId)));
    const jobTotal = Number(jobCountRow?.c ?? 0);

    const jobRows = await this.db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        status: jobs.status,
        executionPhase: jobs.executionPhase,
        scheduledAt: jobs.scheduledAt,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        propertyId: jobs.propertyId,
        snapshotStreet: jobs.snapshotStreet,
        snapshotSuburb: jobs.snapshotSuburb,
        snapshotCity: jobs.snapshotCity,
        snapshotProvince: jobs.snapshotProvince,
        snapshotPostalCode: jobs.snapshotPostalCode,
        snapshotUnit: jobs.snapshotUnit,
        snapshotLatitude: jobs.snapshotLatitude,
        snapshotLongitude: jobs.snapshotLongitude,
        snapshotFormattedAddress: jobs.snapshotFormattedAddress,
        snapshotSiteContactName: jobs.snapshotSiteContactName,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.propertyId, propertyId)))
      .orderBy(desc(jobs.createdAt))
      .limit(jobsLimit);

    const jobIds = jobRows.map((j) => j.id);

    const jobItems: PropertySiteJobSummary[] = jobRows.map((j) => {
      // Site name is not a separate job snapshot column today — do not bind it to live propertyName
      // (which can change). Address/geo/contact snapshots on the job remain the immutable truth.
      const snapshot = buildJobSiteSnapshotFromJob({
        propertyId: j.propertyId,
        propertyName: null,
        titleFallback: j.snapshotFormattedAddress ?? j.snapshotStreet ?? null,
        snapshotStreet: j.snapshotStreet,
        snapshotSuburb: j.snapshotSuburb,
        snapshotCity: j.snapshotCity,
        snapshotProvince: j.snapshotProvince,
        snapshotPostalCode: j.snapshotPostalCode,
        snapshotUnit: j.snapshotUnit,
        snapshotLatitude: j.snapshotLatitude,
        snapshotLongitude: j.snapshotLongitude,
        snapshotFormattedAddress: j.snapshotFormattedAddress,
        snapshotSiteContactName: j.snapshotSiteContactName,
      });
      return {
        id: j.id,
        jobNumber: j.jobNumber,
        title: j.title,
        status: j.status,
        executionPhase: j.executionPhase,
        scheduledAt: j.scheduledAt?.toISOString() ?? null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
        href: `/jobs/${j.id}`,
        snapshot,
      };
    });

    const visitRows =
      jobIds.length === 0
        ? []
        : await this.db
            .select({
              id: jobVisits.id,
              jobId: jobVisits.jobId,
              visitNumber: jobVisits.visitNumber,
              status: jobVisits.status,
              closeReason: jobVisits.closeReason,
              labourMinutes: jobVisits.labourMinutes,
              startedAt: jobVisits.startedAt,
              endedAt: jobVisits.endedAt,
            })
            .from(jobVisits)
            .where(and(eq(jobVisits.companyId, actor.companyId), inArray(jobVisits.jobId, jobIds)))
            .orderBy(desc(jobVisits.createdAt))
            .limit(visitsLimit);

    const jobNumberById = new Map(jobRows.map((j) => [j.id, j.jobNumber]));
    const visitItems: PropertySiteVisitSummary[] = visitRows.map((v) => ({
      id: v.id,
      jobId: v.jobId,
      jobNumber: jobNumberById.get(v.jobId) ?? null,
      visitNumber: v.visitNumber,
      status: v.status,
      closeReason: v.closeReason,
      labourMinutes: v.labourMinutes,
      startedAt: v.startedAt?.toISOString() ?? null,
      endedAt: v.endedAt?.toISOString() ?? null,
    }));

    const [equipCountRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(alAssetRegistryProfiles)
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          eq(alAssetRegistryProfiles.propertyId, propertyId),
        ),
      );
    const equipmentTotal = Number(equipCountRow?.c ?? 0);

    const equipRows = await this.db
      .select({
        assetId: assetEquipment.id,
        name: assetEquipment.name,
        assetType: assetEquipment.assetType,
        status: assetEquipment.status,
        serialNumber: assetEquipment.serialNumber,
        manufacturer: alAssetRegistryProfiles.manufacturer,
        model: alAssetRegistryProfiles.model,
        installationDate: alAssetRegistryProfiles.installationDate,
      })
      .from(alAssetRegistryProfiles)
      .innerJoin(assetEquipment, eq(assetEquipment.id, alAssetRegistryProfiles.assetId))
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          eq(alAssetRegistryProfiles.propertyId, propertyId),
          eq(assetEquipment.companyId, actor.companyId),
        ),
      )
      .orderBy(desc(assetEquipment.updatedAt))
      .limit(equipmentLimit);

    const equipmentItems: PropertySiteEquipmentSummary[] = equipRows.map((e) => ({
      id: e.assetId,
      name: e.name,
      assetType: e.assetType,
      status: e.status,
      manufacturer: e.manufacturer,
      model: e.model,
      serialNumber: e.serialNumber,
      installationDate: e.installationDate,
      href: `/assets/${e.assetId}`,
    }));

    const docItems: PropertySiteDocumentSummary[] = [];
    if (jobIds.length > 0) {
      const jobDocs = await this.db
        .select({
          id: documents.id,
          title: documents.title,
          fileName: documents.fileName,
          jobId: documents.jobId,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.companyId, actor.companyId), inArray(documents.jobId, jobIds)))
        .orderBy(desc(documents.createdAt))
        .limit(documentsLimit);
      for (const d of jobDocs) {
        docItems.push({
          id: d.id,
          title: d.title,
          fileName: d.fileName,
          jobId: d.jobId,
          createdAt: d.createdAt.toISOString(),
        });
      }
    }
    if (docItems.length < documentsLimit) {
      const custDocs = await this.db
        .select({
          id: documents.id,
          title: documents.title,
          fileName: documents.fileName,
          jobId: documents.jobId,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(
          and(
            eq(documents.companyId, actor.companyId),
            eq(documents.customerId, property.customerId),
          ),
        )
        .orderBy(desc(documents.createdAt))
        .limit(documentsLimit - docItems.length);
      const seen = new Set(docItems.map((d) => d.id));
      for (const d of custDocs) {
        if (seen.has(d.id)) continue;
        docItems.push({
          id: d.id,
          title: d.title,
          fileName: d.fileName,
          jobId: d.jobId,
          createdAt: d.createdAt.toISOString(),
        });
      }
    }

    const [docCountRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(documents)
      .where(
        and(
          eq(documents.companyId, actor.companyId),
          or(
            jobIds.length > 0 ? inArray(documents.jobId, jobIds) : sql`false`,
            eq(documents.customerId, property.customerId),
          ),
        ),
      );

    const notesVisible = canViewCustomer360InternalNotesAccess(actor);
    const notes: PropertySiteNote[] = [];
    if (notesVisible && property.siteNotes?.trim()) {
      notes.push({
        id: `site-notes:${property.id}`,
        content: property.siteNotes,
        authorName: 'Site notes',
        createdAt: property.updatedAt.toISOString(),
        visibility: 'internal',
      });
    }
    if (notesVisible && property.accessInstructions?.trim()) {
      notes.push({
        id: `access-instructions:${property.id}`,
        content: property.accessInstructions,
        authorName: 'Access instructions',
        createdAt: property.updatedAt.toISOString(),
        visibility: 'internal',
      });
    }

    const activityEvents: PropertySiteActivityEvent[] = [];
    for (const j of jobItems) {
      activityEvents.push({
        id: `job:${j.id}`,
        kind: 'job',
        occurredAt: j.createdAt,
        title: j.jobNumber ? `Job ${j.jobNumber}` : j.title,
        summary: `${j.status} · ${j.title}`,
        href: j.href,
        relatedId: j.id,
      });
    }
    for (const v of visitItems) {
      activityEvents.push({
        id: `visit:${v.id}`,
        kind: 'visit',
        occurredAt: v.startedAt ?? v.endedAt ?? jCreatedFallback(jobItems, v.jobId),
        title: `Visit #${v.visitNumber}`,
        summary: `${v.status}${v.closeReason ? ` · ${v.closeReason}` : ''}`,
        href: `/jobs/${v.jobId}`,
        relatedId: v.id,
      });
    }
    for (const d of docItems) {
      activityEvents.push({
        id: `document:${d.id}`,
        kind: 'document',
        occurredAt: d.createdAt,
        title: d.title || d.fileName,
        summary: d.fileName,
        href: null,
        relatedId: d.id,
      });
    }
    for (const e of equipmentItems) {
      activityEvents.push({
        id: `equipment:${e.id}`,
        kind: 'equipment',
        occurredAt: property.updatedAt.toISOString(),
        title: e.name,
        summary: `${e.assetType} · ${e.status}`,
        href: e.href,
        relatedId: e.id,
      });
    }
    activityEvents.push({
      id: `property:${property.id}:updated`,
      kind: 'property',
      occurredAt: property.updatedAt.toISOString(),
      title: 'Property updated',
      summary: property.propertyName,
      href: `/properties/${property.id}`,
      relatedId: property.id,
    });

    const activity = paginatePropertyActivity({
      events: activityEvents,
      limit: activityLimit,
      offset: activityOffset,
      order: activityOrder,
    });

    const status = (property.status as PropertySiteStatus) ?? 'active';

    return {
      profile: {
        id: property.id,
        propertyName: property.propertyName,
        customerId: property.customerId,
        customerName: customer.companyName?.trim() || customer.name,
        status,
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2,
        suburb: property.suburb,
        city: property.city,
        province: property.province,
        postalCode: property.postalCode,
        country: property.country,
        unitNumber: property.unitNumber,
        addressDisplay: formatAddress(property),
        latitude: property.latitude,
        longitude: property.longitude,
        geocodeStatus: property.geocodeStatus,
        accessInstructions: property.accessInstructions,
        siteNotes: notesVisible ? property.siteNotes : null,
        isPrimary: property.isPrimary,
        sourceProvider: property.sourceProvider,
        sourceExternalId: property.sourceExternalId,
        primaryContactName,
        createdAt: property.createdAt.toISOString(),
        updatedAt: property.updatedAt.toISOString(),
        provenanceNote:
          'Canonical cx_customer_properties identity. Source IDs are preserved on display edits. Job site snapshots remain immutable.',
      },
      contacts,
      equipment: equipmentItems,
      jobs: jobItems,
      visits: visitItems,
      documents: docItems,
      notes,
      activity,
      sections: PROPERTY_SITE_360_SECTIONS,
      counts: {
        equipment: equipmentTotal,
        jobs: jobTotal,
        visits: visitItems.length,
        documents: Number(docCountRow?.c ?? docItems.length),
      },
      policy: {
        rebuildsProperties: false,
        inventsData: false,
        parallelAssetRegistry: false,
        jobSnapshotsImmutable: true,
        technicianClientDenied: true,
      },
    };
  }

  async search(
    actor: PropertySite360Actor,
    opts: {
      q?: string;
      customerId?: string;
      status?: PropertySiteStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    this.assertAccess(actor);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conditions = [eq(cxCustomerProperties.companyId, actor.companyId)];
    if (opts.customerId) conditions.push(eq(cxCustomerProperties.customerId, opts.customerId));
    if (opts.status) conditions.push(eq(cxCustomerProperties.status, opts.status));
    if (opts.q?.trim()) {
      const term = `%${opts.q.trim()}%`;
      conditions.push(
        or(
          ilike(cxCustomerProperties.propertyName, term),
          ilike(cxCustomerProperties.addressLine1, term),
          ilike(cxCustomerProperties.suburb, term),
          ilike(cxCustomerProperties.city, term),
          ilike(customers.name, term),
          ilike(customers.companyName, term),
        )!,
      );
    }

    const where = and(...conditions, eq(customers.companyId, actor.companyId));

    const [countRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(cxCustomerProperties)
      .innerJoin(customers, eq(customers.id, cxCustomerProperties.customerId))
      .where(where);

    const rows = await this.db
      .select({
        id: cxCustomerProperties.id,
        customerId: cxCustomerProperties.customerId,
        propertyName: cxCustomerProperties.propertyName,
        addressLine1: cxCustomerProperties.addressLine1,
        suburb: cxCustomerProperties.suburb,
        city: cxCustomerProperties.city,
        status: cxCustomerProperties.status,
        updatedAt: cxCustomerProperties.updatedAt,
        customerName: customers.name,
        customerCompanyName: customers.companyName,
      })
      .from(cxCustomerProperties)
      .innerJoin(customers, eq(customers.id, cxCustomerProperties.customerId))
      .where(where)
      .orderBy(desc(cxCustomerProperties.updatedAt))
      .limit(limit)
      .offset(offset);

    return {
      total: Number(countRow?.c ?? 0),
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerCompanyName?.trim() || r.customerName,
        propertyName: r.propertyName,
        addressLine1: r.addressLine1,
        suburb: r.suburb,
        city: r.city,
        status: r.status as PropertySiteStatus,
        updatedAt: r.updatedAt.toISOString(),
        href: `/properties/${r.id}`,
      })),
    };
  }

  async createProperty(
    actor: PropertySite360Actor,
    input: {
      customerId: string;
      propertyName: string;
      addressLine1?: string | null;
      addressLine2?: string | null;
      suburb?: string | null;
      city?: string | null;
      province?: string | null;
      postalCode?: string | null;
      country?: string | null;
      unitNumber?: string | null;
      accessInstructions?: string | null;
      siteNotes?: string | null;
      isPrimary?: boolean;
      forceCreate?: boolean;
    },
  ) {
    this.assertWrite(actor);

    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, actor.companyId), eq(customers.id, input.customerId)))
      .limit(1);
    if (!customer) throw new PropertySite360Error('NOT_FOUND', 'Customer not found in this tenant.');

    const warning = await this.checkDuplicateWarning(actor, {
      customerId: input.customerId,
      propertyName: input.propertyName,
      addressLine1: input.addressLine1 ?? null,
      suburb: input.suburb ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
    });

    if (warning.decision !== 'OK' && !input.forceCreate) {
      throw new PropertySite360Error(
        'DUPLICATE_REVIEW',
        `${warning.reason} Matches: ${warning.matches.map((m) => m.propertyName).join(', ') || 'n/a'}. Pass forceCreate after review — never auto-merge.`,
      );
    }

    const [created] = await this.db
      .insert(cxCustomerProperties)
      .values({
        companyId: actor.companyId,
        customerId: input.customerId,
        propertyName: input.propertyName.trim(),
        addressLine1: input.addressLine1?.trim() || null,
        addressLine2: input.addressLine2?.trim() || null,
        suburb: input.suburb?.trim() || null,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        country: input.country?.trim() || null,
        unitNumber: input.unitNumber?.trim() || null,
        accessInstructions: input.accessInstructions?.trim() || null,
        siteNotes: input.siteNotes?.trim() || null,
        isPrimary: input.isPrimary ?? false,
        status: 'active',
      })
      .returning();

    await this.audit(actor, 'property_created', 'property', created.id, {
      customerId: input.customerId,
      propertyName: created.propertyName,
      duplicateWarning: warning.decision,
      forceCreate: Boolean(input.forceCreate),
    });

    return created;
  }

  async updateProperty(
    actor: PropertySite360Actor,
    propertyId: string,
    input: {
      propertyName?: string;
      addressLine1?: string | null;
      addressLine2?: string | null;
      suburb?: string | null;
      city?: string | null;
      province?: string | null;
      postalCode?: string | null;
      country?: string | null;
      unitNumber?: string | null;
      status?: PropertySiteStatus;
      accessInstructions?: string | null;
      siteNotes?: string | null;
      isPrimary?: boolean;
    },
  ) {
    this.assertWrite(actor);
    const before = await this.loadPropertyOrThrow(actor, propertyId);

    // Capture job snapshots BEFORE update — they must remain unchanged after.
    // Job site address snapshots live on jobs.*snapshot_* and are never written by property updates.
    const snapshotsBefore = await this.loadRawJobSnapshots(actor.companyId, propertyId);

    const [updated] = await this.db
      .update(cxCustomerProperties)
      .set({
        ...(input.propertyName !== undefined ? { propertyName: input.propertyName.trim() } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
        ...(input.suburb !== undefined ? { suburb: input.suburb } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.province !== undefined ? { province: input.province } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.accessInstructions !== undefined
          ? { accessInstructions: input.accessInstructions }
          : {}),
        ...(input.siteNotes !== undefined ? { siteNotes: input.siteNotes } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cxCustomerProperties.companyId, actor.companyId),
          eq(cxCustomerProperties.id, propertyId),
        ),
      )
      .returning();

    if (!updated) throw new PropertySite360Error('NOT_FOUND', 'Property not found.');

    // Prove property UPDATE did not cascade into job snapshot columns.
    const snapshotsAfter = await this.loadRawJobSnapshots(actor.companyId, propertyId);
    for (const beforeSnap of snapshotsBefore) {
      const afterSnap = snapshotsAfter.find((s) => s.id === beforeSnap.id);
      if (!afterSnap) continue;
      if (
        beforeSnap.snapshotStreet !== afterSnap.snapshotStreet ||
        beforeSnap.snapshotCity !== afterSnap.snapshotCity ||
        beforeSnap.snapshotSuburb !== afterSnap.snapshotSuburb ||
        beforeSnap.snapshotFormattedAddress !== afterSnap.snapshotFormattedAddress ||
        beforeSnap.snapshotPostalCode !== afterSnap.snapshotPostalCode ||
        beforeSnap.snapshotLatitude !== afterSnap.snapshotLatitude ||
        beforeSnap.snapshotLongitude !== afterSnap.snapshotLongitude
      ) {
        throw new PropertySite360Error(
          'SNAPSHOT_MUTATION',
          'Historical job-site snapshot mutated after property edit.',
        );
      }
    }

    await this.audit(actor, 'property_updated', 'property', propertyId, {
      before: {
        propertyName: before.propertyName,
        addressLine1: before.addressLine1,
        status: before.status,
        siteNotes: before.siteNotes,
        accessInstructions: before.accessInstructions,
      },
      after: {
        propertyName: updated.propertyName,
        addressLine1: updated.addressLine1,
        status: updated.status,
        siteNotes: updated.siteNotes,
        accessInstructions: updated.accessInstructions,
      },
      sourceProviderPreserved: before.sourceProvider,
      sourceExternalIdPreserved: before.sourceExternalId,
      jobSnapshotsImmutable: true,
      snapshotsChecked: snapshotsBefore.length,
    });

    return updated;
  }

  async archiveProperty(actor: PropertySite360Actor, propertyId: string) {
    this.assertWrite(actor);
    const property = await this.loadPropertyOrThrow(actor, propertyId);

    const [jobCountRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.propertyId, propertyId)));
    const hasJobHistory = Number(jobCountRow?.c ?? 0) > 0;

    await this.db
      .update(cxCustomerProperties)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(cxCustomerProperties.companyId, actor.companyId),
          eq(cxCustomerProperties.id, propertyId),
        ),
      );

    await this.audit(actor, 'property_archived', 'property', propertyId, {
      previousStatus: property.status,
      hasJobHistory,
      hardDeleteBlocked: true,
      reason: hasJobHistory ? 'history_exists_archive_only' : 'archive_preferred',
    });

    return { archived: true as const, hasJobHistory, hardDeleteBlocked: true as const };
  }

  async checkDuplicateWarning(
    actor: PropertySite360Actor,
    input: {
      customerId: string;
      propertyName: string;
      addressLine1?: string | null;
      suburb?: string | null;
      city?: string | null;
      postalCode?: string | null;
    },
  ) {
    this.assertAccess(actor);
    const existing = await this.db
      .select({
        id: cxCustomerProperties.id,
        propertyName: cxCustomerProperties.propertyName,
        addressLine1: cxCustomerProperties.addressLine1,
        suburb: cxCustomerProperties.suburb,
        city: cxCustomerProperties.city,
        postalCode: cxCustomerProperties.postalCode,
      })
      .from(cxCustomerProperties)
      .where(
        and(
          eq(cxCustomerProperties.companyId, actor.companyId),
          eq(cxCustomerProperties.customerId, input.customerId),
        ),
      )
      .limit(200);

    const incomingAddressKey = normalizePropertyAddressKey({
      propertyName: input.propertyName,
      street: input.addressLine1,
      suburb: input.suburb,
      city: input.city,
      postalCode: input.postalCode,
    });

    return planPropertyDuplicateWarning({
      incomingAddressKey,
      candidates: existing.map((e) => ({
        id: e.id,
        propertyName: e.propertyName,
        addressKey: normalizePropertyAddressKey({
          propertyName: e.propertyName,
          street: e.addressLine1,
          suburb: e.suburb,
          city: e.city,
          postalCode: e.postalCode,
        }),
      })),
    });
  }

  async upsertSiteContact(
    actor: PropertySite360Actor,
    propertyId: string,
    input: {
      personId: string;
      role?: PropertySiteContact['role'];
      isPrimary?: boolean;
      notes?: string | null;
    },
  ) {
    this.assertWrite(actor);
    const property = await this.loadPropertyOrThrow(actor, propertyId);

    const [person] = await this.db
      .select()
      .from(customerPeople)
      .where(
        and(eq(customerPeople.companyId, actor.companyId), eq(customerPeople.id, input.personId)),
      )
      .limit(1);
    if (!person) throw new PropertySite360Error('NOT_FOUND', 'Customer person not found.');
    if (person.customerId !== property.customerId) {
      throw new PropertySite360Error(
        'INVALID_STATE',
        'Site contact must belong to the property customer (Row 83 customer_people).',
      );
    }

    if (input.isPrimary) {
      await this.db
        .update(propertySiteContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(propertySiteContacts.companyId, actor.companyId),
            eq(propertySiteContacts.propertyId, propertyId),
            eq(propertySiteContacts.isPrimary, true),
          ),
        );
    }

    const role = input.role ?? 'other';
    const [existing] = await this.db
      .select()
      .from(propertySiteContacts)
      .where(
        and(
          eq(propertySiteContacts.companyId, actor.companyId),
          eq(propertySiteContacts.propertyId, propertyId),
          eq(propertySiteContacts.personId, input.personId),
          eq(propertySiteContacts.role, role),
        ),
      )
      .limit(1);

    let row;
    if (existing) {
      [row] = await this.db
        .update(propertySiteContacts)
        .set({
          isPrimary: input.isPrimary ?? existing.isPrimary,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(propertySiteContacts.id, existing.id))
        .returning();
    } else {
      [row] = await this.db
        .insert(propertySiteContacts)
        .values({
          companyId: actor.companyId,
          propertyId,
          personId: input.personId,
          role,
          isPrimary: input.isPrimary ?? false,
          notes: input.notes ?? null,
          createdByUserId: actor.userId,
        })
        .returning();
    }

    await this.audit(actor, 'property_site_contact_linked', 'property', propertyId, {
      personId: input.personId,
      role: row.role,
      isPrimary: row.isPrimary,
      reusedCustomerPeople: true,
    });

    return row;
  }

  async unlinkSiteContact(actor: PropertySite360Actor, propertyId: string, contactId: string) {
    this.assertWrite(actor);
    await this.loadPropertyOrThrow(actor, propertyId);

    const [deleted] = await this.db
      .delete(propertySiteContacts)
      .where(
        and(
          eq(propertySiteContacts.companyId, actor.companyId),
          eq(propertySiteContacts.propertyId, propertyId),
          eq(propertySiteContacts.id, contactId),
        ),
      )
      .returning();

    if (!deleted) throw new PropertySite360Error('NOT_FOUND', 'Site contact link not found.');

    await this.audit(actor, 'property_site_contact_unlinked', 'property', propertyId, {
      contactId,
      personId: deleted.personId,
    });

    return { unlinked: true as const };
  }

  async linkEquipment(actor: PropertySite360Actor, propertyId: string, assetId: string) {
    this.assertWrite(actor);
    await this.loadPropertyOrThrow(actor, propertyId);

    const [asset] = await this.db
      .select({ id: assetEquipment.id })
      .from(assetEquipment)
      .where(and(eq(assetEquipment.companyId, actor.companyId), eq(assetEquipment.id, assetId)))
      .limit(1);
    if (!asset) throw new PropertySite360Error('NOT_FOUND', 'Asset not found in this tenant.');

    const [profile] = await this.db
      .select()
      .from(alAssetRegistryProfiles)
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          eq(alAssetRegistryProfiles.assetId, assetId),
        ),
      )
      .limit(1);

    if (profile) {
      await this.db
        .update(alAssetRegistryProfiles)
        .set({ propertyId, updatedAt: new Date() })
        .where(eq(alAssetRegistryProfiles.id, profile.id));
    } else {
      await this.db.insert(alAssetRegistryProfiles).values({
        companyId: actor.companyId,
        assetId,
        propertyId,
      });
    }

    await this.audit(actor, 'property_equipment_linked', 'property', propertyId, {
      assetId,
      createdParallelAsset: false,
      row86Reconciliation: false,
    });

    return { linked: true as const, createdParallelAsset: false as const };
  }

  async unlinkEquipment(actor: PropertySite360Actor, propertyId: string, assetId: string) {
    this.assertWrite(actor);
    await this.loadPropertyOrThrow(actor, propertyId);

    await this.db
      .update(alAssetRegistryProfiles)
      .set({ propertyId: null, updatedAt: new Date() })
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, actor.companyId),
          eq(alAssetRegistryProfiles.propertyId, propertyId),
          eq(alAssetRegistryProfiles.assetId, assetId),
        ),
      );

    await this.audit(actor, 'property_equipment_unlinked', 'property', propertyId, { assetId });
    return { unlinked: true as const };
  }

  private async loadRawJobSnapshots(companyId: string, propertyId: string) {
    return this.db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        status: jobs.status,
        propertyId: jobs.propertyId,
        snapshotStreet: jobs.snapshotStreet,
        snapshotSuburb: jobs.snapshotSuburb,
        snapshotCity: jobs.snapshotCity,
        snapshotProvince: jobs.snapshotProvince,
        snapshotPostalCode: jobs.snapshotPostalCode,
        snapshotUnit: jobs.snapshotUnit,
        snapshotLatitude: jobs.snapshotLatitude,
        snapshotLongitude: jobs.snapshotLongitude,
        snapshotFormattedAddress: jobs.snapshotFormattedAddress,
        snapshotSiteContactName: jobs.snapshotSiteContactName,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.propertyId, propertyId)))
      .orderBy(desc(jobs.createdAt))
      .limit(100);
  }

  async getJobSnapshots(actor: PropertySite360Actor, propertyId: string) {
    this.assertAccess(actor);
    await this.loadPropertyOrThrow(actor, propertyId);
    const rows = await this.loadRawJobSnapshots(actor.companyId, propertyId);

    return rows.map((r) => ({
      jobId: r.id,
      jobNumber: r.jobNumber,
      status: r.status,
      snapshot: buildJobSiteSnapshotFromJob({
        propertyId: r.propertyId,
        propertyName: null,
        titleFallback: r.snapshotFormattedAddress ?? r.snapshotStreet ?? null,
        snapshotStreet: r.snapshotStreet,
        snapshotSuburb: r.snapshotSuburb,
        snapshotCity: r.snapshotCity,
        snapshotProvince: r.snapshotProvince,
        snapshotPostalCode: r.snapshotPostalCode,
        snapshotUnit: r.snapshotUnit,
        snapshotLatitude: r.snapshotLatitude,
        snapshotLongitude: r.snapshotLongitude,
        snapshotFormattedAddress: r.snapshotFormattedAddress,
        snapshotSiteContactName: r.snapshotSiteContactName,
      }) satisfies PropertyJobSiteSnapshot,
    }));
  }

  /** Staging proof helper — read-only quote/job linkage for a property. */
  async getPropertyQuoteLinks(actor: PropertySite360Actor, propertyId: string) {
    this.assertAccess(actor);
    await this.loadPropertyOrThrow(actor, propertyId);
    const jobRows = await this.db
      .select({ id: jobs.id, jobNumber: jobs.jobNumber })
      .from(jobs)
      .where(and(eq(jobs.companyId, actor.companyId), eq(jobs.propertyId, propertyId)))
      .limit(100);
    const jobIds = jobRows.map((j) => j.id);
    if (jobIds.length === 0) return [];

    const quoteRows = await this.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        xeroQuoteId: quotes.xeroQuoteId,
        jobId: quotes.jobId,
        propertyId: quotes.propertyId,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.companyId, actor.companyId),
          or(inArray(quotes.jobId, jobIds), eq(quotes.propertyId, propertyId)),
        ),
      )
      .limit(50);

    return quoteRows;
  }
}

function jCreatedFallback(jobs: PropertySiteJobSummary[], jobId: string): string {
  return jobs.find((j) => j.id === jobId)?.createdAt ?? new Date(0).toISOString();
}
