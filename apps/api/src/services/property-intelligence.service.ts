import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  buildPriDocumentSnapshot,
  buildPriEquipmentSnapshot,
  buildPriInsightDraft,
  buildPriMapsSnapshot,
  buildPriWorkSnapshot,
  canAccessPropertyIntelligence,
  canApprovePropertyIntelligenceDrafts,
  canManagePropertyIntelligenceSettings,
  canWritePropertyIntelligence,
  defaultPriSettings,
  formatPriAddress,
  isValidLatLng,
  listPriAuraConnections,
  PRI_PRODUCT_COPY,
  type AcknowledgePriInsightRequest,
  type CreatePriAuraInsightRequest,
  type DecidePriInsightDraftRequest,
  type PriAuraInsightSummary,
  type PriCocRow,
  type PriDashboard,
  type PriEquipmentRow,
  type PriInsightDraftSummary,
  type PriInsightKind,
  type PriMaintenanceHistoryRow,
  type PriPhotoRow,
  type PriPreviousWorkRow,
  type PriPropertyProfile,
  type PriSettings,
  type RefreshPriInsightsRequest,
  type UpdatePriSettingsRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  alAssetRegistryProfiles,
  assetEquipment,
  completionReports,
  customers,
  cxAppointmentBookings,
  cxCustomerDocuments,
  cxCustomerProperties,
  integrationConnections,
  jobDocumentPackItems,
  jobDocumentPacks,
  jobs,
  opsMaintenanceRuns,
  opsRecurringMaintenancePlans,
  priAuraInsights,
  priInsightDrafts,
  priSettings,
  securityAuditLogs,
} from '@titan/db';

export class PropertyIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PropertyIntelligenceError';
  }
}

export type PriActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function includesSection(sections: unknown, value: string): boolean {
  return Array.isArray(sections) && sections.some((s) => String(s) === value);
}

function photoCountFromPayload(payload: Record<string, unknown> | null | undefined): number {
  if (!payload) return 0;
  let count = 0;
  for (const key of ['photos_before', 'photos_during', 'photos_after', 'photos']) {
    const value = payload[key];
    if (Array.isArray(value)) count += value.length;
  }
  return count;
}

export class PropertyIntelligenceService {
  constructor(private readonly db: DatabaseClient) {}

  private assertRead(actor: PriActor): void {
    if (!canAccessPropertyIntelligence(actor)) {
      throw new PropertyIntelligenceError(
        'FORBIDDEN',
        'Property Intelligence requires customers/jobs/documents/ops access (Technician/Client denied).',
      );
    }
  }

  private assertWrite(actor: PriActor): void {
    this.assertRead(actor);
    if (!canWritePropertyIntelligence(actor)) {
      throw new PropertyIntelligenceError(
        'FORBIDDEN',
        'Write actions require customers:write, jobs:write, or ops:manage.',
      );
    }
  }

  private assertApprove(actor: PriActor): void {
    this.assertWrite(actor);
    if (!canApprovePropertyIntelligenceDrafts(actor)) {
      throw new PropertyIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may approve property intelligence insight drafts.',
      );
    }
  }

  private assertManageSettings(actor: PriActor): void {
    this.assertWrite(actor);
    if (!canManagePropertyIntelligenceSettings(actor)) {
      throw new PropertyIntelligenceError(
        'FORBIDDEN',
        'Only Company Owner may change Property Intelligence sensitive settings.',
      );
    }
  }

  private async recordAudit(
    actor: PriActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'ai',
      action,
      entityType: 'property_intelligence',
      entityId,
      userId: actor.userId,
      metadata: {
        ...metadata,
        autoSend: false,
        inventedProperty: false,
      },
    });
  }

  private toDraft(row: typeof priInsightDrafts.$inferSelect): PriInsightDraftSummary {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      propertyId: row.propertyId,
      customerId: row.customerId,
      jobId: row.jobId,
      autoSend: false,
      inventedProperty: false,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private toInsight(row: typeof priAuraInsights.$inferSelect): PriAuraInsightSummary {
    return {
      id: row.id,
      target: row.target,
      status: row.status,
      title: row.title,
      insight: row.insight,
      href: row.href,
      propertyId: row.propertyId,
      customerId: row.customerId,
      sourceInsightDraftId: row.sourceInsightDraftId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSettings(row: typeof priSettings.$inferSelect): PriSettings {
    return defaultPriSettings({
      id: row.id,
      insightDraftsEnabled: row.insightDraftsEnabled,
      mapsSignalsEnabled: row.mapsSignalsEnabled,
      maintenanceSignalsEnabled: row.maintenanceSignalsEnabled,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private async ensureSettings(actor: PriActor): Promise<PriSettings> {
    const existing = await this.db.query.priSettings.findFirst({
      where: eq(priSettings.companyId, actor.companyId),
    });
    if (existing) return this.toSettings(existing);

    const [created] = await this.db
      .insert(priSettings)
      .values({
        companyId: actor.companyId,
        autoSendEnabled: false,
        inventPropertiesEnabled: false,
        insightDraftsEnabled: true,
        mapsSignalsEnabled: true,
        maintenanceSignalsEnabled: true,
        updatedByUserId: actor.userId,
      })
      .returning();

    return this.toSettings(created);
  }

  private async loadMapsConnection(companyId: string) {
    const connection = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'google_maps'),
      ),
    });
    const hasCredentials = Boolean(connection?.credentialsEncrypted);
    return {
      googleMapsConnected: connection?.status === 'connected' && hasCredentials,
      connectionStatus: connection?.status ?? null,
      lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    };
  }

  private async loadEquipmentRows(companyId: string): Promise<PriEquipmentRow[]> {
    const registryRows = await this.db
      .select({
        profileId: alAssetRegistryProfiles.id,
        propertyId: alAssetRegistryProfiles.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: alAssetRegistryProfiles.customerId,
        assetId: alAssetRegistryProfiles.assetId,
        assetName: assetEquipment.name,
        manufacturer: alAssetRegistryProfiles.manufacturer,
        model: alAssetRegistryProfiles.model,
        status: assetEquipment.status,
        installationDate: alAssetRegistryProfiles.installationDate,
        customCategoryName: alAssetRegistryProfiles.customCategoryName,
      })
      .from(alAssetRegistryProfiles)
      .innerJoin(assetEquipment, eq(alAssetRegistryProfiles.assetId, assetEquipment.id))
      .leftJoin(
        cxCustomerProperties,
        eq(alAssetRegistryProfiles.propertyId, cxCustomerProperties.id),
      )
      .where(
        and(
          eq(alAssetRegistryProfiles.companyId, companyId),
          isNotNull(alAssetRegistryProfiles.propertyId),
        ),
      )
      .orderBy(desc(alAssetRegistryProfiles.updatedAt))
      .limit(200);

    const fromRegistry: PriEquipmentRow[] = registryRows.map((row) => {
      const category = (row.customCategoryName ?? '').toLowerCase();
      const nameLower = row.assetName.toLowerCase();
      const isGeyser = category.includes('geyser') || nameLower.includes('geyser');
      return {
        id: `registry:${row.profileId}`,
        source: 'asset_registry' as const,
        propertyId: row.propertyId,
        propertyName: row.propertyName ?? null,
        customerId: row.customerId,
        assetId: row.assetId,
        name: row.assetName,
        manufacturer: row.manufacturer,
        model: row.model,
        plumbingKind: isGeyser ? 'geyser' : null,
        isGeyser,
        status: row.status,
        installationDate: row.installationDate != null ? String(row.installationDate) : null,
      };
    });

    const planRows = await this.db
      .select({
        planId: opsRecurringMaintenancePlans.id,
        propertyId: opsRecurringMaintenancePlans.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: opsRecurringMaintenancePlans.customerId,
        assetId: opsRecurringMaintenancePlans.assetId,
        assetName: assetEquipment.name,
        plumbingKind: opsRecurringMaintenancePlans.plumbingKind,
        status: opsRecurringMaintenancePlans.status,
        planName: opsRecurringMaintenancePlans.name,
      })
      .from(opsRecurringMaintenancePlans)
      .innerJoin(assetEquipment, eq(opsRecurringMaintenancePlans.assetId, assetEquipment.id))
      .leftJoin(
        cxCustomerProperties,
        eq(opsRecurringMaintenancePlans.propertyId, cxCustomerProperties.id),
      )
      .where(
        and(
          eq(opsRecurringMaintenancePlans.companyId, companyId),
          isNotNull(opsRecurringMaintenancePlans.propertyId),
        ),
      )
      .orderBy(desc(opsRecurringMaintenancePlans.updatedAt))
      .limit(200);

    const fromPlans: PriEquipmentRow[] = planRows.map((row) => ({
      id: `plan:${row.planId}`,
      source: 'maintenance_plan' as const,
      propertyId: row.propertyId,
      propertyName: row.propertyName ?? null,
      customerId: row.customerId,
      assetId: row.assetId,
      name: row.planName || row.assetName,
      manufacturer: null,
      model: null,
      plumbingKind: row.plumbingKind,
      isGeyser: row.plumbingKind === 'geyser',
      status: row.status,
      installationDate: null,
    }));

    const seen = new Set<string>();
    const merged: PriEquipmentRow[] = [];
    for (const row of [...fromRegistry, ...fromPlans]) {
      const key = `${row.propertyId}:${row.assetId}:${row.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    return merged.slice(0, 200);
  }

  private async loadCocRows(companyId: string): Promise<PriCocRow[]> {
    const reports = await this.db
      .select({
        id: completionReports.id,
        propertyId: completionReports.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: completionReports.customerId,
        jobId: completionReports.jobId,
        title: completionReports.title,
        status: completionReports.status,
        includedSections: completionReports.includedSections,
        createdAt: completionReports.createdAt,
      })
      .from(completionReports)
      .leftJoin(cxCustomerProperties, eq(completionReports.propertyId, cxCustomerProperties.id))
      .where(eq(completionReports.companyId, companyId))
      .orderBy(desc(completionReports.createdAt))
      .limit(200);

    const fromReports: PriCocRow[] = reports
      .filter((r) => includesSection(r.includedSections, 'coc'))
      .map((r) => ({
        id: `completion:${r.id}`,
        source: 'completion_report' as const,
        propertyId: r.propertyId,
        propertyName: r.propertyName ?? null,
        customerId: r.customerId,
        jobId: r.jobId,
        title: r.title,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));

    const packItems = await this.db
      .select({
        itemId: jobDocumentPackItems.id,
        label: jobDocumentPackItems.label,
        itemType: jobDocumentPackItems.itemType,
        createdAt: jobDocumentPackItems.createdAt,
        packId: jobDocumentPacks.id,
        jobId: jobDocumentPacks.jobId,
        customerId: jobDocumentPacks.customerId,
        status: jobDocumentPacks.status,
        propertyId: jobs.propertyId,
        propertyName: cxCustomerProperties.propertyName,
      })
      .from(jobDocumentPackItems)
      .innerJoin(jobDocumentPacks, eq(jobDocumentPackItems.packId, jobDocumentPacks.id))
      .innerJoin(jobs, eq(jobDocumentPacks.jobId, jobs.id))
      .leftJoin(cxCustomerProperties, eq(jobs.propertyId, cxCustomerProperties.id))
      .where(
        and(
          eq(jobDocumentPackItems.companyId, companyId),
          inArray(jobDocumentPackItems.itemType, ['certificate', 'compliance_report']),
        ),
      )
      .orderBy(desc(jobDocumentPackItems.createdAt))
      .limit(200);

    const fromPacks: PriCocRow[] = packItems.map((row) => ({
      id: `pack:${row.itemId}`,
      source: 'job_document_pack' as const,
      propertyId: row.propertyId,
      propertyName: row.propertyName ?? null,
      customerId: row.customerId,
      jobId: row.jobId,
      title: row.label,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    const cxDocs = await this.db.query.cxCustomerDocuments.findMany({
      where: and(
        eq(cxCustomerDocuments.companyId, companyId),
        inArray(cxCustomerDocuments.accessType, ['certificate', 'compliance_report']),
      ),
      orderBy: [desc(cxCustomerDocuments.createdAt)],
      limit: 100,
    });

    const fromCx: PriCocRow[] = cxDocs.map((doc) => ({
      id: `cx:${doc.id}`,
      source: 'cx_document' as const,
      propertyId: null,
      propertyName: null,
      customerId: doc.customerId,
      jobId: null,
      title: doc.title,
      status: doc.accessType,
      createdAt: doc.createdAt.toISOString(),
    }));

    return [...fromReports, ...fromPacks, ...fromCx].slice(0, 200);
  }

  private async loadPhotoRows(companyId: string): Promise<PriPhotoRow[]> {
    const reports = await this.db
      .select({
        id: completionReports.id,
        propertyId: completionReports.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: completionReports.customerId,
        jobId: completionReports.jobId,
        title: completionReports.title,
        sectionPayload: completionReports.sectionPayload,
        includedSections: completionReports.includedSections,
        createdAt: completionReports.createdAt,
      })
      .from(completionReports)
      .leftJoin(cxCustomerProperties, eq(completionReports.propertyId, cxCustomerProperties.id))
      .where(eq(completionReports.companyId, companyId))
      .orderBy(desc(completionReports.createdAt))
      .limit(200);

    const fromReports: PriPhotoRow[] = [];
    for (const report of reports) {
      const count = photoCountFromPayload(report.sectionPayload as Record<string, unknown>);
      const hasPhotoSection =
        includesSection(report.includedSections, 'photos_before') ||
        includesSection(report.includedSections, 'photos_during') ||
        includesSection(report.includedSections, 'photos_after');
      if (count === 0 && !hasPhotoSection) continue;
      fromReports.push({
        id: `completion-photo:${report.id}`,
        source: 'completion_report',
        propertyId: report.propertyId,
        propertyName: report.propertyName ?? null,
        customerId: report.customerId,
        jobId: report.jobId,
        label: `${report.title} (${count || 'section'} photo signal(s))`,
        createdAt: report.createdAt.toISOString(),
      });
    }

    const packPhotos = await this.db
      .select({
        itemId: jobDocumentPackItems.id,
        label: jobDocumentPackItems.label,
        createdAt: jobDocumentPackItems.createdAt,
        jobId: jobDocumentPacks.jobId,
        customerId: jobDocumentPacks.customerId,
        propertyId: jobs.propertyId,
        propertyName: cxCustomerProperties.propertyName,
      })
      .from(jobDocumentPackItems)
      .innerJoin(jobDocumentPacks, eq(jobDocumentPackItems.packId, jobDocumentPacks.id))
      .innerJoin(jobs, eq(jobDocumentPacks.jobId, jobs.id))
      .leftJoin(cxCustomerProperties, eq(jobs.propertyId, cxCustomerProperties.id))
      .where(
        and(
          eq(jobDocumentPackItems.companyId, companyId),
          eq(jobDocumentPackItems.itemType, 'photo_evidence'),
        ),
      )
      .orderBy(desc(jobDocumentPackItems.createdAt))
      .limit(100);

    const fromPacks: PriPhotoRow[] = packPhotos.map((row) => ({
      id: `pack-photo:${row.itemId}`,
      source: 'job_document_pack' as const,
      propertyId: row.propertyId,
      propertyName: row.propertyName ?? null,
      customerId: row.customerId,
      jobId: row.jobId,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    }));

    const assets = await this.db
      .select({
        assetId: assetEquipment.id,
        name: assetEquipment.name,
        photoDocumentIds: assetEquipment.photoDocumentIds,
        propertyId: alAssetRegistryProfiles.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: alAssetRegistryProfiles.customerId,
        updatedAt: assetEquipment.updatedAt,
      })
      .from(assetEquipment)
      .innerJoin(alAssetRegistryProfiles, eq(alAssetRegistryProfiles.assetId, assetEquipment.id))
      .leftJoin(
        cxCustomerProperties,
        eq(alAssetRegistryProfiles.propertyId, cxCustomerProperties.id),
      )
      .where(
        and(
          eq(assetEquipment.companyId, companyId),
          isNotNull(alAssetRegistryProfiles.propertyId),
        ),
      )
      .limit(100);

    const fromAssets: PriPhotoRow[] = assets
      .filter((a) => Array.isArray(a.photoDocumentIds) && a.photoDocumentIds.length > 0)
      .map((a) => ({
        id: `asset-photo:${a.assetId}`,
        source: 'asset' as const,
        propertyId: a.propertyId,
        propertyName: a.propertyName ?? null,
        customerId: a.customerId,
        jobId: null,
        label: `${a.name} (${a.photoDocumentIds.length} photo document id(s))`,
        createdAt: a.updatedAt.toISOString(),
      }));

    const bookings = await this.db.query.cxAppointmentBookings.findMany({
      where: and(
        eq(cxAppointmentBookings.companyId, companyId),
        isNotNull(cxAppointmentBookings.propertyId),
      ),
      orderBy: [desc(cxAppointmentBookings.createdAt)],
      limit: 50,
    });

    const propertyNameById = new Map(
      (
        await this.db.query.cxCustomerProperties.findMany({
          where: eq(cxCustomerProperties.companyId, companyId),
          columns: { id: true, propertyName: true },
        })
      ).map((p) => [p.id, p.propertyName]),
    );

    const fromBookings: PriPhotoRow[] = bookings
      .filter((b) => Array.isArray(b.photoUrls) && b.photoUrls.length > 0)
      .map((b) => ({
        id: `booking-photo:${b.id}`,
        source: 'booking' as const,
        propertyId: b.propertyId,
        propertyName: b.propertyId ? (propertyNameById.get(b.propertyId) ?? null) : null,
        customerId: b.customerId,
        jobId: null,
        label: `${b.subject} (${b.photoUrls.length} booking photo url(s))`,
        createdAt: b.createdAt.toISOString(),
      }));

    return [...fromReports, ...fromPacks, ...fromAssets, ...fromBookings].slice(0, 200);
  }

  private async loadPreviousWork(companyId: string): Promise<PriPreviousWorkRow[]> {
    const rows = await this.db
      .select({
        id: jobs.id,
        propertyId: jobs.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: jobs.customerId,
        customerName: customers.name,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        status: jobs.status,
        scheduledAt: jobs.scheduledAt,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .leftJoin(cxCustomerProperties, eq(jobs.propertyId, cxCustomerProperties.id))
      .where(and(eq(jobs.companyId, companyId), isNotNull(jobs.propertyId)))
      .orderBy(desc(jobs.updatedAt))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      propertyName: row.propertyName ?? null,
      customerId: row.customerId,
      customerName: row.customerName,
      jobNumber: row.jobNumber,
      title: row.title,
      status: row.status,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadMaintenanceHistory(companyId: string): Promise<PriMaintenanceHistoryRow[]> {
    const plans = await this.db
      .select({
        id: opsRecurringMaintenancePlans.id,
        propertyId: opsRecurringMaintenancePlans.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: opsRecurringMaintenancePlans.customerId,
        name: opsRecurringMaintenancePlans.name,
        plumbingKind: opsRecurringMaintenancePlans.plumbingKind,
        status: opsRecurringMaintenancePlans.status,
        nextDueAt: opsRecurringMaintenancePlans.nextDueAt,
        lastCompletedAt: opsRecurringMaintenancePlans.lastCompletedAt,
      })
      .from(opsRecurringMaintenancePlans)
      .leftJoin(
        cxCustomerProperties,
        eq(opsRecurringMaintenancePlans.propertyId, cxCustomerProperties.id),
      )
      .where(
        and(
          eq(opsRecurringMaintenancePlans.companyId, companyId),
          isNotNull(opsRecurringMaintenancePlans.propertyId),
        ),
      )
      .orderBy(desc(opsRecurringMaintenancePlans.updatedAt))
      .limit(200);

    const fromPlans: PriMaintenanceHistoryRow[] = plans.map((plan) => ({
      id: `plan:${plan.id}`,
      source: 'plan' as const,
      propertyId: plan.propertyId,
      propertyName: plan.propertyName ?? null,
      customerId: plan.customerId,
      planId: plan.id,
      planName: plan.name,
      plumbingKind: plan.plumbingKind,
      status: plan.status,
      nextDueAt: plan.nextDueAt?.toISOString() ?? null,
      lastCompletedAt: plan.lastCompletedAt?.toISOString() ?? null,
      runCompletedAt: null,
    }));

    const runs = await this.db
      .select({
        id: opsMaintenanceRuns.id,
        planId: opsMaintenanceRuns.planId,
        status: opsMaintenanceRuns.status,
        completedAt: opsMaintenanceRuns.completedAt,
        propertyId: opsRecurringMaintenancePlans.propertyId,
        propertyName: cxCustomerProperties.propertyName,
        customerId: opsRecurringMaintenancePlans.customerId,
        planName: opsRecurringMaintenancePlans.name,
        plumbingKind: opsRecurringMaintenancePlans.plumbingKind,
      })
      .from(opsMaintenanceRuns)
      .innerJoin(
        opsRecurringMaintenancePlans,
        eq(opsMaintenanceRuns.planId, opsRecurringMaintenancePlans.id),
      )
      .leftJoin(
        cxCustomerProperties,
        eq(opsRecurringMaintenancePlans.propertyId, cxCustomerProperties.id),
      )
      .where(
        and(
          eq(opsMaintenanceRuns.companyId, companyId),
          isNotNull(opsRecurringMaintenancePlans.propertyId),
        ),
      )
      .orderBy(desc(opsMaintenanceRuns.createdAt))
      .limit(200);

    const fromRuns: PriMaintenanceHistoryRow[] = runs.map((run) => ({
      id: `run:${run.id}`,
      source: 'run' as const,
      propertyId: run.propertyId,
      propertyName: run.propertyName ?? null,
      customerId: run.customerId,
      planId: run.planId,
      planName: run.planName,
      plumbingKind: run.plumbingKind,
      status: run.status,
      nextDueAt: null,
      lastCompletedAt: null,
      runCompletedAt: run.completedAt?.toISOString() ?? null,
    }));

    return [...fromPlans, ...fromRuns].slice(0, 200);
  }

  private async loadPropertyProfiles(
    companyId: string,
    context: {
      equipmentRows: PriEquipmentRow[];
      cocRows: PriCocRow[];
      photoRows: PriPhotoRow[];
      previousWork: PriPreviousWorkRow[];
      maintenanceHistory: PriMaintenanceHistoryRow[];
    },
  ): Promise<PriPropertyProfile[]> {
    const rows = await this.db
      .select({
        property: cxCustomerProperties,
        customerName: customers.name,
      })
      .from(cxCustomerProperties)
      .innerJoin(customers, eq(cxCustomerProperties.customerId, customers.id))
      .where(eq(cxCustomerProperties.companyId, companyId))
      .orderBy(desc(cxCustomerProperties.updatedAt))
      .limit(200);

    return rows.map(({ property, customerName }) => {
      const hasRealCoordinates = isValidLatLng(property.latitude, property.longitude);
      return {
        propertyId: property.id,
        customerId: property.customerId,
        customerName,
        propertyName: property.propertyName,
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2,
        suburb: property.suburb,
        city: property.city,
        province: property.province,
        postalCode: property.postalCode,
        unitNumber: property.unitNumber,
        formattedAddress:
          property.formattedAddress ??
          formatPriAddress({
            addressLine1: property.addressLine1,
            addressLine2: property.addressLine2,
            suburb: property.suburb,
            city: property.city,
            province: property.province,
            postalCode: property.postalCode,
            unitNumber: property.unitNumber,
          }),
        isPrimary: property.isPrimary,
        latitude: hasRealCoordinates ? property.latitude : null,
        longitude: hasRealCoordinates ? property.longitude : null,
        placeId: property.placeId,
        geocodeStatus: property.geocodeStatus,
        hasRealCoordinates,
        jobCount: context.previousWork.filter((j) => j.propertyId === property.id).length,
        equipmentCount: context.equipmentRows.filter((e) => e.propertyId === property.id).length,
        geyserCount: context.equipmentRows.filter(
          (e) => e.propertyId === property.id && e.isGeyser,
        ).length,
        cocCount: context.cocRows.filter((c) => c.propertyId === property.id).length,
        photoCount: context.photoRows.filter((p) => p.propertyId === property.id).length,
        maintenancePlanCount: context.maintenanceHistory.filter(
          (m) => m.propertyId === property.id && m.source === 'plan',
        ).length,
        createdAt: property.createdAt.toISOString(),
        updatedAt: property.updatedAt.toISOString(),
      };
    });
  }

  async getDashboard(actor: PriActor): Promise<PriDashboard> {
    this.assertRead(actor);

    const settings = await this.ensureSettings(actor);
    const [
      mapsConnection,
      equipmentRows,
      cocRows,
      photoRows,
      previousWork,
      maintenanceHistory,
      drafts,
      insights,
    ] = await Promise.all([
      this.loadMapsConnection(actor.companyId),
      this.loadEquipmentRows(actor.companyId),
      this.loadCocRows(actor.companyId),
      this.loadPhotoRows(actor.companyId),
      this.loadPreviousWork(actor.companyId),
      this.loadMaintenanceHistory(actor.companyId),
      this.db.query.priInsightDrafts.findMany({
        where: eq(priInsightDrafts.companyId, actor.companyId),
        orderBy: [desc(priInsightDrafts.createdAt)],
        limit: 50,
      }),
      this.db.query.priAuraInsights.findMany({
        where: eq(priAuraInsights.companyId, actor.companyId),
        orderBy: [desc(priAuraInsights.createdAt)],
        limit: 50,
      }),
    ]);

    const propertyProfiles = await this.loadPropertyProfiles(actor.companyId, {
      equipmentRows,
      cocRows,
      photoRows,
      previousWork,
      maintenanceHistory,
    });

    const propertiesWithCoordinates = propertyProfiles.filter((p) => p.hasRealCoordinates).length;
    const maps = buildPriMapsSnapshot({
      googleMapsConnected: mapsConnection.googleMapsConnected,
      connectionStatus: mapsConnection.connectionStatus,
      propertiesWithCoordinates,
      propertiesWithoutCoordinates: propertyProfiles.length - propertiesWithCoordinates,
      lastSyncAt: mapsConnection.lastSyncAt,
    });

    const geyserRows = equipmentRows.filter((e) => e.isGeyser);
    const equipment = buildPriEquipmentSnapshot({
      equipmentCount: equipmentRows.length,
      geyserCount: geyserRows.length,
    });
    const documents = buildPriDocumentSnapshot({
      cocCount: cocRows.length,
      photoCount: photoRows.length,
    });
    const work = buildPriWorkSnapshot({
      jobCount: previousWork.length,
      maintenancePlanCount: maintenanceHistory.filter((m) => m.source === 'plan').length,
      maintenanceRunCount: maintenanceHistory.filter((m) => m.source === 'run').length,
    });

    const insightDrafts = drafts.map((d) => this.toDraft(d));
    const pendingApprovals = insightDrafts.filter(
      (d) => d.status === 'draft' || d.status === 'pending_approval',
    ).length;

    let summary: string;
    if (propertyProfiles.length === 0) {
      summary =
        'Property Intelligence is ready. No real customer properties yet — profiles, Maps, equipment, COCs, and maintenance stay unavailable (not invented).';
    } else {
      summary = `Real property signals: ${propertyProfiles.length} propert(y/ies), Maps ${maps.availability}, equipment ${equipment.availability}, documents ${documents.availability}, work ${work.availability}, ${pendingApprovals} pending insight draft(s). Never invents properties or auto-sends.`;
    }

    return {
      summary,
      productClarification: { ...PRI_PRODUCT_COPY },
      policy: {
        autoSendEnabled: false,
        inventPropertiesEnabled: false,
        requiresOwnerApproval: true,
        fakeProperties: false,
      },
      maps,
      equipment,
      documents,
      work,
      propertyProfiles,
      equipmentRows,
      geyserRows,
      cocRows,
      photoRows,
      previousWork,
      maintenanceHistory,
      insightDrafts,
      auraInsights: insights.map((i) => this.toInsight(i)),
      auraConnections: listPriAuraConnections(),
      settings,
      pendingApprovals,
      totalProperties: propertyProfiles.length,
      linkedCustomerCount: new Set(propertyProfiles.map((p) => p.customerId)).size,
    };
  }

  async refreshInsightDrafts(
    actor: PriActor,
    input: RefreshPriInsightsRequest = {},
  ): Promise<{ created: number; drafts: PriInsightDraftSummary[] }> {
    this.assertWrite(actor);
    const settings = await this.ensureSettings(actor);
    if (!settings.insightDraftsEnabled) {
      throw new PropertyIntelligenceError(
        'INVALID_STATE',
        'Insight drafts are disabled in Property Intelligence settings.',
      );
    }

    const [equipmentRows, cocRows, previousWork, maintenanceHistory, propertyProfiles] =
      await Promise.all([
        this.loadEquipmentRows(actor.companyId),
        this.loadCocRows(actor.companyId),
        this.loadPreviousWork(actor.companyId),
        this.loadMaintenanceHistory(actor.companyId),
        this.loadPropertyProfiles(actor.companyId, {
          equipmentRows: [],
          cocRows: [],
          photoRows: [],
          previousWork: [],
          maintenanceHistory: [],
        }),
      ]);

    const status = input.submitForApproval ? 'pending_approval' : 'draft';
    const created: PriInsightDraftSummary[] = [];

    const tryCreate = async (
      kind: PriInsightKind,
      propertyId: string | null,
      customerId: string | null,
      propertyName: string | null,
      detail: string,
      jobId: string | null = null,
      metadata: Record<string, unknown> = {},
    ) => {
      const existingOpen = await this.db.query.priInsightDrafts.findFirst({
        where: and(
          eq(priInsightDrafts.companyId, actor.companyId),
          eq(priInsightDrafts.kind, kind),
          propertyId
            ? eq(priInsightDrafts.propertyId, propertyId)
            : sql`${priInsightDrafts.propertyId} is null`,
          inArray(priInsightDrafts.status, ['draft', 'pending_approval']),
        ),
      });
      if (existingOpen) return;

      const draft = buildPriInsightDraft({ kind, propertyName, detail });
      const [inserted] = await this.db
        .insert(priInsightDrafts)
        .values({
          companyId: actor.companyId,
          kind: draft.kind,
          status,
          title: draft.title,
          body: draft.body,
          propertyId,
          customerId,
          jobId,
          autoSend: false,
          inventedProperty: false,
          createdByUserId: actor.userId,
          metadata: { source: 'real_property_signals', ...metadata },
        })
        .returning();

      created.push(this.toDraft(inserted));
      await this.recordAudit(actor, 'pri_insight_draft_created', inserted.id, {
        kind,
        propertyId,
        customerId,
        jobId,
      });
    };

    const richHistory = propertyProfiles.filter((p) => {
      const jobsForProperty = previousWork.filter((j) => j.propertyId === p.propertyId).length;
      const maintForProperty = maintenanceHistory.filter(
        (m) => m.propertyId === p.propertyId,
      ).length;
      return jobsForProperty + maintForProperty >= 2;
    });
    if (richHistory[0]) {
      const p = richHistory[0];
      await tryCreate(
        'property_history',
        p.propertyId,
        p.customerId,
        p.propertyName,
        `${p.propertyName} has real linked job/maintenance history for customer ${p.customerName}. AURA history understanding is observational from stored records only.`,
        null,
        { jobCount: p.jobCount, maintenancePlanCount: p.maintenancePlanCount },
      );
    }

    if (settings.maintenanceSignalsEnabled) {
      const dueSoon = maintenanceHistory.filter(
        (m) =>
          m.source === 'plan' &&
          m.status === 'active' &&
          m.nextDueAt &&
          new Date(m.nextDueAt).getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000,
      );
      if (dueSoon[0]) {
        const row = dueSoon[0];
        await tryCreate(
          'maintenance_opportunity',
          row.propertyId,
          row.customerId,
          row.propertyName,
          `Active plan "${row.planName}"${row.plumbingKind ? ` (${row.plumbingKind})` : ''} next due ${row.nextDueAt}. Maintenance opportunity draft from real recurring maintenance — not invented.`,
          null,
          { planId: row.planId, plumbingKind: row.plumbingKind },
        );
      }
    }

    const staleWork = previousWork.filter(
      (j) =>
        ['completed', 'cancelled'].includes(j.status) === false &&
        j.updatedAt &&
        new Date(j.updatedAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000,
    );
    if (staleWork[0]) {
      const job = staleWork[0];
      await tryCreate(
        'follow_up',
        job.propertyId,
        job.customerId,
        job.propertyName,
        `Open/in-progress job "${job.title}" last updated ${job.updatedAt} — follow-up recommendation draft only (never auto-comms).`,
        job.id,
        { jobStatus: job.status },
      );
    }

    const geyserWithoutRecentMaint = equipmentRows.filter((e) => {
      if (!e.isGeyser || !e.propertyId) return false;
      const runs = maintenanceHistory.filter(
        (m) => m.propertyId === e.propertyId && m.source === 'run',
      );
      return runs.length === 0;
    });
    if (geyserWithoutRecentMaint[0]) {
      const geyser = geyserWithoutRecentMaint[0];
      await tryCreate(
        'equipment_attention',
        geyser.propertyId,
        geyser.customerId,
        geyser.propertyName,
        `Geyser/equipment "${geyser.name}" is linked to a property without recorded maintenance runs — attention draft from real asset/plan signals.`,
        null,
        { assetId: geyser.assetId, plumbingKind: geyser.plumbingKind },
      );
    }

    const propertiesWithJobsNoCoc = propertyProfiles.filter((p) => {
      const hasJobs = previousWork.some((j) => j.propertyId === p.propertyId);
      const hasCoc = cocRows.some((c) => c.propertyId === p.propertyId);
      return hasJobs && !hasCoc;
    });
    if (propertiesWithJobsNoCoc[0]) {
      const p = propertiesWithJobsNoCoc[0];
      await tryCreate(
        'coc_attention',
        p.propertyId,
        p.customerId,
        p.propertyName,
        `${p.propertyName} has property-linked jobs but no COC/certificate signals in completion reports or document packs — attention draft only.`,
        null,
        { jobCount: p.jobCount },
      );
    }

    if (settings.mapsSignalsEnabled) {
      const missingCoords = propertyProfiles.filter((p) => !p.hasRealCoordinates);
      if (missingCoords.length > 0 && propertyProfiles.some((p) => p.hasRealCoordinates)) {
        // observational contrast only when some coords exist company-wide
        const p = missingCoords[0]!;
        await tryCreate(
          'follow_up',
          p.propertyId,
          p.customerId,
          p.propertyName,
          `${missingCoords.length} propert(y/ies) lack real stored coordinates while others have Maps pins — geocode follow-up draft (coords never invented).`,
          null,
          { missingCoordinateCount: missingCoords.length },
        );
      }
    }

    return { created: created.length, drafts: created };
  }

  async decideInsightDraft(
    actor: PriActor,
    draftId: string,
    input: DecidePriInsightDraftRequest,
  ): Promise<PriInsightDraftSummary> {
    this.assertApprove(actor);

    const existing = await this.db.query.priInsightDrafts.findFirst({
      where: and(eq(priInsightDrafts.id, draftId), eq(priInsightDrafts.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new PropertyIntelligenceError('NOT_FOUND', 'Insight draft not found.');
    }
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new PropertyIntelligenceError(
        'INVALID_STATE',
        `Insight draft is already ${existing.status}.`,
      );
    }

    const nextStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'acknowledge'
          ? 'acknowledged'
          : 'rejected';

    const [updated] = await this.db
      .update(priInsightDrafts)
      .set({
        status: nextStatus,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoSend: false,
        inventedProperty: false,
        updatedAt: new Date(),
      })
      .where(and(eq(priInsightDrafts.id, draftId), eq(priInsightDrafts.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `pri_insight_draft_${nextStatus}`, updated.id, {
      decision: input.decision,
      notes: input.notes ?? null,
      autoSent: false,
      inventedProperty: false,
    });

    return this.toDraft(updated);
  }

  async updateSettings(actor: PriActor, input: UpdatePriSettingsRequest): Promise<PriSettings> {
    this.assertManageSettings(actor);
    await this.ensureSettings(actor);

    const patch: Partial<typeof priSettings.$inferInsert> = {
      autoSendEnabled: false,
      inventPropertiesEnabled: false,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    if (input.insightDraftsEnabled !== undefined) {
      patch.insightDraftsEnabled = input.insightDraftsEnabled;
    }
    if (input.mapsSignalsEnabled !== undefined) {
      patch.mapsSignalsEnabled = input.mapsSignalsEnabled;
    }
    if (input.maintenanceSignalsEnabled !== undefined) {
      patch.maintenanceSignalsEnabled = input.maintenanceSignalsEnabled;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db
      .update(priSettings)
      .set(patch)
      .where(eq(priSettings.companyId, actor.companyId))
      .returning();

    await this.recordAudit(actor, 'pri_settings_updated', updated.id, {
      insightDraftsEnabled: updated.insightDraftsEnabled,
      mapsSignalsEnabled: updated.mapsSignalsEnabled,
      maintenanceSignalsEnabled: updated.maintenanceSignalsEnabled,
    });

    return this.toSettings(updated);
  }

  async createAuraInsight(
    actor: PriActor,
    input: CreatePriAuraInsightRequest,
  ): Promise<PriAuraInsightSummary> {
    this.assertWrite(actor);

    if (input.sourceInsightDraftId) {
      const source = await this.db.query.priInsightDrafts.findFirst({
        where: and(
          eq(priInsightDrafts.id, input.sourceInsightDraftId),
          eq(priInsightDrafts.companyId, actor.companyId),
        ),
      });
      if (!source) {
        throw new PropertyIntelligenceError('NOT_FOUND', 'Source insight draft not found.');
      }
    }

    const [inserted] = await this.db
      .insert(priAuraInsights)
      .values({
        companyId: actor.companyId,
        target: input.target,
        status: 'open',
        title: input.title,
        insight: input.insight,
        href: input.href ?? null,
        propertyId: input.propertyId ?? null,
        customerId: input.customerId ?? null,
        sourceInsightDraftId: input.sourceInsightDraftId ?? null,
        createdByUserId: actor.userId,
        metadata: { invented: false, autoSend: false },
      })
      .returning();

    await this.recordAudit(actor, 'pri_aura_insight_created', inserted.id, {
      target: input.target,
      sourceInsightDraftId: input.sourceInsightDraftId ?? null,
    });

    return this.toInsight(inserted);
  }

  async acknowledgeInsight(
    actor: PriActor,
    insightId: string,
    input: AcknowledgePriInsightRequest,
  ): Promise<PriAuraInsightSummary> {
    this.assertWrite(actor);

    const existing = await this.db.query.priAuraInsights.findFirst({
      where: and(eq(priAuraInsights.id, insightId), eq(priAuraInsights.companyId, actor.companyId)),
    });
    if (!existing) {
      throw new PropertyIntelligenceError('NOT_FOUND', 'AURA insight not found.');
    }

    const [updated] = await this.db
      .update(priAuraInsights)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(priAuraInsights.id, insightId), eq(priAuraInsights.companyId, actor.companyId)))
      .returning();

    await this.recordAudit(actor, `pri_aura_insight_${input.status}`, updated.id, {
      status: input.status,
    });

    return this.toInsight(updated);
  }
}
